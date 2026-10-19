<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ContextMenu from 'primevue/contextmenu';
import type { MenuItem } from 'primevue/menuitem';
import type { GridColumn, GridRow, PermissionGrid, PermissionScope } from '../permission-grid';
import type { PermissionView } from '../types';

/**
 * Matrice des permissions d'un profil — façon Odoo / Sage (BSG-12).
 *
 * Lignes = ressources, colonnes = familles d'action (Lire, Écrire, Valider…).
 * Le contenu (quelles permissions existent, lesquelles le profil possède,
 * lesquelles l'utilisateur peut toucher) vient ENTIÈREMENT de l'API ; ce
 * composant ne fait qu'afficher et éditer une liste de clés.
 *
 *  • clic sur une pastille : active / désactive la permission ;
 *  • clic droit (ou touche Menu, ou bouton « ⋯ ») sur une case, un en-tête de
 *    ligne ou de colonne : actions rapides (tout activer, lecture seule…) ;
 *  • 🔒 : permission que VOUS ne possédez pas — le serveur refuserait de la
 *    donner ou de la retirer (anti-escalade) ;
 *  • « — » : aucune permission de ce type n'existe côté serveur (ex. Supprimer).
 *
 * Les modifications non enregistrées sont marquées (vert = ajout, rouge =
 * retrait) par rapport à `baseline`, la version enregistrée.
 */
const props = defineProps<{
  grid: PermissionGrid;
  baseline: readonly string[];
  readonly?: boolean;
}>();
const model = defineModel<string[]>({ required: true });

const { t, te } = useI18n();

const selected = computed(() => new Set(model.value));
const saved = computed(() => new Set(props.baseline));

const resourceLabel = (resource: string) =>
  te(`users.resources.${resource}`) ? t(`users.resources.${resource}`) : resource;
const scopeLabel = (scope: PermissionScope) => (scope ? t(`users.scopes.${scope}`) : '');

function editable(permission: PermissionView): boolean {
  return !props.readonly && permission.grantable;
}

/**
 * Retraits PUIS ajouts, en UNE seule écriture du modèle : deux écritures
 * successives repartiraient toutes deux de l'ancienne valeur (le `v-model`
 * n'est propagé qu'au rendu suivant) et la première serait perdue.
 */
function change(remove: readonly string[], add: readonly string[]): void {
  const next = new Set(model.value);
  const touchable = (key: string) => {
    const permission = allPermissions.value.get(key);
    return !!permission && editable(permission);
  };
  for (const key of remove) if (touchable(key)) next.delete(key);
  for (const key of add) if (touchable(key)) next.add(key);
  model.value = [...next].sort();
}

function setKeys(keys: readonly string[], on: boolean): void {
  if (on) change([], keys);
  else change(keys, []);
}

function toggle(permission: PermissionView): void {
  if (!editable(permission)) return;
  setKeys([permission.key], !selected.value.has(permission.key));
}

const allPermissions = computed(
  () =>
    new Map(
      props.grid.rows.flatMap((row) =>
        Object.values(row.cells).flatMap((cell) =>
          cell.permissions.map((p) => [p.permission.key, p.permission] as const),
        ),
      ),
    ),
);

function stateOf(key: string): 'on' | 'off' | 'added' | 'removed' {
  const on = selected.value.has(key);
  const was = saved.value.has(key);
  if (on && !was) return 'added';
  if (!on && was) return 'removed';
  return on ? 'on' : 'off';
}

const rowCount = (row: GridRow) => row.permissionKeys.filter((k) => selected.value.has(k)).length;
const columnKeys = (column: GridColumn) =>
  props.grid.rows.flatMap((row) => row.cells[column].permissions.map((p) => p.permission.key));
const readKeys = (row: GridRow) => row.cells.read.permissions.map((p) => p.permission.key);

// ─────────────────────────── Menu contextuel ───────────────────────────

