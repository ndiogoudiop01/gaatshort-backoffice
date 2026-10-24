<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Tag from 'primevue/tag';

/** Statut d'une série, d'un épisode, d'une vidéo ou de la diffusion par la marque. */
const props = defineProps<{ status: string; kind?: 'series' | 'episode' | 'media' | 'storefront' }>();
const { t } = useI18n();

const severity = computed(() => {
  switch (props.status) {
    case 'PUBLISHED':
    case 'READY':
    case 'LIVE':
      return 'success';
    case 'PROCESSING':
    case 'PENDING_UPLOAD':
      return 'info';
    case 'FAILED':
    case 'WITHDRAWN':
    case 'ARCHIVED':
      return 'danger';
    default:
      return 'secondary';
  }
});
</script>

<template>
  <Tag :value="t(`catalog.status.${status}`)" :severity="severity" />
</template>
