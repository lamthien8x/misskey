<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m" :class="$style.root">
	<MkPageHeader :overridePageMetadata="{ title: 'Quản trị gói giúp đỡ', icon: 'ti ti-heart-handshake' }"/>
	<div class="_panel" :class="$style.panel">
		<div class="_gaps_s">
			<div :class="$style.filters">
				<MkSelect v-model="period" :items="periodOptions" @update:modelValue="loadPackages">
				</MkSelect>
				<MkSelect v-model="filterType" :items="filterTypeOptions" @update:modelValue="loadPackages">
				</MkSelect>
				<MkSelect v-model="statusFilter" :items="statusOptions" @update:modelValue="loadPackages">
				</MkSelect>
				<MkButton @click="chooseUser"><i class="ti ti-user"></i> {{ selectedUser ? selectedUser.username : 'Tất cả người dùng' }}</MkButton>
				<MkButton v-if="selectedUser" icon @click="clearUser"><i class="ti ti-x"></i></MkButton>
			</div>

			<div v-for="p in packages" :key="p.id" :class="$style.package" @click="openDetail(p)">
				<div :class="$style.packageMain">
					<div :class="$style.packageHeader">
						<MkAvatar v-if="p.author" :user="p.author" :class="$style.avatar"/>
						<div :class="$style.headerText">
							<MkUserName v-if="p.author" :user="p.author"/>
							<div :class="$style.headerMeta"><MkTime :time="new Date(p.createdAt)"/></div>
						</div>
					</div>
					<div :class="$style.packageTitle">{{ p.content }}</div>
					<div :class="$style.packageMeta">
						<span><i class="ti ti-currency-dong"></i> {{ p.amountVnd.toLocaleString('vi-VN') }}₫</span>
						<span :class="{ [$style.statusActive]: p.status === 'active', [$style.statusInactive]: p.status !== 'active' }">
							• {{ p.status === 'active' ? 'Đang hiện' : 'Đang ẩn' }}
						</span>
						<span>• {{ rewardLabel(p) }}</span>
						<span v-if="p.rewardType === 'online'">• {{ p.rewardMediaFileIds.length }} tệp</span>
					</div>
					<div :class="$style.packageStats">
						<span :class="$style.badge"><i class="ti ti-users"></i> {{ p.supporterCount || 0 }} người ủng hộ</span>
						<span :class="$style.badge"><i class="ti ti-circle-check"></i> {{ p.confirmCount || 0 }} đã xác nhận</span>
						<span :class="$style.badge"><i class="ti ti-alert-triangle"></i> {{ p.reportCount || 0 }} báo cáo</span>
					</div>
				</div>
				<div :class="$style.chevron">
					<i class="ti ti-chevron-right"></i>
				</div>
			</div>
		</div>
	</div>
</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from '@/router.js';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import MkTime from '@/components/global/MkTime.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';

const router = useRouter();
const packages = ref<any[]>([]);
const period = ref<string | null>(null);
const filterType = ref<string | null>(null);
const statusFilter = ref<string>('all');
const selectedUser = ref<any>(null);

const periodOptions = [
	{ value: null, label: 'Tất cả thời gian' },
	{ value: 'week', label: 'Tuần này' },
	{ value: 'month', label: 'Tháng này' },
	{ value: 'year', label: 'Năm nay' },
];

const filterTypeOptions = [
	{ value: null, label: 'Tất cả loại' },
	{ value: 'no_reward', label: 'Không có quà' },
	{ value: 'created', label: 'Được tạo' },
	{ value: 'waiting_confirm', label: 'Chờ xác nhận' },
	{ value: 'confirmed', label: 'Đã xác nhận xong' },
	{ value: 'reported', label: 'Báo cáo chưa nhận' },
];

const statusOptions = [
	{ value: 'all', label: 'Tất cả trạng thái' },
	{ value: 'active', label: 'Đang hiện' },
	{ value: 'inactive', label: 'Đang ẩn' },
];

async function chooseUser() {
	const user = await os.selectUser();
	if (user) {
		selectedUser.value = user;
		loadPackages();
	}
}

function clearUser() {
	selectedUser.value = null;
	loadPackages();
}

