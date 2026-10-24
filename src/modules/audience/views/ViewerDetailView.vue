<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import PageHeader from '@shared/components/PageHeader.vue';
import { useApiError } from '@shared/composables/use-api-error';
import { formatMinorAmount } from '@shared/utils/money';
import { useCan } from '@core/rbac';
import { audienceApi } from '../audience.api';
import type { ViewerDetail } from '../types';

/** BO-07 — fiche spectateur : solde commun, mouvements, commandes, geste commercial. */
const props = defineProps<{ accountId: string }>();
const { t, d, n } = useI18n();
const toast = useToast();
const { messageFor, notify } = useApiError();
const { can } = useCan();
const viewer = ref<ViewerDetail | null>(null);
const error = ref<unknown>(null);
const open = ref(false);
const delta = ref<number | null>(null);
const reason = ref('');

async function load(): Promise<void> {
  try {
    viewer.value = await audienceApi.viewer(props.accountId);
  } catch (e) {
    error.value = e;
  }
}
onMounted(load);

async function adjust(): Promise<void> {
  if (!delta.value) return;
  try {
    await audienceApi.adjust(props.accountId, delta.value, reason.value.trim());
    toast.add({ severity: 'success', summary: t('audience.viewer.adjusted'), life: 3000 });
    open.value = false;
    delta.value = null;
    reason.value = '';
    await load();
  } catch (e) {
    notify(e);
  }
}
</script>

<template>
  <div>
    <Message v-if="error" severity="error" :closable="false">{{ messageFor(error) }}</Message>
    <template v-if="viewer">
      <PageHeader
        :title="viewer.account.phoneE164 ?? t('audience.viewer.anonymous')"
        :subtitle="
          t('audience.viewer.since', { date: d(new Date(viewer.membership.createdAt), 'short') })
        "
      >
        <template #actions
          ><Button
            v-if="can('wallet:adjust')"
            :label="t('audience.viewer.adjust')"
            icon="pi pi-gift"
            @click="open = true"
        /></template>
      </PageHeader>
      <section class="mb-6 grid gap-4 sm:grid-cols-3">
        <div class="kpi">
          <p class="kpi-label">{{ t('audience.viewer.total') }}</p>
          <p class="kpi-value">{{ n(viewer.balance.total) }}</p>
        </div>
        <div class="kpi">
          <p class="kpi-label">
            {{ t('audience.viewer.paid') }} / {{ t('audience.viewer.bonus') }}
          </p>
          <p class="kpi-value">
            {{ n(viewer.balance.paidBalance) }} / {{ n(viewer.balance.bonusBalance) }}
          </p>
        </div>
        <div class="kpi">
          <p class="kpi-label">{{ t('audience.viewer.unlocked') }}</p>
          <p class="kpi-value">{{ n(viewer.unlockedEpisodes) }}</p>
        </div>
      </section>
      <div class="grid gap-6 xl:grid-cols-2">
        <section>
          <h2 class="mb-2 font-semibold">{{ t('audience.viewer.ledger') }}</h2>
          <DataTable :value="viewer.ledger" size="small" data-key="id">
            <template #empty>{{ t('common.noResults') }}</template>
            <Column :header="t('audience.viewer.date')"
              ><template #body="{ data }">{{
                d(new Date(data.createdAt), 'long')
              }}</template></Column
            >
            <Column :header="t('audience.viewer.kind')"
              ><template #body="{ data }">{{ t(`audience.ledger.${data.kind}`) }}</template></Column
            >
            <Column :header="t('audience.viewer.delta')"
              ><template #body="{ data }"
                ><span :class="data.delta > 0 ? 'text-green-600' : 'text-red-600'"
                  >{{ data.delta > 0 ? '+' : '' }}{{ data.delta }}</span
                ></template
              ></Column
            >
            <Column :header="t('audience.viewer.reason')"
              ><template #body="{ data }">{{ data.reason ?? '—' }}</template></Column
            >
          </DataTable>
        </section>
        <section>
          <h2 class="mb-2 font-semibold">{{ t('audience.viewer.orders') }}</h2>
          <DataTable :value="viewer.orders" size="small" data-key="id">
            <template #empty>{{ t('common.noResults') }}</template>
            <Column :header="t('monetisation.orders.reference')"
              ><template #body="{ data }"
                ><code>{{ data.reference }}</code></template
              ></Column
            >
            <Column :header="t('monetisation.orders.amount')"
              ><template #body="{ data }">{{
                formatMinorAmount(data.amountMinor, data.currencyCode)
              }}</template></Column
            >
            <Column :header="t('monetisation.orders.statusLabel')"
              ><template #body="{ data }">{{
                t(`monetisation.orders.status.${data.status}`)
              }}</template></Column
            >
            <Column :header="t('audience.viewer.date')"
              ><template #body="{ data }">{{
                d(new Date(data.createdAt), 'short')
              }}</template></Column
            >
          </DataTable>
        </section>
      </div>
      <Dialog v-model:visible="open" modal :header="t('audience.viewer.adjust')" class="w-[28rem]">
        <form class="flex flex-col gap-3" @submit.prevent="adjust">
          <label class="flex flex-col gap-1 text-sm font-medium"
            >{{ t('audience.viewer.deltaLabel')
            }}<InputNumber v-model="delta" :min="-100000" :max="100000" show-buttons
          /></label>
          <label class="flex flex-col gap-1 text-sm font-medium"
            >{{ t('audience.viewer.reasonLabel') }}<Textarea v-model="reason" rows="3"
          /></label>
          <p class="text-xs text-surface-500">{{ t('audience.viewer.adjustHint') }}</p>
          <div class="flex justify-end gap-2">
            <Button type="button" text :label="t('common.cancel')" @click="open = false" />
            <Button
              type="submit"
              :label="t('common.confirm')"
              :disabled="!delta || reason.trim().length < 5"
            />
          </div>
        </form>
      </Dialog>
    </template>
  </div>
</template>

<style scoped>
.kpi {
  @apply rounded-2xl border border-surface-200 bg-surface-0 p-5 dark:border-surface-800 dark:bg-surface-900;
}
.kpi-label {
  @apply text-xs font-semibold uppercase tracking-wide text-surface-500;
}
.kpi-value {
  @apply mt-2 text-2xl font-bold;
}
</style>
