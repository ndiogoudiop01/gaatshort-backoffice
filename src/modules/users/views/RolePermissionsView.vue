<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useEventListener } from '@vueuse/core';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import Select from 'primevue/select';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '@core/auth/auth.store';
import { ApiError } from '@core/http';
import { useApiError } from '@shared/composables/use-api-error';
import PermissionMatrix from '../components/PermissionMatrix.vue';
import TokenEffectNotice from '../components/TokenEffectNotice.vue';
import { buildGrid } from '../permission-grid';
import { usersApi } from '../users.api';
import { diffKeys, roleEditLocksMeOut } from '../users-rules';
import type { PermissionView, RoleView } from '../types';

/**
 * Page dédiée aux permissions d'UN profil (BSG-12).
 *
 * Le mapping rôle → permissions vient de `GET /admin/roles` et le catalogue de
 * `GET /admin/permissions` : rien n'est codé en dur. On édite une liste de
 * clés, puis `PUT /admin/roles/:id/permissions`.
 *
 * Garde-fous (tous également appliqués par le serveur) :
 *  • SUPER_ADMIN : verrouillé, lecture seule ;
 *  • permission que VOUS n'avez pas : cadenas (anti-escalade) ;
 *  • retirer `user:manage` d'un profil qui est votre seul accès : bloqué.
 */
const props = defineProps<{ id: string }>();

const { t, d, n } = useI18n();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const auth = useAuthStore();
const { notify, messageFor } = useApiError();

const roles = ref<RoleView[]>([]);
const catalog = ref<PermissionView[]>([]);
const loading = ref(false);
const loadError = ref<unknown>(null);
const selection = ref<string[]>([]);
const pending = ref(false);

const role = computed(() => roles.value.find((r) => r.id === props.id) ?? null);
const grid = computed(() => buildGrid(catalog.value));
const baseline = computed(() => [...(role.value?.permissions ?? [])].sort());
const diff = computed(() => diffKeys(baseline.value, selection.value));
const dirty = computed(() => diff.value.added.length + diff.value.removed.length > 0);
const readonly = computed(() => !role.value || role.value.locked);

const myRoleKeys = computed(() => [...auth.roles]);
const locksMeOut = computed(
  () =>
    !!role.value && roleEditLocksMeOut(role.value, selection.value, myRoleKeys.value, roles.value),
);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    [roles.value, catalog.value] = await Promise.all([usersApi.roles(), usersApi.permissions()]);
    // Même message neutre qu'un 404 de l'API (inexistant ou autre tenant).
    if (!role.value)
      throw new ApiError({ code: 'RESOURCE_NOT_FOUND', message: 'Rôle introuvable', status: 404 });
    selection.value = [...baseline.value];
  } catch (error) {
    loadError.value = error;
  } finally {
    loading.value = false;
  }
}
watch(() => props.id, load, { immediate: true });

const saving = ref(false);
async function save(): Promise<void> {
  const current = role.value;
  if (!current || !dirty.value || saving.value || readonly.value || locksMeOut.value) return;
  saving.value = true;
  try {
    const updated = await usersApi.setRolePermissions(current.id, selection.value);
    roles.value = roles.value.map((r) => (r.id === updated.id ? updated : r));
    selection.value = [...updated.permissions].sort();
    pending.value = true;
    toast.add({
      severity: 'success',
      summary: t('users.role.saved'),
      detail: t('users.effect.toast'),
      life: 6000,
    });
  } catch (error) {
    notify(error);
  } finally {
    saving.value = false;
  }
}

function reset(): void {
  selection.value = [...baseline.value];
}

// Ctrl+S : enregistrer.
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void save();
  }
});

// ─────────────────────────── Copier depuis un autre profil ───────────────────────────

const copySource = ref<string | null>(null);
const copyOptions = computed(() =>
  roles.value
    .filter((r) => r.id !== props.id)
    .map((r) => ({ value: r.id, label: `${r.name} (${r.permissions.length})` })),
);
function copyFrom(): void {
  const source = roles.value.find((r) => r.id === copySource.value);
  if (!source) return;
  // Seules les cases que l'on peut toucher sont alignées sur la source.
  const grantable = new Set(catalog.value.filter((p) => p.grantable).map((p) => p.key));
  const keep = selection.value.filter((k) => !grantable.has(k));
  selection.value = [
    ...new Set([...keep, ...source.permissions.filter((k) => grantable.has(k))]),
  ].sort();
  copySource.value = null;
}

