<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useDebounceFn } from '@vueuse/core';
import Column from 'primevue/column';
import DataTable, { type DataTablePageEvent, type DataTableSortEvent } from 'primevue/datatable';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import { useApiError } from '@shared/composables/use-api-error';
import { useOffsetQuery } from '@shared/composables/use-offset-query';
import { config } from '@core/config';
import UserStatusTag from './UserStatusTag.vue';
import { USERS_URL } from '../users.api';
import { countryName, displayName, flagOf, initials } from '../users-rules';
import {
  USER_SORT_FIELDS,
  type RoleView,
  type TenantCountry,
  type UserFilters,
  type UserListItem,
} from '../types';

/**
 * Comptes (BSG-12) — offset côté serveur, tri sur la liste blanche backend.
 * L'API ne renvoie QUE les comptes du périmètre pays de l'appelant.
 * Filtres en mémoire (la recherche peut contenir une adresse e-mail).
 */
const props = defineProps<{ roles: readonly RoleView[]; countries: readonly TenantCountry[] }>();

const { t, d } = useI18n();
const router = useRouter();
const { messageFor } = useApiError();

const query = useOffsetQuery<UserListItem, UserFilters>({
  url: USERS_URL,
  filters: {},
  allowedSortFields: USER_SORT_FIELDS,
  defaultSortBy: 'createdAt',
});
const pageSizeOptions = [...config.ui.pageSizeOptions];

type Tab = 'all' | 'ACTIVE' | 'PENDING' | 'SUSPENDED';
const TABS: readonly Tab[] = ['all', 'ACTIVE', 'PENDING', 'SUSPENDED'];
const tab = ref<Tab>('all');
const role = ref<string | null>(null);
const country = ref<string | null>(null);
const searchInput = ref('');

watch(tab, (value) => (query.filters.statuses = value === 'all' ? undefined : [value]));
watch(role, (value) => (query.filters.roles = value ? [value] : undefined));
watch(country, (value) => (query.filters.countryCode = value ?? undefined));
const applySearch = useDebounceFn((value: string) => {
  query.filters.search = value.trim() || undefined;
}, 350);

const roleOptions = computed(() => [
  { value: null, label: t('users.list.allRoles') },
  ...props.roles.map((r) => ({ value: r.key, label: `${r.name} (${r.userCount})` })),
]);
const countryOptions = computed(() => [
  { value: null, label: t('users.list.allCountries') },
  ...props.countries.map((c) => ({
    value: c.countryCode,
    label: `${flagOf(c.countryCode)} ${countryName(c.countryCode)}`,
  })),
]);

/** Filtre rapide depuis la bande des profils. */
function filterRole(key: string): void {
  role.value = role.value === key ? null : key;
}
defineExpose({ filterRole, refresh: () => query.fetch().catch(() => undefined) });

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
function open(row: UserListItem): void {
  void router.push({ name: 'users-detail', params: { id: row.id } });
}

const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
function relative(iso: string | null): string {
  if (!iso) return t('users.list.neverLoggedIn');
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (Math.abs(days) < 1)
    return rtf.format(Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000), 'hour');
  return Math.abs(days) < 30 ? rtf.format(days, 'day') : d(new Date(iso), 'short');
}
</script>

