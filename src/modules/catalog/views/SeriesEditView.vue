<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import MultiSelect from 'primevue/multiselect';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import PageHeader from '@shared/components/PageHeader.vue';
import { useApiError } from '@shared/composables/use-api-error';
import { useCan } from '@core/rbac';
import StatusTag from '../components/StatusTag.vue';
import VideoDialog from '../components/VideoDialog.vue';
import EpisodeDialog from '../components/EpisodeDialog.vue';
import { catalogApi } from '../catalog.api';
import { formatDuration } from '../video-upload';
import type { Episode, Genre, SeriesDetail } from '../types';

/** BO-03 — fiche série : informations, tarification, licences, épisodes et vidéos. */
const props = defineProps<{ id: string }>();
const { t, d } = useI18n();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const { messageFor, notify } = useApiError();
const { can } = useCan();

const series = ref<SeriesDetail | null>(null);
const genres = ref<Genre[]>([]);
const loadError = ref<unknown>(null);
const saving = ref(false);
const form = reactive({
  titleFr: '', titleEn: '', slug: '', synopsisFr: '', synopsisEn: '', posterUrl: '', bannerUrl: '',
  maturityRating: '13+', releaseYear: null as number | null, tags: '', freeEpisodes: 5, episodePriceCoins: 15,
  genreIds: [] as string[], originalLocale: 'fr' as 'fr' | 'en',
});

function fill(s: SeriesDetail): void {
  series.value = s;
  Object.assign(form, {
    titleFr: s.titleFr, titleEn: s.titleEn ?? '', slug: s.slug, synopsisFr: s.synopsisFr, synopsisEn: s.synopsisEn ?? '',
    posterUrl: s.posterUrl ?? '', bannerUrl: s.bannerUrl ?? '', maturityRating: s.maturityRating, releaseYear: s.releaseYear,
    tags: s.tags.join(', '), freeEpisodes: s.freeEpisodes, episodePriceCoins: s.episodePriceCoins,
    genreIds: s.genres.map((g) => g.id), originalLocale: s.originalLocale,
  });
}

async function load(): Promise<void> {
  loadError.value = null;
  try {
    const [s, g] = await Promise.all([catalogApi.series(props.id), catalogApi.genres()]);
    genres.value = g;
    fill(s);
  } catch (error) {
    loadError.value = error;
  }
}

async function reloadSeries(): Promise<void> {
  fill(await catalogApi.series(props.id));
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    fill(await catalogApi.updateSeries(props.id, {
      titleFr: form.titleFr, titleEn: form.titleEn, slug: form.slug, synopsisFr: form.synopsisFr, synopsisEn: form.synopsisEn,
      posterUrl: form.posterUrl, bannerUrl: form.bannerUrl, maturityRating: form.maturityRating,
      releaseYear: form.releaseYear ?? undefined, originalLocale: form.originalLocale,
      tags: form.tags.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean),
      freeEpisodes: form.freeEpisodes, episodePriceCoins: form.episodePriceCoins, genreIds: form.genreIds,
    }));
    toast.add({ severity: 'success', summary: t('catalog.series.saved'), life: 3000 });
  } catch (error) {
    notify(error);
  } finally {
    saving.value = false;
  }
}

async function run(action: () => Promise<unknown>, success?: string): Promise<void> {
  try {
    await action();
    await reloadSeries();
    if (success) toast.add({ severity: 'success', summary: success, life: 3000 });
  } catch (error) {
    notify(error);
  }
}

const publish = () => run(() => catalogApi.publishSeries(props.id), t('catalog.series.published'));
const unpublish = () => run(() => catalogApi.unpublishSeries(props.id));
function archive(): void {
  confirm.require({
    header: t('catalog.series.archive'),
    message: t('catalog.series.archiveConfirm'),
    acceptLabel: t('common.confirm'),
    rejectLabel: t('common.cancel'),
    accept: () => void catalogApi.archiveSeries(props.id).then(() => router.push({ name: 'series' })).catch(notify),
  });
}

