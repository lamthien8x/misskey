<template>
<div class="_gaps_m" :class="$style.root">
	<MkPageHeader :overridePageMetadata="{ title: 'Chi tiết gói giúp đỡ', icon: 'ti ti-heart-handshake' }"/>
	<div class="_panel" :class="$style.panel">
		<div v-if="helpPackage" class="_gaps_m">
			<div :class="$style.detailHeader">
				<MkAvatar v-if="helpPackage.author" :user="helpPackage.author" :class="$style.avatarLarge"/>
				<div>
					<div :class="$style.detailTitle">{{ helpPackage.content }}</div>
					<MkUserName v-if="helpPackage.author" :user="helpPackage.author"/>
					<div :class="$style.packageMeta">
						<span><MkTime :time="new Date(helpPackage.createdAt)"/></span>
						<span>• <i class="ti ti-currency-dong"></i> {{ helpPackage.amountVnd.toLocaleString('vi-VN') }}₫</span>
						<span :class="{ [$style.statusActive]: helpPackage.status === 'active', [$style.statusInactive]: helpPackage.status !== 'active' }">
							• {{ helpPackage.status === 'active' ? 'Đang hiện' : 'Đang ẩn' }}
						</span>
						<span>• {{ rewardLabel(helpPackage) }}</span>
						<span v-if="helpPackage.rewardType === 'online'">• {{ helpPackage.rewardMediaFileIds.length }} tệp</span>
					</div>
				</div>
			</div>

			<div :class="$style.detailActions">
				<MkButton :primary="helpPackage.status !== 'active'" @click="toggleStatus">
					{{ helpPackage.status === 'active' ? 'Ẩn gói này' : 'Hiện gói này' }}
				</MkButton>
			</div>

			<div class="_gaps_s">
				<div class="_title">Danh sách người hỗ trợ</div>
				<div v-if="contribs.length === 0" class="_opacity_05">Chưa có người hỗ trợ</div>
				<div v-for="c in contribs" :key="c.supporterId" :class="$style.contribItem">
					<div :class="$style.contribHeader">
						<MkAvatar v-if="c.user" :user="c.user" :class="$style.avatarSmall"/>
						<MkUserName v-if="c.user" :user="c.user"/>
						<div :class="$style.contribMeta">
							<span>{{ c.amount.toLocaleString('vi-VN') }}₫</span>
							<span>• <MkTime :time="new Date(c.at)"/></span>
						</div>
					</div>
					<div :class="$style.contribStatus">
						<span v-if="c.refunded" :class="$style.statusRefunded"><i class="ti ti-arrow-back-up"></i> Đã hoàn tiền</span>
						<span v-else-if="c.hasConfirmed" :class="$style.statusCompleted"><i class="ti ti-check"></i> Đã nhận quà</span>
						<span v-else-if="c.hasReported" :class="$style.statusDisputed">
							<i class="ti ti-alert-triangle"></i> Báo cáo chưa nhận: {{ c.reportReason || 'Không có lý do' }}
						</span>
						<span v-else class="_opacity_05">Chưa xác nhận</span>
					</div>
					<div v-if="c.hasReported" :class="$style.disputeActions">
						<MkButton inline danger @click="resolve(c, 'refund')">Hoàn tiền</MkButton>
						<MkButton inline primary @click="resolve(c, 'deliver')">Đã giao</MkButton>
						<MkButton inline @click="resolve(c, 'dismiss')">Bác bỏ</MkButton>
					</div>
				</div>
			</div>
		</div>
		<div v-else class="_gaps_m">
			<MkLoading/>
		</div>
	</div>
</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import MkButton from '@/components/MkButton.vue';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import MkTime from '@/components/global/MkTime.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{
	id: string;
}>();

const helpPackage = ref<any>(null);
const contribs = ref<any[]>([]);

async function loadPackage() {
	try {
		const res = await misskeyApi('help/show', { id: props.id });
		const p = res.item;
		if (p.authorId) {
			try { p.author = await misskeyApi('users/show', { userId: p.authorId }); } catch {}
		}
		helpPackage.value = p;
	} catch (e) {
		console.error(e);
	}
}

async function loadContrib() {
	const r = await misskeyApi('help/contrib-list', { id: props.id });
	contribs.value = r.items ?? [];
}

async function resolve(c: any, decision: string) {
	const decisionLabel = decision === 'refund' ? 'hoàn tiền' : decision === 'deliver' ? 'xác nhận đã giao' : 'bác bỏ';
	if (!confirm(`Bạn có chắc chắn muốn ${decisionLabel}?`)) return;

	try {
		await misskeyApi('help/resolve-dispute' as any, {
			id: props.id,
			userId: c.supporterId,
			decision,
		});
		await loadContrib();
		await loadPackage();
		alert(`Đã ${decisionLabel} thành công`);
	} catch (error) {
		console.error('[admin/help.detail] resolve-dispute error:', error);
		alert('Lỗi khi xử lý: ' + ((error as any)?.message || error));
	}
}

async function toggleStatus() {
	if (!helpPackage.value) return;
	const next = helpPackage.value.status === 'active' ? 'inactive' : 'active';
	await misskeyApi('help/update-status', { id: props.id, status: next });
	await loadPackage();
}

function rewardLabel(p: any) {
	if (p.rewardType === 'none') return 'Không có quà báo đáp';
	if (p.rewardType === 'direct') return 'Gặp mặt trực tiếp ';
	if (p.rewardType === 'online') return 'Món quà trực tuyến';
	return '';
}

onMounted(() => {
	loadPackage();
	loadContrib();
});
</script>

<style module lang="scss">
.root { padding: var(--MI-margin); }
.panel { padding: var(--MI-margin); border-radius: var(--MI-radius); }

.detailHeader { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 16px; border-bottom: solid 1px var(--MI_THEME-divider); padding-bottom: 16px; }
.avatarLarge { width: 64px; height: 64px; }
.detailTitle { font-size: 1.5em; font-weight: bold; margin-bottom: 8px; }
.packageMeta { margin-top: 8px; opacity: 0.8; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

.detailActions { margin-bottom: 24px; }

.contribItem { padding:12px; border: solid 1px var(--MI_THEME-divider); border-radius: 8px; display: flex; flex-direction: column; gap: 8px; }
.contribHeader { display: flex; align-items: center; gap: 8px; }
.avatarSmall { width: 32px; height: 32px; }
.contribMeta { font-size: 0.9em; opacity: 0.7; margin-left: auto; }
.contribStatus { display: flex; align-items: center; gap: 8px; font-size: 0.9em; }
.statusCompleted { color: var(--MI_THEME-success); font-weight: bold; display: flex; align-items: center; gap: 4px; }
.statusDisputed { color: var(--MI_THEME-error); font-weight: bold; display: flex; align-items: center; gap: 4px; }
.statusRefunded { color: var(--MI_THEME-warn); font-weight: bold; display: flex; align-items: center; gap: 4px; }
.statusActive { color: var(--MI_THEME-success); font-weight: bold; }
.statusInactive { color: var(--MI_THEME-warn); font-weight: bold; }
.disputeActions { display: flex; gap: 8px; margin-top: 4px; }
</style>
