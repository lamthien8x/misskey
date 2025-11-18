import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { GetterService } from '@/server/api/GetterService.js';
import { ApiError } from '../../error.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { IdService } from '@/core/IdService.js';
import { SePayPgService } from '@/core/SePayPgService.js';
import type { Config } from '@/config.js';
import * as Redis from 'ioredis';

export const meta = {
  tags: ['following','payments'],
  limit: { duration: ms('1hour'), max: 100 },
  requireCredential: true,
  kind: 'write:following',
  res: {
    type: 'object', optional: false, nullable: false,
    properties: { redirectUrl: { type: 'string' } },
  },
  errors: {
    noSuchUser: { message: 'No such user.', code: 'NO_SUCH_USER', id: 'fcd2eef9-a9b2-4c4f-8624-038099e90aa5' },
    priceNotSet: { message: 'Follow price not set by target.', code: 'PRICE_NOT_SET', id: 'eab8bd29-164f-4df2-9f8e-6a0ad403e3c2' },
    sepayConfigMissing: { message: 'SePay config missing', code: 'SEPAY_CONFIG_MISSING', id: 'd7e2e4f1-2222-4b0a-9001-ef6b7d1e9a01' },
  },
} as const;

export const paramDef = {
  type: 'object',
  properties: { userId: { type: 'string', format: 'misskey:id' } },
  required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
  constructor(
    @Inject(DI.config) private config: Config,
    @Inject(DI.usersRepository) private usersRepository: UsersRepository,
    @Inject(DI.userProfilesRepository) private userProfilesRepository: UserProfilesRepository,
    private getterService: GetterService,
    private userEntityService: UserEntityService,
    private idService: IdService,
    private sepayPgService: SePayPgService,
    @Inject(DI.redis) private redis: Redis.Redis,
  ) {
    super(meta, paramDef, async (ps, me) => {
      const followee = await this.getterService.getUser(ps.userId).catch(err => {
        if (err.id === '15348ddd-432d-49c2-8a5a-8069753becff') throw new ApiError(meta.errors.noSuchUser);
        throw err;
      });

      if (!this.userEntityService.isLocalUser(me) || !this.userEntityService.isLocalUser(followee)) {
        throw new ApiError(meta.errors.noSuchUser);
      }

      const profile = await this.userProfilesRepository.findOneByOrFail({ userId: followee.id });
      const amount = Number(profile.followPriceMonthly ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(meta.errors.priceNotSet);

      if (!this.sepayPgService.isConfigured()) throw new ApiError(meta.errors.sepayConfigMissing);

      const invoice = `PF_${me.id.slice(0,8)}_${followee.id.slice(0,8)}_${Date.now()}`;
      const description = `Paid follow @${followee.username}${followee.host ? '@' + followee.host : ''} - 30 days`;

      const fields = this.sepayPgService.initOneTimePaymentFields({
        orderInvoiceNumber: invoice,
        amountVnd: amount,
        description,
        successUrl: `${this.config.url}/`,
        errorUrl: `${this.config.url}/`,
        cancelUrl: `${this.config.url}/`,
      });
      if (!fields) throw new ApiError(meta.errors.sepayConfigMissing);
      const checkoutUrl = this.sepayPgService.initCheckoutUrl();

      const ticket = this.idService.gen();
      await this.redis.setex(`${this.config.redis.prefix}:sepay:ticket:${ticket}`, 60 * 15, JSON.stringify({ fields, checkoutUrl }));
      const redirectUrl = `${this.config.url}/sepay/checkout?ticket=${encodeURIComponent(ticket)}`;
      return { redirectUrl };
    });
  }
}