<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDebounceFn } from '@vueuse/core';
import Column from 'primevue/column';
import DataTable, { type DataTablePageEvent } from 'primevue/datatable';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import PageHeader from '@shared/components/PageHeader.vue';
import { useApiError } from '@shared/composables/use-api-error';
import { useOffsetQuery } from '@shared/composables/use-offset-query';
import { formatMinorAmount } from '@shared/utils/money';
import { monetisationApi, ORDERS_URL, type OrderFilters } from '../monetisation.api';
import type { Order, OrderDetail, OrderStatus } from '../types';

/** BO-10 — commandes de crédits de la marque, et ce que le fournisseur en a dit. */
const { t, d } = useI18n();
const { messageFor, notify } = useApiError();
const query = useOffsetQuery<Order, OrderFilters>({
  url: ORDERS_URL,
  filters: {},
  allowedSortFields: [],
});
const status = ref<OrderStatus | null>(null);
const search = ref('');
watch(status, (v) => (query.filters.status = v ?? undefined));
const applySearch = useDebounceFn((v: string) => (query.filters.q = v.trim() || undefined), 350);
watch(search, (v) => void applySearch(v));
const statusOptions = [
  { value: null, label: t('monetisation.orders.allStatuses') },
  ...(['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'] as const).map((s) => ({
    value: s,
    label: t(`monetisation.orders.status.${s}`),
  })),
];
const severity = (s: OrderStatus) =>
  ({
    SUCCEEDED: 'success',
    PENDING: 'info',
    FAILED: 'danger',
    CANCELLED: 'secondary',
    EXPIRED: 'warn',
  })[s];

function onPage(e: DataTablePageEvent): void {
  query.state.page = e.page + 1;
  query.state.perPage = e.rows;
  void query.fetch().catch(() => undefined);
}

const detail = ref<OrderDetail | null>(null);
const open = ref(false);
async function show(o: Order): Promise<void> {
  try {
    detail.value = await monetisationApi.order(o.id);
    open.value = true;
  } catch (e) {
    notify(e);
  }
}
</script>

<template>
  <div>
    <PageHeader
      :title="t('monetisation.orders.title')"
      :subtitle="t('monetisation.orders.subtitle')"
    />
    <div class="mb-4 flex flex-wrap gap-3">
      <InputText v-model="search" :placeholder="t('monetisation.orders.search')" class="w-64" />
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
      data-key="id"
      striped-rows
      row-hover
      class="cursor-pointer"
      @page="onPage"
      @row-click="(e) => show(e.data as Order)"
    >
      <template #empty>{{ t('common.noResults') }}</template>
      <Column :header="t('monetisation.orders.reference')"
        ><template #body="{ data }"
          ><code>{{ data.reference }}</code></template
        ></Column
      >
      <Column :header="t('monetisation.orders.viewer')"
        ><template #body="{ data }">{{ data.account?.phoneE164 ?? '—' }}</template></Column
      >
      <Column :header="t('monetisation.orders.amount')"
        ><template #body="{ data }">{{
          formatMinorAmount(data.amountMinor, data.currencyCode)
        }}</template></Column
      >
      <Column :header="t('monetisation.orders.coins')"
        ><template #body="{ data }">{{ data.coins + data.bonusCoins }}</template></Column
      >
      <Column :header="t('monetisation.orders.method')"
        ><template #body="{ data }">{{ data.paymentMethod ?? data.provider }}</template></Column
      >
      <Column :header="t('monetisation.orders.statusLabel')"
        ><template #body="{ data }"
          ><Tag
            :value="t(`monetisation.orders.status.${data.status}`)"
            :severity="severity(data.status)" /></template
      ></Column>
      <Column :header="t('monetisation.orders.createdAt')"
        ><template #body="{ data }">{{ d(new Date(data.createdAt), 'long') }}</template></Column
      >
    </DataTable>

    <Dialog v-model:visible="open" modal :header="detail?.reference" class="w-[40rem]">
      <template v-if="detail">
        <dl class="mb-4 grid grid-cols-2 gap-2 text-sm">
          <dt class="text-surface-500">{{ t('monetisation.orders.amount') }}</dt>
          <dd>{{ formatMinorAmount(detail.amountMinor, detail.currencyCode) }}</dd>
          <dt class="text-surface-500">{{ t('monetisation.orders.viewer') }}</dt>
          <dd>{{ detail.account?.phoneE164 ?? '—' }}</dd>
          <dt class="text-surface-500">{{ t('monetisation.orders.paidAt') }}</dt>
          <dd>{{ detail.paidAt ? d(new Date(detail.paidAt), 'long') : '—' }}</dd>
          <dt class="text-surface-500">{{ t('monetisation.orders.failure') }}</dt>
          <dd>{{ detail.failureCode ?? '—' }}</dd>
        </dl>
        <h3 class="mb-2 font-semibold">{{ t('monetisation.orders.history') }}</h3>
        <ul class="mb-4 text-sm">
          <li v-for="h in detail.history" :key="h.id">
            {{ d(new Date(h.createdAt), 'long') }} — {{ h.fromStatus ?? '∅' }} →
            {{ h.toStatus }} ({{ h.cause }})
          </li>
        </ul>
        <h3 class="mb-2 font-semibold">{{ t('monetisation.orders.events') }}</h3>
        <ul class="text-sm">
          <li v-for="e in detail.events" :key="e.id">
            {{ d(new Date(e.receivedAt), 'long') }} — {{ e.eventType ?? '?' }} ·
            {{ e.processingStatus
            }}<span v-if="!e.signatureValid" class="text-red-600">
              · {{ t('monetisation.orders.badSignature') }}</span
            ><span v-if="e.processingError"> · {{ e.processingError }}</span>
          </li>
          <li v-if="!detail.events.length" class="text-surface-500">
            {{ t('monetisation.orders.noEvents') }}
          </li>
        </ul>
      </template>
    </Dialog>
  </div>
</template>
