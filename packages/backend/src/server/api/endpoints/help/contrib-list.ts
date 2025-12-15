import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import * as Redis from 'ioredis';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { UsersRepository } from '@/models/_.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['help'],
	limit: { duration: ms('1min'), max: 60 },
	requireCredential: false,
	kind: 'read:help',
	res: {
		type: 'object', optional: false, nullable: false,
		properties: { items: { type: 'array', items: { type: 'object' } } },
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
		@Inject(DI.usersRepository) private usersRepository: UsersRepository,
		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const s = await this.redis.get(`help:package:${ps.id}`);
			if (!s) throw new ApiError(meta.errors.notFound);

			// IMPORTANT: When using keyPrefix, redis.keys() automatically adds the prefix to the pattern
			// This causes it to search for double-prefixed keys. Use redis.call('KEYS') instead.
			const prefix = this.redis.options.keyPrefix ?? '';
			const pattern = prefix ? `${prefix}help:contrib:${ps.id}:*` : `help:contrib:${ps.id}:*`;
			const keys = await this.redis.call('KEYS', pattern) as string[];

			const contribs: any[] = [];
			const supporterIds = new Set<string>();

			for (const k of keys) {
				// Strip prefix from key before using it
				const key = k.startsWith(prefix) ? k.slice(prefix.length) : k;
				const v = await this.redis.get(key);
				if (!v) continue;
				const data = JSON.parse(v);
				// Extract supporter ID from the key (last part after the last colon)
				const supporterId = key.split(':').pop();
				if (supporterId) {
					contribs.push({ ...data, supporterId });
					supporterIds.add(supporterId);
				}
			}

			const users = await this.usersRepository.findBy({ id: In(Array.from(supporterIds)) });
			const packedUsers = await this.userEntityService.packMany(users, me ?? null);

			const items: any[] = [];
			for (const c of contribs) {
				const user = packedUsers.find(u => u.id === c.supporterId);
				const confirmStr = await this.redis.get(`help:gift:confirm:${ps.id}:${c.supporterId}`);
				const reportStr = await this.redis.get(`help:gift:report:${ps.id}:${c.supporterId}`);
				items.push({
					...c,
					user: user ?? null,
					hasConfirmed: !!confirmStr,
					hasReported: !!reportStr,
					reportReason: reportStr ? JSON.parse(reportStr).reason : null,
				});
			}

			return { items };
		});
	}
}