const menu = ref<InstanceType<typeof ContextMenu> | null>(null);
const menuItems = ref<MenuItem[]>([]);

function open(event: MouseEvent | KeyboardEvent, items: MenuItem[]): void {
  if (props.readonly) return;
  menuItems.value = items;
  menu.value?.show(event as MouseEvent);
}

function bulk(labelKey: string, icon: string, keys: readonly string[], on: boolean): MenuItem {
  const touchable = keys.filter((k) => {
    const p = allPermissions.value.get(k);
    return p && editable(p);
  });
  return {
    label: t(labelKey),
    icon,
    disabled: touchable.length === 0,
    command: () => setKeys(touchable, on),
  };
}

function cellMenu(event: MouseEvent | KeyboardEvent, row: GridRow, column: GridColumn): void {
  const permissions = row.cells[column].permissions;
  if (!permissions.length) return;
  const keys = permissions.map((p) => p.permission.key);
  open(event, [
    {
      label: `${resourceLabel(row.resource)} · ${t(`users.columns.${column}`)}`,
      disabled: true,
      class: 'pm-menu-title',
    },
    bulk('users.matrix.menu.enableCell', 'pi pi-check-square', keys, true),
    bulk('users.matrix.menu.disableCell', 'pi pi-stop', keys, false),
    { separator: true },
    ...permissions.map(({ permission, scope }) => ({
      label: `${scope ? `${scopeLabel(scope)} — ` : ''}${permission.description ?? permission.key}`,
      icon: selected.value.has(permission.key) ? 'pi pi-check' : 'pi pi-circle',
      disabled: !editable(permission),
      command: () => toggle(permission),
    })),
  ]);
}

function rowMenu(event: MouseEvent | KeyboardEvent, row: GridRow): void {
  open(event, [
    { label: resourceLabel(row.resource), disabled: true, class: 'pm-menu-title' },
    bulk('users.matrix.menu.enableRow', 'pi pi-check-square', row.permissionKeys, true),
    {
      label: t('users.matrix.menu.readOnly'),
      icon: 'pi pi-eye',
      command: () => change(row.permissionKeys, readKeys(row)),
      disabled: readKeys(row).length === 0,
    },
    bulk('users.matrix.menu.disableRow', 'pi pi-stop', row.permissionKeys, false),
  ]);
}

function columnMenu(event: MouseEvent | KeyboardEvent, column: GridColumn): void {
  const keys = columnKeys(column);
  if (!keys.length) return;
  open(event, [
    { label: t(`users.columns.${column}`), disabled: true, class: 'pm-menu-title' },
    bulk('users.matrix.menu.enableColumn', 'pi pi-check-square', keys, true),
    bulk('users.matrix.menu.disableColumn', 'pi pi-stop', keys, false),
  ]);
}

const COLUMN_ICON: Record<GridColumn, string> = {
  read: 'pi pi-eye',
  write: 'pi pi-pencil',
  validate: 'pi pi-check-circle',
  assign: 'pi pi-user-plus',
  export: 'pi pi-download',
  delete: 'pi pi-trash',
  manage: 'pi pi-cog',
  other: 'pi pi-ellipsis-h',
};

function chipTitle(permission: PermissionView): string {
  const parts = [permission.description ?? permission.key, permission.key];
  if (!permission.grantable) parts.push(t('users.matrix.notGrantable'));
  return parts.join(' — ');
}
</script>

