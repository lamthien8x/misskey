import { Inject, Injectable } from '@nestjs/common';
import { SePayPgClient } from 'sepay-pg-node';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';

@Injectable()
export class SePayPgService {
  private client: SePayPgClient | null = null;

  constructor(
    @Inject(DI.config)
    private config: Config,
  ) {
    const sepay = this.config.sepay;
    if (sepay?.merchantId && sepay.secretKey) {
      this.client = new SePayPgClient({
        env: (sepay.env as any) ?? 'sandbox',
        merchant_id: sepay.merchantId,
        secret_key: sepay.secretKey,
      });
    }
  }

  public isConfigured(): boolean {
    return this.client != null;
  }

  public initOneTimePaymentFields(params: {
    orderInvoiceNumber: string;
    amountVnd: number;
    description: string;
    successUrl?: string;
    errorUrl?: string;
    cancelUrl?: string;
  }): Record<string, string | number> | null {
    if (!this.client) return null;
    const fields = this.client.checkout.initOneTimePaymentFields({
      operation: 'PURCHASE',
      payment_method: 'BANK_TRANSFER',
      order_invoice_number: params.orderInvoiceNumber,
      order_amount: params.amountVnd,
      currency: 'VND',
      order_description: params.description,
      success_url: params.successUrl,
      error_url: params.errorUrl,
      cancel_url: params.cancelUrl,
    } as any);
    return fields as any;
  }

  public initCheckoutUrl(): string {
    if (!this.client) return '';
    return this.client.checkout.initCheckoutUrl();
  }
}