<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" :preferType="'dialog'" :zPriority="'high'" @closed="emit('closed')">
  <div :class="$style.root">
    <div :class="$style.header">
      <div :class="$style.headerText"><i class="ti ti-qrcode"></i> SePay QR</div>
      <button :class="$style.closeButton" class="_button" @click="modal?.close()"><i class="ti ti-x"></i></button>
    </div>
    <div :class="$style.content">
      <div class="_gaps_m" style="text-align:center;">
        <div>{{ i18n.ts.follow }} — {{ amountVnd.toLocaleString('vi-VN') }}₫/30d</div>
        <img v-if="qrDataUrl" :src="qrDataUrl" :alt="'SePay QR'" :class="$style.qr"/>
        <MkKeyValue v-if="paymentUrl" :copy="paymentUrl" oneline>
          <template #key>Payment Link</template>
          <template #value><span class="_monospace">{{ paymentUrl }}</span></template>
        </MkKeyValue>
      </div>
    </div>
  </div>
</MkModal>
</template>

<script lang="ts" setup>
import { useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';

const modal = useTemplateRef('modal');

const props = defineProps<{
  user: Misskey.entities.UserDetailed;
  qrDataUrl: string;
  paymentUrl?: string;
  amountVnd: number;
}>();

const emit = defineEmits<{ (ev: 'closed'): void }>();

// Webhook sẽ xác nhận follow sau khi chuyển khoản
</script>

<style lang="scss" module>
.root { background: var(--MI_THEME-panel); border-radius: var(--MI-radius); }
.header { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom: solid 0.5px var(--MI_THEME-divider); }
.headerText { font-weight: 600; }
.closeButton { margin-left:auto; }
.content { padding: 16px; }
.qr { width: 260px; height: 260px; object-fit: contain; margin: 0 auto; }
</style>