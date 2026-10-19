<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import MultiSelect from 'primevue/multiselect';
import ProgressSpinner from 'primevue/progressspinner';
import Select from 'primevue/select';
import ToggleSwitch from 'primevue/toggleswitch';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { useAuthStore } from '@core/auth/auth.store';
import { useApiError } from '@shared/composables/use-api-error';
import TokenEffectNotice from '../components/TokenEffectNotice.vue';
import UserStatusTag from '../components/UserStatusTag.vue';
import { usersApi } from '../users.api';
import {
  countryName,
  diffKeys,
  displayName,
  flagOf,
  initials,
  selfRoleGuard,
} from '../users-rules';
import type { PermissionView, RoleView, TenantCountry, UserDetail } from '../types';

/**
 * Fiche d'un compte (BSG-12).
 *
 *  • Rôles : cartes à cocher, seuls les rôles `assignable` (API) sont actifs.
 *    Sur SON PROPRE compte : impossible de se retirer `user:manage` (bloqué ici
 *    ET par le serveur, `SELF_LOCKOUT`), et tout autre changement passe par une
 *    confirmation qui NOMME la conséquence.
 *  • Toute modification prend effet au PROCHAIN jeton : l'écran le dit
 *    (`TokenEffectNotice`) et propose « Déconnecter partout » pour l'appliquer.
 *  • Périmètre pays : modifiable par un SUPER_ADMIN seulement
 *    (`manageable.canEditCountries`, calculé par l'API).
 *  • Permissions effectives : calculées par l'API, jamais ici.
 *  • Pas de mot de passe, donc pas de « réinitialiser le mot de passe ».
 */
const props = defineProps<{ id: string }>();

const { t, d, te } = useI18n();
const toast = useToast();
const confirm = useConfirm();
const auth = useAuthStore();
const { notify, messageFor } = useApiError();

const user = ref<UserDetail | null>(null);
const roles = ref<RoleView[]>([]);
const catalog = ref<PermissionView[]>([]);
const countries = ref<TenantCountry[]>([]);
const loading = ref(false);
const loadError = ref<unknown>(null);
/** Une modification a été enregistrée depuis l'ouverture : effet au prochain jeton. */
const pending = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const [detail, roleList, permissionList, countryList] = await Promise.all([
      usersApi.detail(props.id),
      usersApi.roles(),
      usersApi.permissions(),
      usersApi.countries(),
    ]);
    roles.value = roleList;
    catalog.value = permissionList;
    countries.value = countryList;
    apply(detail);
  } catch (error) {
    // 404 : inexistant, autre tenant OU hors de votre périmètre pays — message neutre.
    user.value = null;
    loadError.value = error;
  } finally {
    loading.value = false;
  }
}

function apply(detail: UserDetail): void {
  user.value = detail;
  selection.value = detail.roles.map((r) => r.key);
  Object.assign(profile, {
    firstName: detail.firstName ?? '',
    lastName: detail.lastName ?? '',
    phoneE164: detail.phoneE164 ?? '',
    countryCode: detail.countryCode,
  });
  scope.allCountries = detail.allCountries;
  scope.countryScope = [...detail.countryScope];
}

watch(() => props.id, load, { immediate: true });

const canManage = computed(() => !!user.value?.manageable.canManage);
const isSelf = computed(() => !!user.value?.isSelf);
const name = computed(() => (user.value ? displayName(user.value) : ''));

// ─────────────────────────── Rôles ───────────────────────────

const selection = ref<string[]>([]);
const savedKeys = computed(() => user.value?.roles.map((r) => r.key) ?? []);
const rolesDirty = computed(() => {
  const { added, removed } = diffKeys(savedKeys.value, selection.value);
  return added.length + removed.length > 0;
});
const guard = computed(() =>
  selfRoleGuard(isSelf.value, savedKeys.value, selection.value, roles.value),
);
const savingRoles = ref(false);

function roleDisabled(role: RoleView): boolean {
  if (!role.assignable) return true;
  return !canManage.value && !isSelf.value;
}

function toggleRole(role: RoleView): void {
  if (roleDisabled(role)) return;
  selection.value = selection.value.includes(role.key)
    ? selection.value.filter((k) => k !== role.key)
    : [...selection.value, role.key];
}

async function persistRoles(): Promise<void> {
  if (!user.value) return;
  savingRoles.value = true;
  try {
    apply(await usersApi.setRoles(user.value.id, selection.value));
    pending.value = true;
    toast.add({
      severity: 'success',
      summary: t('users.detail.rolesSaved'),
      detail: t('users.effect.toast'),
      life: 6000,
    });
  } catch (error) {
    notify(error);
  } finally {
    savingRoles.value = false;
  }
}

