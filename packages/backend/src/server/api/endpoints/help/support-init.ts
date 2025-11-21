import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import * as Redis from 'ioredis';
import { ApiError } from '../../error.js';
import { IdService } from '@/core/IdService.js';

export const meta = {
  tags: ['help','payments'],
  limit: { duration: ms('1min'), max: 60 },
  requireCredential: true,
  kind: 'write:help',
  res: {
    type: 'object', optional: false, nullable: false,
    properties: { qrUrl: { type: 'string' }, token: { type: 'string' }, amountVnd: { type: 'integer' } },
  },
  errors: {
    notFound: { message: 'Not found', code: 'NOT_FOUND', id: 'c0b8b90c-0a37-4b87-8faa-63a20c5f4520' },
    sepayQrConfigMissing: { message: 'SePay QR config missing', code: 'SEPAY_QR_CONFIG_MISSING', id: 'a1b2c3d4-3333-4444-5555-666677778888' },
  },
} as const;

export const paramDef = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
  constructor(
    @Inject(DI.config) private config: Config,
    @Inject(DI.redis) private redis: Redis.Redis,
    private idService: IdService,
  ) {
    super(meta, paramDef, async (ps, me) => {
      const s = await this.redis.get(`help:package:${ps.id}`);
      if (!s) throw new ApiError(meta.errors.notFound);
      const pkg = JSON.parse(s);
      const sepay = this.config.sepay;
      if (!sepay?.qrAccount || !sepay?.qrBank) throw new ApiError(meta.errors.sepayQrConfigMissing);

      const token = `PH_${this.idService.gen().slice(0,8)}`;
      const des = encodeURIComponent(`${token}`);
      const qrUrl = `${sepay.qrBase}?acc=${encodeURIComponent(sepay.qrAccount)}&bank=${encodeURIComponent(sepay.qrBank)}&amount=${pkg.amountVnd}&des=${des}`;

      const payload = JSON.stringify({ packageId: pkg.id, supporterId: me.id, amount: pkg.amountVnd });
      await this.redis.setex(`sepay:help:token:${token}`, 60 * 60, payload);
      return { qrUrl, token, amountVnd: pkg.amountVnd };
    });
  }
}