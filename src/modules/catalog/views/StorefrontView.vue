<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputNumber from 'primevue/inputnumber';
import Message from 'primevue/message';
import ToggleSwitch from 'primevue/toggleswitch';
import PageHeader from '@shared/components/PageHeader.vue';
import { useApiError } from '@shared/composables/use-api-error';
import { useCan } from '@core/rbac';
import { catalogApi } from '../catalog.api';
import type { StorefrontRow } from '../types';

/**
 * BO-11 — vitrine de la marque connectée : quelles séries publiées elle diffuse,
 * lesquelles sont mises en avant, ordre, et surcharges (épisodes gratuits, prix).
 */
const { t } = useI18n();
const toast = useToast();
const { notify } = useApiError();
const { can } = useCan();
const rows = ref<StorefrontRow[]>([]);
const loading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try { rows.value = await catalogApi.storefront(); } catch (e) { notify(e); } finally { loading.value = false; }
}
onMounted(load);

async function save(r: StorefrontRow): Promise<void> {
  try {
    await catalogApi.setStorefront(r.seriesId, {
      status: r.status, featured: r.featured, position: r.position,
      freeEpisodesOverride: r.freeEpisodesOverride, episodePriceCoinsOverride: r.episodePriceCoinsOverride,
    });
    toast.add({ severity: 'success', summary: t('catalog.storefront.saved', { title: r.titleFr }), life: 2500 });
  } catch (e) {
    notify(e);
    await load();
  }
}

function toggleLive(r: StorefrontRow, live: boolean): void {
  r.status = live ? 'LIVE' : 'HIDDEN';
  void save(r);
}
</script>

<template>
  <div>
    <PageHeader :title="t('catalog.storefront.title')" :subtitle="t('catalog.storefront.subtitle')" />
    <Message severity="info" :closable="false" class="mb-4">{{ t('catalog.storefront.hint') }}</Message>
    <DataTable :value="rows" :loading="loading" data-key="seriesId" striped-rows>
      <template #empty>{{ t('catalog.storefront.empty') }}</template>
      <Column :header="t('catalog.series.columns.title')">
        <template #body="{ data }">
          <div class="flex items-center gap-3">
            <img v-if="data.posterUrl" :src="data.posterUrl" alt="" class="h-12 w-9 rounded object-cover" />
            <div><p class="font-medium">{{ data.titleFr }}</p><p class="text-xs text-surface-500">{{ data.episodeCount }} {{ t('catalog.storefront.episodes') }}</p></div>
          </div>
        </template>
      </Column>
      <Column :header="t('catalog.storefront.live')">
        <template #body="{ data }">
          <ToggleSwitch :model-value="data.status === 'LIVE'" :disabled="!can('storefront:write') || (!data.licensedForTenant && data.status !== 'LIVE')" @update:model-value="(v: boolean) => toggleLive(data, v)" />
          <p v-if="!data.licensedForTenant" class="mt-1 text-xs text-orange-600">{{ t('catalog.storefront.notLicensed') }}</p>
        </template>
      </Column>
      <Column :header="t('catalog.storefront.featured')"><template #body="{ data }"><ToggleSwitch v-model="data.featured" :disabled="!can('storefront:write')" @update:model-value="save(data)" /></template></Column>
      <Column :header="t('catalog.storefront.position')"><template #body="{ data }"><InputNumber v-model="data.position" :min="0" class="w-20" :disabled="!can('storefront:write')" /></template></Column>
      <Column :header="t('catalog.storefront.freeOverride', { n: '' })">
        <template #body="{ data }"><InputNumber v-model="data.freeEpisodesOverride" :min="0" :placeholder="String(data.freeEpisodes)" class="w-20" :disabled="!can('storefront:write')" /></template>
      </Column>
      <Column :header="t('catalog.storefront.priceOverride')">
        <template #body="{ data }"><InputNumber v-model="data.episodePriceCoinsOverride" :min="1" :placeholder="String(data.episodePriceCoins)" class="w-24" :disabled="!can('storefront:write')" /></template>
      </Column>
      <Column v-if="can('storefront:write')"><template #body="{ data }"><Button size="small" text icon="pi pi-save" :aria-label="t('common.save')" @click="save(data)" /></template></Column>
    </DataTable>
  </div>
</template>
