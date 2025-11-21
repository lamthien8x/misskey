import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';

export const meta = {
	tags: ['help'],
	limit: { duration: ms('1min'), max: 60 },
	requireCredential: false,
	kind: 'read:help',
	res: {
		type: 'object', optional: false, nullable: false,
		properties: { items: { type: 'array', items: { type: 'object' } } },
	},
} as const;

export const paramDef = { type: 'object', properties: { includeInactive: { type: 'boolean', nullable: true } } } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.config) private config: Config,
		@Inject(DI.redis) private redis: Redis.Redis,
	) {
		super(meta, paramDef, async (ps) => {
			console.log('[help/list] called');
			const ids = await this.redis.smembers('help:packages');
			console.log('[help/list] ids:', ids.length);
			const items: any[] = [];
			const prefix = this.redis.options.keyPrefix ?? '';

			for (const id of ids) {
				const s = await this.redis.get(`help:package:${id}`);
				if (!s) continue;
				const o = JSON.parse(s);

				// Try to get cached counters first
				const supportersCount = await this.redis.get(`help:package:${id}:supportersCount`).then(x => x ? parseInt(x, 10) : null);
				const totalAmount = await this.redis.get(`help:package:${id}:totalAmount`).then(x => x ? parseInt(x, 10) : null);

				if (supportersCount !== null && totalAmount !== null) {
					// Use cached values
					o.supporterCount = supportersCount;
					o.totalAmount = totalAmount;
				} else {
					// Fallback: calculate from contrib keys
					// IMPORTANT: Use redis.call('KEYS') to avoid double-prefix issues with ioredis
					const pattern = prefix ? `${prefix}help:contrib:${id}:*` : `help:contrib:${id}:*`;
					const contribKeys = await this.redis.call('KEYS', pattern) as string[];
					o.supporterCount = contribKeys.length;
					let calculatedTotal = 0;
					for (const k of contribKeys) {
						const key = k.startsWith(prefix) ? k.slice(prefix.length) : k;
						const v = await this.redis.get(key);
						if (!v) continue;
						const j = JSON.parse(v);
						if (typeof j?.amount === 'number') calculatedTotal += j.amount;
					}
					o.totalAmount = calculatedTotal;
				}

				if (ps?.includeInactive) {
					items.push(o);
				} else {
					if (o.status === 'active') items.push(o);
				}
			}
			console.log('[help/list] items:', items.length);
			return { items };
		});
	}
}
