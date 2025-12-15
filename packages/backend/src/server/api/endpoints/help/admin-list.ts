import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';

export const meta = {
	tags: ['help', 'admin'],
	limit: { duration: ms('1min'), max: 60 },
	requireCredential: true,
	kind: 'read:help',
	res: {
		type: 'object', optional: false, nullable: false,
		properties: { items: { type: 'array', items: { type: 'object' } } },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		includeInactive: { type: 'boolean', nullable: true },
		period: { type: 'string', enum: ['week', 'month', 'year'], nullable: true },
		filterType: { type: 'string', enum: ['no_reward', 'created', 'waiting_confirm', 'confirmed', 'reported'], nullable: true },
		authorId: { type: 'string', nullable: true },
		status: { type: 'string', enum: ['active', 'inactive', 'all'], nullable: true },
	},
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.config) private config: Config,
		@Inject(DI.redis) private redis: Redis.Redis,
	) {
		super(meta, paramDef, async (ps) => {
			const ids = await this.redis.smembers('help:packages');
			const items: any[] = [];
			const now = Date.now();
			let since = 0;
			if (ps.period === 'week') since = now - 7 * 24 * 3600 * 1000;
			if (ps.period === 'month') since = now - 30 * 24 * 3600 * 1000;
			if (ps.period === 'year') since = now - 365 * 24 * 3600 * 1000;

			for (const id of ids) {
				const s = await this.redis.get(`help:package:${id}`);
				if (!s) continue;
				const o = JSON.parse(s);

				// Period filter (based on createdAt)
				if (since > 0 && o.createdAt < since) continue;

				// Author filter
				if (ps.authorId && o.authorId !== ps.authorId) continue;

				// Status filter
				if (ps.status) {
					if (ps.status === 'active' && o.status !== 'active') continue;
					if (ps.status === 'inactive' && o.status !== 'inactive') continue;
					// 'all' -> pass
				} else {
					// Fallback to includeInactive
					if (!ps.includeInactive && o.status !== 'active') continue;
				}

				const contribKeys = await this.redis.keys(`help:contrib:${id}:*`);
				const confirmKeys = await this.redis.keys(`help:gift:confirm:${id}:*`);
				const reportKeys = await this.redis.keys(`help:gift:report:${id}:*`);

				// Filter Type Logic
				if (ps.filterType) {
					if (ps.filterType === 'no_reward' && o.rewardType !== 'none') continue;
					if (ps.filterType === 'created') {
						// Just created packages, maybe active? Already handled by includeInactive default?
						// Keeping all if strictly 'created' requested
					}
					if (ps.filterType === 'waiting_confirm') {
						// Has contributions but not all confirmed/reported
						// This is an approximation. Ideally check each contrib.
						if (contribKeys.length === 0) continue;
						if (contribKeys.length <= confirmKeys.length + reportKeys.length) continue;
					}
					if (ps.filterType === 'confirmed') {
						// Has at least one confirmation? Or fully confirmed?
						// Let's go with "has confirmed supports"
						if (confirmKeys.length === 0) continue;
					}
					if (ps.filterType === 'reported') {
						if (reportKeys.length === 0) continue;
					}
				}

				let lastSupportAt = 0;
				for (const k of contribKeys) {
					const v = await this.redis.get(k); if (!v) continue;
					const j = JSON.parse(v); if (j?.at && j.at > lastSupportAt) lastSupportAt = j.at;
				}
				let lastReportAt = 0;
				for (const k of reportKeys) {
					const v = await this.redis.get(k); if (!v) continue;
					const j = JSON.parse(v); if (j?.at && j.at > lastReportAt) lastReportAt = j.at;
				}
				items.push({
					...o,
					supporterCount: contribKeys.length,
					confirmCount: confirmKeys.length,
					reportCount: reportKeys.length,
					lastSupportAt,
					lastReportAt,
				});
			}
			return { items };
		});
	}
}
