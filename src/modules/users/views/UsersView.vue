<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import PageHeader from '@shared/components/PageHeader.vue';
import { useApiError } from '@shared/composables/use-api-error';
import AccountList from '../components/AccountList.vue';
import CreateRoleDialog from '../components/CreateRoleDialog.vue';
import CreateUserDialog from '../components/CreateUserDialog.vue';
import RolesOverview from '../components/RolesOverview.vue';
import { usersApi } from '../users.api';
import type { PermissionView, RoleView, TenantCountry, UserDetail } from '../types';

/**
 * Utilisateurs (BSG-12) — onglets « Comptes » et « Profils & permissions ».
 * Rôles, catalogue et pays viennent de l'API ; seul l'onglet va dans l'adresse.
 */
const { t, n } = useI18n();
const router = useRouter();
const toast = useToast();
const { messageFor } = useApiError();

type Tab = 'comptes' | 'profils';
const tab = computed<Tab>(() =>
  router.currentRoute.value.query['onglet'] === 'profils' ? 'profils' : 'comptes',
);
function selectTab(next: Tab): void {
  void router.replace({ query: next === 'comptes' ? {} : { onglet: next } });
}

const roles = ref<RoleView[]>([]);
const catalog = ref<PermissionView[]>([]);
const countries = ref<TenantCountry[]>([]);
const loadError = ref<unknown>(null);

async function loadReference(): Promise<void> {
  loadError.value = null;
  try {
    [roles.value, catalog.value, countries.value] = await Promise.all([
      usersApi.roles(),
      usersApi.permissions(),
      usersApi.countries(),
    ]);
  } catch (error) {
    loadError.value = error;
  }
}
onMounted(loadReference);

const accounts = ref<InstanceType<typeof AccountList> | null>(null);
const createUserOpen = ref(false);
const createRoleOpen = ref(false);

function onUserCreated(user: UserDetail): void {
  toast.add({
    severity: 'success',
    summary: t('users.create.done'),
    detail: t('users.create.doneDetail'),
    life: 5000,
  });
  void router.push({ name: 'users-detail', params: { id: user.id } });
}
function onRoleCreated(role: RoleView): void {
  toast.add({ severity: 'success', summary: t('users.roleCreate.done'), life: 4000 });
  void router.push({ name: 'users-role', params: { id: role.id } });
}
function filterByRole(key: string): void {
  if (tab.value !== 'comptes') selectTab('comptes');
  accounts.value?.filterRole(key);
}
</script>

<template>
  <div>
    <PageHeader :title="t('users.title')" :subtitle="t('users.subtitle')">
      <template #actions>
        <Button
          v-if="tab === 'profils'"
          :label="t('users.roleCreate.title')"
          icon="pi pi-plus"
          outlined
          data-testid="role-create"
          @click="createRoleOpen = true"
        />
        <Button
          :label="t('users.create.title')"
          icon="pi pi-user-plus"
          data-testid="user-create"
          @click="createUserOpen = true"
        />
      </template>
    </PageHeader>

    <Message v-if="loadError" severity="error" :closable="false" class="mb-4">{{
      messageFor(loadError)
    }}</Message>

    <!-- Bande des profils : effectifs, et filtre rapide au clic. -->
    <section
      v-if="roles.length"
      class="mb-5 flex flex-wrap gap-2"
      :aria-label="t('users.roles.strip')"
    >
      <button
        v-for="role in roles"
        :key="role.id"
        type="button"
        class="strip-item"
        :data-testid="`strip-${role.key}`"
        @click="filterByRole(role.key)"
      >
        <span class="font-medium">{{ role.name }}</span>
        <span class="strip-count">{{ n(role.userCount) }}</span>
      </button>
    </section>

    <div class="tabs mb-4" role="tablist" :aria-label="t('users.title')">
      <button
        v-for="option in ['comptes', 'profils'] as const"
        :key="option"
        type="button"
        role="tab"
        class="tab"
        :class="{ 'tab--active': tab === option }"
        :aria-selected="tab === option"
        :data-testid="`tab-${option}`"
        @click="selectTab(option)"
      >
        <i :class="option === 'comptes' ? 'pi pi-users' : 'pi pi-shield'" aria-hidden="true" />
        {{ t(`users.tabs.${option}`) }}
      </button>
    </div>

    <AccountList v-if="tab === 'comptes'" ref="accounts" :roles="roles" :countries="countries" />
    <RolesOverview v-else :roles="roles" :catalog="catalog" />

    <CreateUserDialog
      v-model:visible="createUserOpen"
      :roles="roles"
      :countries="countries"
      @created="onUserCreated"
    />
    <CreateRoleDialog v-model:visible="createRoleOpen" :roles="roles" @created="onRoleCreated" />
  </div>
</template>

<style scoped>
.strip-item {
  @apply inline-flex items-center gap-2 rounded-full border border-surface-200 bg-surface-0 py-1 pl-3 pr-1 text-sm dark:border-surface-700 dark:bg-surface-900;
  transition:
    border-color var(--duration-popover) ease,
    transform var(--duration-press) var(--ease-out);
}
.strip-item:active {
  transform: scale(0.97);
}
@media (hover: hover) and (pointer: fine) {
  .strip-item:hover {
    @apply border-primary-300;
  }
}
.strip-count {
  @apply rounded-full bg-surface-100 px-2 py-0.5 text-xs tabular-nums dark:bg-surface-800;
}
.tabs {
  @apply flex gap-1 border-b border-surface-200 dark:border-surface-800;
}
.tab {
  @apply -mb-px inline-flex items-center gap-2 border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-surface-500;
  transition:
    color var(--duration-popover) ease,
    border-color var(--duration-popover) ease;
}
@media (hover: hover) and (pointer: fine) {
  .tab:hover {
    @apply text-surface-900 dark:text-surface-0;
  }
}
.tab--active {
  @apply border-primary-500 text-primary-700 dark:text-primary-300;
}
@media (prefers-reduced-motion: reduce) {
  .strip-item:active {
    transform: none;
  }
}
</style>