// ── Épisodes ──
const bulkCount = ref<number | null>(null);
const addEpisode = () => run(() => catalogApi.createEpisode(props.id, {}));
const addBulk = () => run(() => catalogApi.createEpisodesBulk(props.id, bulkCount.value ?? 0), t('catalog.episodes.bulkDone')).then(() => (bulkCount.value = null));
const publishReady = () => run(() => catalogApi.publishReady(props.id), t('catalog.episodes.publishReadyDone'));
const publishEpisode = (e: Episode) => run(() => catalogApi.publishEpisode(e.id));
const withdrawEpisode = (e: Episode) => run(() => catalogApi.withdrawEpisode(e.id));
const refreshVideo = (e: Episode) => (e.video ? run(() => catalogApi.refreshMedia(e.video!.id)) : Promise.resolve());
function deleteEpisode(e: Episode): void {
  confirm.require({
    header: t('catalog.episodes.delete'),
    message: t('catalog.episodes.deleteConfirm', { n: e.number }),
    acceptLabel: t('common.confirm'),
    rejectLabel: t('common.cancel'),
    accept: () => void run(() => catalogApi.deleteEpisode(e.id)),
  });
}

const subtitleLocales = (e: Episode) => e.subtitles.map((s) => s.locale.toUpperCase()).join(' · ') || '—';

const videoFor = ref<Episode | null>(null);
const videoOpen = ref(false);
const editFor = ref<Episode | null>(null);
const editOpen = ref(false);
function openVideo(e: Episode): void { videoFor.value = e; videoOpen.value = true; }
function openEdit(e: Episode): void { editFor.value = e; editOpen.value = true; }

const readyDrafts = computed(() => series.value?.episodes.filter((e) => e.status === 'DRAFT' && e.video?.status === 'READY').length ?? 0);

// Suivi de l'encodage : tant qu'une vidéo est en traitement, on relit son état.
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  void load();
  timer = setInterval(() => {
    const pending = series.value?.episodes.filter((e) => e.video && e.video.status === 'PROCESSING') ?? [];
    if (!pending.length) return;
    void Promise.all(pending.map((e) => catalogApi.refreshMedia(e.video!.id))).then(reloadSeries).catch(() => undefined);
  }, 15_000);
});
onBeforeUnmount(() => timer && clearInterval(timer));
</script>

