<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * Aperçu EN DIRECT de l'image d'une organisation (BSG-13) : barre d'en-tête,
 * bouton principal et lien, avec la couleur et le logo saisis — avant
 * d'enregistrer. Purement visuel ; aucun style n'est appliqué au back-office.
 */
const props = defineProps<{ name: string; primaryColor: string; logoUrl: string }>();
const { t } = useI18n();

const color = computed(() =>
  /^#[0-9A-Fa-f]{6}$/.test(props.primaryColor) ? props.primaryColor : '#64748B',
);
/** Texte lisible sur la couleur : luminance relative (WCAG). */
const onColor = computed(() => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.value.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
  return luminance > 0.45 ? '#0f172a' : '#ffffff';
});

const logoFailed = ref(false);
watch(
  () => props.logoUrl,
  () => (logoFailed.value = false),
);
const logo = computed(() =>
  /^https:\/\/\S+$/.test(props.logoUrl) && !logoFailed.value ? props.logoUrl : null,
);
const initials = computed(() =>
  props.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join(''),
);
</script>

<template>
  <figure
    class="preview"
    data-testid="brand-preview"
    :style="{ '--brand': color, '--on-brand': onColor }"
  >
    <div class="bar">
      <span class="logo">
        <img
          v-if="logo"
          :src="logo"
          alt=""
          class="h-full w-full object-contain"
          @error="logoFailed = true"
        />
        <span v-else>{{ initials || '?' }}</span>
      </span>
      <span class="truncate text-sm font-semibold">{{ name || '—' }}</span>
    </div>
    <div class="flex flex-col gap-3 p-4">
      <span class="h-2 w-2/3 rounded-full bg-surface-200 dark:bg-surface-700" />
      <span class="h-2 w-1/2 rounded-full bg-surface-100 dark:bg-surface-800" />
      <div class="flex items-center gap-3">
        <span class="cta">{{ t('tenants.brand.cta') }}</span>
        <span class="link">{{ t('tenants.brand.link') }}</span>
      </div>
    </div>
    <figcaption class="sr-only">{{ t('tenants.brand.previewLabel') }}</figcaption>
  </figure>
</template>

<style scoped>
.preview {
  @apply overflow-hidden rounded-xl border border-surface-200 bg-surface-0 dark:border-surface-700 dark:bg-surface-900;
}
.bar {
  @apply flex items-center gap-2.5 px-4 py-3;
  background-color: var(--brand);
  color: var(--on-brand);
  /* La couleur glisse vers la nouvelle au lieu de sauter : l'œil suit le changement. */
  transition:
    background-color var(--duration-panel) var(--ease-out),
    color var(--duration-panel) var(--ease-out);
}
.logo {
  @apply inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/90 text-xs font-bold text-surface-800;
}
.cta {
  @apply rounded-md px-3 py-1.5 text-xs font-semibold;
  background-color: var(--brand);
  color: var(--on-brand);
  transition:
    background-color var(--duration-panel) var(--ease-out),
    color var(--duration-panel) var(--ease-out);
}
.link {
  @apply text-xs font-medium underline underline-offset-2;
  color: var(--brand);
  transition: color var(--duration-panel) var(--ease-out);
}
</style>
