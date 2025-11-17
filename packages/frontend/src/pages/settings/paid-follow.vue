<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
  <div class="_spacer" style="--MI_SPACER-w: 900px; --MI_SPACER-min: 20px; --MI_SPACER-max: 32px;">
    <div class="_gaps_m">
      <SearchMarker :keywords="['follow', 'price', 'paid follow', 'giá theo dõi']">
        <FormSlot>
          <MkInput v-model="priceVnd" type="number" :min="10000" :max="5000000">
            <template #label>
              <SearchLabel>Giá theo dõi (30 ngày) — VND</SearchLabel>
            </template>
            <template #caption>
              <div>- Tối thiểu: 10.000 VND; Tối đa: 5.000.000 VND</div>
              <div style="color: var(--MI_THEME-warn);"><i class="ti ti-alert-triangle"></i> Không hỗ trợ hoàn tiền. Follow có hiệu lực 30 ngày.</div>
            </template>
          </MkInput>
          <div class="_buttons">
            <MkButton :disabled="!!err" primary @click="save">
              <i class="ti ti-check"></i> {{ i18n.ts.save }}
            </MkButton>
            <span v-if="err" style="color: var(--MI_THEME-error);">{{ err }}</span>
          </div>
        </FormSlot>
      </SearchMarker>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import FormSlot from '@/components/form/slot.vue';
import SearchMarker from '@/components/global/SearchMarker.vue';
import SearchLabel from '@/components/global/SearchLabel.vue';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import * as os from '@/os.js';
import { definePage } from '@/page.js';

const $i = ensureSignin();

const priceVnd = ref<number | null>(($i as any).followPriceAmountVnd ?? 0);
const err = computed<string | null>(() => {
  if (priceVnd.value == null) return null;
  const val = Number(priceVnd.value);
  if (!Number.isFinite(val)) return 'Giá không hợp lệ';
  if (val < 10000) return 'Tối thiểu 10.000 VND';
  if (val > 5000000) return 'Tối đa 5.000.000 VND';
  return null;
});

async function save() {
  if (err.value) return;
  try {
    const payload: any = { followPriceAmountVnd: Number(priceVnd.value) };
    const res = await (os.apiWithDialog as any)('i/update', payload);
    if (res && typeof res === 'object') {
      ($i as any).followPriceAmountVnd = (res as any).followPriceAmountVnd ?? Number(priceVnd.value);
    }
  } catch {}
}

definePage(() => ({
  title: 'Thiết lập giá theo dõi',
  icon: 'ti ti-credit-card',
}));
</script>