<template>
  <div>
    <Message v-if="loadError" severity="error" :closable="false">{{ messageFor(loadError) }}</Message>
    <template v-else-if="series">
      <PageHeader :title="series.titleFr" :subtitle="series.slug">
        <template #actions>
          <StatusTag :status="series.status" />
          <Button v-if="can('catalog:publish') && series.status !== 'PUBLISHED'" :label="t('catalog.series.publish')" icon="pi pi-send" data-testid="series-publish" @click="publish" />
          <Button v-if="can('catalog:publish') && series.status === 'PUBLISHED'" :label="t('catalog.series.unpublish')" icon="pi pi-eye-slash" outlined @click="unpublish" />
          <Button v-if="can('catalog:publish')" icon="pi pi-trash" severity="danger" text :aria-label="t('catalog.series.archive')" @click="archive" />
        </template>
      </PageHeader>

      <div class="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section class="card">
          <h2 class="card-title">{{ t('catalog.series.info') }}</h2>
          <form class="grid gap-4 md:grid-cols-2" @submit.prevent="save">
            <label class="field">{{ t('catalog.series.fields.titleFr') }}<InputText v-model="form.titleFr" data-testid="field-titleFr" /></label>
            <label class="field">{{ t('catalog.series.fields.titleEn') }}<InputText v-model="form.titleEn" /></label>
            <label class="field md:col-span-2">{{ t('catalog.series.fields.synopsisFr') }}<Textarea v-model="form.synopsisFr" rows="3" auto-resize /></label>
            <label class="field md:col-span-2">{{ t('catalog.series.fields.synopsisEn') }}<Textarea v-model="form.synopsisEn" rows="3" auto-resize /></label>
            <label class="field">{{ t('catalog.series.fields.slug') }}<InputText v-model="form.slug" /></label>
            <label class="field">{{ t('catalog.series.fields.genres') }}
              <MultiSelect v-model="form.genreIds" :options="genres" option-label="nameFr" option-value="id" display="chip" />
            </label>
            <label class="field">{{ t('catalog.series.fields.posterUrl') }}<InputText v-model="form.posterUrl" placeholder="https://…/affiche.jpg" /></label>
            <label class="field">{{ t('catalog.series.fields.bannerUrl') }}<InputText v-model="form.bannerUrl" placeholder="https://…/banniere.jpg" /></label>
            <label class="field">{{ t('catalog.series.fields.tags') }}<InputText v-model="form.tags" placeholder="mariage, trahison" /></label>
            <div class="grid grid-cols-3 gap-3">
              <label class="field">{{ t('catalog.series.fields.maturity') }}<InputText v-model="form.maturityRating" /></label>
              <label class="field">{{ t('catalog.series.fields.year') }}<InputNumber v-model="form.releaseYear" :use-grouping="false" :min="1900" :max="2100" /></label>
              <label class="field">{{ t('catalog.series.fields.locale') }}
                <Select v-model="form.originalLocale" :options="['fr', 'en']" />
              </label>
            </div>
            <label class="field">{{ t('catalog.series.fields.freeEpisodes') }}<InputNumber v-model="form.freeEpisodes" :min="0" :max="1000" show-buttons /></label>
            <label class="field">{{ t('catalog.series.fields.episodePrice') }}<InputNumber v-model="form.episodePriceCoins" :min="1" :max="100000" show-buttons :suffix="` ${t('catalog.coins')}`" /></label>
            <div class="md:col-span-2 flex justify-end">
              <Button v-if="can('catalog:write')" type="submit" :label="t('common.save')" icon="pi pi-save" :loading="saving" data-testid="series-save" />
            </div>
          </form>
        </section>

        <aside class="flex flex-col gap-6">
          <section class="card">
            <h2 class="card-title">{{ t('catalog.series.visuals') }}</h2>
            <div class="flex gap-3">
              <img v-if="form.posterUrl" :src="form.posterUrl" alt="" class="h-48 w-32 rounded-lg object-cover" />
              <div v-else class="flex h-48 w-32 items-center justify-center rounded-lg bg-surface-100 text-xs text-surface-500">{{ t('catalog.series.noPoster') }}</div>
              <img v-if="form.bannerUrl" :src="form.bannerUrl" alt="" class="h-48 flex-1 rounded-lg object-cover" />
            </div>
          </section>
          <section class="card">
            <h2 class="card-title">{{ t('catalog.series.licenses') }}</h2>
            <ul v-if="series.licenses.length" class="flex flex-col gap-2 text-sm">
              <li v-for="l in series.licenses" :key="l.id" class="rounded-lg border border-surface-200 p-2">
                <p class="font-medium">{{ l.licensorName }} — {{ l.contractRef }}</p>
                <p class="text-xs text-surface-500">{{ d(new Date(l.startsAt), 'short') }} → {{ d(new Date(l.endsAt), 'short') }} · {{ l.territories.join(', ') }}
                  <span v-if="l.sublicensingAllowed"> · {{ t('catalog.licenses.sublicensing') }}</span></p>
              </li>
            </ul>
            <Message v-else severity="warn" :closable="false">{{ t('catalog.series.noLicense') }}</Message>
            <RouterLink :to="{ name: 'licenses' }" class="mt-2 inline-block text-sm text-primary">{{ t('catalog.series.manageLicenses') }}</RouterLink>
          </section>
        </aside>
      </div>

      <section class="card mt-6">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 class="card-title !mb-0">{{ t('catalog.episodes.title', { n: series.episodes.length }) }}</h2>
          <div v-if="can('catalog:write')" class="flex flex-wrap items-center gap-2">
            <Button size="small" :label="t('catalog.episodes.add')" icon="pi pi-plus" outlined data-testid="episode-add" @click="addEpisode" />
            <InputNumber v-model="bulkCount" :min="1" :max="500" size="small" :placeholder="t('catalog.episodes.bulkPlaceholder')" class="w-32" />
            <Button size="small" :label="t('catalog.episodes.bulk')" :disabled="!bulkCount" outlined @click="addBulk" />
            <Button v-if="can('catalog:publish')" size="small" :label="t('catalog.episodes.publishReady', { n: readyDrafts })" :disabled="!readyDrafts" icon="pi pi-send" @click="publishReady" />
          </div>
        </div>
        <DataTable :value="series.episodes" data-key="id" size="small" striped-rows>
          <template #empty>{{ t('catalog.episodes.empty') }}</template>
          <Column field="number" header="#" class="w-14" />
          <Column :header="t('catalog.episodes.columns.title')">
            <template #body="{ data }">
              {{ data.titleFr || t('catalog.episodes.untitled', { n: data.number }) }}
              <span v-if="data.number <= series.freeEpisodes" class="ml-2 rounded bg-green-100 px-1.5 text-xs text-green-800">{{ t('catalog.episodes.free') }}</span>
            </template>
          </Column>
          <Column :header="t('catalog.episodes.columns.video')">
            <template #body="{ data }">
              <StatusTag v-if="data.video" :status="data.video.status" />
              <span v-else class="text-sm text-surface-500">{{ t('catalog.episodes.noVideo') }}</span>
            </template>
          </Column>
          <Column :header="t('catalog.episodes.columns.duration')"><template #body="{ data }">{{ formatDuration(data.durationSeconds) }}</template></Column>
          <Column :header="t('catalog.episodes.columns.price')">
            <template #body="{ data }">{{ data.number <= series.freeEpisodes ? '—' : `${data.priceCoinsOverride ?? series.episodePriceCoins} ${t('catalog.coins')}` }}</template>
          </Column>
          <Column :header="t('catalog.episodes.columns.subtitles')"><template #body="{ data }">{{ subtitleLocales(data) }}</template></Column>
          <Column :header="t('catalog.episodes.columns.status')"><template #body="{ data }"><StatusTag :status="data.status" /></template></Column>
          <Column :header="t('common.actions')" class="w-64">
            <template #body="{ data }">
              <div class="flex flex-wrap gap-1">
                <Button v-if="can('media:upload')" size="small" text icon="pi pi-video" :aria-label="t('catalog.video.title', { n: data.number })" @click="openVideo(data)" />
                <Button v-if="data.video && data.video.status === 'PROCESSING'" size="small" text icon="pi pi-refresh" :aria-label="t('catalog.video.refresh')" @click="refreshVideo(data)" />
                <Button v-if="can('catalog:write')" size="small" text icon="pi pi-pencil" :aria-label="t('catalog.episodes.edit', { n: data.number })" @click="openEdit(data)" />
                <Button v-if="can('catalog:publish') && data.status !== 'PUBLISHED'" size="small" text icon="pi pi-send" :disabled="data.video?.status !== 'READY'" :aria-label="t('catalog.episodes.publish')" @click="publishEpisode(data)" />
                <Button v-if="can('catalog:publish') && data.status === 'PUBLISHED'" size="small" text icon="pi pi-eye-slash" :aria-label="t('catalog.episodes.withdraw')" @click="withdrawEpisode(data)" />
                <Button v-if="can('catalog:write') && data.status === 'DRAFT'" size="small" text severity="danger" icon="pi pi-trash" :aria-label="t('catalog.episodes.delete')" @click="deleteEpisode(data)" />
              </div>
            </template>
          </Column>
        </DataTable>
      </section>

      <VideoDialog v-model:visible="videoOpen" :episode="videoFor" @done="reloadSeries" />
      <EpisodeDialog v-model:visible="editOpen" :episode="editFor" @done="reloadSeries" />
    </template>
  </div>
</template>

<style scoped>
.card { @apply rounded-2xl border border-surface-200 bg-surface-0 p-5 dark:border-surface-800 dark:bg-surface-900; }
.card-title { @apply mb-4 text-base font-semibold; }
.field { @apply flex flex-col gap-1 text-sm font-medium; }
</style>
