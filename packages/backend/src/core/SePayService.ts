import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { HttpRequestService } from './HttpRequestService.js';

@Injectable()
export class SePayService {
  constructor(
    @Inject(DI.config)
    private config: Config,
    private httpRequestService: HttpRequestService,
  ) {}

  public async verifyTransaction(transactionId: string): Promise<{ ok: boolean; amount?: number; raw?: any }> {
    const sepay = this.config.sepay;
    if (!sepay || !sepay.baseUrl || !sepay.apiKey) {
      return { ok: false };
    }
    const endpoint = (sepay.verifyEndpoint ?? '/transactions').replace(/\/$/, '');
    const url = `${sepay.baseUrl}${endpoint}/${transactionId}`;
    const headers = { Authorization: `Bearer ${sepay.apiKey}` };

    let retry = 0;
    while (retry < 3) {
      const res = await this.httpRequestService.send(url, { method: 'GET', headers }, { throwErrorWhenResponseNotOk: false });
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('x-sepay-userapi-retry-after') ?? '1');
        await new Promise(r => setTimeout(r, Math.max(1, retryAfter) * 1000));
        retry++;
        continue;
      }
      if (res.status !== 200) {
        return { ok: false };
      }
      const data = await res.json();
      const amount = Number((data?.amount ?? data?.data?.amount));
      const status = (data?.status ?? data?.data?.status ?? '').toString().toLowerCase();
      const ok = !!amount && (status === 'success' || status === 'completed' || status === 'paid');
      return { ok, amount: amount || undefined, raw: data };
    }
    return { ok: false };
  }
}