<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import PageHeader from '@shared/components/PageHeader.vue';
import { useApiError } from '@shared/composables/use-api-error';
import { catalogApi } from '../catalog.api';
import { IMPORT_TEMPLATE, MAX_IMPORT_BYTES } from '../import-template';
import type { ImportReport } from '../types';

/**
 * Import en lot (BO-17) : on analyse d'abord (essai à blanc, aucune écriture), puis on
 * importe EXACTEMENT le contenu analysé. Changer le texte invalide l'analyse.
 */
const { t } = useI18n();
const { notify } = useApiError();
const confirm = useConfirm();

const csv = ref('');
const fileName = ref<string | null>(null);
const report = ref<ImportReport | null>(null);
const analysedCsv = ref<string | null>(null);
const busy = ref(false);
const onlyErrors = ref(false);

const tooBig = computed(() => new Blob([csv.value]).size > MAX_IMPORT_BYTES);
const canRun = computed(
  () => !!report.value?.dryRun && analysedCsv.value === csv.value && report.value.totals.rows > 0,
);
const stale = computed(() => !!report.value && analysedCsv.value !== csv.value);
const rows = computed(() =>
  (report.value?.rows ?? []).filter(
    (r) => !onlyErrors.value || r.episode === 'ERROR' || r.video === 'ERROR',
  ),
);
const totalKeys = [
  'rows',
  'seriesCreated',
  'seriesUpdated',
  'episodesCreated',
  'episodesUpdated',
  'videosQueued',
  'videosAlreadyPresent',
  'errors',
] as const;

const severity = (a: string) =>
  a === 'ERROR'
    ? 'danger'
    : a === 'CREATED' || a === 'QUEUED'
      ? 'success'
      : a === 'UPDATED'
        ? 'info'
        : 'secondary';

async function onFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  fileName.value = file.name;
  csv.value = await file.text();
}

function downloadTemplate(): void {
  // BOM : Excel ouvre alors le fichier en UTF-8 (accents intacts).
  const blob = new Blob(['﻿', IMPORT_TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'gaatshort-import-modele.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function send(dryRun: boolean): Promise<void> {
  busy.value = true;
  try {
    const content = csv.value;
    report.value = await catalogApi.importCatalog(content, dryRun);
    analysedCsv.value = dryRun ? content : null;
  } catch (e) {
    notify(e);
  } finally {
    busy.value = false;
  }
}

function run(): void {
  confirm.require({
    header: t('catalog.import.run'),
    message: t('catalog.import.runConfirm', { rows: report.value?.totals.rows ?? 0 }),
    acceptLabel: t('common.confirm'),
    rejectLabel: t('common.cancel'),
    accept: () => void send(false),
  });
}
</script>

<template>
  <div>
    <PageHeader :title="t('catalog.import.title')" :subtitle="t('catalog.import.subtitle')">
      <template #actions>
        <Button
          :label="t('catalog.import.template')"
          icon="pi pi-download"
          severity="secondary"
          outlined
          data-testid="import-template"
          @click="downloadTemplate"
        />
      </template>
    </PageHeader>

    <section class="mb-4 flex flex-col gap-3">
      <label class="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
        <span class="pi pi-file" aria-hidden="true" />
        {{ fileName ?? t('catalog.import.chooseFile') }}
        <input
          type="file"
          accept=".csv,text/csv"
          class="sr-only"
          data-testid="import-file"
          @change="onFile"
        />
      </label>
      <label class="flex flex-col gap-1 text-sm text-muted-color"
        >{{ t('catalog.import.orPaste') }}
        <Textarea
          v-model="csv"
          rows="6"
          class="font-mono text-xs"
          spellcheck="false"
          data-testid="import-csv"
        />
      </label>
      <Message v-if="tooBig" severity="error" :closable="false">{{
        t('catalog.import.tooBig')
      }}</Message>
      <Message v-if="stale" severity="warn" :closable="false">{{
        t('catalog.import.changedSinceAnalysis')
      }}</Message>
      <div class="flex flex-wrap gap-2">
        <Button
          :label="t('catalog.import.analyse')"
          icon="pi pi-search"
          :loading="busy"
          :disabled="!csv.trim() || tooBig"
          data-testid="import-analyse"
          @click="send(true)"
        />
        <Button
          :label="t('catalog.import.run')"
          icon="pi pi-upload"
          severity="success"
          :loading="busy"
          :disabled="!canRun"
          data-testid="import-run"
          @click="run"
        />
      </div>
    </section>

    <template v-if="report">
      <Message :severity="report.dryRun ? 'info' : 'success'" :closable="false" class="mb-3">{{
        report.dryRun ? t('catalog.import.dryRunNotice') : t('catalog.import.doneNotice')
      }}</Message>

      <dl class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="import-totals">
        <div
          v-for="k in totalKeys"
          :key="k"
          class="rounded-lg border border-surface-200 p-3 dark:border-surface-700"
        >
          <dt class="text-xs text-muted-color">{{ t(`catalog.import.totals.${k}`) }}</dt>
          <dd
            class="text-xl font-semibold"
            :class="k === 'errors' && report.totals.errors ? 'text-red-500' : ''"
          >
            {{ report.totals[k] }}
          </dd>
        </div>
      </dl>

      <div v-if="report.errors.length" class="mb-3">
        <h3 class="mb-1 font-semibold">{{ t('catalog.import.fileErrors') }}</h3>
        <ul class="list-disc pl-5 text-sm text-red-500">
          <li v-for="e in report.errors" :key="`${e.line}-${e.message}`">
            {{ t('catalog.import.line') }} {{ e.line }} — {{ e.message }}
          </li>
        </ul>
      </div>
      <div v-if="report.warnings.length" class="mb-3">
        <h3 class="mb-1 font-semibold">{{ t('catalog.import.warnings') }}</h3>
        <ul class="list-disc pl-5 text-sm">
          <li v-for="w in report.warnings" :key="`${w.line}-${w.message}`">{{ w.message }}</li>
        </ul>
      </div>

      <DataTable :value="report.series" size="small" class="mb-4" data-key="slug">
        <Column field="slug" :header="t('catalog.import.series')" />
        <Column :header="t('catalog.import.episode')"
          ><template #body="{ data }"
            ><Tag
              :severity="severity(data.action)"
              :value="t(`catalog.import.action.${data.action}`)" /></template
        ></Column>
        <Column field="message" :header="t('catalog.import.message')" />
      </DataTable>

      <label class="mb-2 flex items-center gap-2 text-sm"
        ><Checkbox v-model="onlyErrors" binary /> {{ t('catalog.import.onlyErrors') }}</label
      >
      <DataTable
        :value="rows"
        size="small"
        paginator
        :rows="50"
        data-key="line"
        data-testid="import-rows"
      >
        <Column field="line" :header="t('catalog.import.line')" />
        <Column field="seriesSlug" :header="t('catalog.import.series')" />
        <Column field="episodeNumber" :header="t('catalog.import.episode')" />
        <Column :header="t('catalog.import.episode')"
          ><template #body="{ data }"
            ><Tag
              :severity="severity(data.episode)"
              :value="t(`catalog.import.action.${data.episode}`)" /></template
        ></Column>
        <Column :header="t('catalog.import.video')"
          ><template #body="{ data }"
            ><Tag
              :severity="severity(data.video)"
              :value="t(`catalog.import.action.${data.video}`)" /></template
        ></Column>
        <Column field="message" :header="t('catalog.import.message')" />
      </DataTable>
    </template>
  </div>
</template>
