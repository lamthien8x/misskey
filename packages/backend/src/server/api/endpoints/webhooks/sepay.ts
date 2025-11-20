import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { UsersRepository, UserProfilesRepository, PaidFollowsRepository } from '@/models/_.js';
import { GetterService } from '@/server/api/GetterService.js';
import { ApiError } from '../../error.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { IdService } from '@/core/IdService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { SePayService } from '@/core/SePayService.js';
import * as Redis from 'ioredis';
import type { Config } from '@/config.js';
import { MoreThan } from 'typeorm';

export const meta = {
  tags: ['webhooks','following','users'],

  limit: {
    duration: ms('1min'),
    max: 300,
  },

  requireCredential: false,
  kind: 'write:system',

  errors: {
    unauthorized: { message: 'Unauthorized webhook', code: 'UNAUTHORIZED', id: 'f7a9b6a2-2bde-4f67-9b19-8a7e5d2ac111' },
    noSuchUser: { message: 'No such user.', code: 'NO_SUCH_USER', id: 'fcd2eef9-a9b2-4c4f-8624-038099e90aa5' },
    invalidStatus: { message: 'Invalid transaction status.', code: 'INVALID_STATUS', id: '2b0f7d0f-ba4e-497a-8f52-bb7b8d2db2f9' },
    tokenNotFound: { message: 'Token not found', code: 'TOKEN_NOT_FOUND', id: '8dd3c2e8-7f9e-4b9e-bc7d-1111aa22bb33' },
  },

  res: {
    type: 'object',
    optional: false, nullable: false,
    properties: {
      ok: { type: 'boolean' },
    },
  },
} as const;

export const paramDef = { type: 'object', properties: {} } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
  constructor(
    @Inject(DI.config)
    private config: Config,

    @Inject(DI.usersRepository)
    private usersRepository: UsersRepository,

    @Inject(DI.userProfilesRepository)
    private userProfilesRepository: UserProfilesRepository,

    @Inject(DI.paidFollowsRepository)
    private paidFollowsRepository: PaidFollowsRepository,

    private getterService: GetterService,
    private userEntityService: UserEntityService,
    private idService: IdService,
    private userFollowingService: UserFollowingService,
    private sepayService: SePayService,
    @Inject(DI.redis) private redis: Redis.Redis,
  ) {
    super(meta, paramDef, async (_ps, _user, _token, _file, _cleanup, _ip, headers, body) => {
      // Optional API key auth (depends on SePay webhook config)
      const apiKey = this.config.sepay?.apiKey;
      const hAuth = (headers?.authorization ?? headers?.Authorization ?? '') as string;
      const hXApiKey = (headers?.['x-api-key'] ?? headers?.['X-Api-Key'] ?? headers?.['x-sepay-api-key'] ?? headers?.['X-Sepay-Api-Key'] ?? '') as string;
      const bodyApiKey = (body?.apiKey ?? body?.api_key ?? '') as string;
      if (apiKey) {
        const normalized = hAuth.toString().replace(/^Bearer\s+/i, '').trim();
        const presented = (normalized || hXApiKey || bodyApiKey).toString().trim();
        if (presented !== apiKey) throw new ApiError(meta.errors.unauthorized);
      }

      const content: string = (body?.content ?? body?.description ?? '') as string;
      const transferAmount: number = Number(body?.transferAmount ?? 0);
      const tokenMatch = content?.match(/PF_?[A-Za-z0-9]+/);
      const token = tokenMatch?.[0];
      if (!token) throw new ApiError(meta.errors.tokenNotFound);

      const mappingStr = await this.redis.get(`${this.config.redis.prefix}:sepay:token:${token}`);
      let mapping = mappingStr ? JSON.parse(mappingStr) : null;
      if (!mapping && /^PF(?!_)/.test(token)) {
        const alt = token.replace(/^PF(?!_)/, 'PF_');
        const altStr = await this.redis.get(`${this.config.redis.prefix}:sepay:token:${alt}`);
        mapping = altStr ? JSON.parse(altStr) : null;
      }
      if (!mapping) throw new ApiError(meta.errors.tokenNotFound);

      const follower = await this.getterService.getUser(mapping.followerId).catch(err => {
        if (err.id === '15348ddd-432d-49c2-8a5a-8069753becff') throw new ApiError(meta.errors.noSuchUser);
        throw err;
      });
      const followee = await this.getterService.getUser(mapping.followeeId).catch(err => {
        if (err.id === '15348ddd-432d-49c2-8a5a-8069753becff') throw new ApiError(meta.errors.noSuchUser);
        throw err;
      });

      if (!this.userEntityService.isLocalUser(follower) || !this.userEntityService.isLocalUser(followee)) {
        throw new ApiError(meta.errors.noSuchUser);
      }

      const profile = await this.userProfilesRepository.findOneByOrFail({ userId: followee.id });
      const price = Number(profile.followPriceMonthly ?? 0);

      const amount = transferAmount;
      if (!(amount >= price && amount >= Number(mapping.amount ?? 0))) throw new ApiError(meta.errors.invalidStatus);

      const now = new Date();
      const exists = await this.paidFollowsRepository.exists({
        where: { followerId: follower.id, followeeId: followee.id, expiresAt: MoreThan(now) },
      });
      if (!exists) {
        const expires = new Date(Date.now() + ms('30d'));
        await this.paidFollowsRepository.insert({
          id: this.idService.gen(),
          followerId: follower.id,
          followeeId: followee.id,
          amount,
          expiresAt: expires,
        });
      }

      await this.userFollowingService.follow(follower, followee);
      await this.redis.del(`${this.config.redis.prefix}:sepay:token:${token}`);
      return { ok: true };
    });
  }
}