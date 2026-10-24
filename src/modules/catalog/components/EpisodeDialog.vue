<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import { useApiError } from '@shared/composables/use-api-error';
import { catalogApi } from '../catalog.api';
import { effectiveFreeEpisodes } from '../pricing';
import type { Episode, SeriesDetail } from '../types';

/** Titres, prix particulier et sous-titres d'un épisode. */
const props = defineProps<{ episode: Episode | null; series?: SeriesDetail | null }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ done: [] }>();
const { t } = useI18n();
const { notify } = useApiError();

const titleFr = ref('');
const titleEn = ref('');
const price = ref<number | null>(null);
const subFr = ref('');
const subEn = ref('');
const busy = ref(false);

/** Pourquoi un prix saisi ici peut ne pas s'appliquer (même règle que l'API). */
const priceNotice = computed(() => {
  const e = props.episode;
  const s = props.series;
  if (!e || !s) return null;
  if (e.number <= effectiveFreeEpisodes(s))
    return t('catalog.episodes.freeNotice', { n: effectiveFreeEpisodes(s) });
  const brand = s.tenantSeries?.episodePriceCoinsOverride;
  if (brand !== null && brand !== undefined)
    return t('catalog.episodes.brandNotice', { price: brand });
  return null;
});

/**
 * Formulaire rempli à CHAQUE ouverture (et pas seulement au changement d'épisode) : rouvrir
 * le même épisode après « Annuler » montre ses vraies valeurs, pas la saisie abandonnée.
 */
watch(
  () => [props.episode, visible.value] as const,
  ([e, open]) => {
    if (!open) return;
    titleFr.value = e?.titleFr ?? '';
    titleEn.value = e?.titleEn ?? '';
    price.value = e?.priceCoinsOverride ?? null;
    subFr.value = e?.subtitles.find((s) => s.locale === 'fr')?.url ?? '';
    subEn.value = e?.subtitles.find((s) => s.locale === 'en')?.url ?? '';
  },
  { immediate: true },
);

async function save(): Promise<void> {
  const e = props.episode;
  if (!e) return;
  busy.value = true;
  try {
    await catalogApi.updateEpisode(e.id, {
      titleFr: titleFr.value || null,
      titleEn: titleEn.value || null,
      priceCoinsOverride: price.value,
    });
    for (const [locale, url] of [
      ['fr', subFr.value],
      ['en', subEn.value],
    ] as const) {
      const had = e.subtitles.some((s) => s.locale === locale);
      if (url.trim()) await catalogApi.setSubtitle(e.id, locale, url.trim());
      else if (had) await catalogApi.removeSubtitle(e.id, locale);
    }
    visible.value = false;
    emit('done');
  } catch (error) {
    notify(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="t('catalog.episodes.edit', { n: episode?.number ?? '' })"
    class="w-[32rem]"
  >
    <form class="grid gap-3" @submit.prevent="save">
      <label class="text-sm font-medium"
        >{{ t('catalog.episodes.titleFr') }}<InputText v-model="titleFr" class="mt-1 w-full"
      /></label>
      <label class="text-sm font-medium"
        >{{ t('catalog.episodes.titleEn') }}<InputText v-model="titleEn" class="mt-1 w-full"
      /></label>
      <label class="text-sm font-medium"
        >{{ t('catalog.episodes.priceOverride') }}
        <InputNumber
          v-model="price"
          :min="1"
          :max="100000"
          show-buttons
          class="mt-1 w-full"
          :placeholder="t('catalog.episodes.priceInherited')"
        />
      </label>
      <Message v-if="priceNotice" severity="warn" :closable="false" data-testid="price-notice">{{
        priceNotice
      }}</Message>
      <label class="text-sm font-medium"
        >{{ t('catalog.episodes.subtitlesFr')
        }}<InputText v-model="subFr" placeholder="https://…/fr.vtt" class="mt-1 w-full"
      /></label>
      <label class="text-sm font-medium"
        >{{ t('catalog.episodes.subtitlesEn')
        }}<InputText v-model="subEn" placeholder="https://…/en.vtt" class="mt-1 w-full"
      /></label>
      <div class="flex justify-end gap-2">
        <Button type="button" text :label="t('common.cancel')" @click="visible = false" />
        <Button type="submit" :label="t('common.save')" :loading="busy" />
      </div>
    </form>
  </Dialog>
</template>
