<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="src" :actions="headerActions" :tabs="$i ? headerTabs : headerTabsWhenNotLogin" :swipable="true" :displayMyAvatar="true" :canOmitTitle="true">
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<div v-if="helpPackages.length > 0 || $i" :class="$style.helpSection">
			<!-- Header with title and actions -->
			<div :class="$style.helpHeader">
				<div :class="$style.helpTitle">
					<i class="ti ti-heart-handshake"></i> Những người đang cần giúp
				</div>
				<div :class="$style.helpActions">
					<a :class="$style.viewAllLink" href="/help">
						Xem tất cả <i class="ti ti-chevron-right"></i>
					</a>
				</div>
			</div>

			<!-- Horizontal scrollable cards -->
			<div :class="$style.helpCards">
				<!-- Create card (always first if user is logged in) -->
				<a
					v-if="$i"
					href="/help/create"
					:class="[$style.helpCard, $style.createCard]"
					class="_panel"
				>
					<div :class="$style.createCardContent">
						<div :class="$style.createIcon">
							<i class="ti ti-plus"></i>
						</div>
						<div :class="$style.createTitle">
							Tạo gói giúp đỡ
						</div>
						<div :class="$style.createDesc">
							Kêu gọi sự hỗ trợ từ cộng đồng
						</div>
					</div>
				</a>

				<!-- Regular help package cards -->
				<a
					v-for="pkg in helpPackages.slice(0, 10)"
					:key="pkg.id"
					:href="`/help/${pkg.id}`"
					:class="$style.helpCard"
					class="_panel"
				>
					<!-- Creator info with avatar -->
					<div v-if="pkg.author" :class="$style.cardHeader">
						<img :src="pkg.author.avatarUrl" :class="$style.cardAvatar" :alt="pkg.author.username"/>
						<div :class="$style.cardAuthor">
							<span :class="$style.authorName">{{ pkg.author.name || pkg.author.username }}</span>
						</div>
					</div>

					<!-- Content -->
					<div :class="$style.cardContent">
						{{ truncateText(pkg.content, 80) }}
					</div>

					<!-- Amount needed -->
					<div :class="$style.cardAmount">
						Mục tiêu: {{ formatVnd(pkg.amountVnd) }}
					</div>

					<!-- Reward info -->
					<div v-if="pkg.rewardType && pkg.rewardType !== 'none'" :class="$style.cardReward">
						<i class="ti ti-gift"></i>
						<span>Quà báo đáp: {{ getRewardLabel(pkg.rewardType) }}</span>
					</div>
					<div v-else-if="pkg.rewardType === 'none'" :class="$style.cardReward">
						<i class="ti ti-gift"></i>
						<span>Cho đi không mong nhận lại gì</span>
					</div>

					<!-- Progress -->
					<div :class="$style.cardProgress">
						<div :class="$style.progressBar">
							<div
								:class="$style.progressFill"
								:style="{ width: `${Math.min((pkg.totalAmount / pkg.amountVnd) * 100, 100)}%` }"
							></div>
						</div>
						<div :class="$style.cardStats">
							<span><i class="ti ti-users"></i> {{ pkg.supporterCount || 0 }} người đã giúp</span>
							<span>{{ formatVnd(pkg.totalAmount || 0) }}</span>
						</div>
					</div>

					<!-- Action button -->
					<div :class="$style.cardAction">
						<span class="_buttonPrimary" style="box-sizing: border-box; width: 100%; display: flex; justify-content: center; align-items: center; padding: 8px; border-radius: 99px;">
							Giúp đỡ ngay
						</span>
					</div>
				</a>
			</div>
		</div>
		<MkTip v-if="isBasicTimeline(src)" :k="`tl.${src}`" style="margin-bottom: var(--MI-margin);">
			{{ i18n.ts._timelineDescription[src] }}
		</MkTip>
		<MkPostForm v-if="prefer.r.showFixedPostForm.value" :class="$style.postForm" class="_panel" fixed style="margin-bottom: var(--MI-margin);"/>
		<MkStreamingNotesTimeline
			ref="tlComponent"
			:key="src + withRenotes + withReplies + onlyFiles + withSensitive"
			:class="$style.tl"
			:src="(src.split(':')[0] as (BasicTimelineType | 'list'))"
			:list="src.split(':')[1]"
			:withRenotes="withRenotes"
			:withReplies="withReplies"
			:withSensitive="withSensitive"
			:onlyFiles="onlyFiles"
			:sound="true"
		/>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, watch, provide, useTemplateRef, ref, onMounted, onActivated } from 'vue';
