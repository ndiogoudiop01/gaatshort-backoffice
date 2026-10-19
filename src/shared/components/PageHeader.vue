<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
  <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div class="min-w-0">
      <h1 class="text-xl font-semibold">{{ title }}</h1>
      <p v-if="subtitle" class="mt-1 text-sm text-surface-500">{{ subtitle }}</p>
    </div>
    <div class="flex items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
