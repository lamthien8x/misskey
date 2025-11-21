import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { UsersRepository, UserProfilesRepository, RoleAssignmentsRepository } from '@/models/_.js';
import { GetterService } from '@/server/api/GetterService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { IdService } from '@/core/IdService.js';
import type { Config } from '@/config.js';
import { MetaService } from '@/core/MetaService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['help', 'payments'],
	limit: { duration: ms('1min'), max: 30 },
	requireCredential: true,
	secure: true,
	kind: 'write:help',
	res: {
		type: 'object', optional: false, nullable: false,
		properties: { id: { type: 'string' } },
	},
	errors: {
		notEligible: { message: 'User not eligible', code: 'NOT_ELIGIBLE', id: 'b3f2d694-2d6f-4f47-9a3d-3b3c7c19a111' },
		invalidParam: { message: 'Invalid params', code: 'INVALID_PARAM', id: '3d81ceae-475f-4600-b2a8-2bc116157532' },
		limitExceeded: { message: 'Limit exceeded', code: 'LIMIT_EXCEEDED', id: '8d81ceae-475f-4600-b2a8-2bc116157533' },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		amountVnd: { type: 'integer' },
		rewardType: { type: 'string', enum: ['none', 'direct', 'online'] },
		rewardMediaFileIds: { type: 'array', nullable: true, items: { type: 'string' } },
		content: { type: 'string' },
	},
	required: ['amountVnd', 'rewardType', 'content'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.config) private config: Config,
		@Inject(DI.usersRepository) private usersRepository: UsersRepository,
		@Inject(DI.userProfilesRepository) private userProfilesRepository: UserProfilesRepository,
		@Inject(DI.roleAssignmentsRepository) private roleAssignmentsRepository: RoleAssignmentsRepository,
		private getterService: GetterService,
		private userEntityService: UserEntityService,
		private idService: IdService,
		private metaService: MetaService,
		@Inject(DI.redis) private redis: Redis.Redis,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (!this.userEntityService.isLocalUser(me)) throw new ApiError(meta.errors.notEligible);
			// Eligibility relaxed: only require login (handled by requireCredential)

			// Check if user has at least one role
			const roleCount = await this.roleAssignmentsRepository.count({
				where: { userId: me.id },
			});
			if (roleCount === 0) {
				throw new ApiError(meta.errors.notEligible);
			}

			const serverMeta = await this.metaService.fetch();
			if (serverMeta.maxHelpPackagesPerUser > 0) {
				const ids = await this.redis.smembers('help:packages');
				const pipeline = this.redis.pipeline();
				for (const id of ids) {
					pipeline.get(`help:package:${id}`);
				}
				const results = await pipeline.exec();
				let count = 0;
				if (results) {
					for (const [err, res] of results) {
						if (err || !res) continue;
						try {
							const pkg = JSON.parse(res as string);
							if (pkg.authorId === me.id && pkg.status === 'active') {
								count++;
							}
						} catch (e) { }
					}
				}
				if (count >= serverMeta.maxHelpPackagesPerUser) {
					throw new ApiError(meta.errors.limitExceeded);
				}
			}

			const amount = Number(ps.amountVnd);
			if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(meta.errors.invalidParam);
			if (ps.rewardType === 'online') {
				const files = Array.isArray(ps.rewardMediaFileIds) ? ps.rewardMediaFileIds.filter(x => typeof x === 'string') : [];
				const ok = files.length >= 3 || files.length === 1;
				if (!ok) throw new ApiError(meta.errors.invalidParam);
			}

			const id = `HP_${this.idService.gen().slice(0, 8)}`;
			const record = {
				id,
				authorId: me.id,
				amountVnd: amount,
				rewardType: ps.rewardType,
				rewardMediaFileIds: ps.rewardMediaFileIds ?? [],
				content: ps.content,
				status: 'active',
				createdAt: Date.now(),
			};
			await this.redis.sadd('help:packages', id);
			await this.redis.set(`help:package:${id}`, JSON.stringify(record));
			return { id };
		});
	}
}
