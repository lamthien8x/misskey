/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { GetterService } from '@/server/api/GetterService.js';
import { ApiError } from '../../error.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { SePayCheckoutService } from '@/core/SePayCheckoutService.js';
import type { Config } from '@/config.js';
import * as QRCode from 'qrcode';

export const meta = {
  tags: ['following','payments'],
  requireCredential: true,
  kind: 'read:following',
  res: {
    type: 'object',
    optional: false, nullable: false,
    properties: {
      qrDataUrl: { type: 'string' },
      paymentUrl: { type: 'string' },
      amountVnd: { type: 'integer' },
    },
  },
  errors: {
    noSuchUser: { message: 'No such user.', code: 'NO_SUCH_USER', id: 'fcd2eef9-a9b2-4c4f-8624-038099e90aa5' },
    priceNotSet: { message: 'Follow price not set by target.', code: 'PRICE_NOT_SET', id: 'eab8bd29-164f-4df2-9f8e-6a0ad403e3c2' },
    sepayConfigMissing: { message: 'SePay config missing', code: 'SEPAY_CONFIG_MISSING', id: 'd7e2e4f1-2222-4b0a-9001-ef6b7d1e9a01' },
  },
} as const;

export const paramDef = {
  type: 'object',
  properties: {
    userId: { type: 'string', format: 'misskey:id' },
  },
  required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
  constructor(
    @Inject(DI.config)
    private config: Config,

    @Inject(DI.usersRepository)
    private usersRepository: UsersRepository,

    @Inject(DI.userProfilesRepository)
    private userProfilesRepository: UserProfilesRepository,

    private getterService: GetterService,
    private userEntityService: UserEntityService,
    private sepayCheckoutService: SePayCheckoutService,
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

      const sepay = this.config.sepay;
      if (!sepay?.merchantId || !sepay?.secretKey) throw new ApiError(meta.errors.sepayConfigMissing);

      const invoice = `PF_${me.id.slice(0,8)}_${followee.id.slice(0,8)}_${Date.now()}`;
      const description = `Paid follow @${followee.username}${followee.host ? '@' + followee.host : ''} - 30 days`;

      const payload = {
        merchant: sepay.merchantId,
        currency: 'VND',
        order_amount: amount,
        operation: 'PURCHASE',
        order_description: description,
        order_invoice_number: invoice,
      };

      const sig = this.sepayCheckoutService.signPayload(payload, sepay.secretKey);
      const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
      const paymentUrl = `${this.config.url}/sepay/checkout?s=${encodeURIComponent(b64)}&sig=${encodeURIComponent(sig)}`;

      const qrDataUrl = await QRCode.toDataURL(paymentUrl, { margin: 1, scale: 6 });
      return {
        qrDataUrl,
        paymentUrl,
        amountVnd: amount,
      };
    });
  }
}