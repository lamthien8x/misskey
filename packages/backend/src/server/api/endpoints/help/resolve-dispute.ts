import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import * as Redis from 'ioredis';
import { ApiError } from '../../error.js';

export const meta = {
  tags: ['help', 'admin'],
  limit: { duration: ms('1min'), max: 60 },
  requireCredential: true,
  requireAdmin: true,
  kind: 'write:help',
  res: {
    type: 'object', optional: false, nullable: false,
    properties: { ok: { type: 'boolean' } },
  },
  errors: {
    notFound: { message: 'Not found', code: 'NOT_FOUND', id: 'c0b8b90c-0a37-4b87-8faa-63a20c5f4520' },
  },
} as const;

export const paramDef = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        userId: { type: 'string' },
        decision: { type: 'string', enum: ['refund', 'deliver', 'dismiss'] },
    },
    required: ['id', 'userId', 'decision'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
  constructor(
    @Inject(DI.config) private config: Config,
    @Inject(DI.redis) private redis: Redis.Redis,
  ) {
    super(meta, paramDef, async (ps, me) => {
      const pkg = await this.redis.get(`help:package:${ps.id}`);
      if (!pkg) throw new ApiError(meta.errors.notFound);

      if (ps.decision === 'refund') {
          // Mark contribution as refunded
          const contribKey = `help:contrib:${ps.id}:${ps.userId}`;
          const contrib = await this.redis.get(contribKey);
          if (contrib) {
              const c = JSON.parse(contrib);
              c.refunded = true;
              c.paid = false;
              await this.redis.set(contribKey, JSON.stringify(c));
          }
          // Remove report if exists
          await this.redis.del(`help:gift:report:${ps.id}:${ps.userId}`);
          // Remove confirm if exists (shouldn't be confirmed if refunded, but just in case)
          await this.redis.del(`help:gift:confirm:${ps.id}:${ps.userId}`);
      } else if (ps.decision === 'deliver') {
          // Mark as confirmed
          await this.redis.set(`help:gift:confirm:${ps.id}:${ps.userId}`, JSON.stringify({ at: Date.now(), byAdmin: true }));
          // Remove report
          await this.redis.del(`help:gift:report:${ps.id}:${ps.userId}`);
      } else if (ps.decision === 'dismiss') {
          // Just remove the report
          await this.redis.del(`help:gift:report:${ps.id}:${ps.userId}`);
      }

      return { ok: true };
    });
  }
}
