import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import * as Redis from 'ioredis';
import { ApiError } from '../../error.js';

export const meta = {
  tags: ['help','payments'],
  limit: { duration: ms('1min'), max: 60 },
  requireCredential: true,
  kind: 'read:help',
  res: {
    type: 'object', optional: false, nullable: false,
    properties: { unlocked: { type: 'boolean' }, rewardMediaFileIds: { type: 'array', items: { type: 'string' }, nullable: true } },
  },
  errors: {
    notFound: { message: 'Not found', code: 'NOT_FOUND', id: 'c0b8b90c-0a37-4b87-8faa-63a20c5f4520' },
  },
} as const;

export const paramDef = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
  constructor(
    @Inject(DI.config) private config: Config,
    @Inject(DI.redis) private redis: Redis.Redis,
  ) {
    super(meta, paramDef, async (ps, me) => {
      const contrib = await this.redis.get(`help:contrib:${ps.id}:${me.id}`);
      if (!contrib) return { unlocked: false, rewardMediaFileIds: null };
      const s = await this.redis.get(`help:package:${ps.id}`);
      if (!s) throw new ApiError(meta.errors.notFound);
      const pkg = JSON.parse(s);
      const unlocked = !!JSON.parse(contrib)?.paid;
      return { unlocked, rewardMediaFileIds: unlocked && pkg.rewardType === 'online' ? pkg.rewardMediaFileIds : null };
    });
  }
}