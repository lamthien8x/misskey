import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import * as Redis from 'ioredis';
import { ApiError } from '../../error.js';

export const meta = {
  tags: ['help','admin'],
  limit: { duration: ms('1min'), max: 60 },
  requireCredential: true,
  kind: 'write:help',
  res: {
    type: 'object', optional: false, nullable: false,
    properties: { ok: { type: 'boolean' } },
  },
  errors: {
    notFound: { message: 'Not found', code: 'NOT_FOUND', id: 'c0b8b90c-0a37-4b87-8faa-63a20c5f4520' },
    invalid: { message: 'Invalid', code: 'INVALID', id: '8e93b69a-1f1c-4a41-9a1d-2f30a7b6e111' },
  },
} as const;

export const paramDef = { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string', enum: ['active','inactive'] } }, required: ['id','status'] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
  constructor(
    @Inject(DI.config) private config: Config,
    @Inject(DI.redis) private redis: Redis.Redis,
  ) {
    super(meta, paramDef, async (ps) => {
      const s = await this.redis.get(`help:package:${ps.id}`);
      if (!s) throw new ApiError(meta.errors.notFound);
      const o = JSON.parse(s);
      o.status = ps.status;
      await this.redis.set(`help:package:${ps.id}`, JSON.stringify(o));
      return { ok: true };
    });
  }
}