/**
 * Les permissions du backend, recopiées depuis `prisma/seed/permissions.seed.ts`
 * (gaatshort-backend) — la source de vérité.
 *
 * Les recopier ici a un coût — il faudra les tenir à jour — et un bénéfice
 * qui le dépasse : une permission mal orthographiée dans un garde de route
 * devient une erreur de compilation, au lieu d'un écran discrètement
 * inaccessible que personne ne remarque avant la recette.
 */
export const PERMISSIONS = {
  CATALOG_READ: 'catalog:read',
  CATALOG_WRITE: 'catalog:write',
  CATALOG_PUBLISH: 'catalog:publish',
  MEDIA_UPLOAD: 'media:upload',
  LICENSE_READ: 'license:read',
  LICENSE_WRITE: 'license:write',
  STOREFRONT_WRITE: 'storefront:write',
  PACK_WRITE: 'pack:write',
  ORDER_READ: 'order:read',
  VIEWER_READ: 'viewer:read',
  WALLET_ADJUST: 'wallet:adjust',
  METRICS_READ: 'metrics:read',
  TENANT_MANAGE: 'tenant:manage',
  USER_MANAGE: 'user:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * ⚠ `tenant:manage` existe au catalogue mais n'est vérifiée par AUCUN
 * contrôleur : les routes d'administration des marques utilisent
 * `@RequireRoles('SUPER_ADMIN')`. Pour ces routes, on teste le RÔLE.
 */
export const ROLE_ONLY_ROUTES = ['SUPER_ADMIN'] as const;
