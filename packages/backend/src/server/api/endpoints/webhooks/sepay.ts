import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { MoreThan, IsNull } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { UsersRepository, UserProfilesRepository, PaidFollowsRepository } from '@/models/_.js';
import { GetterService } from '@/server/api/GetterService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { IdService } from '@/core/IdService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { SePayService } from '@/core/SePayService.js';
import type { Config } from '@/config.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['webhooks', 'following', 'users'],

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

export const paramDef = {
	type: 'object',
	properties: {
		content: { type: 'string', nullable: true },
		description: { type: 'string', nullable: true },
		transaction_content: { type: 'string', nullable: true },
		transactionContent: { type: 'string', nullable: true },
		body: { type: 'string', nullable: true },
		message: { type: 'string', nullable: true },
		transferAmount: { type: 'integer', nullable: true },
		amount_in: { type: 'integer', nullable: true },
		amountIn: { type: 'integer', nullable: true },
		amount: { type: 'integer', nullable: true },
	},
	additionalProperties: true,
} as const;

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
		super(meta, paramDef, async (ps, _user, _token, _file, _cleanup, _ip, headers) => {
			// Optional API key auth (depends on SePay webhook config)
			const apiKey = this.config.sepay?.apiKey;
			const hAuth = (headers?.authorization ?? headers?.Authorization ?? '') as string;
			const hXApiKey = (headers?.['x-api-key'] ?? headers?.['X-Api-Key'] ?? headers?.['x-sepay-api-key'] ?? headers?.['X-Sepay-Api-Key'] ?? '') as string;
			const body = ps as any;
			console.log('[webhooks/sepay] Received body:', JSON.stringify(body));
			if (!body) {
				// This block seems incomplete in the instruction, but I'll add it as provided.
				// The original `bodyApiKey` declaration is moved below this `if` block.
			}
			const bodyApiKey = ((ps as any)?.apiKey ?? (ps as any)?.api_key ?? '') as string;
			if (apiKey) {
				const normalized = hAuth.toString().replace(/^Bearer\s+/i, '').trim();
				const presented = (normalized || hXApiKey || bodyApiKey).toString().trim();
				if (presented !== apiKey) throw new ApiError(meta.errors.unauthorized);
			}

			const ct = String((headers?.['content-type'] ?? headers?.['Content-Type'] ?? ''));
			const payload: any = ps as any;
			const contentCandidate = (payload?.content ?? payload?.description ?? payload?.transaction_content ?? payload?.transactionContent ?? payload?.message ?? payload?.body ?? '') as string;
			const transferAmount = Number(payload?.transferAmount ?? payload?.amount_in ?? payload?.amountIn ?? payload?.amount ?? 0);
			console.log('[webhooks/sepay] content-type:', ct);
			console.log('[webhooks/sepay] content:', typeof contentCandidate === 'string' ? contentCandidate.slice(0, 200) : contentCandidate);
			console.log('[webhooks/sepay] transferAmount:', transferAmount);
			let token: string | undefined = contentCandidate?.match(/(?:PF|PH)_?[A-Za-z0-9]+/)?.[0];
			if (!token && typeof payload === 'object' && payload) {
				for (const v of Object.values(payload)) {
					if (typeof v === 'string') { const m = v.match(/(?:PF|PH)_?[A-Za-z0-9]+/); if (m) { token = m[0]; break; } }
				}
			}
			console.log('[webhooks/sepay] token extracted:', token);
			if (!token) throw new ApiError(meta.errors.tokenNotFound);

			const mappingStr = await this.redis.get(`sepay:token:${token}`);
			console.log('[webhooks/sepay] redis get token key exists:', !!mappingStr);
			let mapping = mappingStr ? JSON.parse(mappingStr) : null;
			if (!mapping && /^(PF|PH)(?!_)/.test(token)) {
				const alt = token.replace(/^(PF|PH)(?!_)/, '$1_');
				const altStr = await this.redis.get(`sepay:token:${alt}`);
				console.log('[webhooks/sepay] redis get alt token key exists:', !!altStr);
				mapping = altStr ? JSON.parse(altStr) : null;
			}
			if (!mapping) {
				const keys = await this.redis.keys('sepay:token:*');
				console.log('[webhooks/sepay] redis keys count:', keys.length);
				const prefix = this.redis.options.keyPrefix ?? '';
				for (const k of keys) {
					const key = k.startsWith(prefix) ? k.slice(prefix.length) : k;
					const v = await this.redis.get(key);
					if (!v) continue;
					const m = JSON.parse(v);
					if (Number(m.amount) === Number(transferAmount)) { mapping = m; break; }
				}
				console.log('[webhooks/sepay] mapping after amount fallback exists:', !!mapping);
			}
			if (!mapping) {
				const helpStr = await this.redis.get(`sepay:help:token:${token}`);
				let help = helpStr ? JSON.parse(helpStr) : null;
				if (!help && /^(PH)(?!_)/.test(token)) {
					const alt = token.replace(/^(PH)(?!_)/, '$1_');
					const altStr = await this.redis.get(`sepay:help:token:${alt}`);
					help = altStr ? JSON.parse(altStr) : null;
				}
				if (!help) {
					const keys = await this.redis.keys('sepay:help:token:*');
					const prefix = this.redis.options.keyPrefix ?? '';
					console.log('[webhooks/sepay] Searching help token in keys:', keys.length);
					for (const k of keys) {
						const key = k.startsWith(prefix) ? k.slice(prefix.length) : k;
						const v = await this.redis.get(key);
						if (!v) continue;
						const m = JSON.parse(v);
						console.log('[webhooks/sepay] Checking key:', key, 'Value:', m);
						if (Number(m.amount) === Number(transferAmount)) {
							help = m;
							console.log('[webhooks/sepay] Match found for amount:', transferAmount);
							break;
						} else {
							console.log('[webhooks/sepay] Amount mismatch. Record:', m.amount, 'Transfer:', transferAmount);
						}
					}
				}
				if (help) {
					const s = await this.redis.get(`help:package:${help.packageId}`);
					if (!s) throw new ApiError(meta.errors.noSuchUser);
					const pkg = JSON.parse(s);
					if (!(transferAmount >= Number(pkg.amountVnd))) throw new ApiError(meta.errors.invalidStatus);

					// Record the contribution
					await this.redis.set(`help:contrib:${help.packageId}:${help.supporterId}`, JSON.stringify({ paid: true, amount: transferAmount, at: Date.now() }));

					// Increment supporter count and total amount
					await this.redis.incr(`help:package:${help.packageId}:supportersCount`);
					await this.redis.incrby(`help:package:${help.packageId}:totalAmount`, transferAmount);

					console.log(`[webhooks/sepay] Help package ${help.packageId} updated: supporter ${help.supporterId}, amount ${transferAmount}`);

					await this.redis.del(`sepay:help:token:${token}`);
					await this.redis.del(`sepay:token:${token}`);
					return { ok: true };
				}
			}
			if (!mapping) {
				const followerUsername = (payload?.followerUsername ?? payload?.follower ?? '') as string;
				const followeeUsername = (payload?.followeeUsername ?? payload?.followee ?? '') as string;
				const followerId = (payload?.followerId ?? '') as string;
				const followeeId = (payload?.followeeId ?? '') as string;
				let follower = null;
				let followee = null;
				if (followerId) follower = await this.getterService.getUser(followerId).catch(() => null);
				if (followeeId) followee = await this.getterService.getUser(followeeId).catch(() => null);
				if (!follower && followerUsername) follower = await this.usersRepository.findOneBy({ usernameLower: followerUsername.toLowerCase(), host: IsNull(), isSuspended: false }).catch(() => null);
				if (!followee && followeeUsername) followee = await this.usersRepository.findOneBy({ usernameLower: followeeUsername.toLowerCase(), host: IsNull(), isSuspended: false }).catch(() => null);
				if (follower && followee) {
					mapping = { followerId: follower.id, followeeId: followee.id, amount: transferAmount } as any;
					console.log('[webhooks/sepay] manual mapping via usernames/ids applied');
				}
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
			await this.redis.del(`sepay:token:${token}`);
			return { ok: true };
		});
	}
}
