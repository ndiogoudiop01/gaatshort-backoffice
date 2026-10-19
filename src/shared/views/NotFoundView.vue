<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';

const { t } = useI18n();
const router = useRouter();
</script>

<template>
  <div class="mx-auto flex max-w-lg flex-col items-center gap-4 p-10 text-center">
    <i class="pi pi-compass text-4xl text-surface-400" />
    <h1 class="text-xl font-semibold">{{ t('errors.notFoundTitle') }}</h1>
    <p class="text-surface-500">{{ t('errors.notFoundBody') }}</p>
    <Button :label="t('nav.home')" icon="pi pi-home" @click="router.push({ name: 'home' })" />
  </div>
</template>
