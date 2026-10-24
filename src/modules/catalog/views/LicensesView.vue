<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import MultiSelect from 'primevue/multiselect';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import ToggleSwitch from 'primevue/toggleswitch';
import PageHeader from '@shared/components/PageHeader.vue';
import { useApiError } from '@shared/composables/use-api-error';
import { useCan } from '@core/rbac';
import { catalogApi } from '../catalog.api';
import type { License, SeriesRow } from '../types';

/**
 * BO-05 — registre des licences (R-02). Une série n'est publiable que couverte par
 * une licence en cours ; une marque TIERCE ne la diffuse qu'avec le droit de sous-licence.
 */
const { t, d } = useI18n();
const { notify } = useApiError();
const confirm = useConfirm();
const { can } = useCan();
const licenses = ref<License[]>([]);
const allSeries = ref<SeriesRow[]>([]);
const loading = ref(false);
const open = ref(false);
const editing = ref<License | null>(null);
const form = reactive({ licensorName: '', contractRef: '', documentUrl: '', startsAt: '', endsAt: '', territories: ['SN'] as string[], sublicensingAllowed: false, notes: '', seriesIds: [] as string[] });

const territoryOptions = [{ code: 'SN', label: 'Sénégal' }, { code: 'GM', label: 'Gambie' }];
const now = Date.now();
const isActive = (l: License) => new Date(l.startsAt).getTime() <= now && now < new Date(l.endsAt).getTime();
const expiringSoon = (l: License) => isActive(l) && new Date(l.endsAt).getTime() - now < 60 * 86_400_000;
const valid = computed(() => form.licensorName.trim() && form.contractRef.trim() && form.startsAt && form.endsAt && form.endsAt > form.startsAt && form.territories.length);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [l, s] = await Promise.all([catalogApi.licenses(), catalogApi.listSeries({ page: 1, perPage: 100 })]);
    licenses.value = l;
    allSeries.value = [...s.items];
  } catch (e) { notify(e); } finally { loading.value = false; }
}
onMounted(load);

function edit(l?: License): void {
  editing.value = l ?? null;
  Object.assign(form, l
    ? { licensorName: l.licensorName, contractRef: l.contractRef, documentUrl: l.documentUrl ?? '', startsAt: l.startsAt.slice(0, 10), endsAt: l.endsAt.slice(0, 10), territories: [...l.territories], sublicensingAllowed: l.sublicensingAllowed, notes: l.notes ?? '', seriesIds: (l.series ?? []).map((s) => s.id) }
    : { licensorName: '', contractRef: '', documentUrl: '', startsAt: '', endsAt: '', territories: ['SN'], sublicensingAllowed: false, notes: '', seriesIds: [] });
  open.value = true;
}

async function save(): Promise<void> {
  const body = { ...form, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString() };
  try {
    if (editing.value) await catalogApi.updateLicense(editing.value.id, body);
    else await catalogApi.createLicense(body);
    open.value = false;
    await load();
  } catch (e) { notify(e); }
}

function remove(l: License): void {
  confirm.require({
    header: t('catalog.licenses.delete'), message: t('catalog.licenses.deleteConfirm', { ref: l.contractRef }),
    acceptLabel: t('common.confirm'), rejectLabel: t('common.cancel'),
    accept: () => void catalogApi.deleteLicense(l.id).then(load).catch(notify),
  });
}
</script>

<template>
  <div>
    <PageHeader :title="t('catalog.licenses.title')" :subtitle="t('catalog.licenses.subtitle')">
      <template #actions><Button v-if="can('license:write')" :label="t('catalog.licenses.add')" icon="pi pi-plus" @click="edit()" /></template>
    </PageHeader>
    <DataTable :value="licenses" :loading="loading" data-key="id" striped-rows>
      <template #empty>{{ t('catalog.licenses.empty') }}</template>
      <Column :header="t('catalog.licenses.licensor')"><template #body="{ data }"><p class="font-medium">{{ data.licensorName }}</p><p class="text-xs text-surface-500">{{ data.contractRef }}</p></template></Column>
      <Column :header="t('catalog.licenses.period')"><template #body="{ data }">{{ d(new Date(data.startsAt), 'short') }} → {{ d(new Date(data.endsAt), 'short') }}</template></Column>
      <Column :header="t('catalog.licenses.territories')"><template #body="{ data }">{{ data.territories.join(', ') }}</template></Column>
      <Column :header="t('catalog.licenses.sublicensing')"><template #body="{ data }"><i :class="data.sublicensingAllowed ? 'pi pi-check text-green-600' : 'pi pi-minus text-surface-400'" /></template></Column>
      <Column :header="t('catalog.licenses.series')"><template #body="{ data }">{{ data.series?.length ?? 0 }}</template></Column>
      <Column :header="t('catalog.licenses.state')">
        <template #body="{ data }">
          <Tag v-if="expiringSoon(data)" severity="warn" :value="t('catalog.licenses.expiring')" />
          <Tag v-else-if="isActive(data)" severity="success" :value="t('catalog.licenses.active')" />
          <Tag v-else severity="secondary" :value="t('catalog.licenses.inactive')" />
        </template>
      </Column>
      <Column v-if="can('license:write')" :header="t('common.actions')">
        <template #body="{ data }">
          <Button size="small" text icon="pi pi-pencil" :aria-label="t('common.save')" @click="edit(data)" />
          <Button size="small" text severity="danger" icon="pi pi-trash" :aria-label="t('catalog.licenses.delete')" @click="remove(data)" />
        </template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="open" modal :header="editing ? t('catalog.licenses.edit') : t('catalog.licenses.add')" class="w-[40rem]">
      <form class="grid gap-3 md:grid-cols-2" @submit.prevent="save">
        <label class="field">{{ t('catalog.licenses.licensor') }}<InputText v-model="form.licensorName" /></label>
        <label class="field">{{ t('catalog.licenses.contractRef') }}<InputText v-model="form.contractRef" /></label>
        <label class="field">{{ t('catalog.licenses.startsAt') }}<input v-model="form.startsAt" type="date" class="p-inputtext" /></label>
        <label class="field">{{ t('catalog.licenses.endsAt') }}<input v-model="form.endsAt" type="date" class="p-inputtext" /></label>
        <label class="field">{{ t('catalog.licenses.territories') }}<MultiSelect v-model="form.territories" :options="territoryOptions" option-label="label" option-value="code" display="chip" /></label>
        <label class="field">{{ t('catalog.licenses.documentUrl') }}<InputText v-model="form.documentUrl" placeholder="https://…" /></label>
        <label class="field md:col-span-2">{{ t('catalog.licenses.series') }}<MultiSelect v-model="form.seriesIds" :options="allSeries" option-label="titleFr" option-value="id" filter display="chip" /></label>
        <label class="flex items-center gap-2 text-sm md:col-span-2"><ToggleSwitch v-model="form.sublicensingAllowed" /> {{ t('catalog.licenses.sublicensingHint') }}</label>
        <label class="field md:col-span-2">{{ t('catalog.licenses.notes') }}<Textarea v-model="form.notes" rows="2" /></label>
        <div class="flex justify-end gap-2 md:col-span-2">
          <Button type="button" text :label="t('common.cancel')" @click="open = false" />
          <Button type="submit" :label="t('common.save')" :disabled="!valid" />
        </div>
      </form>
    </Dialog>
  </div>
</template>

<style scoped>
.field { @apply flex flex-col gap-1 text-sm font-medium; }
</style>
