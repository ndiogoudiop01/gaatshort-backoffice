import { describe, expect, it } from 'vitest';
import { buildGrid, columnOf, scopeOf } from '../permission-grid';
import {
  diffKeys,
  displayName,
  flagOf,
  initials,
  permissionsOfRoles,
  roleEditLocksMeOut,
  roleKeyFrom,
  selfRoleGuard,
} from '../users-rules';
import type { PermissionView, RoleView } from '../types';

const role = (key: string, permissions: string[]): RoleView => ({
  id: `r-${key}`,
  key,
  name: key,
  description: null,
  isSystem: true,
  locked: false,
  userCount: 1,
  permissions,
  assignable: true,
  updatedAt: '2026-09-01T00:00:00.000Z',
});

// Données « API » de test : aucune n'est lue depuis le module.
const ROLES = [
  role('ADMIN', ['user:manage', 'pool:read', 'pool:export']),
  role('MANAGER', ['pool:read']),
  role('AUDITOR', ['user:manage', 'metrics:read']),
];

describe('selfRoleGuard — garde-fou sur ses propres rôles', () => {
  it('bloque si l’on se retire user:manage', () => {
    expect(selfRoleGuard(true, ['ADMIN'], ['MANAGER'], ROLES)).toEqual({ kind: 'blocked' });
    expect(selfRoleGuard(true, ['ADMIN'], [], ROLES)).toEqual({ kind: 'blocked' });
  });

  it('demande une confirmation qui nomme les permissions perdues', () => {
    expect(selfRoleGuard(true, ['ADMIN'], ['AUDITOR'], ROLES)).toEqual({
      kind: 'confirm',
      lost: ['pool:export', 'pool:read'],
      gained: ['metrics:read'],
    });
  });

  it('rien à signaler pour quelqu’un d’autre ou sans changement', () => {
    expect(selfRoleGuard(false, ['ADMIN'], [], ROLES)).toEqual({ kind: 'ok' });
    expect(selfRoleGuard(true, ['ADMIN'], ['ADMIN'], ROLES)).toEqual({ kind: 'ok' });
  });
});

describe('roleEditLocksMeOut — modifier un profil que l’on possède', () => {
  it('vrai si plus aucun de mes profils n’accorde user:manage', () => {
    expect(roleEditLocksMeOut(ROLES[0]!, ['pool:read'], ['ADMIN'], ROLES)).toBe(true);
    // Un autre de mes profils garde user:manage : pas de verrouillage.
    expect(roleEditLocksMeOut(ROLES[0]!, ['pool:read'], ['ADMIN', 'AUDITOR'], ROLES)).toBe(false);
    // Profil que je n'ai pas : sans effet sur moi.
    expect(roleEditLocksMeOut(ROLES[1]!, [], ['ADMIN'], ROLES)).toBe(false);
  });
});

describe('outils', () => {
  it('permissions d’un jeu de rôles, d’après les données de l’API', () => {
    expect(permissionsOfRoles(['ADMIN', 'MANAGER'], ROLES)).toEqual([
      'pool:export',
      'pool:read',
      'user:manage',
    ]);
    expect(diffKeys(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] });
  });

  it('nom, initiales, drapeau, identifiant de profil', () => {
    const user = { firstName: 'Awa', lastName: 'Diop', email: 'a@b.c', phoneE164: null };
    expect(displayName(user)).toBe('Awa Diop');
    expect(displayName({ ...user, firstName: null, lastName: null })).toBe('a@b.c');
    expect(initials(user)).toBe('AD');
    expect(flagOf('SN')).toBe('🇸🇳');
    expect(flagOf(null)).toBe('🌍');
    expect(roleKeyFrom('Gestionnaire régional')).toBe('GESTIONNAIRE_REGIONAL');
    expect(roleKeyFrom('2 équipes')).toBe('EQUIPES');
  });
});

describe('permission-grid — rangement du catalogue en grille', () => {
  const p = (key: string, grantable = true): PermissionView => {
    const [resource = '', ...rest] = key.split(':');
    return { key, resource, action: rest.join(':'), description: null, grantable };
  };

  it('classe chaque action dans une famille', () => {
    expect(columnOf('read:any')).toBe('read');
    expect(columnOf('config:read')).toBe('read');
    expect(columnOf('config:write')).toBe('write');
    expect(columnOf('note:write')).toBe('write');
    expect(columnOf('schedule')).toBe('write');
    expect(columnOf('transition:assigned')).toBe('validate');
    expect(columnOf('review')).toBe('validate');
    expect(columnOf('export')).toBe('export');
    expect(columnOf('manage')).toBe('manage');
    expect(columnOf('frobnicate')).toBe('other');
  });

  it('étiquette les variantes de portée seulement quand la case en contient plusieurs', () => {
    expect(scopeOf('read:any', 3)).toBe('any');
    expect(scopeOf('read', 3)).toBe('gateway');
    expect(scopeOf('read', 1)).toBeNull();
  });

  it('une ligne par ressource, Supprimer vide, « Autres » seulement si nécessaire', () => {
    const grid = buildGrid([
      p('pool:read'),
      p('pool:export'),
      p('application:read'),
      p('application:read:any'),
    ]);
    expect(grid.rows.map((r) => r.resource)).toEqual(['application', 'pool']);
    expect(grid.columns).not.toContain('other');
    expect(grid.rows[1]!.cells.delete.permissions).toHaveLength(0);
    expect(grid.rows[0]!.cells.read.permissions.map((c) => c.scope)).toEqual(['gateway', 'any']);
    expect(buildGrid([p('pool:frobnicate')]).columns).toContain('other');
  });
});
