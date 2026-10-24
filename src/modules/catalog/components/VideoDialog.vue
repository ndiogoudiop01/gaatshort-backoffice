<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import ProgressBar from 'primevue/progressbar';
import { useApiError } from '@shared/composables/use-api-error';
import { catalogApi } from '../catalog.api';
import { uploadVideo } from '../video-upload';
import type { Episode } from '../types';

/** Vidéo d'un épisode : téléversement direct (TUS) ou import par URL. */
const props = defineProps<{ episode: Episode | null }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ done: [] }>();
const { t } = useI18n();
const { notify } = useApiError();

const mode = ref<'file' | 'url'>('file');
const file = ref<File | null>(null);
const sourceUrl = ref('');
const progress = ref<number | null>(null);
const busy = ref(false);
let abort: (() => void) | null = null;

function pick(e: Event): void {
  file.value = (e.target as HTMLInputElement).files?.[0] ?? null;
}

async function submit(): Promise<void> {
  if (!props.episode) return;
  busy.value = true;
  try {
    if (mode.value === 'url') {
      await catalogApi.ingest(props.episode.id, sourceUrl.value.trim());
    } else if (file.value) {
      const ticket = await catalogApi.createUpload(props.episode.id);
      progress.value = 0;
      const job = uploadVideo(file.value, ticket, (p) => (progress.value = p));
      abort = job.abort;
      await job.promise;
    }
    visible.value = false;
    emit('done');
  } catch (error) {
    notify(error);
  } finally {
    busy.value = false;
    progress.value = null;
    abort = null;
  }
}

function close(): void {
  abort?.();
  visible.value = false;
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="t('catalog.video.title', { n: episode?.number ?? '' })"
    class="w-[32rem]"
    :closable="!busy"
  >
    <div class="mb-4 flex gap-2">
      <Button
        size="small"
        :outlined="mode !== 'file'"
        :label="t('catalog.video.fromFile')"
        icon="pi pi-upload"
        @click="mode = 'file'"
      />
      <Button
        size="small"
        :outlined="mode !== 'url'"
        :label="t('catalog.video.fromUrl')"
        icon="pi pi-link"
        @click="mode = 'url'"
      />
    </div>
    <div v-if="mode === 'file'" class="flex flex-col gap-2">
      <input type="file" accept="video/*" data-testid="video-file" @change="pick" />
      <p class="text-xs text-surface-500">{{ t('catalog.video.fileHint') }}</p>
      <ProgressBar v-if="progress !== null" :value="progress" />
    </div>
    <div v-else class="flex flex-col gap-2">
      <InputText
        v-model="sourceUrl"
        placeholder="https://…/episode-01.mp4"
        data-testid="video-url"
      />
      <p class="text-xs text-surface-500">{{ t('catalog.video.urlHint') }}</p>
    </div>
    <template #footer>
      <Button text :label="t('common.cancel')" @click="close" />
      <Button
        :label="t('catalog.video.submit')"
        icon="pi pi-check"
        :loading="busy"
        :disabled="mode === 'file' ? !file : !/^https?:\/\//.test(sourceUrl)"
        @click="submit"
      />
    </template>
  </Dialog>
</template>