// ─────────────────────────── Libellé ───────────────────────────

const editingName = ref(false);
const nameDraft = ref('');
const descriptionDraft = ref('');
function startRename(): void {
  if (!role.value) return;
  nameDraft.value = role.value.name;
  descriptionDraft.value = role.value.description ?? '';
  editingName.value = true;
}
async function saveName(): Promise<void> {
  const current = role.value;
  if (!current || nameDraft.value.trim().length < 2) return;
  try {
    const updated = await usersApi.updateRole(current.id, {
      name: nameDraft.value.trim(),
      description: descriptionDraft.value.trim() || null,
    });
    roles.value = roles.value.map((r) => (r.id === updated.id ? updated : r));
    editingName.value = false;
  } catch (error) {
    notify(error);
  }
}

function askDelete(): void {
  const current = role.value;
  if (!current || current.isSystem) return;
  confirm.require({
    header: t('users.role.deleteTitle'),
    message: t('users.role.deleteMessage', { name: current.name }),
    icon: 'pi pi-trash',
    acceptLabel: t('users.role.delete'),
    rejectLabel: t('common.cancel'),
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await usersApi.deleteRole(current.id);
        selection.value = [...baseline.value];
        toast.add({ severity: 'success', summary: t('users.role.deleted'), life: 4000 });
        await router.push({ name: 'users', query: { onglet: 'profils' } });
      } catch (error) {
        notify(error);
      }
    },
  });
}

// ─────────────────────────── Quitter ───────────────────────────

onBeforeRouteLeave(() => {
  if (!dirty.value || saving.value) return true;
  return new Promise<boolean>((resolve) => {
    confirm.require({
      header: t('users.leave.title'),
      message: t('users.leave.message'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: t('users.leave.accept'),
      rejectLabel: t('users.leave.stay'),
      acceptClass: 'p-button-danger',
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false),
    });
  });
});
useEventListener(window, 'beforeunload', (event: BeforeUnloadEvent) => {
  if (dirty.value) event.preventDefault();
});
</script>

