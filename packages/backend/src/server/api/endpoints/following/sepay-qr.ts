import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { UsersRepository, UserProfilesRepository } from '@/models/_.js';
import { GetterService } from '@/server/api/GetterService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { IdService } from '@/core/IdService.js';
import type { Config } from '@/config.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['following', 'payments'],
	limit: { duration: ms('1hour'), max: 100 },
	requireCredential: true,
	kind: 'read:following',
	res: {
		type: 'object', optional: false, nullable: false,
		properties: { qrUrl: { type: 'string' }, token: { type: 'string' }, amountVnd: { type: 'integer' } },
	},
	errors: {
		noSuchUser: { message: 'No such user.', code: 'NO_SUCH_USER', id: 'fcd2eef9-a9b2-4c4f-8624-038099e90aa5' },
		priceNotSet: { message: 'Follow price not set by target.', code: 'PRICE_NOT_SET', id: 'eab8bd29-164f-4df2-9f8e-6a0ad403e3c2' },
		sepayConfigMissing: { message: 'SePay config missing', code: 'SEPAY_CONFIG_MISSING', id: 'd7e2e4f1-2222-4b0a-9001-ef6b7d1e9a01' },
		sepayQrConfigMissing: { message: 'SePay QR config missing', code: 'SEPAY_QR_CONFIG_MISSING', id: 'a1b2c3d4-3333-4444-5555-666677778888' },
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

			const sepay = this.config.sepay;
			if (!sepay?.qrAccount || !sepay?.qrBank) throw new ApiError(meta.errors.sepayQrConfigMissing);

			const token = `PF_${this.idService.gen().slice(0, 8)}`;
			const des = encodeURIComponent(`${token}`);
			const qrUrl = `${sepay.qrBase}?acc=${encodeURIComponent(sepay.qrAccount)}&bank=${encodeURIComponent(sepay.qrBank)}&amount=${amount}&des=${des}`;

			await this.redis.setex(`${this.config.redis.prefix}:sepay:token:${token}`, 60 * 60, JSON.stringify({ followerId: me.id, followeeId: followee.id, amount }));
			return { qrUrl, token, amountVnd: amount };
		});
	}
}
