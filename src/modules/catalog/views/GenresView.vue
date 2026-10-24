<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import PageHeader from '@shared/components/PageHeader.vue';
import { useApiError } from '@shared/composables/use-api-error';
import { slugify } from '@shared/utils/slugify';
import { useCan } from '@core/rbac';
import { catalogApi } from '../catalog.api';
import type { Genre } from '../types';

/** Genres du catalogue (FR / EN), ordre d'affichage dans l'application. */
const { t } = useI18n();
const { notify } = useApiError();
const confirm = useConfirm();
const { can } = useCan();
const genres = ref<Genre[]>([]);
const loading = ref(false);
const draft = reactive({ nameFr: '', nameEn: '', position: 0 });

async function load(): Promise<void> {
  loading.value = true;
  try { genres.value = await catalogApi.genres(); } catch (e) { notify(e); } finally { loading.value = false; }
}
onMounted(load);

async function add(): Promise<void> {
  try {
    await catalogApi.createGenre({ slug: slugify(draft.nameFr), nameFr: draft.nameFr.trim(), nameEn: draft.nameEn.trim() || draft.nameFr.trim(), position: draft.position });
    Object.assign(draft, { nameFr: '', nameEn: '', position: 0 });
    await load();
  } catch (e) { notify(e); }
}

async function save(g: Genre): Promise<void> {
  try { await catalogApi.updateGenre(g.id, { nameFr: g.nameFr, nameEn: g.nameEn, position: g.position }); await load(); } catch (e) { notify(e); }
}

function remove(g: Genre): void {
  confirm.require({
    header: t('catalog.genres.delete'), message: t('catalog.genres.deleteConfirm', { name: g.nameFr }),
    acceptLabel: t('common.confirm'), rejectLabel: t('common.cancel'),
    accept: () => void catalogApi.deleteGenre(g.id).then(load).catch(notify),
  });
}
</script>

<template>
  <div>
    <PageHeader :title="t('catalog.genres.title')" :subtitle="t('catalog.genres.subtitle')" />
    <form v-if="can('catalog:write')" class="mb-4 flex flex-wrap items-end gap-3" @submit.prevent="add">
      <label class="flex flex-col gap-1 text-sm">{{ t('catalog.genres.nameFr') }}<InputText v-model="draft.nameFr" data-testid="genre-fr" /></label>
      <label class="flex flex-col gap-1 text-sm">{{ t('catalog.genres.nameEn') }}<InputText v-model="draft.nameEn" /></label>
      <label class="flex flex-col gap-1 text-sm">{{ t('catalog.genres.position') }}<InputNumber v-model="draft.position" :min="0" class="w-24" /></label>
      <Button type="submit" :label="t('catalog.genres.add')" icon="pi pi-plus" :disabled="!draft.nameFr.trim()" />
    </form>
    <DataTable :value="genres" :loading="loading" data-key="id" size="small">
      <Column :header="t('catalog.genres.nameFr')"><template #body="{ data }"><InputText v-model="data.nameFr" :disabled="!can('catalog:write')" /></template></Column>
      <Column :header="t('catalog.genres.nameEn')"><template #body="{ data }"><InputText v-model="data.nameEn" :disabled="!can('catalog:write')" /></template></Column>
      <Column :header="t('catalog.genres.position')"><template #body="{ data }"><InputNumber v-model="data.position" :min="0" class="w-24" :disabled="!can('catalog:write')" /></template></Column>
      <Column :header="t('catalog.genres.series')"><template #body="{ data }">{{ data._count?.series ?? 0 }}</template></Column>
      <Column v-if="can('catalog:write')" :header="t('common.actions')">
        <template #body="{ data }">
          <Button size="small" text icon="pi pi-save" :aria-label="t('common.save')" @click="save(data)" />
          <Button size="small" text severity="danger" icon="pi pi-trash" :aria-label="t('catalog.genres.delete')" @click="remove(data)" />
        </template>
      </Column>
    </DataTable>
  </div>
</template>