import type { Tab } from '@/components/global/MkPageHeader.tabs.vue';
import type { MenuItem } from '@/types/menu.js';
import type { BasicTimelineType } from '@/timelines.js';
import MkStreamingNotesTimeline from '@/components/MkStreamingNotesTimeline.vue';
import MkPostForm from '@/components/MkPostForm.vue';
import * as os from '@/os.js';
import { store } from '@/store.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { definePage } from '@/page.js';
import { antennasCache, userListsCache, favoritedChannelsCache } from '@/cache.js';
import { deviceKind } from '@/utility/device-kind.js';
import { deepMerge } from '@/utility/merge.js';
import { miLocalStorage } from '@/local-storage.js';
import { availableBasicTimelines, hasWithReplies, isAvailableBasicTimeline, isBasicTimeline, basicTimelineIconClass } from '@/timelines.js';
import { prefer } from '@/preferences.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const tlComponent = useTemplateRef('tlComponent');
const helpPackages = ref<any[]>([]);

async function loadHelpPackages() {
	try {
		const res = await misskeyApi('help/list', {});
		const packages = res.items ?? [];

		// Fetch author info for each package
		for (const pkg of packages) {
			if (pkg.authorId) {
				try {
					const user = await misskeyApi('users/show', { userId: pkg.authorId });
					pkg.author = user;
				} catch (err) {
					console.error('Failed to load author:', err);
				}
			}
		}

		helpPackages.value = packages;
	} catch (err) {
		console.error('Failed to load help packages:', err);
	}
}

function formatVnd(amount: number): string {
	return new Intl.NumberFormat('vi-VN', {
		style: 'currency',
		currency: 'VND',
	}).format(amount);
}

function truncateText(text: string, maxLength: number): string {
	if (!text) return '';
	if (text.length <= maxLength) return text;
	return text.substring(0, maxLength) + '...';
}

function getRewardLabel(rewardType: string): string {
	switch (rewardType) {
		case 'online': return 'Ảnh và video';
		case 'direct': return 'Gặp mặt';
		default: return rewardType;
	}
}

type TimelinePageSrc = BasicTimelineType | `list:${string}`;

const srcWhenNotSignin = ref<'local' | 'global'>(isAvailableBasicTimeline('local') ? 'local' : 'global');
const src = computed<TimelinePageSrc>({
	get: () => ($i ? store.r.tl.value.src : srcWhenNotSignin.value),
	set: (x) => saveSrc(x),
});
const withRenotes = computed<boolean>({
	get: () => store.r.tl.value.filter.withRenotes,
	set: (x) => saveTlFilter('withRenotes', x),
});

// computed内での無限ループを防ぐためのフラグ
const localSocialTLFilterSwitchStore = ref<'withReplies' | 'onlyFiles' | false>(
	store.r.tl.value.filter.withReplies ? 'withReplies' :
	store.r.tl.value.filter.onlyFiles ? 'onlyFiles' :
	false,
);

const withReplies = computed<boolean>({
	get: () => {
		if (!$i) return false;
		if (['local', 'social'].includes(src.value) && localSocialTLFilterSwitchStore.value === 'onlyFiles') {
			return false;
		} else {
			return store.r.tl.value.filter.withReplies;
		}
	},
	set: (x) => saveTlFilter('withReplies', x),
});
const onlyFiles = computed<boolean>({
	get: () => {
		if (['local', 'social'].includes(src.value) && localSocialTLFilterSwitchStore.value === 'withReplies') {
			return false;
		} else {
			return store.r.tl.value.filter.onlyFiles;
		}
	},
	set: (x) => saveTlFilter('onlyFiles', x),
});

watch([withReplies, onlyFiles], ([withRepliesTo, onlyFilesTo]) => {
	if (withRepliesTo) {
		localSocialTLFilterSwitchStore.value = 'withReplies';
	} else if (onlyFilesTo) {
		localSocialTLFilterSwitchStore.value = 'onlyFiles';
	} else {
		localSocialTLFilterSwitchStore.value = false;
	}
});

const withSensitive = computed<boolean>({
	get: () => store.r.tl.value.filter.withSensitive,
	set: (x) => saveTlFilter('withSensitive', x),
});

const showFixedPostForm = prefer.model('showFixedPostForm');

async function chooseList(ev: MouseEvent): Promise<void> {
	const lists = await userListsCache.fetch();
	const items: (MenuItem | undefined)[] = [
		...lists.map(list => ({
			type: 'link' as const,
			text: list.name,
			to: `/timeline/list/${list.id}`,
		})),
		(lists.length === 0 ? undefined : { type: 'divider' }),
		{
			type: 'link' as const,
			icon: 'ti ti-plus',
			text: i18n.ts.createNew,
			to: '/my/lists',
		},
	];
	os.popupMenu(items.filter(i => i != null), ev.currentTarget ?? ev.target);
}

