<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m" :class="$style.root">
	<MkPageHeader :overridePageMetadata="{ title: 'Gói giúp đỡ', icon: 'ti ti-heart-handshake' }"/>
	<div class="_gaps_s" style="display:flex; justify-content:flex-end;">
		<MkButton v-if="$i" primary @click="goCreate"><i class="ti ti-plus"></i> Tạo gói</MkButton>
	</div>
	<div class="_panel" :class="$style.list">
		<div v-if="loading" :class="$style.loading"><i class="ti ti-loader-2" style="margin-right:6px;"></i> Đang tải gói giúp đỡ...</div>
		<div v-else-if="error" :class="$style.error"><i class="ti ti-alert-triangle" style="margin-right:6px;"></i>{{ error }}</div>
		<div v-else :class="$style.grid">
			<div v-for="p in items" :key="p.id" :class="$style.card">
				<div :class="$style.cardHeader">
					<MkAvatar v-if="p.author" :user="p.author" :class="$style.avatar"/>
					<div :class="$style.cardHeaderText">
						<MkUserName v-if="p.author" :user="p.author"/>
						<div :class="$style.cardHeaderMeta"><MkTime :time="new Date(p.createdAt)"/></div>
					</div>
				</div>
				<div :class="$style.cardTitle">{{ p.content }}</div>
				<div :class="$style.cardMeta"><i class="ti ti-currency-dong"></i> {{ p.amountVnd.toLocaleString('vi-VN') }}₫</div>
				<div :class="$style.cardMeta"><i class="ti ti-users"></i> {{ p.supporterCount || 0 }} người đã hỗ trợ</div>
				<div :class="$style.cardMeta"><i class="ti ti-currency-dollar"></i> Tổng hỗ trợ: {{ (p.totalAmount || 0).toLocaleString('vi-VN') }}₫</div>
				<div :class="$style.cardBadges">
					<span :class="$style.badge"><i class="ti ti-gift"></i> {{ rewardLabel(p) }}</span>
					<span v-if="p.rewardType === 'online'" :class="$style.badge"><i class="ti ti-photo"></i> {{ p.rewardMediaFileIds.length }} tệp</span>
				</div>
				<div :class="$style.cardActions">
					<MkButton primary @click="goDetail(p.id)"><i class="ti ti-eye"></i> Xem chi tiết</MkButton>
				</div>
			</div>
		</div>
	</div>
</div>
</template>

<script setup lang="ts">
import { ref, onActivated } from 'vue';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import MkButton from '@/components/MkButton.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useRouter } from '@/router.js';
import { $i } from '@/i.js';

const router = useRouter();
const items = ref<any[]>([]);
const loading = ref<boolean>(true);
const error = ref<string>('');

async function load() {
	try {
		console.log('[help.explore] load start');
		const r = await misskeyApi('help/list', {});
		console.log('[help.explore] load done items:', r.items?.length ?? 0);
		const enriched: any[] = [];
		for (const it of (r.items ?? [])) {
			let author = null;
			try { author = await misskeyApi('users/show', { userId: it.authorId }); } catch {}
			enriched.push({ ...it, author });
		}
		items.value.splice(0, items.value.length, ...enriched);
	} catch (e) {
		console.log('[help.explore] load error', e);
		error.value = 'Không thể tải danh sách gói';
	} finally {
		loading.value = false;
	}
}

function goDetail(id: string) {
	router.push(`/help/${id}`);
}

function goCreate() {
	router.push('/help/create');
}

console.log('[help.explore] mounted');
load();
onActivated(() => {
	console.log('[help.explore] activated, reload');
	load();
});

function rewardLabel(p: any) {
	if (p.rewardType === 'none') return 'Không có quà báo đáp';
	if (p.rewardType === 'direct') return 'Gặp mặt trực tiếp ';
	if (p.rewardType === 'online') return 'Món quà trực tuyến';
	return '';
}
</script>

<style module lang="scss">
.root { padding: var(--MI-margin); }
.list { padding: var(--MI-margin); border-radius: var(--MI-radius); }
.loading, .error { text-align:center; padding:16px; }
.grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:16px; }
.card { padding:16px; border-radius: 12px; background: var(--MI_THEME-panel); box-shadow: 0 8px 24px rgb(0 0 0 / 20%); display:flex; flex-direction:column; gap:8px; }
.cardHeader { display:flex; align-items:center; gap:12px; }
.avatar { width: 40px; height: 40px; }
.cardHeaderText { display:flex; flex-direction:column; }
.cardHeaderMeta { font-size:12px; opacity:.7; }
.cardIcon { width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; background: var(--MI_THEME-accent); color: var(--MI_THEME-fgOnAccent); }
.cardTitle { font-weight:700; }
.cardMeta { opacity:.8; }
.cardBadges { display:flex; gap:8px; }
.badge { padding:4px 8px; border-radius:999px; background: var(--MI_THEME-panelHighlight); font-size:12px; }
.cardActions { display:flex; justify-content:flex-end; }
</style>