<template>
  <div>
    <section class="toolbar">
      <div class="tabs" role="tablist" :aria-label="t('users.list.filterStatus')">
        <button
          v-for="option in TABS"
          :key="option"
          type="button"
          role="tab"
          class="tab"
          :class="{ 'tab--active': tab === option }"
          :aria-selected="tab === option"
          :data-testid="`status-tab-${option}`"
          @click="tab = option"
        >
          {{ option === 'all' ? t('users.list.all') : t(`users.statusesPlural.${option}`) }}
        </button>
      </div>
      <IconField class="min-w-56 flex-1">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="searchInput"
          class="w-full"
          autocomplete="off"
          :placeholder="t('users.list.searchPlaceholder')"
          :aria-label="t('common.search')"
          data-testid="user-search"
          @update:model-value="applySearch(searchInput)"
        />
      </IconField>
      <Select
        v-model="role"
        :options="roleOptions"
        option-label="label"
        option-value="value"
        :aria-label="t('users.fields.roles')"
        class="w-48"
        data-testid="role-filter"
      />
      <Select
        v-model="country"
        :options="countryOptions"
        option-label="label"
        option-value="value"
        :aria-label="t('users.fields.homeCountry')"
        class="w-44"
      />
    </section>

    <Message v-if="query.error.value" severity="error" :closable="false" class="mb-4">
      {{ messageFor(query.error.value) }}
    </Message>

    <p class="mb-2 text-sm text-surface-500" aria-live="polite">
      <template v-if="!query.loading.value && !query.error.value">
        {{ t('users.list.results', query.total.value) }}
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
      data-testid="user-table"
      @page="onPage"
      @sort="onSort"
      @row-click="open($event.data as UserListItem)"
    >
      <template #empty>
        <p class="px-4 py-10 text-center text-surface-500" data-testid="user-empty">
          {{ t('users.list.empty') }}
        </p>
      </template>

      <Column field="lastName" :header="t('users.list.columns.user')" sortable>
        <template #body="{ data }">
          <div class="flex min-w-0 items-center gap-3">
            <span class="avatar" aria-hidden="true">{{ initials(data as UserListItem) }}</span>
            <div class="min-w-0">
              <p class="flex items-center gap-2 truncate font-medium">
                {{ displayName(data as UserListItem) }}
                <span v-if="(data as UserListItem).isSelf" class="self-badge">{{
                  t('users.you')
                }}</span>
              </p>
              <p class="truncate text-xs text-surface-500">
                {{ (data as UserListItem).email ?? (data as UserListItem).phoneE164 }}
              </p>
            </div>
          </div>
        </template>
      </Column>

      <Column :header="t('users.fields.roles')">
        <template #body="{ data }">
          <div class="flex flex-wrap gap-1">
            <span
              v-for="r in (data as UserListItem).roles"
              :key="r.key"
              class="role-chip"
              :data-role="r.key"
              >{{ r.name }}</span
            >
            <span v-if="!(data as UserListItem).roles.length" class="text-xs text-surface-400">{{
              t('users.roles.none')
            }}</span>
          </div>
        </template>
      </Column>

      <Column :header="t('users.list.columns.countries')" style="width: 11rem">
        <template #body="{ data }">
          <span
            v-if="(data as UserListItem).effectiveCountries === null"
            class="scope-chip scope-chip--all"
          >
            <i class="pi pi-globe text-[0.65rem]" aria-hidden="true" />
            {{ t('users.countries.all') }}
          </span>
          <span v-else class="inline-flex flex-wrap items-center gap-1">
            <span
              v-for="code in (data as UserListItem).effectiveCountries"
              :key="code"
              class="scope-chip"
              :title="countryName(code)"
            >
              {{ flagOf(code) }} {{ code }}
            </span>
            <span
              v-if="!(data as UserListItem).effectiveCountries!.length"
              class="text-xs text-red-600"
            >
              {{ t('users.countries.none') }}
            </span>
          </span>
        </template>
      </Column>

      <Column :header="t('users.list.columns.status')" style="width: 9rem">
        <template #body="{ data }"
          ><UserStatusTag :status="(data as UserListItem).status"
        /></template>
      </Column>

      <Column
        field="lastLoginAt"
        :header="t('users.list.columns.lastLogin')"
        sortable
        style="width: 10rem"
      >
        <template #body="{ data }">
          <span class="text-surface-600 dark:text-surface-300">{{
            relative((data as UserListItem).lastLoginAt)
          }}</span>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
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
.avatar {
  @apply inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-900/50 dark:text-primary-200;
}
.self-badge {
  @apply rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/50 dark:text-amber-200;
}
.role-chip {
  @apply rounded-md bg-surface-100 px-2 py-0.5 text-xs font-medium text-surface-700 dark:bg-surface-800 dark:text-surface-200;
}
.scope-chip {
  @apply inline-flex items-center gap-1 rounded-md border border-surface-200 px-1.5 py-0.5 text-xs dark:border-surface-700;
}
.scope-chip--all {
  @apply border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-800 dark:bg-primary-950/40 dark:text-primary-200;
}
</style>