<template>
  <div class="pm" data-testid="permission-matrix">
    <ul class="pm-legend" :aria-label="t('users.matrix.legendLabel')">
      <li>
        <span class="pm-dot pm-dot--on" aria-hidden="true" />{{ t('users.matrix.legend.on') }}
      </li>
      <li>
        <span class="pm-dot pm-dot--added" aria-hidden="true" />{{ t('users.matrix.legend.added') }}
      </li>
      <li>
        <span class="pm-dot pm-dot--removed" aria-hidden="true" />{{
          t('users.matrix.legend.removed')
        }}
      </li>
      <li>
        <i class="pi pi-lock text-[0.7rem]" aria-hidden="true" />{{
          t('users.matrix.legend.locked')
        }}
      </li>
      <li>
        <span class="font-mono" aria-hidden="true">—</span>{{ t('users.matrix.legend.none') }}
      </li>
      <li class="ml-auto hidden md:list-item">
        <i class="pi pi-mouse text-[0.7rem]" aria-hidden="true" />{{
          t('users.matrix.legend.hint')
        }}
      </li>
    </ul>

    <div class="pm-scroll">
      <table class="pm-table">
        <caption class="sr-only">
          {{
            t('users.matrix.caption')
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col" class="pm-corner">{{ t('users.matrix.resource') }}</th>
            <th
              v-for="column in grid.columns"
              :key="column"
              scope="col"
              class="pm-colhead"
              :data-testid="`col-${column}`"
              @contextmenu.prevent="columnMenu($event, column)"
            >
              <span class="inline-flex items-center gap-1.5">
                <i
                  :class="COLUMN_ICON[column]"
                  class="text-[0.75rem] text-surface-400"
                  aria-hidden="true"
                />
                {{ t(`users.columns.${column}`) }}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in grid.rows"
            :key="row.resource"
            class="pm-row"
            :data-testid="`row-${row.resource}`"
          >
            <th scope="row" class="pm-rowhead" @contextmenu.prevent="rowMenu($event, row)">
              <div class="flex items-center justify-between gap-2">
                <span class="min-w-0">
                  <span class="block truncate font-medium">{{ resourceLabel(row.resource) }}</span>
                  <span class="text-xs tabular-nums text-surface-500">
                    {{ rowCount(row) }} / {{ row.permissionKeys.length }}
                  </span>
                </span>
                <button
                  v-if="!readonly"
                  type="button"
                  class="pm-more"
                  :aria-label="
                    t('users.matrix.rowActions', { resource: resourceLabel(row.resource) })
                  "
                  :title="t('users.matrix.rowActions', { resource: resourceLabel(row.resource) })"
                  :data-testid="`row-menu-${row.resource}`"
                  @click="rowMenu($event, row)"
                >
                  <i class="pi pi-ellipsis-v text-xs" aria-hidden="true" />
                </button>
              </div>
            </th>
            <td
              v-for="column in grid.columns"
              :key="column"
              class="pm-cell"
              :class="{ 'pm-cell--empty': !row.cells[column].permissions.length }"
              :data-testid="`cell-${row.resource}-${column}`"
              @contextmenu.prevent="cellMenu($event, row, column)"
            >
              <span
                v-if="!row.cells[column].permissions.length"
                class="text-surface-300 dark:text-surface-600"
                :title="t('users.matrix.noneTitle')"
              >
                —
              </span>
              <div v-else class="flex flex-wrap justify-center gap-1">
                <button
                  v-for="{ permission, scope } in row.cells[column].permissions"
                  :key="permission.key"
                  type="button"
                  class="pm-chip"
                  :class="[`pm-chip--${stateOf(permission.key)}`, { 'pm-chip--scoped': !!scope }]"
                  :aria-pressed="selected.has(permission.key)"
                  :aria-label="chipTitle(permission)"
                  :title="chipTitle(permission)"
                  :disabled="!editable(permission)"
                  :data-testid="`perm-${permission.key}`"
                  :data-state="stateOf(permission.key)"
                  @click="toggle(permission)"
                  @keydown.shift.f10.prevent="cellMenu($event, row, column)"
                >
                  <i
                    v-if="!permission.grantable && !readonly"
                    class="pi pi-lock text-[0.6rem]"
                    aria-hidden="true"
                  />
                  <i
                    v-else
                    class="pm-check pi"
                    :class="selected.has(permission.key) ? 'pi-check' : 'pi-minus'"
                    aria-hidden="true"
                  />
                  <span v-if="scope">{{ scopeLabel(scope) }}</span>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ContextMenu ref="menu" :model="menuItems" data-testid="permission-menu" />
  </div>
</template>

<style scoped>
.pm-legend {
  @apply mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-surface-500;
}
.pm-legend li {
  @apply inline-flex items-center gap-1.5;
}
.pm-dot {
  @apply inline-block h-2.5 w-2.5 rounded-sm;
}
.pm-dot--on {
  @apply bg-primary-500;
}
.pm-dot--added {
  @apply bg-emerald-500;
}
.pm-dot--removed {
  @apply border border-red-400 bg-red-50 dark:bg-red-950/40;
}

.pm-scroll {
  @apply overflow-x-auto rounded-xl border border-surface-200 dark:border-surface-800;
}
.pm-table {
  @apply w-full min-w-[56rem] border-separate border-spacing-0 text-sm;
}
.pm-corner,
.pm-colhead {
  @apply sticky top-0 z-10 border-b border-surface-200 bg-surface-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-surface-600 dark:border-surface-800 dark:bg-surface-900 dark:text-surface-300;
}
.pm-corner {
  @apply left-0 z-20 text-left;
}
.pm-colhead {
  @apply cursor-context-menu select-none text-center;
}
.pm-rowhead {
  @apply sticky left-0 z-[5] w-52 border-b border-r border-surface-100 bg-surface-0 px-3 py-2 text-left font-normal dark:border-surface-800 dark:bg-surface-900;
}
.pm-cell {
  @apply border-b border-surface-100 px-2 py-2 text-center align-middle dark:border-surface-800;
  transition: background-color var(--duration-press) ease;
}
@media (hover: hover) and (pointer: fine) {
  .pm-row:hover .pm-cell,
  .pm-row:hover .pm-rowhead {
    @apply bg-surface-50 dark:bg-surface-800/50;
  }
}
.pm-cell--empty {
  @apply bg-surface-50/40 dark:bg-surface-950/30;
}
.pm-more {
  @apply inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-surface-400 hover:bg-surface-200 hover:text-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-400 dark:hover:bg-surface-700;
}

/* Pastille : case à cocher « Odoo », ou étiquette de portée (Tous / Assignés / Les siens). */
.pm-chip {
  @apply inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md border px-1.5 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-400 disabled:cursor-not-allowed;
  transition:
    background-color var(--duration-press) ease,
    border-color var(--duration-press) ease,
    color var(--duration-press) ease,
    transform var(--duration-press) var(--ease-out);
}
.pm-chip:active:not(:disabled) {
  transform: scale(0.94);
}
.pm-chip--scoped {
  @apply px-2;
}
.pm-chip--off {
  @apply border-surface-300 bg-surface-0 text-surface-400 dark:border-surface-600 dark:bg-surface-900;
}
.pm-chip--on {
  @apply border-primary-500 bg-primary-500 text-white;
}
.pm-chip--added {
  @apply border-emerald-500 bg-emerald-500 text-white ring-2 ring-emerald-200 dark:ring-emerald-900;
}
.pm-chip--removed {
  @apply border-dashed border-red-400 bg-red-50 text-red-600 dark:bg-red-950/40;
}
.pm-chip:disabled.pm-chip--off {
  @apply opacity-60;
}
.pm-chip:disabled.pm-chip--on {
  @apply opacity-80;
}
@media (hover: hover) and (pointer: fine) {
  .pm-chip--off:not(:disabled):hover {
    @apply border-primary-400 text-primary-600;
  }
}

:deep(.pm-menu-title) {
  @apply text-xs font-semibold uppercase tracking-wide opacity-70;
}

@media (prefers-reduced-motion: reduce) {
  .pm-chip:active:not(:disabled) {
    transform: none;
  }
}
</style>