async function loadPackages() {
	console.log('[admin/help] load packages', period.value, filterType.value);
	try {
		const params: any = {
			includeInactive: true, // Always include, we filter by status param now
		};
		if (period.value) params.period = period.value;
		if (filterType.value) params.filterType = filterType.value;
		if (statusFilter.value && statusFilter.value !== 'all') params.status = statusFilter.value;
		if (selectedUser.value) params.authorId = selectedUser.value.id;

		const r = await misskeyApi('help/admin-list', params);
		const enriched: any[] = [];
		for (const it of (r.items ?? [])) {
			let author = null;
			try { author = await misskeyApi('users/show', { userId: it.authorId }); } catch {}
			enriched.push({ ...it, author });
		}
		packages.value.splice(0, packages.value.length, ...enriched);
		console.log('[admin/help] packages:', packages.value.length);
	} catch (e) {
		console.error('[admin/help] API Error:', e);
		alert('API Error: ' + e);
	}
}

function openDetail(p: any) {
	router.push(`/admin/help/${p.id}`);
}

async function toggleStatus(p: any, e: Event) {
	e.stopPropagation();
	const next = p.status === 'active' ? 'inactive' : 'active';
	await misskeyApi('help/update-status', { id: p.id, status: next });
	await loadPackages();
}

loadPackages();

function rewardLabel(p: any) {
	if (p.rewardType === 'none') return 'Không có quà báo đáp';
	if (p.rewardType === 'direct') return 'Gặp mặt trực tiếp ';
	if (p.rewardType === 'online') return 'Món quà trực tuyến';
	return '';
}
</script>

<style module lang="scss">
.root { padding: var(--MI-margin); }
.panel { padding: var(--MI-margin); border-radius: var(--MI-radius); }
.package {
	display:flex; align-items:center; justify-content:space-between; padding:12px; border-bottom: solid 1px var(--MI_THEME-divider);
	cursor: pointer; transition: background 0.1s;
	&:hover { background: var(--MI_THEME-panelHighlight); }
}
.packageMain { display:flex; flex-direction:column; gap:8px; flex: 1; }
.packageHeader { display:flex; align-items:center; gap:12px; }
.avatar { width: 44px; height: 44px; }
.headerText { display:flex; flex-direction:column; }
.headerMeta { font-size:12px; opacity:.7; }
.packageTitle { font-weight:600; }
.packageMeta { opacity:.8; display:flex; gap:8px; flex-wrap:wrap; align-items: center; }
.packageStats { display:flex; gap:8px; margin-top: 4px; }
.badge { padding:4px 8px; border-radius:999px; background: var(--MI_THEME-panelHighlight); font-size:12px; }
.chevron { opacity: 0.5; margin-left: 16px; }

.filters { display:flex; gap:12px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }

.statusActive { color: var(--MI_THEME-success); font-weight: bold; }
.statusInactive { color: var(--MI_THEME-warn); font-weight: bold; }

.detailContent { padding: 20px; }
.detailHeader { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
.avatarLarge { width: 64px; height: 64px; }
.detailTitle { font-size: 1.2em; font-weight: bold; margin-bottom: 4px; }
.detailActions { margin-bottom: 24px; padding-bottom: 16px; border-bottom: solid 1px var(--MI_THEME-divider); }

.contribItem { padding:12px; border: solid 1px var(--MI_THEME-divider); border-radius: 8px; display: flex; flex-direction: column; gap: 8px; }
.contribHeader { display: flex; align-items: center; gap: 8px; }
.avatarSmall { width: 32px; height: 32px; }
.contribMeta { font-size: 0.9em; opacity: 0.7; margin-left: auto; }
.contribStatus { display: flex; align-items: center; gap: 8px; font-size: 0.9em; }
.statusCompleted { color: var(--MI_THEME-success); font-weight: bold; display: flex; align-items: center; gap: 4px; }
.statusDisputed { color: var(--MI_THEME-error); font-weight: bold; display: flex; align-items: center; gap: 4px; }
.statusRefunded { color: var(--MI_THEME-warn); font-weight: bold; display: flex; align-items: center; gap: 4px; }
.disputeActions { display: flex; gap: 8px; margin-top: 4px; }
</style>
