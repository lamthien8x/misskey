import { Inject, Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';

type CheckoutFields = Record<string, string>;

@Injectable()
export class SePayCheckoutService {
  constructor(
    @Inject(DI.config)
    private config: Config,
  ) {}

  public signCheckoutFields(fields: CheckoutFields, secretKey: string): string {
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

  public buildFormFields(data: {
    merchantId: string;
    secretKey: string;
    amountVnd: number;
    invoiceNumber: string;
    description: string;
    successUrl?: string;
    errorUrl?: string;
    cancelUrl?: string;
  }): CheckoutFields {
    const fields: CheckoutFields = {
      merchant: String(data.merchantId),
      currency: 'VND',
      order_amount: String(data.amountVnd),
      operation: 'PURCHASE',
      order_description: String(data.description),
      order_invoice_number: String(data.invoiceNumber),
    };
    if (data.successUrl) fields.success_url = String(data.successUrl);
    if (data.errorUrl) fields.error_url = String(data.errorUrl);
    if (data.cancelUrl) fields.cancel_url = String(data.cancelUrl);
    fields.signature = this.signCheckoutFields(fields, data.secretKey);
    return fields;
  }

  public getCheckoutUrl(): string {
    const custom = this.config.sepay?.checkoutBaseUrl;
    if (custom) return `${custom.replace(/\/$/, '')}/v1/checkout/init`;
    const apiBase = this.config.sepay?.baseUrl ?? '';
    if (apiBase.includes('pgapi-sandbox.sepay.vn')) return 'https://pay-sandbox.sepay.vn/v1/checkout/init';
    if (apiBase.includes('pgapi.sepay.vn')) return 'https://pay.sepay.vn/v1/checkout/init';
    return 'https://pay.sepay.vn/v1/checkout/init';
  }

  public buildAutoSubmitHtml(actionUrl: string, formFields: CheckoutFields, formAttrs?: Record<string, string>): string {
    const defaults = { method: 'POST', action: actionUrl } as Record<string, string>;
    const all = { ...defaults, ...(formAttrs ?? {}) };
    let html = '<!doctype html><html><head><meta charset="utf-8"><title>SePay Checkout</title></head><body>';
    html += '<form';
    for (const [k, v] of Object.entries(all)) html += ` ${k}="${String(v).replace(/"/g, '&quot;')}"`;
    html += '>';
    for (const [name, value] of Object.entries(formFields)) {
      html += `<input type="hidden" name="${name}" value="${String(value).replace(/"/g, '&quot;')}">`;
    }
    html += '<noscript><button type="submit">Proceed to Payment</button></noscript>';
    html += '</form>';
    html += '<script>document.forms[0].submit();</script>';
    html += '</body></html>';
    return html;
  }

  public signPayload(payload: object, secretKey: string): string {
    const json = JSON.stringify(payload);
    return crypto.createHmac('sha256', secretKey).update(json).digest('hex');
  }

  public verifyPayload(payloadB64: string, sigHex: string, secretKey: string): any | null {
    try {
      const json = Buffer.from(payloadB64, 'base64').toString('utf8');
      const sig = crypto.createHmac('sha256', secretKey).update(json).digest('hex');
      if (sig !== sigHex) return null;
      return JSON.parse(json);
    } catch { return null; }
  }
}