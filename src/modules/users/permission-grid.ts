import type { PermissionView } from './types';

/**
 * Mise en GRILLE du catalogue de permissions (BSG-12) — façon Odoo / Sage :
 * une ligne par ressource, une colonne par famille d'action.
 *
 * Ce fichier ne dit PAS quelles permissions un rôle possède (ça vient de
 * `GET /admin/roles`), ni quelles permissions existent (ça vient de
 * `GET /admin/permissions`). Il ne fait que RANGER ce que l'API renvoie :
 * « `pool:export` va dans la colonne Exporter ». Une permission ajoutée demain
 * côté backend apparaît donc d'elle-même — au pire dans la colonne « Autres ».
 *
 * Les cases sans permission (par exemple « Supprimer ») sont affichées vides
 * à dessein : l'API ne vérifie aucune permission de suppression, et cocher
 * une case qui ne protège rien serait mentir sur la sécurité.
 */

export const GRID_COLUMNS = [
  'read',
  'write',
  'validate',
  'assign',
  'export',
  'delete',
  'manage',
] as const;
export type GridColumn = (typeof GRID_COLUMNS)[number] | 'other';

/** Portée d'une variante (`application:read:any` → `any`). */
export type PermissionScope = 'own' | 'assigned' | 'any' | 'gateway' | null;

const VALIDATE_ACTIONS = ['transition', 'preselect', 'publish', 'review', 'complete'];
const WRITE_ACTIONS = ['write', 'schedule'];

export function columnOf(action: string): GridColumn {
  const [head = '', second = ''] = action.split(':');
  // `config:read` / `config:write` / `note:write` : le verbe est en second.
  const verb = head === 'config' || head === 'note' ? second : head;
  if (verb === 'read') return 'read';
  if (WRITE_ACTIONS.includes(verb)) return 'write';
  if (VALIDATE_ACTIONS.includes(verb)) return 'validate';
  if (verb === 'assign') return 'assign';
  if (verb === 'export') return 'export';
  if (verb === 'delete') return 'delete';
  if (verb === 'manage') return 'manage';
  return 'other';
}

export function scopeOf(action: string, siblings: number): PermissionScope {
  if (action.endsWith(':own')) return 'own';
  if (action.endsWith(':assigned')) return 'assigned';
  if (action.endsWith(':any')) return 'any';
  // Seule dans sa case, une permission « nue » n'a pas besoin d'étiquette.
  return siblings > 1 && !action.includes(':') ? 'gateway' : null;
}

/** Ordre de lecture des ressources ; les inconnues suivent, par ordre alphabétique. */
const RESOURCE_ORDER = [
  'application',
  'interview',
  'document',
  'pool',
  'partner',
  'activity',
  'simulation',
  'content',
  'news',
  'metrics',
  'user',
  'tenant',
];

const SCOPE_ORDER: Record<string, number> = { gateway: 0, any: 1, assigned: 2, own: 3 };

export interface GridCell {
  readonly column: GridColumn;
  readonly permissions: readonly { permission: PermissionView; scope: PermissionScope }[];
}

export interface GridRow {
  readonly resource: string;
  readonly cells: Readonly<Record<GridColumn, GridCell>>;
  readonly permissionKeys: readonly string[];
}

export interface PermissionGrid {
  readonly columns: readonly GridColumn[];
  readonly rows: readonly GridRow[];
}

export function buildGrid(catalog: readonly PermissionView[]): PermissionGrid {
  const resources = [...new Set(catalog.map((p) => p.resource))].sort((a, b) => {
    const ia = RESOURCE_ORDER.indexOf(a);
    const ib = RESOURCE_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  const hasOther = catalog.some((p) => columnOf(p.action) === 'other');
  const columns: GridColumn[] = [...GRID_COLUMNS, ...(hasOther ? (['other'] as const) : [])];

  const rows = resources.map((resource) => {
    const own = catalog.filter((p) => p.resource === resource);
    // Toutes les colonnes, même masquées (« Autres » vide) : `cells[col]` existe toujours.
    const cells = Object.fromEntries(
      ([...GRID_COLUMNS, 'other'] as GridColumn[]).map((column): [GridColumn, GridCell] => {
        const inCell = own.filter((p) => columnOf(p.action) === column);
        const permissions = inCell
          .map((permission) => ({ permission, scope: scopeOf(permission.action, inCell.length) }))
          .sort(
            (a, b) =>
              (SCOPE_ORDER[a.scope ?? ''] ?? 9) - (SCOPE_ORDER[b.scope ?? ''] ?? 9) ||
              a.permission.key.localeCompare(b.permission.key),
          );
        return [column, { column, permissions }];
      }),
    ) as unknown as Record<GridColumn, GridCell>;
    return { resource, cells, permissionKeys: own.map((p) => p.key) };
  });
  return { columns, rows };
}
