import type { RoleView, UserListItem } from './types';

/**
 * Règles d'ÉCRAN du module Utilisateurs (BSG-12) — fonctions pures.
 *
 * Elles servent à PRÉVENIR (désactiver, demander confirmation, expliquer).
 * Elles ne remplacent aucune règle serveur : le backend refuse de toute façon
 * (`SELF_LOCKOUT`, `ROLE_NOT_GRANTABLE`, `PERMISSION_NOT_GRANTABLE`…).
 * Les permissions d'un rôle viennent de `GET /admin/roles`, jamais d'une table locale.
 */

export const ADMIN_PERMISSION = 'user:manage';

export function displayName(
  user: Pick<UserListItem, 'firstName' | 'lastName' | 'email' | 'phoneE164'>,
): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.email || user.phoneE164 || '—';
}

export function initials(user: Pick<UserListItem, 'firstName' | 'lastName' | 'email'>): string {
  const parts = [user.firstName, user.lastName].filter((p): p is string => !!p?.trim());
  if (parts.length)
    return parts
      .map((p) => p.trim()[0]!.toUpperCase())
      .join('')
      .slice(0, 2);
  return (user.email?.[0] ?? '?').toUpperCase();
}

/** Union des permissions de rôles, D'APRÈS L'API (`RoleView.permissions`). */
export function permissionsOfRoles(
  roleKeys: readonly string[],
  roles: readonly RoleView[],
): string[] {
  return [
    ...new Set(roles.filter((r) => roleKeys.includes(r.key)).flatMap((r) => r.permissions)),
  ].sort();
}

export function diffKeys(before: readonly string[], after: readonly string[]) {
  const a = new Set(before);
  const b = new Set(after);
  return {
    added: after.filter((k) => !a.has(k)).sort(),
    removed: before.filter((k) => !b.has(k)).sort(),
  };
}

/**
 * Modifier SES PROPRES rôles.
 *  • `blocked` : on se retirerait `user:manage` — l'écran refuse (le serveur aussi) ;
 *  • `confirm` : autre changement sur soi — confirmation qui NOMME la conséquence ;
 *  • `ok`      : ce n'est pas soi, ou rien ne change.
 */
export type SelfRoleGuard =
  { kind: 'ok' } | { kind: 'blocked' } | { kind: 'confirm'; lost: string[]; gained: string[] };

export function selfRoleGuard(
  isSelf: boolean,
  currentKeys: readonly string[],
  nextKeys: readonly string[],
  roles: readonly RoleView[],
): SelfRoleGuard {
  if (!isSelf) return { kind: 'ok' };
  const before = permissionsOfRoles(currentKeys, roles);
  const after = permissionsOfRoles(nextKeys, roles);
  if (!after.includes(ADMIN_PERMISSION)) return { kind: 'blocked' };
  const { added, removed } = diffKeys(before, after);
  const rolesChanged = diffKeys(currentKeys, nextKeys);
  if (!rolesChanged.added.length && !rolesChanged.removed.length) return { kind: 'ok' };
  return { kind: 'confirm', lost: removed, gained: added };
}

/**
 * Modifier les permissions d'un RÔLE que l'on possède : se couperait-on
 * l'accès à cet écran ? (vrai si, après modification, aucun de SES rôles
 * n'accorde plus `user:manage`).
 */
export function roleEditLocksMeOut(
  role: Pick<RoleView, 'key'>,
  nextPermissions: readonly string[],
  myRoleKeys: readonly string[],
  roles: readonly RoleView[],
): boolean {
  if (!myRoleKeys.includes(role.key)) return false;
  return !roles
    .filter((r) => myRoleKeys.includes(r.key))
    .some((r) => (r.key === role.key ? nextPermissions : r.permissions).includes(ADMIN_PERMISSION));
}

// ─────────────────────────── Pays ───────────────────────────

/** 🇸🇳 depuis `SN` : deux indicateurs régionaux Unicode. */
export function flagOf(code: string | null): string {
  if (!code || !/^[A-Z]{2}$/.test(code)) return '🌍';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

let regionNames: Intl.DisplayNames | null = null;
export function countryName(code: string | null, locale = 'fr'): string {
  if (!code) return '—';
  try {
    regionNames ??= new Intl.DisplayNames([locale], { type: 'region' });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Clé de rôle proposée à partir d'un libellé : « Gestionnaire régional » → GESTIONNAIRE_REGIONAL. */
export function roleKeyFrom(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^A-Z]+/, '')
    .slice(0, 40);
}
