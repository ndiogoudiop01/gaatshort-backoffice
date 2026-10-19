<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import { useAuthStore } from '@core/auth/auth.store';
import { config } from '@core/config';

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();

const sidebarOpen = ref(true);
const userMenu = ref<InstanceType<typeof Menu> | null>(null);

type NavSection = NonNullable<import('vue-router').RouteMeta['section']>;

/**
 * La navigation est DÉRIVÉE des routes, jamais écrite à part.
 *
 * Deux listes finissent toujours par diverger : on ajoute un écran, on oublie
 * l'entrée de menu, ou l'inverse — et un lien pointe vers une route supprimée.
 * En lisant `meta.nav` et `meta.permissions`, une entrée ne peut apparaître
 * que si la route existe ET si l'utilisateur peut l'ouvrir.
 */
const navItems = computed(() => {
  // `useRouter()` plutôt qu'un import du routeur : une brique partagée n'a pas
  // à connaître la racine de composition, et le composant reste montable dans
  // un test avec un routeur fabriqué pour l'occasion.
  const shell = router.getRoutes().filter((route) => route.meta.nav === true);

  return shell
    .filter((route) =>
      (route.meta.permissions ?? []).every((permission) => auth.permissions.has(permission)),
    )
    .filter((route) => {
      const roles = route.meta.roles ?? [];
      return roles.length === 0 || roles.some((role) => auth.roles.has(role));
    })
    .map((route) => ({
      name: String(route.name),
      label: t(route.meta.titleKey ?? String(route.name)),
      icon: route.meta.icon ?? 'pi pi-circle',
      section: (route.meta.section ?? 'pilotage') as NavSection,
    }));
});

const sections = computed(() => {
  const order: NavSection[] = ['pilotage', 'candidats', 'partenaires', 'contenu', 'plateforme'];
  return order
    .map((section) => ({
      key: section,
      label: t(`nav.sections.${section}`),
      items: navItems.value.filter((item) => item.section === section),
    }))
    .filter((group) => group.items.length > 0);
});

const userMenuItems = computed(() => [
  { label: t('auth.signOut'), icon: 'pi pi-sign-out', command: () => void signOut() },
]);

async function signOut(): Promise<void> {
  await auth.logout();
  await router.push({ name: 'login' });
}

const initials = computed(() => (auth.user?.email ?? '??').slice(0, 2).toUpperCase());
const primaryRole = computed(() => {
  const [role] = auth.roles;
  return role ? t(`roles.${role}`) : null;
});
</script>

<template>
  <div class="flex h-full">
    <aside
      class="flex flex-col border-r border-surface-200 bg-surface-0 transition-all dark:border-surface-800 dark:bg-surface-950"
      :class="sidebarOpen ? 'w-72' : 'w-[4.5rem]'"
    >
      <!-- Identité -->
      <div class="flex items-center gap-3 border-b border-surface-100 p-4 dark:border-surface-800">
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-contrast"
        >
          <i class="pi pi-bolt text-base" />
        </div>
        <div v-if="sidebarOpen" class="min-w-0">
          <p class="truncate text-sm font-bold leading-tight">{{ config.app.name }}</p>
          <p class="truncate text-[11px] font-semibold uppercase tracking-wider text-primary">
            {{ t('app.backoffice') }}
          </p>
        </div>
      </div>

      <nav class="flex-1 overflow-y-auto px-3 py-4" :aria-label="t('app.backoffice')">
        <div v-for="group in sections" :key="group.key" class="mb-5">
          <p
            v-if="sidebarOpen"
            class="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-surface-400"
          >
            {{ group.label }}
          </p>
          <RouterLink
            v-for="item in group.items"
            :key="item.name"
            :to="{ name: item.name }"
            class="mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-surface-600 transition-colors hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-800"
            active-class="!bg-primary-50 !text-primary-700 dark:!bg-primary-950/40 dark:!text-primary-300"
          >
            <i :class="item.icon" class="shrink-0 text-base" />
            <span v-if="sidebarOpen" class="truncate">{{ item.label }}</span>
          </RouterLink>
        </div>
      </nav>

      <!-- Identité de session -->
      <div class="border-t border-surface-100 p-3 dark:border-surface-800">
        <div v-if="sidebarOpen" class="flex items-center gap-2.5">
          <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-900 text-xs font-bold text-surface-0 dark:bg-surface-100 dark:text-surface-900"
          >
            {{ initials }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-semibold">{{ auth.user?.email ?? '—' }}</p>
            <p v-if="primaryRole" class="truncate text-[11px] text-primary">{{ primaryRole }}</p>
          </div>
          <Button
            text
            rounded
            size="small"
            icon="pi pi-sign-out"
            :aria-label="t('auth.signOut')"
            @click="signOut"
          />
        </div>
        <Button
          v-else
          text
          rounded
          icon="pi pi-sign-out"
          class="w-full"
          :aria-label="t('auth.signOut')"
          @click="signOut"
        />
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="flex h-14 items-center gap-3 border-b border-surface-200 bg-surface-0 px-4 dark:border-surface-800 dark:bg-surface-900"
      >
        <Button
          text
          rounded
          :icon="sidebarOpen ? 'pi pi-angle-double-left' : 'pi pi-angle-double-right'"
          :aria-label="t('common.close')"
          @click="sidebarOpen = !sidebarOpen"
        />

        <span class="flex-1 truncate text-sm text-surface-500">{{ config.app.name }}</span>

        <!-- Bandeau d'environnement : un back-office de recette et un back-office
             de production se ressemblent trop pour qu'on distingue l'un de l'autre
             sans indice visible. -->
        <span
          v-if="!config.app.isProduction"
          class="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800"
        >
          {{ config.app.env }}
        </span>

        <Button
          text
          rounded
          :label="initials"
          :aria-label="auth.user?.email ?? ''"
          @click="userMenu?.toggle($event)"
        />
        <Menu ref="userMenu" :model="userMenuItems" popup />
      </header>

      <main class="min-w-0 flex-1 overflow-y-auto p-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>
