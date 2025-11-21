import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import * as Redis from 'ioredis';

export const meta = {
  tags: ['help','admin'],
  limit: { duration: ms('1min'), max: 60 },
  requireCredential: true,
  kind: 'read:help',
  res: {
    type: 'object', optional: false, nullable: false,
    properties: { items: { type: 'array', items: { type: 'object' } } },
  },
} as const;

export const paramDef = { type: 'object', properties: { includeInactive: { type: 'boolean', nullable: true } } } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
  constructor(
    @Inject(DI.config) private config: Config,
    @Inject(DI.redis) private redis: Redis.Redis,
  ) {
    super(meta, paramDef, async (ps) => {
      const ids = await this.redis.smembers('help:packages');
      const items: any[] = [];
      for (const id of ids) {
        const s = await this.redis.get(`help:package:${id}`);
        if (!s) continue;
        const o = JSON.parse(s);
        if (!ps?.includeInactive && o.status !== 'active') continue;
        const contribKeys = await this.redis.keys(`help:contrib:${id}:*`);
        const confirmKeys = await this.redis.keys(`help:gift:confirm:${id}:*`);
        const reportKeys = await this.redis.keys(`help:gift:report:${id}:*`);
        let lastSupportAt = 0;
        for (const k of contribKeys) {
          const v = await this.redis.get(k); if (!v) continue;
          const j = JSON.parse(v); if (j?.at && j.at > lastSupportAt) lastSupportAt = j.at;
        }
        let lastReportAt = 0;
        for (const k of reportKeys) {
          const v = await this.redis.get(k); if (!v) continue;
          const j = JSON.parse(v); if (j?.at && j.at > lastReportAt) lastReportAt = j.at;
        }
        items.push({
          ...o,
          supporterCount: contribKeys.length,
          confirmCount: confirmKeys.length,
          reportCount: reportKeys.length,
          lastSupportAt,
          lastReportAt,
        });
      }
      return { items };
    });
  }
}