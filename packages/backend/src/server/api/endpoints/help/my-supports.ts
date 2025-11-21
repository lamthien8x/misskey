import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import * as Redis from 'ioredis';
import { ApiError } from '../../error.js';

export const meta = {
  tags: ['help'],
  limit: { duration: ms('1min'), max: 60 },
  requireCredential: true,
  kind: 'read:help',
  res: {
    type: 'object', optional: false, nullable: false,
    properties: { items: { type: 'array', items: { type: 'object' } } },
  },
  errors: {
    notFound: { message: 'Not found', code: 'NOT_FOUND', id: 'c0b8b90c-0a37-4b87-8faa-63a20c5f4520' },
  },
} as const;

export const paramDef = { type: 'object', properties: {} } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
  constructor(
    @Inject(DI.config) private config: Config,
    @Inject(DI.redis) private redis: Redis.Redis,
  ) {
    super(meta, paramDef, async (_ps, me) => {
      const ids = await this.redis.smembers('help:packages');
      const items: any[] = [];
      for (const id of ids) {
        const contribStr = await this.redis.get(`help:contrib:${id}:${me.id}`);
        if (!contribStr) continue;
        const pkgStr = await this.redis.get(`help:package:${id}`);
        if (!pkgStr) continue;
        const pkg = JSON.parse(pkgStr);
        const unlocked = !!JSON.parse(contribStr)?.paid;
        const confirmStr = await this.redis.get(`help:gift:confirm:${id}:${me.id}`);
        const reportStr = await this.redis.get(`help:gift:report:${id}:${me.id}`);
        items.push({
          id: pkg.id,
          authorId: pkg.authorId,
          amountVnd: pkg.amountVnd,
          rewardType: pkg.rewardType,
          rewardMediaFileIds: pkg.rewardMediaFileIds ?? [],
          content: pkg.content,
          status: pkg.status,
          createdAt: pkg.createdAt,
          unlocked,
          hasConfirmed: !!confirmStr,
          hasReported: !!reportStr,
        });
      }
      return { items };
    });
  }
}