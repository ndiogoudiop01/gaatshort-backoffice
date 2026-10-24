<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Tag from 'primevue/tag';
import ToggleSwitch from 'primevue/toggleswitch';
import PageHeader from '@shared/components/PageHeader.vue';
import { useApiError } from '@shared/composables/use-api-error';
import { formatMinorAmount } from '@shared/utils/money';
import { monetisationApi } from '../monetisation.api';
import type { CoinPack } from '../types';

/** BO-09 — packs de crédits de la marque (prix en XOF, sans décimale). */
const { t } = useI18n();
const { notify } = useApiError();
const packs = ref<CoinPack[]>([]);
const loading = ref(false);
const open = ref(false);
const editing = ref<CoinPack | null>(null);
const form = reactive({
  code: '',
  coins: 100,
  bonusCoins: 0,
  amountMinor: 1000,
  badge: '',
  position: 0,
  active: true,
});
const valid = computed(
  () => /^[a-z0-9-]{2,40}$/.test(form.code) && form.coins > 0 && form.amountMinor > 0,
);
const perCoin = (p: { coins: number; bonusCoins: number; amountMinor: number }) =>
  (p.amountMinor / Math.max(1, p.coins + p.bonusCoins)).toFixed(1);

async function load(): Promise<void> {
  loading.value = true;
  try {
    packs.value = await monetisationApi.packs();
  } catch (e) {
    notify(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function edit(p?: CoinPack): void {
  editing.value = p ?? null;
  Object.assign(
    form,
    p
      ? {
          code: p.code,
          coins: p.coins,
          bonusCoins: p.bonusCoins,
          amountMinor: p.amountMinor,
          badge: p.badge ?? '',
          position: p.position,
          active: p.active,
        }
      : {
          code: '',
          coins: 100,
          bonusCoins: 0,
          amountMinor: 1000,
          badge: '',
          position: packs.value.length + 1,
          active: true,
        },
  );
  open.value = true;
}

async function save(): Promise<void> {
  try {
    const body = {
      coins: form.coins,
      bonusCoins: form.bonusCoins,
      amountMinor: form.amountMinor,
      badge: form.badge.trim() || null,
      position: form.position,
      active: form.active,
    };
    if (editing.value) await monetisationApi.updatePack(editing.value.id, body);
    else
      await monetisationApi.createPack({
        ...body,
        code: form.code,
        currencyCode: 'XOF',
        badge: body.badge ?? undefined,
      });
    open.value = false;
    await load();
  } catch (e) {
    notify(e);
  }
}
</script>

<template>
  <div>
    <PageHeader :title="t('monetisation.packs.title')" :subtitle="t('monetisation.packs.subtitle')">
      <template #actions
        ><Button :label="t('monetisation.packs.add')" icon="pi pi-plus" @click="edit()"
      /></template>
    </PageHeader>
    <DataTable :value="packs" :loading="loading" data-key="id" striped-rows>
      <Column field="position" header="#" class="w-12" />
      <Column :header="t('monetisation.packs.code')"
        ><template #body="{ data }"
          ><code>{{ data.code }}</code>
          <Tag v-if="data.badge" :value="data.badge" class="ml-2" /></template
      ></Column>
      <Column :header="t('monetisation.packs.coins')"
        ><template #body="{ data }"
          >{{ data.coins
          }}<span v-if="data.bonusCoins" class="text-green-600">
            + {{ data.bonusCoins }}</span
          ></template
        ></Column
      >
      <Column :header="t('monetisation.packs.price')"
        ><template #body="{ data }">{{
          formatMinorAmount(data.amountMinor, data.currencyCode)
        }}</template></Column
      >
      <Column :header="t('monetisation.packs.perCoin')"
        ><template #body="{ data }">{{ perCoin(data) }} {{ data.currencyCode }}</template></Column
      >
      <Column :header="t('monetisation.packs.active')"
        ><template #body="{ data }"
          ><i
            :class="
              data.active ? 'pi pi-check text-green-600' : 'pi pi-minus text-surface-400'
            " /></template
      ></Column>
      <Column :header="t('common.actions')"
        ><template #body="{ data }"
          ><Button
            size="small"
            text
            icon="pi pi-pencil"
            :aria-label="t('common.save')"
            @click="edit(data)" /></template
      ></Column>
    </DataTable>

    <Dialog
      v-model:visible="open"
      modal
      :header="editing ? t('monetisation.packs.edit') : t('monetisation.packs.add')"
      class="w-[30rem]"
    >
      <form class="grid grid-cols-2 gap-3" @submit.prevent="save">
        <label class="field col-span-2"
          >{{ t('monetisation.packs.code')
          }}<InputText v-model="form.code" :disabled="!!editing" placeholder="pack-220"
        /></label>
        <label class="field"
          >{{ t('monetisation.packs.coins') }}<InputNumber v-model="form.coins" :min="1"
        /></label>
        <label class="field"
          >{{ t('monetisation.packs.bonus') }}<InputNumber v-model="form.bonusCoins" :min="0"
        /></label>
        <label class="field"
          >{{ t('monetisation.packs.priceXof')
          }}<InputNumber v-model="form.amountMinor" :min="1" suffix=" FCFA"
        /></label>
        <label class="field"
          >{{ t('monetisation.packs.position') }}<InputNumber v-model="form.position" :min="0"
        /></label>
        <label class="field col-span-2"
          >{{ t('monetisation.packs.badge')
          }}<InputText v-model="form.badge" placeholder="Populaire"
        /></label>
        <label class="col-span-2 flex items-center gap-2 text-sm"
          ><ToggleSwitch v-model="form.active" /> {{ t('monetisation.packs.active') }}</label
        >
        <p class="col-span-2 text-xs text-surface-500">
          {{ t('monetisation.packs.priceHint', { perCoin: perCoin(form) }) }}
        </p>
        <div class="col-span-2 flex justify-end gap-2">
          <Button type="button" text :label="t('common.cancel')" @click="open = false" />
          <Button type="submit" :label="t('common.save')" :disabled="!valid" />
        </div>
      </form>
    </Dialog>
  </div>
</template>

<style scoped>
.field {
  @apply flex flex-col gap-1 text-sm font-medium;
}
</style>
