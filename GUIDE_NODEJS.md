# Hướng dẫn tích hợp SePay Payment Gateway cho Node.js (tham chiếu từ sepay-pg-php)

## Tổng quan

- Mục tiêu: chuyển hóa kiến trúc SDK PHP `sepay-pg-php` sang cách dùng trong dự án Node.js.
- Tính năng chính:
  - Khởi tạo client với Basic Auth.
  - Tạo form checkout kèm chữ ký HMAC-SHA256.
  - Gọi API đơn hàng: lấy chi tiết, liệt kê, hủy giao dịch, hủy đơn.
  - Cấu hình môi trường, URL và retry.

## Kiến trúc gốc (PHP SDK)

- `SePayClient`: client chính, khởi tạo với `merchantId`, `secretKey`, `environment`, `config`.
- `Client/HttpClient`: gửi HTTP (`GET/POST/PUT/DELETE`) với Basic Auth và retry.
- `Config/UrlConfig`: ánh xạ base URL theo môi trường (sandbox/production) cho API và Checkout.
- `Resources/CheckoutResource`: tạo trường form + chữ ký, dựng HTML form, verify chữ ký.
- `Resources/OrderResource`: các thao tác với đơn hàng qua API.
- `Builders/CheckoutBuilder`: builder dữ liệu checkout đảm bảo validate theo nghiệp vụ.
- `Auth/SignatureGenerator`: sinh chữ ký HMAC-SHA256 và base64.
- `Exceptions/*`: ánh xạ lỗi 400/401/429/5xx, kèm chi tiết validation.

## Bản đồ sang Node.js

- Tách module tương tự:
  - `config/urls.js`: hằng số URL theo môi trường.
  - `auth/signature.js`: tạo chữ ký cho trường checkout.
  - `client/sepay-client.js`: client chính, tạo header Basic Auth, có retry.
  - `resources/orders.js`: hàm `retrieve`, `list`, `voidTransaction`, `cancel`.
  - `resources/checkout.js`: tạo form fields, verify chữ ký, dựng HTML.

## Môi trường và URL

- Môi trường: `sandbox` hoặc `production`.
- API base URLs:
  - `sandbox`: `https://pgapi-sandbox.sepay.vn`
  - `production`: `https://pgapi.sepay.vn`
- Checkout base URLs:
  - `sandbox`: `https://pay-sandbox.sepay.vn`
  - `production`: `https://pay.sepay.vn`
- Endpoint checkout: `POST {checkoutBase}/v1/checkout/init`.
- Endpoint API: ghép `/{version}/{endpoint}`, ví dụ `GET {apiBase}/v1/order/detail/{orderId}`.

## Thiết lập khuyến nghị

- Biến môi trường: `SEPAY_MERCHANT_ID`, `SEPAY_SECRET_KEY`, `SEPAY_ENV`.
- Node >= 18 có `fetch` sẵn; nếu thấp hơn, dùng `node-fetch` hoặc `axios`.
- Không ghi log `secretKey`; chỉ log metadata request/response.

## Chữ ký checkout (HMAC-SHA256 → base64)

- Trường tham gia chữ ký (chỉ khi có trong payload):
  - `merchant`, `env`, `operation`, `payment_method`, `order_amount`, `currency`, `order_invoice_number`, `order_description`, `customer_id`, `agreement_id`, `agreement_name`, `agreement_type`, `agreement_payment_frequency`, `agreement_amount_per_payment`, `success_url`, `error_url`, `cancel_url`.
- Cách tạo:
  - Lấy key theo thứ tự xuất hiện trong object payload.
  - Lọc giữ các key thuộc danh sách trên.
  - Chuỗi hóa mỗi phần tử thành `key=value` rồi nối bằng dấu phẩy.
  - Tính `HMAC-SHA256(secretKey, chuỗi)` và `digest` dạng `base64`.

### Ví dụ Node.js: tạo chữ ký