function permissionLabel(key: string): string {
  return catalog.value.find((p) => p.key === key)?.description ?? key;
}

/** Garde-fou sur soi : bloqué, confirmé en nommant la conséquence, ou direct. */
function saveRoles(): void {
  if (!user.value || !rolesDirty.value || savingRoles.value) return;
  const check = guard.value;
  if (check.kind === 'blocked') return;
  if (check.kind === 'confirm') {
    const lost = check.lost.map(permissionLabel);
    confirm.require({
      header: t('users.self.confirmTitle'),
      message: lost.length
        ? t('users.self.confirmLoss', { count: lost.length, list: lost.slice(0, 6).join(' · ') })
        : t('users.self.confirmNoLoss'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: t('users.self.confirmAccept'),
      rejectLabel: t('common.cancel'),
      acceptClass: lost.length ? 'p-button-danger' : undefined,
      accept: () => void persistRoles(),
    });
    return;
  }
  void persistRoles();
}

// ─────────────────────────── Statut ───────────────────────────

const statusBusy = ref(false);
function askStatus(): void {
  const current = user.value;
  if (!current || isSelf.value || !canManage.value) return;
  const next = current.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
  confirm.require({
    header: t(`users.status.${next}.title`),
    message: t(`users.status.${next}.message`, { name: name.value }),
    icon: next === 'SUSPENDED' ? 'pi pi-ban' : 'pi pi-check-circle',
    acceptLabel: t(`users.status.${next}.accept`),
    rejectLabel: t('common.cancel'),
    acceptClass: next === 'SUSPENDED' ? 'p-button-danger' : undefined,
    accept: async () => {
      statusBusy.value = true;
      try {
        apply(await usersApi.setStatus(current.id, next));
        toast.add({ severity: 'success', summary: t(`users.status.${next}.done`), life: 4000 });
      } catch (error) {
        notify(error);
      } finally {
        statusBusy.value = false;
      }
    },
  });
}

// ─────────────────────────── Sessions ───────────────────────────

const sessionBusy = ref(false);
function askRevoke(): void {
  const current = user.value;
  if (!current) return;
  confirm.require({
    header: t('users.sessions.revokeTitle'),
    message: t('users.sessions.revokeMessage', { name: name.value, count: current.activeSessions }),
    icon: 'pi pi-sign-out',
    acceptLabel: t('users.effect.revoke'),
    rejectLabel: t('common.cancel'),
    accept: async () => {
      sessionBusy.value = true;
      try {
        const { revoked } = await usersApi.revokeSessions(current.id);
        pending.value = false;
        toast.add({
          severity: 'success',
          summary: t('users.sessions.revoked', revoked),
          life: 5000,
        });
        await load();
      } catch (error) {
        notify(error);
      } finally {
        sessionBusy.value = false;
      }
    },
  });
}

/** Sur soi : renouveler SON jeton applique tout de suite ses nouveaux droits. */
async function refreshSelf(): Promise<void> {
  sessionBusy.value = true;
  try {
    await auth.refresh();
    pending.value = false;
    toast.add({ severity: 'success', summary: t('users.effect.appliedSelf'), life: 4000 });
  } catch (error) {
    notify(error);
  } finally {
    sessionBusy.value = false;
  }
}

// ─────────────────────────── Profil ───────────────────────────

const profile = reactive({
  firstName: '',
  lastName: '',
  phoneE164: '',
  countryCode: null as string | null,
});
const profileBusy = ref(false);
const profileDirty = computed(() => {
  const u = user.value;
  if (!u) return false;
  return (
    profile.firstName.trim() !== (u.firstName ?? '') ||
    profile.lastName.trim() !== (u.lastName ?? '') ||
    profile.phoneE164.trim() !== (u.phoneE164 ?? '') ||
    profile.countryCode !== u.countryCode
  );
});
async function saveProfile(): Promise<void> {
  if (!user.value || !profileDirty.value || profileBusy.value) return;
  profileBusy.value = true;
  try {
    apply(
      await usersApi.update(user.value.id, {
        firstName: profile.firstName.trim() || null,
        lastName: profile.lastName.trim() || null,
        phoneE164: profile.phoneE164.trim() || null,
        countryCode: profile.countryCode,
      }),
    );
    pending.value = true;
    toast.add({ severity: 'success', summary: t('users.detail.profileSaved'), life: 4000 });
  } catch (error) {
    notify(error);
  } finally {
    profileBusy.value = false;
  }
}

// ─────────────────────────── Périmètre pays ───────────────────────────

const scope = reactive({ allCountries: false, countryScope: [] as string[] });
const scopeBusy = ref(false);
const scopeDirty = computed(() => {
  const u = user.value;
  if (!u) return false;
  const a = diffKeys(u.countryScope, scope.countryScope);
  return scope.allCountries !== u.allCountries || a.added.length + a.removed.length > 0;
});
const countryOptions = computed(() =>
  countries.value.map((c) => ({
    value: c.countryCode,
    label: `${flagOf(c.countryCode)} ${countryName(c.countryCode)}`,
  })),
);
async function saveScope(): Promise<void> {
  if (!user.value || !scopeDirty.value || scopeBusy.value) return;
  scopeBusy.value = true;
  try {
    apply(
      await usersApi.setCountries(user.value.id, {
        allCountries: scope.allCountries,
        countryScope: [...scope.countryScope],
      }),
    );
    pending.value = true;
    toast.add({ severity: 'success', summary: t('users.countries.saved'), life: 4000 });
  } catch (error) {
    notify(error);
  } finally {
    scopeBusy.value = false;
  }
}

// ─────────────────────────── Permissions effectives ───────────────────────────

const effectiveByResource = computed(() => {
  const groups = new Map<string, PermissionView[]>();
  for (const key of user.value?.effectivePermissions ?? []) {
    const permission = catalog.value.find((p) => p.key === key) ?? {
      key,
      resource: key.split(':')[0] ?? key,
      action: key,
      description: null,
      grantable: false,
    };
    groups.set(permission.resource, [...(groups.get(permission.resource) ?? []), permission]);
  }
  return [...groups.entries()];
});
const resourceLabel = (resource: string) =>
  te(`users.resources.${resource}`) ? t(`users.resources.${resource}`) : resource;

const blockerText = computed(() => {
  const reason = user.value?.manageable.reason;
  return reason ? t(`users.blockers.${reason}`) : null;
});
</script>

<template>
  <div class="user-detail">
    <RouterLink
      :to="{ name: 'users' }"
      class="mb-3 inline-flex items-center gap-2 text-sm text-surface-500 hover:text-primary"
    >
      <i class="pi pi-arrow-left" aria-hidden="true" />
      {{ t('users.detail.back') }}
    </RouterLink>

    <div v-if="loading && !user" class="flex min-h-64 items-center justify-center">
      <ProgressSpinner style="width: 2.5rem; height: 2.5rem" stroke-width="4" />
    </div>

    <Message v-else-if="loadError" severity="error" :closable="false" data-testid="user-load-error">
      {{ messageFor(loadError) }}
    </Message>

    <template v-else-if="user">
      <!-- En-tête -->
      <header class="hero">
        <span class="hero-avatar" aria-hidden="true">{{ initials(user) }}</span>
        <div class="min-w-0 flex-1">
          <h1 class="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {{ name }}
            <span v-if="user.isSelf" class="self-badge" data-testid="self-badge">{{
              t('users.you')
            }}</span>
            <UserStatusTag :status="user.status" />
          </h1>
          <p class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-surface-500">
            <span v-if="user.email"
              ><i class="pi pi-envelope mr-1" aria-hidden="true" />{{ user.email }}</span
            >
            <span v-if="user.phoneE164"
              ><i class="pi pi-phone mr-1" aria-hidden="true" />{{ user.phoneE164 }}</span
            >
            <span>
              <i class="pi pi-sign-in mr-1" aria-hidden="true" />
              {{
                user.lastLoginAt
                  ? t('users.detail.lastLogin', { date: d(new Date(user.lastLoginAt), 'long') })
                  : t('users.list.neverLoggedIn')
              }}
            </span>
          </p>
        </div>
        <Button
          v-if="!user.isSelf"
          :label="
            user.status === 'SUSPENDED'
              ? t('users.status.ACTIVE.accept')
              : t('users.status.SUSPENDED.accept')
          "
          :icon="user.status === 'SUSPENDED' ? 'pi pi-check-circle' : 'pi pi-ban'"
          :severity="user.status === 'SUSPENDED' ? 'success' : 'danger'"
          outlined
          :disabled="!canManage"
          :loading="statusBusy"
          data-testid="status-toggle"
          @click="askStatus"
        />
      </header>

      <Message
        v-if="blockerText"
        severity="info"
        :closable="false"
        class="mb-4"
        data-testid="manage-blocker"
      >
        {{ blockerText }}
      </Message>

      <!-- LE message du ticket : effet au prochain jeton. -->
      <TokenEffectNotice
        class="mb-5"
        :pending="pending"
        :is-self="user.isSelf"
        :who="name"
        :sessions="user.activeSessions"
        :busy="sessionBusy"
        :can-act="user.isSelf || canManage"
        @revoke="askRevoke"
        @refresh-self="refreshSelf"
      />

      <div class="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <main class="flex min-w-0 flex-col gap-5">
          <!-- Rôles -->
          <section class="card" data-testid="roles-panel">
            <div class="card-head">
              <h2 class="card-title">
                <i class="pi pi-shield" aria-hidden="true" />{{ t('users.fields.roles') }}
              </h2>
              <Button
                :label="t('users.detail.saveRoles')"
                icon="pi pi-check"
                size="small"
                :disabled="!rolesDirty || guard.kind === 'blocked'"
                :loading="savingRoles"
                data-testid="save-roles"
                @click="saveRoles"
              />
            </div>
            <Message
              v-if="guard.kind === 'blocked'"
              severity="warn"
              :closable="false"
              class="mb-3"
              data-testid="self-blocked"
            >
              {{ t('users.self.blocked') }}
            </Message>
            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
              <button
                v-for="role in roles"
                :key="role.id"
                type="button"
                class="role-pick"
                :class="{ 'role-pick--on': selection.includes(role.key) }"
                :aria-pressed="selection.includes(role.key)"
                :disabled="roleDisabled(role)"
                :title="role.assignable ? undefined : t('users.roles.notAssignable')"
                :data-testid="`role-${role.key}`"
                @click="toggleRole(role)"
              >
                <span class="flex min-w-0 flex-col items-start text-left">
                  <span class="truncate font-medium">{{ role.name }}</span>
                  <span class="text-xs text-surface-500">
                    {{
                      t('users.roles.permissionCount', {
                        count: role.permissions.length,
                        total: catalog.length,
                      })
                    }}
                  </span>
                </span>
                <i
                  :class="
                    !role.assignable
                      ? 'pi pi-lock'
                      : selection.includes(role.key)
                        ? 'pi pi-check-circle'
                        : 'pi pi-circle'
                  "
                  aria-hidden="true"
                />
              </button>
            </div>
          </section>

          <!-- Permissions effectives -->
          <section class="card" data-testid="effective-permissions">
            <h2 class="card-title mb-1">
              <i class="pi pi-key" aria-hidden="true" />{{ t('users.detail.effective') }}
            </h2>
            <p class="mb-3 text-xs text-surface-500">{{ t('users.detail.effectiveHint') }}</p>
            <p v-if="!effectiveByResource.length" class="text-sm text-surface-500">
              {{ t('users.detail.noPermission') }}
            </p>
            <dl v-else class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div
                v-for="[resource, permissions] in effectiveByResource"
                :key="resource"
                class="perm-group"
              >
                <dt class="mb-1 text-xs font-semibold uppercase tracking-wide text-surface-500">
                  {{ resourceLabel(resource) }}
                </dt>
                <dd class="flex flex-col gap-1">
                  <span
                    v-for="p in permissions"
                    :key="p.key"
                    class="flex items-start gap-2 text-sm"
                    :title="p.key"
                  >
                    <i
                      class="pi pi-check mt-1 text-[0.65rem] text-emerald-600"
                      aria-hidden="true"
                    />
                    {{ p.description ?? p.key }}
                  </span>
                </dd>
              </div>
            </dl>
          </section>
        </main>

        <aside class="flex flex-col gap-5">
          <!-- Périmètre pays -->
          <section class="card" data-testid="countries-panel">
            <h2 class="card-title mb-3">
              <i class="pi pi-globe" aria-hidden="true" />{{ t('users.countries.title') }}
            </h2>
            <p class="mb-3 text-sm">
              <template v-if="user.effectiveCountries === null">{{
                t('users.countries.effectiveAll')
              }}</template>
              <template v-else-if="user.effectiveCountries.length">
                {{ t('users.countries.effective') }}
                <strong>{{
                  user.effectiveCountries.map((c) => `${flagOf(c)} ${countryName(c)}`).join(', ')
                }}</strong>
              </template>
              <span v-else class="text-red-600">{{ t('users.countries.effectiveNone') }}</span>
            </p>
            <template v-if="user.manageable.canEditCountries">
              <label class="mb-3 flex items-center gap-2 text-sm">
                <ToggleSwitch v-model="scope.allCountries" data-testid="all-countries" />
                {{ t('users.countries.allToggle') }}
              </label>
              <div v-if="!scope.allCountries" class="field mb-3">
                <label for="extra-countries">{{ t('users.countries.extra') }}</label>
                <MultiSelect
                  v-model="scope.countryScope"
                  input-id="extra-countries"
                  :options="countryOptions.filter((o) => o.value !== user?.countryCode)"
                  option-label="label"
                  option-value="value"
                  display="chip"
                  :placeholder="t('users.countries.extraPlaceholder')"
                  fluid
                />
              </div>
              <Button
                :label="t('users.countries.save')"
                icon="pi pi-check"
                size="small"
                :disabled="!scopeDirty"
                :loading="scopeBusy"
                data-testid="save-countries"
                @click="saveScope"
              />
            </template>
            <p v-else class="text-xs text-surface-500" data-testid="countries-readonly">
              <i class="pi pi-lock mr-1" aria-hidden="true" />{{ t('users.countries.superOnly') }}
            </p>
          </section>

          <!-- Profil -->
          <section class="card">
            <h2 class="card-title mb-3">
              <i class="pi pi-id-card" aria-hidden="true" />{{ t('users.detail.profile') }}
            </h2>
            <form class="flex flex-col gap-3" novalidate @submit.prevent="saveProfile">
              <div class="grid grid-cols-2 gap-2">
                <div class="field">
                  <label for="p-first">{{ t('users.fields.firstName') }}</label>
                  <InputText
                    id="p-first"
                    v-model="profile.firstName"
                    :disabled="!canManage"
                    maxlength="80"
                    fluid
                  />
                </div>
                <div class="field">
                  <label for="p-last">{{ t('users.fields.lastName') }}</label>
                  <InputText
                    id="p-last"
                    v-model="profile.lastName"
                    :disabled="!canManage"
                    maxlength="80"
                    fluid
                  />
                </div>
              </div>
              <div class="field">
                <label for="p-phone">{{ t('users.fields.phone') }}</label>
                <InputText
                  id="p-phone"
                  v-model="profile.phoneE164"
                  :disabled="!canManage"
                  inputmode="tel"
                  fluid
                />
              </div>
              <div class="field">
                <label for="p-country">{{ t('users.fields.homeCountry') }}</label>
                <Select
                  v-model="profile.countryCode"
                  input-id="p-country"
                  :options="countryOptions"
                  option-label="label"
                  option-value="value"
                  :disabled="!canManage"
                  show-clear
                  fluid
                />
              </div>
              <p class="text-xs text-surface-500">
                <i class="pi pi-info-circle mr-1" aria-hidden="true" />{{
                  t('users.detail.passwordless')
                }}
              </p>
              <Button
                type="submit"
                :label="t('common.save')"
                icon="pi pi-check"
                size="small"
                :disabled="!canManage || !profileDirty"
                :loading="profileBusy"
                class="self-start"
              />
            </form>
          </section>

          <section class="card text-sm">
            <h2 class="card-title mb-2">
              <i class="pi pi-desktop" aria-hidden="true" />{{ t('users.sessions.title') }}
            </h2>
            <p>{{ t('users.sessions.active', user.activeSessions) }}</p>
            <p class="mt-1 text-xs text-surface-500">
              {{ t('users.detail.createdAt', { date: d(new Date(user.createdAt), 'long') }) }}
            </p>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hero {
  @apply mb-4 flex flex-wrap items-center gap-4 rounded-2xl border border-surface-200 bg-surface-0 p-5 dark:border-surface-800 dark:bg-surface-900;
}
.hero-avatar {
  @apply inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 text-lg font-bold text-white shadow-sm;
}
.self-badge {
  @apply rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/50 dark:text-amber-200;
}
.card {
  @apply rounded-xl border border-surface-200 bg-surface-0 p-4 dark:border-surface-800 dark:bg-surface-900;
}
.card-head {
  @apply mb-3 flex items-center justify-between gap-3;
}
.card-title {
  @apply flex items-center gap-2 text-sm font-semibold;
}
.card-title > i {
  @apply text-surface-400;
}
.field {
  @apply flex flex-col gap-1;
}
.field label {
  @apply text-sm font-medium;
}
.perm-group {
  @apply rounded-lg bg-surface-50 p-3 dark:bg-surface-800/50;
}
.role-pick {
  @apply flex items-center justify-between gap-3 rounded-lg border border-surface-200 px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-surface-700;
  transition:
    border-color var(--duration-popover) ease,
    background-color var(--duration-popover) ease,
    transform var(--duration-press) var(--ease-out);
}
.role-pick:active:not(:disabled) {
  transform: scale(0.98);
}
.role-pick--on {
  @apply border-primary-400 bg-primary-50/70 text-primary-800 dark:border-primary-700 dark:bg-primary-950/40 dark:text-primary-100;
}
@media (prefers-reduced-motion: reduce) {
  .role-pick:active:not(:disabled) {
    transform: none;
  }
}
</style>