async function chooseAntenna(ev: MouseEvent): Promise<void> {
	const antennas = await antennasCache.fetch();
	const items: (MenuItem | undefined)[] = [
		...antennas.map(antenna => ({
			type: 'link' as const,
			text: antenna.name,
			indicate: antenna.hasUnreadNote,
			to: `/timeline/antenna/${antenna.id}`,
		})),
		(antennas.length === 0 ? undefined : { type: 'divider' }),
		{
			type: 'link' as const,
			icon: 'ti ti-plus',
			text: i18n.ts.createNew,
			to: '/my/antennas',
		},
	];
	os.popupMenu(items.filter(i => i != null), ev.currentTarget ?? ev.target);
}

async function chooseChannel(ev: MouseEvent): Promise<void> {
	const channels = await favoritedChannelsCache.fetch();
	const items: (MenuItem | undefined)[] = [
		...channels.map(channel => {
			const lastReadedAt = miLocalStorage.getItemAsJson(`channelLastReadedAt:${channel.id}`) ?? null;
			const hasUnreadNote = (lastReadedAt && channel.lastNotedAt) ? Date.parse(channel.lastNotedAt) > lastReadedAt : !!(!lastReadedAt && channel.lastNotedAt);

			return {
				type: 'link' as const,
				text: channel.name,
				indicate: hasUnreadNote,
				to: `/channels/${channel.id}`,
			};
		}),
		(channels.length === 0 ? undefined : { type: 'divider' }),
		{
			type: 'link',
			icon: 'ti ti-plus',
			text: i18n.ts.createNew,
			to: '/channels',
		},
	];
	os.popupMenu(items.filter(i => i != null), ev.currentTarget ?? ev.target);
}

function saveSrc(newSrc: TimelinePageSrc): void {
	const out = deepMerge({ src: newSrc }, store.s.tl);

	if (newSrc.startsWith('userList:')) {
		const id = newSrc.substring('userList:'.length);
		out.userList = prefer.r.pinnedUserLists.value.find(l => l.id === id) ?? null;
	}

	store.set('tl', out);
	if (['local', 'global'].includes(newSrc)) {
		srcWhenNotSignin.value = newSrc as 'local' | 'global';
	}
}

function saveTlFilter(key: keyof typeof store.s.tl.filter, newValue: boolean) {
	if (key !== 'withReplies' || $i) {
		const out = deepMerge({ filter: { [key]: newValue } }, store.s.tl);
		store.set('tl', out);
	}
}

function switchTlIfNeeded() {
	if (isBasicTimeline(src.value) && !isAvailableBasicTimeline(src.value)) {
		src.value = availableBasicTimelines()[0];
	}
}

onMounted(() => {
	switchTlIfNeeded();
	loadHelpPackages();
});
onActivated(() => {
	switchTlIfNeeded();
});

const headerActions = computed(() => {
	const items = [{
		icon: 'ti ti-dots',
		text: i18n.ts.options,
		handler: (ev) => {
			const menuItems: MenuItem[] = [];

			menuItems.push({
				type: 'switch',
				icon: 'ti ti-repeat',
				text: i18n.ts.showRenotes,
				ref: withRenotes,
			});

			if (isBasicTimeline(src.value) && hasWithReplies(src.value)) {
				menuItems.push({
					type: 'switch',
					icon: 'ti ti-messages',
					text: i18n.ts.showRepliesToOthersInTimeline,
					ref: withReplies,
					disabled: onlyFiles,
				});
			}

			menuItems.push({
				type: 'switch',
				icon: 'ti ti-eye-exclamation',
				text: i18n.ts.withSensitive,
				ref: withSensitive,
			}, {
				type: 'switch',
				icon: 'ti ti-photo',
				text: i18n.ts.fileAttachedOnly,
				ref: onlyFiles,
				disabled: isBasicTimeline(src.value) && hasWithReplies(src.value) ? withReplies : false,
			}, {
				type: 'divider',
			}, {
				type: 'switch',
				text: i18n.ts.showFixedPostForm,
				ref: showFixedPostForm,
			});

			os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
		},
	}];

	if (deviceKind === 'desktop') {
		items.unshift({
			icon: 'ti ti-refresh',
			text: i18n.ts.reload,
			handler: (ev: Event) => {
				tlComponent.value?.reloadTimeline();
			},
		});
	}

	return items;
});

const headerTabs = computed(() => ([
	{
		key: 'local',
		title: 'Trang chủ',
		icon: basicTimelineIconClass('local'),
		iconOnly: false,
	},
	{
		key: 'home',
		title: 'Đang theo dõi',
		icon: basicTimelineIconClass('home'),
		iconOnly: false,
	},
] as Tab[]));