```js
import crypto from 'crypto';

export function signCheckoutFields(fields, secretKey) {
  const allowed = [
    'merchant',
    'env',
    'operation',
    'payment_method',
    'order_amount',
    'currency',
    'order_invoice_number',
    'order_description',
    'customer_id',
    'agreement_id',
    'agreement_name',
    'agreement_type',
    'agreement_payment_frequency',
    'agreement_amount_per_payment',
    'success_url',
    'error_url',
    'cancel_url',
  ];
  const signedKeys = Object.keys(fields).filter(k => allowed.includes(k));
  const message = signedKeys.map(k => `${k}=${fields[k] ?? ''}`).join(',');
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}
```

## Tạo trường form checkout và HTML

- Validate bắt buộc:
  - `currency === 'VND'`.
  - `order_amount` số nguyên không âm; với `PURCHASE` phải > 0; với `VERIFY` phải = 0.
  - `operation ∈ {PURCHASE, VERIFY}`.
  - `order_description` có giá trị.
  - `merchant`: có thể tự động lấy từ client.
  - Nếu `operation === 'PURCHASE'` cần `order_invoice_number` không rỗng.
- Tạo form fields: ép kiểu giá trị sang chuỗi nơi cần thiết (như `order_amount`).
- Dựng HTML form và auto-submit script khi cần.

### Ví dụ Node.js: tạo form fields và HTML

```js
import { signCheckoutFields } from './auth/signature.js';

export function generateFormFields(data, merchantId, secretKey) {
  const fields = { ...data };
  if (!fields.merchant && merchantId) fields.merchant = merchantId;
  if (fields.currency !== 'VND') throw new Error('Only VND currency is supported');
  if (!['PURCHASE', 'VERIFY'].includes(fields.operation)) throw new Error('Operation must be PURCHASE or VERIFY');
  if (fields.operation === 'PURCHASE') {
    if (!fields.order_invoice_number) throw new Error('Order invoice number is required for PURCHASE operation');
    if (!(fields.order_amount > 0)) throw new Error('Order amount must be greater than 0 for PURCHASE operation');
  }
  if (fields.operation === 'VERIFY' && fields.order_amount > 0) throw new Error('Order amount must be 0 for VERIFY operation');
  const optional = [
    'payment_method',
    'order_invoice_number',
    'customer_id',
    'success_url',
    'error_url',
    'cancel_url',
    'branch_code',
    'agreement_id',
    'agreement_name',
    'agreement_type',
    'agreement_payment_frequency',
    'agreement_amount_per_payment',
  ];
  const form = {
    merchant: String(fields.merchant),
    currency: String(fields.currency),
    order_amount: String(fields.order_amount),
    operation: String(fields.operation),
    order_description: String(fields.order_description),
  };
  for (const k of optional) if (fields[k] !== undefined && fields[k] !== '') form[k] = String(fields[k]);
  form.signature = signCheckoutFields(form, secretKey);
  return form;
}

export function getCheckoutUrl(env, customBase) {
  const base = customBase ?? (env === 'production' ? 'https://pay.sepay.vn' : 'https://pay-sandbox.sepay.vn');
  return `${base}/v1/checkout/init`;
}

export function generateFormHtml(formFields, actionUrl, attrs = {}) {
  const defaults = { method: 'POST', action: actionUrl };
  const all = { ...defaults, ...attrs };
  let html = '<form';
  for (const [k, v] of Object.entries(all)) {
    if (k === 'no_submit_button') continue;
    html += ` ${k}="${String(v).replace(/"/g, '&quot;')}"`;
  }
  html += '>' + '\n';
  for (const [name, value] of Object.entries(formFields)) {
    html += `    <input type="hidden" name="${name}" value="${String(value).replace(/"/g, '&quot;')}">` + '\n';
  }
  if (!all.no_submit_button) html += '    <button type="submit">Proceed to Payment</button>' + '\n';
  html += '</form>';
  return html;
}
```

## Gọi API đơn hàng từ Node.js

### Header xác thực (Basic Auth)

```js
function getAuthHeaders(merchantId, secretKey) {
  const credentials = Buffer.from(`${merchantId}:${secretKey}`).toString('base64');
  return { Authorization: `Basic ${credentials}`, Accept: 'application/json', 'Content-Type': 'application/json' };
}
```

### HTTP client đơn giản với retry

```js
async function request(method, endpoint, { baseUrl, merchantId, secretKey, query, json, timeout = 30000, retryAttempts = 3, retryDelayMs = 1000 } = {}) {
  const url = new URL(`/v1/${endpoint.replace(/^\//, '')}`, baseUrl);
  if (query) Object.entries(query).forEach(([k, v]) => v !== undefined && url.searchParams.append(k, String(v)));
  let attempt = 0;
  while (attempt < retryAttempts) {
    try {
      attempt++;
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(merchantId, secretKey),
        body: json ? JSON.stringify(json) : undefined,
        signal: AbortSignal.timeout(timeout),
      });
      const text = await res.text();
      if (res.status >= 400) throw new Error(`HTTP ${res.status}: ${text}`);
      const data = text ? JSON.parse(text) : {};
      return data;
    } catch (e) {
      if (attempt >= retryAttempts) throw e;
      await new Promise(r => setTimeout(r, retryDelayMs));
    }
  }
  throw new Error('Maximum retry attempts exceeded');
}
```

### Orders API

```js
export async function retrieveOrder(orderId, opts) {
  if (!orderId) throw new Error('Order ID is required');
  return request('GET', `order/detail/${orderId}`, opts);
}

