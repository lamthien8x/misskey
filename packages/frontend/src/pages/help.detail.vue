<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m" :class="$style.root">
	<MkPageHeader :overridePageMetadata="{ title: 'Chi tiết gói giúp đỡ', icon: 'ti ti-heart-handshake' }"/>
	<div v-if="error" class="_panel" :class="$style.card">
		<div :class="$style.error"><i class="ti ti-alert-triangle" style="margin-right:6px;"></i>{{ error }}</div>
	</div>
	<div v-else-if="loading" class="_panel" :class="$style.card">
		<div :class="$style.loading"><i class="ti ti-loader-2" style="margin-right:6px;"></i> Đang tải chi tiết gói...</div>
	</div>
	<div v-else-if="item" class="_panel" :class="$style.card">
		<!-- Author header with clickable avatar -->
		<div :class="$style.header">
			<a v-if="author" :href="`/@${author.username}`" :class="$style.avatarLink">
				<MkAvatar :user="author" :class="$style.avatar"/>
			</a>
			<div :class="$style.headerText">
				<a v-if="author" :href="`/@${author.username}`" :class="$style.authorLink">
					<MkUserName :user="author"/>
				</a>
				<div :class="$style.headerMeta"><MkTime :time="new Date(item.createdAt)"/></div>
			</div>
		</div>

		<!-- Main content - prominently displayed -->
		<div :class="$style.contentSection">
			<div :class="$style.content">{{ item.content }}</div>
		</div>

		<!-- Funding section with visual prominence -->
		<div :class="$style.fundingSection">
			<div :class="$style.fundingAmount">
				<div :class="$style.amountLabel">Mục tiêu</div>
				<div :class="$style.amountValue">{{ item.amountVnd.toLocaleString('vi-VN') }}₫</div>
			</div>

			<!-- Progress bar -->
			<div :class="$style.progressContainer">
				<div :class="$style.progressBar">
					<div
						:class="$style.progressFill"
						:style="{ width: `${Math.min((item.totalAmount || 0) / item.amountVnd * 100, 100)}%` }"
					></div>
				</div>
				<div :class="$style.progressStats">
					<span :class="$style.statItem">
						<i class="ti ti-users"></i> {{ item.supporterCount || 0 }} người đã giúp
					</span>
					<span :class="$style.statValue">
						{{ (item.totalAmount || 0).toLocaleString('vi-VN') }}₫
					</span>
				</div>
			</div>
		</div>

		<!-- Reward badge -->
		<div :class="$style.badges">
			<span :class="$style.badge"><i class="ti ti-gift"></i> {{ rewardLabel(item) }}</span>
			<span v-if="item.rewardType === 'online'" :class="$style.badge"><i class="ti ti-photo"></i> {{ item.rewardMediaFileIds.length }} tệp</span>
		</div>

		<!-- Action button -->
		<div :class="$style.actions">
			<MkButton v-if="!unlocked" primary @click="support">Giúp đỡ ngay</MkButton>
		</div>

		<!-- Reward media if unlocked -->
		<div v-if="unlocked && rewardMediaFileIds?.length" :class="$style.reward">
			<div>Quà trực tuyến:</div>
			<div class="_gaps_s">
				<MkDriveFile v-for="f in rewardMediaFiles" :key="f.id" :file="f" :folder="null"/>
			</div>
			<div :class="$style.rewardActions">
				<MkButton @click="confirmGift"><i class="ti ti-circle-check"></i> Đã nhận quà</MkButton>
				<MkButton warn @click="reportGift"><i class="ti ti-alert-triangle"></i> Báo cáo quà không tồn tại</MkButton>
			</div>
		</div>

		<!-- Supporters list with clickable avatars -->
		<div v-if="supporters.length > 0" class="_gaps_m" style="margin-top: 32px;">
			<div :class="$style.supportersTitle">Người đã hỗ trợ ({{ supporters.length }})</div>
			<div class="_gaps_s">
				<div v-for="s in supporters" :key="s.supporterId" class="_panel" :class="$style.supporterCard">
					<a v-if="s.user" :href="`/@${s.user.username}`" :class="$style.supporterAvatar">
						<MkAvatar :user="s.user" :class="$style.avatarImg"/>
					</a>
					<div v-else :class="$style.supporterAvatarEmpty"></div>
					<div :class="$style.supporterInfo">
						<a v-if="s.user" :href="`/@${s.user.username}`" :class="$style.supporterName">
							<MkUserName :user="s.user"/>
						</a>
						<div v-else :class="$style.supporterName" style="opacity: 0.7;">Người dùng ẩn danh</div>
						<div :class="$style.supporterAmount">Đã hỗ trợ {{ s.amount.toLocaleString('vi-VN') }}₫</div>
					</div>
					<div :class="$style.supporterTime"><MkTime :time="new Date(s.at)"/></div>
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
import MkDriveFile from '@/components/MkDrive.file.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';

const props = defineProps<{ id: string }>();
const id = props.id;
const item = ref<any | null>(null);
const author = ref<any | null>(null);
const unlocked = ref<boolean>(false);
const rewardMediaFileIds = ref<string[] | null>(null);
const rewardMediaFiles = ref<any[]>([]);
const loading = ref<boolean>(true);
const error = ref<string>('');
const supporters = ref<any[]>([]);