const headerTabsWhenNotLogin = computed(() => ([
	{
		key: 'local',
		title: 'Trang chủ',
		icon: basicTimelineIconClass('local'),
		iconOnly: false,
	},
	// home không khả dụng khi chưa đăng nhập
] as Tab[]));

definePage(() => ({
	title: i18n.ts.timeline,
	icon: isBasicTimeline(src.value) ? basicTimelineIconClass(src.value) : 'ti ti-home',
}));
</script>

<style lang="scss" module>
.new {
	position: sticky;
	top: calc(var(--MI-stickyTop, 0px) + 16px);
	z-index: 1000;
	width: 100%;
	margin: calc(-0.675em - 8px) 0;

	&:first-child {
		margin-top: calc(-0.675em - 8px - var(--MI-margin));
	}
}

.newButton {
	display: block;
	margin: var(--MI-margin) auto 0 auto;
	padding: 8px 16px;
	border-radius: 32px;
}

.postForm {
	border-radius: var(--MI-radius);
}

.tl {
	background: var(--MI_THEME-bg);
	border-radius: var(--MI-radius);
	overflow: clip;
}

.helpSection {
	margin-bottom: var(--MI-margin);
}

.helpHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 12px;
	padding: 0 4px;
}

.helpTitle {
	font-weight: 700;
	font-size: 18px;
	display: flex;
	align-items: center;
	gap: 8px;
	color: var(--MI_THEME-fg);
}

.helpActions {
	display: flex;
	gap: 8px;
}

.viewAllLink {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-size: 14px;
	color: var(--MI_THEME-accent);
	text-decoration: none;
	transition: opacity 0.2s;

	&:hover {
		opacity: 0.7;
	}

	i {
		font-size: 16px;
	}
}

.helpCards {
	display: flex;
	gap: 12px;
	overflow-x: auto;
	overflow-y: hidden;
	padding: 4px;
	margin: 0 -4px;
	scrollbar-width: thin;
	scrollbar-color: var(--MI_THEME-scrollbarHandle) transparent;

	&::-webkit-scrollbar {
		height: 6px;
	}

	&::-webkit-scrollbar-track {
		background: transparent;
	}

	&::-webkit-scrollbar-thumb {
		background: var(--MI_THEME-scrollbarHandle);
		border-radius: 3px;
	}
}

.helpCard {
	flex: 0 0 200px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 14px;
	border-radius: var(--MI-radius);
	text-decoration: none;
	color: inherit;
	transition: transform 0.2s, box-shadow 0.2s;
	cursor: pointer;

	&:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
	}
}

.createCard {
	border: 2px dashed var(--MI_THEME-divider);
	background: transparent;
	justify-content: center;
	align-items: center;

	&:hover {
		border-color: var(--MI_THEME-accent);
		background: var(--MI_THEME-panel);
	}
}

.createCardContent {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	text-align: center;
	padding: 20px 0;
}

.createIcon {
	width: 60px;
	height: 60px;
	border-radius: 50%;
	background: var(--MI_THEME-accent);
	display: flex;
	align-items: center;
	justify-content: center;

	i {
		font-size: 32px;
		color: white;
	}
}

.createTitle {
	font-size: 16px;
	font-weight: 600;
}

.createDesc {
	font-size: 13px;
	opacity: 0.7;
}

.cardHeader {
	display: flex;
	align-items: center;
	gap: 8px;
	padding-bottom: 8px;
	border-bottom: 1px solid var(--MI_THEME-divider);
}

.cardAvatar {
	width: 32px;
	height: 32px;
	border-radius: 50%;
	object-fit: cover;
}

.cardAuthor {
	flex: 1;
	min-width: 0;
}

.authorName {
	font-size: 13px;
	font-weight: 600;
	display: block;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.cardContent {
	font-size: 14px;
	line-height: 1.4;
	overflow: hidden;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	min-height: 40px;
}

.cardAmount {
	font-size: 15px;
	font-weight: 600;
	color: var(--MI_THEME-accent);
}

.cardReward {
	font-size: 13px;
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 6px 10px;
	background: var(--MI_THEME-panel);
	border-radius: 6px;
	opacity: 0.9;

	i {
		color: var(--MI_THEME-accent);
	}
}

.cardProgress {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.progressBar {
	height: 5px;
	background: var(--MI_THEME-divider);
	border-radius: 3px;
	overflow: hidden;
}

.progressFill {
	height: 100%;
	background: var(--MI_THEME-accent);
	transition: width 0.3s ease;
	border-radius: 3px;
}

.cardStats {
	display: flex;
	justify-content: space-between;
	font-size: 12px;
	opacity: 0.8;

	span {
		display: flex;
		align-items: center;
		gap: 4px;
	}
}

.cardAction {
	margin-top: auto;
	padding-top: 4px;
}

</style>