export async function listOrders(filters = {}, opts) {
  return request('GET', 'order', { ...opts, query: filters });
}

export async function voidTransaction(orderInvoiceNumber, opts) {
  if (!orderInvoiceNumber) throw new Error('Order invoice number is required');
  return request('POST', 'order/voidTransaction', { ...opts, json: { order_invoice_number: orderInvoiceNumber } });
}

export async function cancelOrder(orderInvoiceNumber, opts) {
  if (!orderInvoiceNumber) throw new Error('Order invoice number is required');
  return request('POST', 'order/cancel', { ...opts, json: { order_invoice_number: orderInvoiceNumber } });
}
```

## Quick start Node.js

```js
import { generateFormFields, getCheckoutUrl, generateFormHtml } from './resources/checkout.js';
import { retrieveOrder, listOrders } from './resources/orders.js';

const merchantId = process.env.SEPAY_MERCHANT_ID;
const secretKey = process.env.SEPAY_SECRET_KEY;
const env = process.env.SEPAY_ENV || 'sandbox';

const checkoutData = {
  currency: 'VND',
  order_amount: 100000,
  operation: 'PURCHASE',
  order_description: 'Thanh toán đơn hàng #123',
  order_invoice_number: 'INV_123',
  success_url: 'https://yoursite.com/success',
};

const formFields = generateFormFields(checkoutData, merchantId, secretKey);
const actionUrl = getCheckoutUrl(env);
const formHtml = generateFormHtml(formFields, actionUrl, { id: 'sepay-checkout-form' });

console.log(formHtml);

const apiBase = env === 'production' ? 'https://pgapi.sepay.vn' : 'https://pgapi-sandbox.sepay.vn';
const opts = { baseUrl: apiBase, merchantId, secretKey };

const order = await retrieveOrder('INV_123', opts);
console.log(order);

const orders = await listOrders({ per_page: 10 }, opts);
console.log(orders);
```

## Xử lý lỗi (gợi ý ánh xạ)

- 401 → lỗi xác thực: kiểm tra `merchantId/secretKey` và môi trường.
- 400 → lỗi dữ liệu: hiển thị thông báo và chi tiết validation.
- 429 → giới hạn tốc độ: chờ rồi thử lại (`retryDelayMs`).
- 5xx → lỗi hệ thống: log và retry theo chính sách.

## Ghi chú bảo mật

- Không ghi log khóa bí mật hoặc chữ ký.
- Luôn dùng HTTPS với domain SePay.
- Xác thực đầu vào trước khi tạo chữ ký.

## Khả năng mở rộng

- Tách lớp `SePayClient` để gom `baseUrl`, `merchantId`, `secretKey`, `config` (timeout/retry/userAgent).
- Bổ sung exponential backoff và jitter cho retry.
- Thêm unit test cho luồng chữ ký và gọi API.

## Tài liệu liên quan

- Tham khảo tài liệu nhà phát triển của SePay để cập nhật chi tiết API và webhook.