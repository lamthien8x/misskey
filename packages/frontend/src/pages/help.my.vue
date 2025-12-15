<template>
<div class="_gaps_m" :class="$style.root">
	<MkPageHeader :overridePageMetadata="{ title: 'Hỗ trợ của tôi', icon: 'ti ti-heart-handshake' }"/>
	<div class="_panel" :class="$style.list">
		<div v-if="loading" :class="$style.loading"><i class="ti ti-loader-2" style="margin-right:6px;"></i> Đang tải...</div>
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
				<div :class="$style.cardBadges">
					<span :class="$style.badge"><i class="ti ti-gift"></i> {{ rewardLabel(p) }}</span>
					<span v-if="p.rewardType === 'online'" :class="$style.badge"><i class="ti ti-photo"></i> {{ p.rewardMediaFileIds.length }} tệp</span>
				</div>
				<div v-if="p.rewardType !== 'none'" :class="$style.actions">
					<div v-if="p.hasConfirmed" :class="$style.statusCompleted"><i class="ti ti-check"></i> Đã hoàn thành</div>
					<div v-else-if="p.hasReported" :class="$style.statusDisputed"><i class="ti ti-alert-circle"></i> Đang tranh chấp</div>
					<template v-else>
						<MkButton primary @click="confirm(p)"><i class="ti ti-circle-check"></i> Đã nhận quà</MkButton>
						<MkButton danger @click="report(p)"><i class="ti ti-alert-triangle"></i> Báo cáo chưa nhận</MkButton>
					</template>
				</div>
			</div>
		</div>
	</div>
</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import MkButton from '@/components/MkButton.vue';
import { misskeyApi } from '@/utility/misskey-api.js';

const items = ref<any[]>([]);
const loading = ref<boolean>(true);
const error = ref<string>('');

async function load() {
	try {
		const r = await misskeyApi('help/my-supports', {});
		const enriched: any[] = [];
		for (const it of (r.items ?? [])) {
			let author = null;
			try { author = await misskeyApi('users/show', { userId: it.authorId }); } catch {}
			enriched.push({ ...it, author });
		}
		items.value.splice(0, items.value.length, ...enriched);
	} catch (e) {
		error.value = 'Không thể tải danh sách hỗ trợ';
	} finally {
		loading.value = false;
	}
}

function rewardLabel(p: any) {
	if (p.rewardType === 'none') return 'Không có quà báo đáp';
	if (p.rewardType === 'direct') return 'Gặp mặt trực tiếp ';
	if (p.rewardType === 'online') return 'Món quà trực tuyến';
	return '';
}

async function confirm(p: any) {
	if (!window.confirm('Bạn có chắc chắn đã nhận được quà?')) return;
	await misskeyApi('help/gift-confirm' as any, { id: p.id });
	p.hasConfirmed = true;
}

async function report(p: any) {
	const reason = window.prompt('Vui lòng nhập lý do chưa nhận quà (tùy chọn):');
	if (reason === null) return;
	await misskeyApi('help/gift-report' as any, { id: p.id, reason });
	p.hasReported = true;
}

load();
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
.cardTitle { font-weight:700; }
.cardMeta { opacity:.8; }
.cardBadges { display:flex; gap:8px; }
.badge { padding:4px 8px; border-radius:999px; background: var(--MI_THEME-panelHighlight); font-size:12px; }
.actions { display:flex; gap:8px; align-items: center; }
.statusCompleted { color: var(--MI_THEME-success); font-weight: bold; display: flex; align-items: center; gap: 4px; }
.statusDisputed { color: var(--MI_THEME-error); font-weight: bold; display: flex; align-items: center; gap: 4px; }
</style>
