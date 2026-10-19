<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import { confirmationMatches, type ChangeLine } from '../tenant-rules';
import type { TenantView } from '../types';

/**
 * Confirmation AVANT toute écriture sur une organisation (BSG-13).
 *
 * `PATCH /admin/tenants/:id` franchit l'isolation multi-tenant : l'écran
 * NOMME l'organisation (nom + identifiant) et liste chaque changement
 * « avant → après ». Si le changement coupe l'accès (suspension, archivage),
 * il faut en plus retaper l'identifiant de l'organisation.
 *
 * Pas de `<form>` : « Entrée » ne confirme rien. Bouton désactivé pendant la
 * requête (`pending`).
 */
const props = defineProps<{
  tenant: TenantView;
  changes: readonly ChangeLine[];
  cutsAccess: boolean;
  pending: boolean;
}>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ confirm: [] }>();

const { t, te } = useI18n();

const typed = ref('');
const input = ref<HTMLInputElement | null>(null);

watch(visible, async (open) => {
  if (!open) return;
  typed.value = '';
  await nextTick();
  input.value?.focus();
});

const canConfirm = computed(
  () =>
    !props.pending && (!props.cutsAccess || confirmationMatches(typed.value, props.tenant.slug)),
);

function fieldLabel(field: string): string {
  if (field.startsWith('flag:')) return t('tenants.confirm.flag', { key: field.slice(5) });
  return te(`tenants.fields.${field}`) ? t(`tenants.fields.${field}`) : field;
}

function confirm(): void {
  if (!canConfirm.value) return;
  emit('confirm');
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="t('tenants.confirm.title', { name: tenant.name })"
    :closable="!pending"
    :close-on-escape="!pending"
    :style="{ width: '34rem' }"
    :breakpoints="{ '640px': '95vw' }"
    data-testid="tenant-confirm"
  >
    <div class="flex flex-col gap-4">
      <p class="org" data-testid="tenant-confirm-name">
        <i class="pi pi-sitemap" aria-hidden="true" />
        <span>
          <strong>{{ tenant.name }}</strong>
          <span class="ml-1 font-mono text-xs text-surface-500">{{ tenant.slug }}</span>
        </span>
      </p>

      <ul class="changes" :aria-label="t('tenants.confirm.changes')">
        <li v-for="change in changes" :key="change.field" class="change">
          <span class="text-xs font-semibold uppercase tracking-wide text-surface-500">
            {{ fieldLabel(change.field) }}
          </span>
          <span class="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <span class="before">{{ change.before }}</span>
            <i class="pi pi-arrow-right text-[0.65rem] text-surface-400" aria-hidden="true" />
            <span class="after">{{ change.after }}</span>
          </span>
        </li>
      </ul>

      <template v-if="cutsAccess">
        <div class="danger" role="note" data-testid="tenant-confirm-danger">
          <i class="pi pi-exclamation-triangle mt-0.5" aria-hidden="true" />
          <p class="text-sm">
            {{ t('tenants.confirm.cutsAccess', { count: tenant.userCount, name: tenant.name }) }}
          </p>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="tenant-confirm-slug" class="text-sm font-medium">
            {{ t('tenants.confirm.typeSlug', { slug: tenant.slug }) }}
          </label>
          <input
            id="tenant-confirm-slug"
            ref="input"
            v-model="typed"
            type="text"
            autocomplete="off"
            spellcheck="false"
            class="slug-input"
            :class="{ 'slug-input--ok': confirmationMatches(typed, tenant.slug) }"
            :placeholder="tenant.slug"
            data-testid="tenant-confirm-slug"
            @keydown.enter.prevent
          />
        </div>
      </template>

      <div class="mt-1 flex justify-end gap-2">
        <Button
          type="button"
          :label="t('common.cancel')"
          text
          :disabled="pending"
          @click="visible = false"
        />
        <Button
          type="button"
          :label="
            cutsAccess
              ? t('tenants.confirm.acceptDanger', { name: tenant.name })
              : t('tenants.confirm.accept', { name: tenant.name })
          "
          :icon="cutsAccess ? 'pi pi-ban' : 'pi pi-check'"
          :severity="cutsAccess ? 'danger' : undefined"
          :loading="pending"
          :disabled="!canConfirm"
          data-testid="tenant-confirm-accept"
          @click="confirm"
        />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.org {
  @apply flex items-center gap-3 rounded-lg bg-surface-50 px-3 py-2.5 dark:bg-surface-800/60;
}
.changes {
  @apply flex max-h-64 flex-col gap-2 overflow-y-auto;
}
.change {
  @apply flex flex-col gap-1 rounded-lg border border-surface-200 px-3 py-2 dark:border-surface-700;
}
.before {
  @apply max-w-full truncate rounded bg-red-50 px-1.5 py-0.5 text-red-700 line-through decoration-red-300 dark:bg-red-950/40 dark:text-red-300;
}
.after {
  @apply max-w-full truncate rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200;
}
.danger {
  @apply flex items-start gap-2 rounded-lg bg-red-50 p-3 text-red-900 dark:bg-red-950/40 dark:text-red-200;
}
.slug-input {
  @apply h-10 w-full rounded-lg border border-surface-300 bg-transparent px-3 font-mono outline-none focus:border-primary-400 focus:ring-4 focus:ring-primary-100 dark:border-surface-600 dark:focus:ring-primary-900/40;
  transition:
    border-color var(--duration-popover) ease,
    box-shadow var(--duration-popover) ease;
}
.slug-input--ok {
  @apply border-red-500 focus:border-red-500 focus:ring-red-100 dark:focus:ring-red-900/40;
}
</style>
