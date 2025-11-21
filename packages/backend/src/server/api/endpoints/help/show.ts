import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['help'],
	limit: { duration: ms('1min'), max: 60 },
	requireCredential: false,
	kind: 'read:help',
	res: {
		type: 'object', optional: false, nullable: false,
		properties: { item: { type: 'object' } },
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
		super(meta, paramDef, async (ps) => {
			const s = await this.redis.get(`help:package:${ps.id}`);
			if (!s) throw new ApiError(meta.errors.notFound);
			const o = JSON.parse(s);
			const contribKeys = await this.redis.keys(`help:contrib:${ps.id}:*`);
			const confirmKeys = await this.redis.keys(`help:gift:confirm:${ps.id}:*`);
			const reportKeys = await this.redis.keys(`help:gift:report:${ps.id}:*`);
			let supportersCount = await this.redis.get(`help:package:${ps.id}:supportersCount`).then(x => x ? parseInt(x, 10) : null);
			let totalAmount = await this.redis.get(`help:package:${ps.id}:totalAmount`).then(x => x ? parseInt(x, 10) : null);

			console.log(`[help/show] ID: ${ps.id}, Redis Supporters: ${supportersCount}, Redis Total: ${totalAmount}`);

			let lastSupportAt = 0;

			// Fallback for legacy data
			if (supportersCount === null || totalAmount === null) {
				supportersCount = 0;
				totalAmount = 0;
				const prefix = this.redis.options.keyPrefix ?? '';
				console.log(`[help/show] Fallback triggered. Found ${contribKeys.length} contrib keys.`);
				for (const k of contribKeys) {
					const key = k.startsWith(prefix) ? k.slice(prefix.length) : k;
					const v = await this.redis.get(key);
					console.log(`[help/show] Checking key: ${k} -> ${key}, Value: ${v}`);
					if (!v) continue;
					const j = JSON.parse(v);
					if (j?.at && j.at > lastSupportAt) lastSupportAt = j.at;
					if (typeof j?.amount === 'number') totalAmount += j.amount;
				}
				supportersCount = contribKeys.length;
				console.log(`[help/show] Calculated: Supporters=${supportersCount}, Total=${totalAmount}`);

				// Lazy migration: save the calculated values
				if (supportersCount > 0) {
					await this.redis.set(`help:package:${ps.id}:supportersCount`, supportersCount);
					await this.redis.set(`help:package:${ps.id}:totalAmount`, totalAmount);
				}
			} else {
				// Just find the last support time if we didn't iterate
				// Optimization: We could store lastSupportAt in Redis too, but iterating keys for just timestamp is okay-ish for now
				// or just pick the max from keys if we really need it.
				// For now, let's keep the iteration for lastSupportAt if we didn't calculate totals,
				// OR we can just accept that lastSupportAt might be expensive to get without iteration.
				// Let's iterate just for lastSupportAt if we have counters, to be safe, but optimize later if needed.
				const prefix = this.redis.options.keyPrefix ?? '';
				for (const k of contribKeys) {
					const key = k.startsWith(prefix) ? k.slice(prefix.length) : k;
					const v = await this.redis.get(key); if (!v) continue;
					const j = JSON.parse(v);
					if (j?.at && j.at > lastSupportAt) lastSupportAt = j.at;
				}
			}

			let lastReportAt = 0;
			const prefix = this.redis.options.keyPrefix ?? '';
			for (const k of reportKeys) {
				const key = k.startsWith(prefix) ? k.slice(prefix.length) : k;
				const v = await this.redis.get(key); if (!v) continue;
				const j = JSON.parse(v); if (j?.at && j.at > lastReportAt) lastReportAt = j.at;
			}
			const item = {
				...o,
				supporterCount: supportersCount,
				confirmCount: confirmKeys.length,
				reportCount: reportKeys.length,
				totalAmount,
				lastSupportAt,
				lastReportAt,
			};
			return { item };
		});
	}
}
