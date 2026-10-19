<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useDebounceFn } from '@vueuse/core';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable, { type DataTablePageEvent, type DataTableSortEvent } from 'primevue/datatable';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import PageHeader from '@shared/components/PageHeader.vue';
import { useApiError } from '@shared/composables/use-api-error';
import { useOffsetQuery } from '@shared/composables/use-offset-query';
import { config } from '@core/config';
import TenantStatusTag from '../components/TenantStatusTag.vue';
import { TENANTS_URL } from '../tenants.api';
import {
  TENANT_SORT_FIELDS,
  type TenantFilters,
  type TenantStatus,
  type TenantView,
} from '../types';

/**
 * Organisations (BSG-13) — SUPER_ADMIN uniquement (garde par RÔLE).
 * Pagination OFFSET côté serveur, tri sur la liste blanche backend.
 */
const { t, n } = useI18n();
const router = useRouter();
const { messageFor } = useApiError();

const query = useOffsetQuery<TenantView, TenantFilters>({
  url: TENANTS_URL,
  filters: {},
  allowedSortFields: TENANT_SORT_FIELDS,
  defaultSortBy: 'name',
  // Premier chargement différé : le composable part en `desc` par défaut,
  // et une liste d'organisations se lit de A à Z.
  immediate: false,
});
query.state.sortDir = 'asc';
void query.fetch().catch(() => undefined);
const pageSizeOptions = [...config.ui.pageSizeOptions];

