<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useDebounceFn } from '@vueuse/core';
import Column from 'primevue/column';
import DataTable, { type DataTablePageEvent } from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import PageHeader from '@shared/components/PageHeader.vue';
import { useApiError } from '@shared/composables/use-api-error';
import { useOffsetQuery } from '@shared/composables/use-offset-query';
import { VIEWERS_URL } from '../audience.api';
import type { ViewerRow } from '../types';

/** BO-07 — spectateurs rattachés à la marque (assistance). */
const { t, d, n } = useI18n();
const router = useRouter();
const { messageFor } = useApiError();
const query = useOffsetQuery<ViewerRow, { q?: string }>({
  url: VIEWERS_URL,
  filters: {},
  allowedSortFields: [],
});
const search = ref('');
const applySearch = useDebounceFn((v: string) => (query.filters.q = v.trim() || undefined), 350);
watch(search, (v) => void applySearch(v));
function onPage(e: DataTablePageEvent): void {
  query.state.page = e.page + 1;
  query.state.perPage = e.rows;
  void query.fetch().catch(() => undefined);
}
</script>

<template>
  <div>
    <PageHeader :title="t('audience.viewers.title')" :subtitle="t('audience.viewers.subtitle')" />
    <InputText v-model="search" :placeholder="t('audience.viewers.search')" class="mb-4 w-72" />
    <Message v-if="query.error.value" severity="error" :closable="false" class="mb-4">{{
      messageFor(query.error.value)
    }}</Message>
    <DataTable
      :value="query.items.value"
      :loading="query.loading.value"
      lazy
      paginator
      :rows="query.state.perPage"
      :total-records="query.total.value"
      data-key="accountId"
      striped-rows
      row-hover
      class="cursor-pointer"
      @page="onPage"
      @row-click="
        (e) =>
          router.push({
            name: 'viewer-detail',
            params: { accountId: (e.data as ViewerRow).accountId },
          })
      "
    >
      <template #empty>{{ t('common.noResults') }}</template>
      <Column :header="t('audience.viewers.phone')"
        ><template #body="{ data }">{{ data.phoneE164 ?? '—' }}</template></Column
      >
      <Column :header="t('audience.viewers.country')"
        ><template #body="{ data }">{{ data.countryCode ?? '—' }}</template></Column
      >
      <Column :header="t('audience.viewers.balance')"
        ><template #body="{ data }"
          >{{ n(data.balance) }} {{ t('catalog.coins') }}</template
        ></Column
      >
      <Column :header="t('audience.viewers.joinedAt')"
        ><template #body="{ data }">{{ d(new Date(data.joinedAt), 'short') }}</template></Column
      >
      <Column :header="t('audience.viewers.lastLogin')"
        ><template #body="{ data }">{{
          data.lastLoginAt ? d(new Date(data.lastLoginAt), 'long') : '—'
        }}</template></Column
      >
      <Column :header="t('audience.viewers.status')"
        ><template #body="{ data }">{{ data.accountStatus ?? data.status }}</template></Column
      >
    </DataTable>
  </div>
</template>
