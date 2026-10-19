/**
 * Les 28 permissions du backend, recopiées depuis `prisma/seed/permissions.seed.ts`
 * — la source de vérité. (La matrice de `docs/03-security-rbac.md` est
 * incomplète : elle omet plusieurs permissions réellement attribuées.)
 *
 * Les recopier ici a un coût — il faudra les tenir à jour — et un bénéfice
 * qui le dépasse : une permission mal orthographiée dans un garde de route
 * devient une erreur de compilation, au lieu d'un écran discrètement
 * inaccessible que personne ne remarque avant la recette.
 */
export const PERMISSIONS = {
  APPLICATION_READ_OWN: 'application:read:own',
  APPLICATION_WRITE_OWN: 'application:write:own',
  APPLICATION_READ: 'application:read',
  APPLICATION_READ_ANY: 'application:read:any',
  APPLICATION_READ_ASSIGNED: 'application:read:assigned',
  APPLICATION_TRANSITION: 'application:transition',
  APPLICATION_TRANSITION_ANY: 'application:transition:any',
  APPLICATION_TRANSITION_ASSIGNED: 'application:transition:assigned',
  APPLICATION_PRESELECT: 'application:preselect',
  APPLICATION_ASSIGN: 'application:assign',
  APPLICATION_NOTE_WRITE: 'application:note:write',
  INTERVIEW_SCHEDULE: 'interview:schedule',
  INTERVIEW_COMPLETE: 'interview:complete',
  DOCUMENT_REVIEW: 'document:review',
  POOL_READ: 'pool:read',
  POOL_EXPORT: 'pool:export',
  PARTNER_READ: 'partner:read',
  PARTNER_WRITE: 'partner:write',
  PARTNER_TRANSITION: 'partner:transition',
  ACTIVITY_WRITE: 'activity:write',
  ACTIVITY_PUBLISH: 'activity:publish',
  SIMULATION_CONFIG_READ: 'simulation:config:read',
  SIMULATION_CONFIG_WRITE: 'simulation:config:write',
  CONTENT_WRITE: 'content:write',
  NEWS_WRITE: 'news:write',
  METRICS_READ: 'metrics:read',
  TENANT_MANAGE: 'tenant:manage',
  USER_MANAGE: 'user:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * ⚠ `tenant:manage` existe au catalogue mais n'est vérifiée par AUCUN
 * contrôleur : les deux routes d'administration des tenants utilisent
 * `@RequireRoles('SUPER_ADMIN')`. Se fier à cette permission côté front
 * afficherait un écran que l'API refuserait ensuite. Pour ces routes, on
 * teste le RÔLE.
 */
export const ROLE_ONLY_ROUTES = ['SUPER_ADMIN'] as const;
