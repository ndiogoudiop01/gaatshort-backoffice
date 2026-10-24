<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Message from 'primevue/message';
import PageHeader from '@shared/components/PageHeader.vue';
import { useApiError } from '@shared/composables/use-api-error';
import { formatMinorAmount } from '@shared/utils/money';
import { audienceApi, barHeights } from '../audience.api';
import type { Dashboard } from '../types';

/** BO-01 — tableau de bord de la marque. */
const { t, n, d } = useI18n();
const { messageFor } = useApiError();
const data = ref<Dashboard | null>(null);
const error = ref<unknown>(null);
onMounted(async () => {
  try {
    data.value = await audienceApi.dashboard();
  } catch (e) {
    error.value = e;
  }
});
const revenue = computed(
  () =>
    data.value?.revenue30d
      .map((r) => formatMinorAmount(r.amountMinor, r.currencyCode))
      .join(' · ') || formatMinorAmount(0, 'XOF'),
);
const bars = computed(() => {
  const days = data.value?.revenueByDay30d ?? [];
  const heights = barHeights(days.map((x) => x.amountMinor));
  return days.map((x, i) => ({ ...x, height: heights[i] ?? 0 }));
});
const conversion = computed(() =>
  data.value && data.value.activeViewers7d
    ? Math.round((data.value.paidOrders30d / Math.max(1, data.value.viewers)) * 1000) / 10
    : 0,
);
</script>

<template>
  <div>
    <PageHeader :title="t('dashboard.title')" :subtitle="t('dashboard.subtitle')" />
    <Message v-if="error" severity="error" :closable="false">{{ messageFor(error) }}</Message>
    <template v-if="data">
      <section class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div class="kpi">
          <p class="kpi-label">{{ t('dashboard.revenue30d') }}</p>
          <p class="kpi-value">{{ revenue }}</p>
          <p class="kpi-sub">{{ t('dashboard.paidOrders', { n: n(data.paidOrders30d) }) }}</p>
        </div>
        <div class="kpi">
          <p class="kpi-label">{{ t('dashboard.viewers') }}</p>
          <p class="kpi-value">{{ n(data.viewers) }}</p>
          <p class="kpi-sub">{{ t('dashboard.newViewers', { n: n(data.newViewers7d) }) }}</p>
        </div>
        <div class="kpi">
          <p class="kpi-label">{{ t('dashboard.active7d') }}</p>
          <p class="kpi-value">{{ n(data.activeViewers7d) }}</p>
          <p class="kpi-sub">{{ t('dashboard.conversion', { p: conversion }) }}</p>
        </div>
        <div class="kpi">
          <p class="kpi-label">{{ t('dashboard.unlocks30d') }}</p>
          <p class="kpi-value">{{ n(data.unlocks30d) }}</p>
          <p class="kpi-sub">
            {{ t('dashboard.catalog', { s: data.liveSeries, e: data.publishedEpisodes }) }}
          </p>
        </div>
      </section>
      <div class="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section class="card">
          <h2 class="mb-4 font-semibold">{{ t('dashboard.revenueByDay') }}</h2>
          <div
            v-if="bars.length"
            class="flex h-48 items-end gap-1"
            role="img"
            :aria-label="t('dashboard.revenueByDay')"
          >
            <div
              v-for="b in bars"
              :key="b.day"
              class="flex-1 rounded-t bg-primary"
              :style="{ height: `${b.height}%` }"
              :title="`${d(new Date(b.day), 'short')} — ${formatMinorAmount(b.amountMinor, 'XOF')} (${b.orders})`"
            />
          </div>
          <p v-else class="text-sm text-surface-500">{{ t('dashboard.noRevenue') }}</p>
        </section>
        <section class="card">
          <h2 class="mb-4 font-semibold">{{ t('dashboard.topSeries') }}</h2>
          <ol v-if="data.topSeries30d.length" class="flex flex-col gap-3">
            <li
              v-for="(s, i) in data.topSeries30d"
              :key="s.seriesId"
              class="flex items-center gap-3"
            >
              <span class="w-5 text-sm font-bold text-surface-400">{{ i + 1 }}</span>
              <img
                v-if="s.posterUrl"
                :src="s.posterUrl"
                alt=""
                class="h-10 w-7 rounded object-cover"
              />
              <span class="flex-1 truncate text-sm">{{ s.title }}</span>
              <span class="text-sm text-surface-500">{{
                t('dashboard.viewersCount', { n: n(s.viewers) })
              }}</span>
            </li>
          </ol>
          <p v-else class="text-sm text-surface-500">{{ t('dashboard.noViews') }}</p>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.kpi {
  @apply rounded-2xl border border-surface-200 bg-surface-0 p-5 dark:border-surface-800 dark:bg-surface-900;
}
.kpi-label {
  @apply text-xs font-semibold uppercase tracking-wide text-surface-500;
}
.kpi-value {
  @apply mt-2 text-2xl font-bold;
}
.kpi-sub {
  @apply mt-1 text-sm text-surface-500;
}
.card {
  @apply rounded-2xl border border-surface-200 bg-surface-0 p-5 dark:border-surface-800 dark:bg-surface-900;
}
</style>
