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
      <div :class="$style.center">
        <div :class="$style.amount">{{ i18n.ts.follow }} — {{ amountVnd.toLocaleString('vi-VN') }}₫/30d</div>
        <div :class="$style.timerWrap">
          <div :class="$style.timerCircle" :style="{ '--pct': pct + '%' }">
            <div :class="$style.timerText">{{ mm }}:{{ ss }}</div>
          </div>
          <div :class="$style.timerHint">QR hết hạn sau 5 phút</div>
        </div>
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
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
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

const total = 300;
const left = ref(total);
let h: ReturnType<typeof setInterval> | null = null;
const mm = computed(() => String(Math.floor(left.value / 60)).padStart(2, '0'));
const ss = computed(() => String(left.value % 60).padStart(2, '0'));
const pct = computed(() => Math.round((left.value / total) * 100));

onMounted(() => {
  h = setInterval(() => {
    if (left.value > 0) {
      left.value -= 1;
    } else {
      if (modal.value) modal.value.close();
    }
  }, 1000);
});

onUnmounted(() => {
  if (h) clearInterval(h);
});
</script>

<style lang="scss" module>
.root { background: var(--MI_THEME-panel); border-radius: var(--MI-radius); overflow: hidden; }
.header { display:flex; align-items:center; gap:8px; padding:12px 16px; background: linear-gradient(90deg, var(--MI_THEME-buttonGradateA), var(--MI_THEME-buttonGradateB)); color: var(--MI_THEME-fgOnAccent); }
.headerText { font-weight: 600; }
.closeButton { margin-left:auto; color: var(--MI_THEME-fgOnAccent); }
.content { padding: 24px; }
.center { display:flex; flex-direction:column; align-items:center; gap:16px; }
.amount { font-weight: 600; }
.qr { width: 280px; height: 280px; object-fit: contain; border-radius: 12px; box-shadow: 0 12px 32px rgb(0 0 0 / 25%); }
.timerWrap { display:flex; flex-direction:column; align-items:center; gap:6px; }
.timerCircle { width: 84px; height: 84px; border-radius: 50%; display:flex; align-items:center; justify-content:center; background:
  conic-gradient(var(--MI_THEME-accent) calc(var(--pct) * 1%), color-mix(in srgb, var(--MI_THEME-fg), transparent 90%) 0);
}
.timerText { font-weight: 700; color: var(--MI_THEME-fgOnPanel); }
.timerHint { font-size: 12px; opacity: .7; }
</style>