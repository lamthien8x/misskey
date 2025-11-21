<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m" :class="$style.root">
  <MkPageHeader :overridePageMetadata="{ title: 'Quản trị gói giúp đỡ', icon: 'ti ti-heart-handshake' }"/>
  <div class="_panel" :class="$style.panel">
    <div class="_gaps_s">
      <div v-for="p in packages" :key="p.id" :class="$style.package">
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
            <span>• {{ p.status }}</span>
            <span>• {{ rewardLabel(p) }}</span>
            <span v-if="p.rewardType === 'online'">• {{ p.rewardMediaFileIds.length }} tệp</span>
          </div>
          <div :class="$style.packageStats">
            <span :class="$style.badge"><i class="ti ti-users"></i> {{ p.supporterCount || 0 }}</span>
            <span :class="$style.badge"><i class="ti ti-circle-check"></i> {{ p.confirmCount || 0 }}</span>
            <span :class="$style.badge"><i class="ti ti-alert-triangle"></i> {{ p.reportCount || 0 }}</span>
          </div>
        </div>
        <div :class="$style.actions">
          <MkButton @click="toggleStatus(p)">{{ p.status === 'active' ? 'Ẩn' : 'Hiện' }}</MkButton>
          <MkButton @click="loadContrib(p.id)"><i class="ti ti-users"></i> Xem người hỗ trợ</MkButton>
        </div>
      </div>
    </div>
    <div v-if="contribs.length" class="_gaps_s" :class="$style.contribs">
      <div v-for="c in contribs" :key="c.supporterId" :class="$style.contribItem">
        <div>Người hỗ trợ: {{ c.supporterId }}</div>
        <div>Số tiền: {{ c.amount.toLocaleString('vi-VN') }}₫</div>
        <div>Thời điểm: {{ new Date(c.at).toLocaleString('vi-VN') }}</div>
      </div>
    </div>
  </div>
</div>
</template>

<script setup lang="ts">
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import MkButton from '@/components/MkButton.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { ref } from 'vue';

const packages = ref<any[]>([]);
const contribs = ref<any[]>([]);

async function loadPackages() {
  console.log('[admin/help] load packages');
  const r = await misskeyApi('help/admin-list', { includeInactive: true });
  const enriched: any[] = [];
  for (const it of (r.items ?? [])) {
    let author = null;
    try { author = await misskeyApi('users/show', { userId: it.authorId }); } catch {}
    enriched.push({ ...it, author });
  }
  packages.value.splice(0, packages.value.length, ...enriched);
  console.log('[admin/help] packages:', packages.value.length);
}

async function loadContrib(id: string) {
  const r = await misskeyApi('help/contrib-list', { id });
  contribs.value.splice(0, contribs.value.length, ...(r.items ?? []));
}

async function toggleStatus(p: any) {
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
.package { display:flex; align-items:flex-start; justify-content:space-between; padding:12px; border-bottom: solid 1px var(--MI_THEME-divider); }
.packageMain { display:flex; flex-direction:column; gap:8px; }
.packageHeader { display:flex; align-items:center; gap:12px; }
.avatar { width: 44px; height: 44px; }
.headerText { display:flex; flex-direction:column; }
.headerMeta { font-size:12px; opacity:.7; }
.packageTitle { font-weight:600; }
.packageMeta { opacity:.8; display:flex; gap:8px; flex-wrap:wrap; }
.packageStats { display:flex; gap:8px; }
.badge { padding:4px 8px; border-radius:999px; background: var(--MI_THEME-panelHighlight); font-size:12px; }
.actions { display:flex; gap:8px; }
.contribs { margin-top: 16px; }
.contribItem { padding:8px; border: solid 1px var(--MI_THEME-divider); border-radius: 8px; }
</style>