type Tab = 'all' | TenantStatus;
const TABS: readonly Tab[] = ['all', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'];
const tab = ref<Tab>('all');
const searchInput = ref('');
watch(tab, (value) => (query.filters.statuses = value === 'all' ? undefined : [value]));
const applySearch = useDebounceFn((value: string) => {
  query.filters.search = value.trim() || undefined;
}, 350);

const hasFilters = computed(() => tab.value !== 'all' || !!searchInput.value);

function onPage(event: DataTablePageEvent): void {
  query.state.page = event.page + 1;
  query.state.perPage = event.rows;
  void query.fetch().catch(() => undefined);
}
function onSort(event: DataTableSortEvent): void {
  query.state.sortBy = typeof event.sortField === 'string' ? event.sortField : undefined;
  query.state.sortDir = event.sortOrder === 1 ? 'asc' : 'desc';
  void query.fetch().catch(() => undefined);
}
function open(row: TenantView): void {
  void router.push({ name: 'tenants-detail', params: { id: row.id } });
}
</script>

<template>
  <div>
    <PageHeader :title="t('tenants.title')" :subtitle="t('tenants.subtitle')">
      <template #actions>
        <Button
          icon="pi pi-refresh"
          text
          rounded
          :aria-label="t('common.retry')"
          :loading="query.loading.value"
          @click="query.fetch().catch(() => undefined)"
        />
      </template>
    </PageHeader>

    <p class="guard-note mb-4">
      <i class="pi pi-shield" aria-hidden="true" />
      {{ t('tenants.guardNote') }}
    </p>

    <section class="toolbar">
      <div class="tabs" role="tablist" :aria-label="t('tenants.filterStatus')">
        <button
          v-for="option in TABS"
          :key="option"
          type="button"
          role="tab"
          class="tab"
          :class="{ 'tab--active': tab === option }"
          :aria-selected="tab === option"
          :data-testid="`tenant-tab-${option}`"
          @click="tab = option"
        >
          {{ option === 'all' ? t('tenants.all') : t(`tenants.statuses.${option}`) }}
        </button>
      </div>
      <IconField class="min-w-56 flex-1">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="searchInput"
          class="w-full"
          :placeholder="t('tenants.searchPlaceholder')"
          :aria-label="t('common.search')"
          @update:model-value="applySearch(searchInput)"
        />
      </IconField>
    </section>

    <Message v-if="query.error.value" severity="error" :closable="false" class="mb-4">
      {{ messageFor(query.error.value) }}
    </Message>

    <p class="mb-2 text-sm text-surface-500" aria-live="polite">
      <template v-if="!query.loading.value && !query.error.value">
        {{ t('tenants.results', query.total.value) }}
      </template>
    </p>

    <DataTable
      :value="query.items.value"
      :loading="query.loading.value"
      lazy
      paginator
      row-hover
      data-key="id"
      :rows="query.state.perPage"
      :first="(query.state.page - 1) * query.state.perPage"
      :total-records="query.total.value"
      :rows-per-page-options="pageSizeOptions"
      :sort-field="query.state.sortBy"
      :sort-order="query.state.sortDir === 'asc' ? 1 : -1"
      paginator-template="FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink RowsPerPageDropdown"
      :current-page-report-template="`{first}–{last} ${t('common.of')} {totalRecords}`"
      class="text-sm"
      :pt="{ bodyRow: { class: 'cursor-pointer' } }"
      data-testid="tenant-table"
      @page="onPage"
      @sort="onSort"
      @row-click="open($event.data as TenantView)"
    >
      <template #empty>
        <p class="px-4 py-10 text-center text-surface-500" data-testid="tenant-empty">
          {{ hasFilters ? t('tenants.emptyFiltered') : t('tenants.empty') }}
        </p>
      </template>

      <Column field="name" :header="t('tenants.columns.name')" sortable>
        <template #body="{ data }">
          <div class="flex min-w-0 items-center gap-3">
            <span
              class="swatch"
              :style="{ backgroundColor: (data as TenantView).branding.primaryColor ?? undefined }"
              aria-hidden="true"
            >
              <img
                v-if="(data as TenantView).branding.logoUrl"
                :src="(data as TenantView).branding.logoUrl!"
                alt=""
                class="h-full w-full rounded-lg bg-white object-contain p-0.5"
              />
              <i v-else class="pi pi-sitemap text-xs" />
            </span>
            <div class="min-w-0">
              <p class="flex items-center gap-2 truncate font-medium">
                {{ (data as TenantView).name }}
                <span v-if="(data as TenantView).isCurrent" class="here">{{
                  t('tenants.current')
                }}</span>
              </p>
              <p class="truncate font-mono text-xs text-surface-500">
                {{ (data as TenantView).slug }}
              </p>
            </div>
          </div>
        </template>
      </Column>
      <Column :header="t('tenants.columns.domains')">
        <template #body="{ data }">
          <span v-if="(data as TenantView).domains.length" class="truncate text-xs">
            {{ (data as TenantView).domains.map((d) => d.domain).join(', ') }}
          </span>
          <span v-else class="text-xs text-surface-400">—</span>
        </template>
      </Column>
      <Column :header="t('tenants.columns.locale')" style="width: 10rem">
        <template #body="{ data }">
          <span class="font-mono text-xs">
            {{ (data as TenantView).defaultCountry }} · {{ (data as TenantView).defaultCurrency }} ·
            {{ (data as TenantView).defaultLocale }}
          </span>
        </template>
      </Column>
      <Column :header="t('tenants.columns.users')" style="width: 7rem" class="text-right">
        <template #body="{ data }">
          <span class="tabular-nums">{{ n((data as TenantView).userCount) }}</span>
        </template>
      </Column>
      <Column field="status" :header="t('tenants.columns.status')" sortable style="width: 9rem">
        <template #body="{ data }"
          ><TenantStatusTag :status="(data as TenantView).status"
        /></template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.guard-note {
  @apply flex items-start gap-2 rounded-lg bg-surface-50 px-3 py-2 text-xs text-surface-600 dark:bg-surface-800/60 dark:text-surface-300;
}
.toolbar {
  @apply mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-surface-200 bg-surface-0 p-3 dark:border-surface-800 dark:bg-surface-900;
}
.tabs {
  @apply inline-flex flex-wrap rounded-lg bg-surface-100 p-0.5 dark:bg-surface-800;
}
.tab {
  @apply h-8 rounded-md px-3 text-sm font-medium text-surface-500;
  transition:
    background-color var(--duration-popover) ease,
    color var(--duration-popover) ease;
}
@media (hover: hover) and (pointer: fine) {
  .tab:hover {
    @apply text-surface-900 dark:text-surface-0;
  }
}
.tab--active {
  @apply bg-surface-0 text-surface-900 shadow-sm dark:bg-surface-700 dark:text-surface-0;
}
.swatch {
  @apply inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-200 text-white dark:bg-surface-700;
}
.here {
  @apply rounded-full bg-primary-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary-800 dark:bg-primary-900/50 dark:text-primary-200;
}
</style>