async function load() {
	try {
		console.log('[help.detail] load start id:', id);
		const r = await misskeyApi('help/show', { id });
		item.value = r.item;

		// Fetch supporters list
		misskeyApi('help/contrib-list', { id }).then(res => {
			supporters.value = res.items;
		}).catch(err => {
			console.error('Failed to load supporters', err);
		});

		const s = await misskeyApi('help/support-status', { id });
		try { author.value = await misskeyApi('users/show', { userId: r.item.authorId }); } catch {}
		unlocked.value = s.unlocked;
		rewardMediaFileIds.value = s.rewardMediaFileIds ?? null;
		rewardMediaFiles.value = [];
		if (unlocked.value && rewardMediaFileIds.value?.length) {
			for (const fid of rewardMediaFileIds.value) {
				try {
					const f = await misskeyApi('drive/files/show', { fileId: fid });
					rewardMediaFiles.value.push(f);
				} catch {}
			}
		}
		console.log('[help.detail] load done');
	} catch (e) {
		console.log('[help.detail] load error', e);
		error.value = 'Không thể tải chi tiết gói';
	} finally {
		loading.value = false;
	}
}

async function support() {
	const r = await misskeyApi('help/support-init', { id });
	const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkSepayQrDialog.vue').then(x => x.default), {
		helpId: id,
		qrDataUrl: r.qrUrl,
		amountVnd: r.amountVnd,
	}, { closed: async () => { dispose(); await load(); } });
}

async function confirmGift() {
	await misskeyApi('help/gift-confirm', { id });
	await os.alert({ type: 'success', text: 'Đã xác nhận nhận quà' });
}

async function reportGift() {
	await misskeyApi('help/gift-report', { id });
	await os.alert({ type: 'warning', text: 'Đã gửi báo cáo quà không tồn tại' });
}

load();
onActivated(() => {
	console.log('[help.detail] activated reload');
	loading.value = true; error.value = '';
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
.root {
	padding: var(--MI-margin);
	max-width: 800px;
	margin: 0 auto;
}

.card {
	padding: 24px;
	border-radius: var(--MI-radius);
}

.header {
	display: flex;
	align-items: center;
	gap: 12px;
	padding-bottom: 16px;
	border-bottom: 1px solid var(--MI_THEME-divider);
}

.avatarLink {
	text-decoration: none;
	transition: opacity 0.2s;

	&:hover {
		opacity: 0.8;
	}
}

.avatar {
	width: 48px;
	height: 48px;
}

.headerText {
	display: flex;
	flex-direction: column;
}

.authorLink {
	text-decoration: none;
	color: inherit;
	font-weight: 600;
	transition: color 0.2s;

	&:hover {
		color: var(--MI_THEME-accent);
	}
}

.headerMeta {
	font-size: 13px;
	opacity: 0.7;
}

.contentSection {
	margin-top: 24px;
	margin-bottom: 24px;
}

.content {
	font-size: 18px;
	line-height: 1.6;
	font-weight: 500;
	color: var(--MI_THEME-fg);
}

.fundingSection {
	margin-top: 24px;
	padding: 20px;
	background: var(--MI_THEME-panel);
	border-radius: 12px;
	border: 2px solid var(--MI_THEME-divider);
}

.fundingAmount {
	text-align: center;
	margin-bottom: 20px;
}

.amountLabel {
	font-size: 14px;
	opacity: 0.7;
	margin-bottom: 8px;
}

.amountValue {
	font-size: 32px;
	font-weight: 700;
	color: var(--MI_THEME-accent);
}

.progressContainer {
	margin-top: 16px;
}

.progressBar {
	height: 8px;
	background: var(--MI_THEME-divider);
	border-radius: 4px;
	overflow: hidden;
	margin-bottom: 12px;
}

.progressFill {
	height: 100%;
	background: var(--MI_THEME-accent);
	transition: width 0.3s ease;
	border-radius: 4px;
}

.progressStats {
	display: flex;
	justify-content: space-between;
	align-items: center;
	font-size: 14px;
}

.statItem {
	display: flex;
	align-items: center;
	gap: 6px;
	opacity: 0.8;

	i {
		font-size: 16px;
	}
}

.statValue {
	font-weight: 600;
	color: var(--MI_THEME-accent);
}

.badges {
	display: flex;
	gap: 8px;
	margin-top: 16px;
}

.badge {
	padding: 6px 12px;
	border-radius: 999px;
	background: var(--MI_THEME-panelHighlight);
	font-size: 13px;
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.actions {
	margin-top: 24px;
	display: flex;
	justify-content: center;
}

.reward {
	margin-top: 24px;
	padding: 16px;
	background: var(--MI_THEME-panel);
	border-radius: 12px;
}

.rewardActions {
	display: flex;
	gap: 8px;
	margin-top: 12px;
}

.supportersTitle {
	font-size: 18px;
	font-weight: 600;
	margin-bottom: 8px;
}

.supporterCard {
	padding: 14px;
	display: flex;
	align-items: center;
	gap: 12px;
	transition: background 0.2s;

	&:hover {
		background: var(--MI_THEME-panelHighlight);
	}
}

.supporterAvatar {
	width: 44px;
	height: 44px;
	flex-shrink: 0;
	text-decoration: none;
	transition: opacity 0.2s;

	&:hover {
		opacity: 0.8;
	}
}

.avatarImg {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.supporterAvatarEmpty {
	width: 44px;
	height: 44px;
	background: var(--MI_THEME-face);
	border-radius: 50%;
	flex-shrink: 0;
}

.supporterInfo {
	flex: 1;
	min-width: 0;
}

.supporterName {
	font-weight: 600;
	font-size: 15px;
	text-decoration: none;
	color: inherit;
	display: block;

	&:hover {
		color: var(--MI_THEME-accent);
	}
}

.supporterAmount {
	font-size: 13px;
	opacity: 0.7;
	margin-top: 2px;
}

.supporterTime {
	font-size: 13px;
	opacity: 0.6;
	flex-shrink: 0;
}

.loading {
	text-align: center;
	padding: 24px;
}

.error {
	text-align: center;
	padding: 24px;
	color: var(--MI_THEME-warn);
}
</style>
