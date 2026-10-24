<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useDebounceFn } from '@vueuse/core';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable, { type DataTablePageEvent } from 'primevue/datatable';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import PageHeader from '@shared/components/PageHeader.vue';
import { useApiError } from '@shared/composables/use-api-error';
import { useOffsetQuery } from '@shared/composables/use-offset-query';
import { useCan } from '@core/rbac';
import StatusTag from '../components/StatusTag.vue';
import { catalogApi } from '../catalog.api';
import type { SeriesRow, SeriesStatus } from '../types';

/** BO-02 — catalogue global des séries (toutes marques). */
const { t, d } = useI18n();
const router = useRouter();
const { messageFor, notify } = useApiError();
const { can } = useCan();

const query = useOffsetQuery<SeriesRow, { status?: SeriesStatus; q?: string }>({
  url: '/admin/series',
  filters: {},
  allowedSortFields: [],
});
const status = ref<SeriesStatus | null>(null);
const search = ref('');
watch(status, (v) => (query.filters.status = v ?? undefined));
const applySearch = useDebounceFn((v: string) => (query.filters.q = v.trim() || undefined), 350);
watch(search, (v) => void applySearch(v));

const statusOptions = [
  { value: null, label: t('catalog.series.allStatuses') },
  ...(['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const).map((s) => ({
    value: s,
    label: t(`catalog.status.${s}`),
  })),
];

const genreNames = (s: SeriesRow) => s.genres.map((g) => g.nameFr).join(', ') || '—';

function onPage(e: DataTablePageEvent): void {
  query.state.page = e.page + 1;
  query.state.perPage = e.rows;
  void query.fetch().catch(() => undefined);
}

const createOpen = ref(false);
const newTitle = ref('');
const creating = ref(false);
async function create(): Promise<void> {
  if (!newTitle.value.trim()) return;
  creating.value = true;
  try {
    const s = await catalogApi.createSeries({ titleFr: newTitle.value.trim() });
    createOpen.value = false;
    newTitle.value = '';
    await router.push({ name: 'series-edit', params: { id: s.id } });
  } catch (error) {
    notify(error);
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <div>
    <PageHeader :title="t('catalog.series.title')" :subtitle="t('catalog.series.subtitle')">
      <template #actions>
        <Button
          v-if="can('catalog:write')"
          :label="t('catalog.series.create')"
          icon="pi pi-plus"
          data-testid="series-create"
          @click="createOpen = true"
        />
      </template>
    </PageHeader>

    <div class="mb-4 flex flex-wrap gap-3">
      <InputText
        v-model="search"
        :placeholder="t('catalog.series.search')"
        class="w-72"
        data-testid="series-search"
      />
      <Select
        v-model="status"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        class="w-56"
      />
    </div>

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
      :rows-per-page-options="[10, 20, 50]"
      data-key="id"
      striped-rows
      row-hover
      class="cursor-pointer"
      @page="onPage"
      @row-click="
        (e) => router.push({ name: 'series-edit', params: { id: (e.data as SeriesRow).id } })
      "
    >
      <template #empty>{{ t('common.noResults') }}</template>
      <Column :header="t('catalog.series.columns.title')">
        <template #body="{ data }">
          <div class="flex items-center gap-3">
            <img
              v-if="data.posterUrl"
              :src="data.posterUrl"
              alt=""
              class="h-14 w-10 rounded object-cover"
            />
            <div
              v-else
              class="flex h-14 w-10 items-center justify-center rounded bg-surface-200 text-surface-500"
            >
              <i class="pi pi-image" />
            </div>
            <div class="min-w-0">
              <p class="truncate font-medium">{{ data.titleFr }}</p>
              <p class="truncate text-xs text-surface-500">{{ data.slug }}</p>
            </div>
          </div>
        </template>
      </Column>
      <Column :header="t('catalog.series.columns.genres')">
        <template #body="{ data }">{{ genreNames(data) }}</template>
      </Column>
      <Column :header="t('catalog.series.columns.episodes')">
        <template #body="{ data }"
          >{{ data.publishedEpisodeCount }} / {{ data.episodeCount }}</template
        >
      </Column>
      <Column :header="t('catalog.series.columns.status')">
        <template #body="{ data }"><StatusTag :status="data.status" /></template>
      </Column>
      <Column :header="t('catalog.series.columns.license')">
        <template #body="{ data }">
          <i
            :class="
              data.licensed
                ? 'pi pi-check-circle text-green-600'
                : 'pi pi-exclamation-triangle text-orange-500'
            "
          />
        </template>
      </Column>
      <Column :header="t('catalog.series.columns.storefront')">
        <template #body="{ data }"><StatusTag :status="data.tenantStatus" /></template>
      </Column>
      <Column :header="t('catalog.series.columns.updatedAt')">
        <template #body="{ data }">{{ d(new Date(data.updatedAt), 'short') }}</template>
      </Column>
    </DataTable>

    <Dialog
      v-model:visible="createOpen"
      modal
      :header="t('catalog.series.create')"
      class="w-[28rem]"
    >
      <form class="flex flex-col gap-3" @submit.prevent="create">
        <label class="text-sm font-medium" for="new-title">{{
          t('catalog.series.fields.titleFr')
        }}</label>
        <InputText id="new-title" v-model="newTitle" autofocus data-testid="new-title" />
        <p class="text-xs text-surface-500">{{ t('catalog.series.createHint') }}</p>
        <div class="flex justify-end gap-2">
          <Button type="button" text :label="t('common.cancel')" @click="createOpen = false" />
          <Button
            type="submit"
            :label="t('common.save')"
            :loading="creating"
            :disabled="!newTitle.trim()"
          />
        </div>
      </form>
    </Dialog>
  </div>
</template>
