/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

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

export const meta = {
  tags: ['following','users'],

  limit: {
    duration: ms('1hour'),
    max: 100,
  },

  requireCredential: true,
  kind: 'write:following',

  errors: {
    noSuchUser: {
      message: 'No such user.',
      code: 'NO_SUCH_USER',
      id: 'fcd2eef9-a9b2-4c4f-8624-038099e90aa5',
    },
    selfPurchase: {
      message: 'Cannot purchase for yourself.',
      code: 'SELF_PURCHASE',
      id: 'a3b2dcd7-4b2f-4c7d-9c3a-87c9a8f8d311',
    },
    priceNotSet: {
      message: 'Follow price not set by target.',
      code: 'PRICE_NOT_SET',
      id: 'eab8bd29-164f-4df2-9f8e-6a0ad403e3c2',
    },
  },

  res: {
    type: 'object',
    optional: false, nullable: false,
    properties: {
      expiresAt: { type: 'string' },
    },
  },
} as const;

export const paramDef = {
  type: 'object',
  properties: {
    userId: { type: 'string', format: 'misskey:id' },
    transactionId: { type: 'string' },
  },
  required: ['userId', 'transactionId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
  constructor(
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
  ) {
    super(meta, paramDef, async (ps, me) => {
      if (me.id === ps.userId) throw new ApiError(meta.errors.selfPurchase);

      const followee = await this.getterService.getUser(ps.userId).catch(err => {
        if (err.id === '15348ddd-432d-49c2-8a5a-8069753becff') throw new ApiError(meta.errors.noSuchUser);
        throw err;
      });

      // Only support local-to-local for now
      if (!this.userEntityService.isLocalUser(me) || !this.userEntityService.isLocalUser(followee)) {
        throw new ApiError(meta.errors.noSuchUser);
      }

      const profile = await this.userProfilesRepository.findOneByOrFail({ userId: followee.id });
      const price = profile.followPriceMonthly ?? 0;
      if (price <= 0) throw new ApiError(meta.errors.priceNotSet);

      const verify = await this.sepayService.verifyTransaction(ps.transactionId);
      if (!verify.ok || (verify.amount ?? 0) < price) {
        throw new ApiError(meta.errors.priceNotSet);
      }

      const expires = new Date(Date.now() + ms('30d'));

      await this.paidFollowsRepository.insert({
        id: this.idService.gen(),
        followerId: me.id,
        followeeId: followee.id,
        amount: verify.amount ?? price,
        expiresAt: expires,
      });

      await this.userFollowingService.follow(me, followee);

      return { expiresAt: expires.toISOString() };
    });
  }
}