<template>
  <div>
    <RouterLink
      :to="{ name: 'users', query: { onglet: 'profils' } }"
      class="mb-3 inline-flex items-center gap-2 text-sm text-surface-500 hover:text-primary"
    >
      <i class="pi pi-arrow-left" aria-hidden="true" />
      {{ t('users.role.back') }}
    </RouterLink>

    <div v-if="loading && !role" class="flex min-h-64 items-center justify-center">
      <ProgressSpinner style="width: 2.5rem; height: 2.5rem" stroke-width="4" />
    </div>

    <Message v-else-if="loadError" severity="error" :closable="false" data-testid="role-load-error">
      {{ messageFor(loadError) }}
    </Message>

    <template v-else-if="role">
      <header class="hero">
        <div class="min-w-0 flex-1">
          <template v-if="!editingName">
            <h1 class="flex flex-wrap items-center gap-2 text-xl font-semibold">
              {{ role.name }}
              <span class="font-mono text-sm font-normal text-surface-500">{{ role.key }}</span>
              <span v-if="role.locked" class="lock-badge" data-testid="role-locked">
                <i class="pi pi-lock text-[0.65rem]" aria-hidden="true" />
                {{ t('users.roles.locked') }}
              </span>
              <button
                type="button"
                class="icon-btn"
                :aria-label="t('users.role.rename')"
                :title="t('users.role.rename')"
                @click="startRename"
              >
                <i class="pi pi-pencil text-xs" aria-hidden="true" />
              </button>
            </h1>
            <p v-if="role.description" class="mt-1 text-sm text-surface-600 dark:text-surface-300">
              {{ role.description }}
            </p>
          </template>
          <form v-else class="flex flex-col gap-2 sm:max-w-lg" @submit.prevent="saveName">
            <InputText
              v-model="nameDraft"
              maxlength="80"
              :aria-label="t('users.roleCreate.name')"
            />
            <InputText
              v-model="descriptionDraft"
              maxlength="300"
              :placeholder="t('users.roleCreate.description')"
              :aria-label="t('users.roleCreate.description')"
            />
            <div class="flex gap-2">
              <Button type="submit" :label="t('common.save')" size="small" />
              <Button
                type="button"
                :label="t('common.cancel')"
                size="small"
                text
                @click="editingName = false"
              />
            </div>
          </form>
          <p class="mt-2 flex flex-wrap gap-x-4 text-xs text-surface-500">
            <span
              ><i class="pi pi-users mr-1" aria-hidden="true" />{{
                t('users.role.userCount', role.userCount)
              }}</span
            >
            <span
              ><i class="pi pi-key mr-1" aria-hidden="true" />{{
                t('users.roles.permissionCount', { count: selection.length, total: catalog.length })
              }}</span
            >
            <span
              ><i class="pi pi-clock mr-1" aria-hidden="true" />{{
                t('users.role.updatedAt', { date: d(new Date(role.updatedAt), 'long') })
              }}</span
            >
          </p>
        </div>
        <Button
          v-if="!role.isSystem"
          :label="t('users.role.delete')"
          icon="pi pi-trash"
          severity="danger"
          text
          :disabled="role.userCount > 0"
          :title="role.userCount > 0 ? t('users.role.deleteInUse') : undefined"
          @click="askDelete"
        />
      </header>

      <TokenEffectNotice
        class="mb-4"
        :pending="pending"
        :who="t('users.role.whoAccounts', { count: n(role.userCount) })"
      />

      <Message v-if="role.locked" severity="info" :closable="false" class="mb-4">{{
        t('users.role.lockedInfo')
      }}</Message>

      <!-- Barre d'enregistrement : résumé des modifications. -->
      <div
        v-if="!readonly"
        class="save-bar"
        :class="{ 'save-bar--dirty': dirty }"
        data-testid="role-save-bar"
      >
        <span class="text-sm" aria-live="polite">
          <template v-if="dirty">
            <span class="font-semibold text-emerald-700 dark:text-emerald-400"
              >+{{ diff.added.length }}</span
            >
            ·
            <span class="font-semibold text-red-600">−{{ diff.removed.length }}</span>
            {{ t('users.role.unsaved') }}
          </template>
          <template v-else>{{ t('users.role.allSaved') }}</template>
        </span>
        <div class="flex flex-wrap items-center gap-2">
          <Select
            v-model="copySource"
            :options="copyOptions"
            option-label="label"
            option-value="value"
            :placeholder="t('users.role.copyPlaceholder')"
            class="w-56"
            size="small"
            @change="copyFrom"
          />
          <Button
            :label="t('users.role.reset')"
            icon="pi pi-undo"
            size="small"
            text
            :disabled="!dirty"
            @click="reset"
          />
          <Button
            :label="t('common.save')"
            icon="pi pi-check"
            size="small"
            :disabled="!dirty || locksMeOut"
            :loading="saving"
            :title="`${t('common.save')} (Ctrl+S)`"
            data-testid="role-save"
            @click="save"
          />
        </div>
      </div>
      <Message
        v-if="locksMeOut"
        severity="warn"
        :closable="false"
        class="mb-4"
        data-testid="role-self-lockout"
      >
        {{ t('users.self.roleLockout') }}
      </Message>

      <PermissionMatrix
        v-model="selection"
        :grid="grid"
        :baseline="baseline"
        :readonly="readonly"
      />
    </template>
  </div>
</template>

<style scoped>
.hero {
  @apply mb-4 flex flex-wrap items-start gap-4 rounded-2xl border border-surface-200 bg-surface-0 p-5 dark:border-surface-800 dark:bg-surface-900;
}
.lock-badge {
  @apply inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-red-700 dark:bg-red-950/40 dark:text-red-300;
}
.icon-btn {
  @apply inline-flex h-7 w-7 items-center justify-center rounded-md text-surface-400 hover:bg-surface-100 hover:text-surface-800 dark:hover:bg-surface-800;
}
.save-bar {
  @apply sticky top-0 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-200 bg-surface-0/90 px-4 py-2.5 shadow-sm backdrop-blur dark:border-surface-800 dark:bg-surface-900/90;
  transition:
    border-color var(--duration-panel) var(--ease-out),
    background-color var(--duration-panel) var(--ease-out);
}
.save-bar--dirty {
  @apply border-amber-300 dark:border-amber-800;
}
</style>
