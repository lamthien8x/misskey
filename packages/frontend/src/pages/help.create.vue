<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m" :class="$style.root">
	<MkPageHeader :overridePageMetadata="{ title: 'Tạo gói giúp đỡ', icon: 'ti ti-heart-handshake' }"/>
	<div class="_panel" :class="$style.form">
		<div :class="$style.group">
			<div :class="$style.label"><i class="ti ti-currency-dong"></i> Số tiền cần giúp (VND)</div>
			<MkInput v-model="amountVnd" type="number"/>
		</div>
		<div :class="$style.group">
			<div :class="$style.label"><i class="ti ti-gift"></i> Quà báo đáp</div>
			<MkSelect v-model="rewardType" :items="rewardOptions"/>
		</div>
		<div v-if="rewardType === 'online'" :class="$style.group">
			<div :class="$style.label"><i class="ti ti-photo"></i> Kho ảnh/video (ít nhất 3 ảnh hoặc 1 video)</div>
			<MkButton @click="pickFiles"><i class="ti ti-photo"></i> Chọn tệp</MkButton>
			<div :class="$style.files">
				<MkDriveFile v-for="f in rewardMediaFiles" :key="f.id" :file="f" :folder="null"/>
			</div>
		</div>
		<div :class="$style.group">
			<div :class="$style.label"><i class="ti ti-align-left"></i> Bạn muốn nói gì với người giúp đỡ mình không?</div>
			<MkTextarea v-model="content"/>
		</div>
		<div :class="$style.actions">
			<MkButton primary @click="submit"><i class="ti ti-check"></i> Tạo gói</MkButton>
		</div>
	</div>
</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type * as Misskey from 'misskey-js';
import { $i } from '@/i.js';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useRouter } from '@/router.js';
import MkDriveFile from '@/components/MkDrive.file.vue';

const amountVnd = ref<number>(0);
const rewardType = ref<'none' | 'direct' | 'online'>('none');
const rewardMediaFileIds = ref<string[]>([]);
const rewardMediaFiles = ref<Misskey.entities.DriveFile[]>([]);
const content = ref<string>('');

const rewardOptions = [
	{ value: 'none', label: 'Không có quà báo đáp' },
	{ value: 'direct', label: 'Gặp mặt trực tiếp ' },
	{ value: 'online', label: 'Món quà trực tuyến' },
];

const router = useRouter();

async function pickFiles() {
	const files = await os.chooseFileFromPc({ multiple: true });
	if (!files || files.length === 0) return;
	try {
		const uploaded = await os.launchUploader(files, { multiple: true });
		rewardMediaFiles.value.splice(0, rewardMediaFiles.value.length, ...uploaded);
		rewardMediaFileIds.value.splice(0, rewardMediaFileIds.value.length, ...uploaded.map(f => f.id));
	} catch {}
}

async function submit() {
	if (!$i || !$i.roles || $i.roles.length === 0) {
		await os.alert({
			type: 'warning',
			title: 'Chưa được cấp quyền',
			text: '<center>**Bạn cần được cấp quyền để sử dụng tính năng này**</center>\n\nVui lòng liên hệ admin để mở khóa:\n\n<center>**Zalo: 0387684547**</center>\n<center>(gặp admin Hồ Công)</center>',
		});
		return;
	}

	try {
		const r = await misskeyApi('help/create', { amountVnd: amountVnd.value, rewardType: rewardType.value, rewardMediaFileIds: rewardMediaFileIds.value, content: content.value });
		await os.alert({ type: 'success', text: `Đã tạo gói: ${r.id}` });
		router.push('/help');
	} catch (e) {
		await os.alert({ type: 'error', text: 'Tạo gói thất bại' });
	}
}
</script>

<style module lang="scss">
.root { padding: var(--MI-margin); }
.form { padding: var(--MI-margin); border-radius: var(--MI-radius); display:flex; flex-direction:column; gap:16px; }
.group { display:flex; flex-direction:column; gap:8px; }
.label { font-weight:600; }
.files { display:flex; flex-direction:column; gap:4px; }
.actions { display:flex; justify-content:flex-end; }
</style>
