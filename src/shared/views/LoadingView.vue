<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import ProgressSpinner from 'primevue/progressspinner';

const { t } = useI18n();
</script>

<template>
  <div class="flex justify-center p-12">
    <ProgressSpinner style="width: 2.5rem; height: 2.5rem" :aria-label="t('common.loading')" />
  </div>
</template>
