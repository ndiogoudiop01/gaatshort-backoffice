<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { PermissionView, RoleView } from '../types';

/**
 * Profils (BSG-12) : une carte par rôle, clic → page dédiée à ses permissions.
 *
 * « Constats » : les incohérences RÉELLES du modèle de droits, déduites des
 * données de l'API (profil sans permission, permission qu'aucun contrôleur ne
 * vérifie). On les MONTRE ; on ne les corrige pas ici (ticket backend si le
 * métier le demande).
 */
const props = defineProps<{ roles: readonly RoleView[]; catalog: readonly PermissionView[] }>();

const { t, n } = useI18n();
const router = useRouter();

const total = computed(() => props.catalog.length || 1);

/** Permission présente au catalogue mais vérifiée par aucun contrôleur (constat BSG-12). */
const UNCHECKED = ['tenant:manage'];

const findings = computed(() => {
  const list: { key: string; params: Record<string, string> }[] = [];
  for (const role of props.roles) {
    if (!role.permissions.length) list.push({ key: 'emptyRole', params: { role: role.name } });
  }
  for (const key of UNCHECKED) {
    if (props.catalog.some((p) => p.key === key))
      list.push({ key: 'unchecked', params: { permission: key } });
  }
  const admin = props.roles.find((r) => r.key === 'ADMIN');
  if (
    admin &&
    props.catalog.some((p) => p.key === 'tenant:manage') &&
    !admin.permissions.includes('tenant:manage')
  ) {
    list.push({ key: 'adminNoOwn', params: {} });
  }
  return list;
});

function open(role: RoleView): void {
  void router.push({ name: 'users-role', params: { id: role.id } });
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      <button
        v-for="role in roles"
        :key="role.id"
        type="button"
        class="role-card"
        :data-testid="`role-card-${role.key}`"
        @click="open(role)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 text-left">
            <p class="truncate font-semibold">{{ role.name }}</p>
            <p class="font-mono text-xs text-surface-500">{{ role.key }}</p>
          </div>
          <span class="flex shrink-0 gap-1">
            <span v-if="role.locked" class="badge badge--lock"
              ><i class="pi pi-lock text-[0.6rem]" aria-hidden="true" />
              {{ t('users.roles.locked') }}</span
            >
            <span v-else-if="role.isSystem" class="badge">{{ t('users.roles.system') }}</span>
            <span v-else class="badge badge--custom">{{ t('users.roles.custom') }}</span>
          </span>
        </div>
        <p
          v-if="role.description"
          class="line-clamp-2 text-left text-sm text-surface-600 dark:text-surface-300"
        >
          {{ role.description }}
        </p>
        <div class="mt-auto">
          <div class="mb-1.5 flex items-baseline justify-between text-xs text-surface-500">
            <span>{{
              t('users.roles.permissionCount', {
                count: role.permissions.length,
                total: catalog.length,
              })
            }}</span>
            <span
              ><i class="pi pi-users mr-1 text-[0.65rem]" aria-hidden="true" />{{
                n(role.userCount)
              }}</span
            >
          </div>
          <span class="meter" aria-hidden="true">
            <span
              class="meter-fill"
              :style="{ transform: `scaleX(${role.permissions.length / total})` }"
            />
          </span>
        </div>
      </button>
    </div>

    <section v-if="findings.length" class="findings" data-testid="rbac-findings">
      <h3 class="mb-2 flex items-center gap-2 text-sm font-semibold">
        <i class="pi pi-search" aria-hidden="true" />
        {{ t('users.findings.title') }}
      </h3>
      <ul class="flex flex-col gap-1.5 text-sm">
        <li v-for="(finding, index) in findings" :key="index" class="flex items-start gap-2">
          <i class="pi pi-info-circle mt-0.5 text-amber-600" aria-hidden="true" />
          <span>{{ t(`users.findings.${finding.key}`, finding.params) }}</span>
        </li>
      </ul>
      <p class="mt-2 text-xs text-surface-500">{{ t('users.findings.hint') }}</p>
    </section>
  </div>
</template>

<style scoped>
.role-card {
  @apply flex min-h-40 flex-col gap-3 rounded-xl border border-surface-200 bg-surface-0 p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-400 dark:border-surface-800 dark:bg-surface-900;
  transition:
    border-color var(--duration-popover) ease,
    box-shadow var(--duration-popover) ease,
    transform var(--duration-press) var(--ease-out);
}
.role-card:active {
  transform: scale(0.99);
}
@media (hover: hover) and (pointer: fine) {
  .role-card:hover {
    @apply border-primary-300 shadow-md dark:border-primary-800;
  }
}
.badge {
  @apply inline-flex items-center gap-1 rounded-full bg-surface-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-surface-600 dark:bg-surface-800 dark:text-surface-300;
}
.badge--lock {
  @apply bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300;
}
.badge--custom {
  @apply bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300;
}
.meter {
  @apply relative block h-1.5 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800;
}
.meter-fill {
  @apply absolute inset-0 origin-left rounded-full bg-primary-500;
  transition: transform var(--duration-panel) var(--ease-out);
}
.findings {
  @apply rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100;
}
@media (prefers-reduced-motion: reduce) {
  .role-card:active {
    transform: none;
  }
}
</style>
