import { z } from 'zod';

/**
 * Contrat d'environnement, validé AU DÉMARRAGE.
 *
 * Même parti pris que `src/config/env.schema.ts` côté backend : une variable
 * manquante ou mal écrite doit faire échouer le démarrage bruyamment, pas
 * produire un `undefined` qui se transformera en `"undefined"` dans une URL
 * trois écrans plus loin.
 */

const TRUTHY = ['true', '1', 'yes', 'on'];
const FALSY = ['false', '0', 'no', 'off'];

/**
 * `Boolean("false")` vaut `true` : toute chaîne non vide est truthy en
 * JavaScript, et un fichier `.env` ne fournit QUE des chaînes. Le backend
 * s'est fait prendre exactement là-dessus sur six variables (SIB-55), dont
 * une qui désactivait un repli de sécurité. On ne reproduit pas l'erreur :
 * les synonymes usuels sont acceptés, et toute valeur non reconnue fait
 * échouer la validation au lieu d'être silencieusement lue comme `false`.
 */
const bool = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    if (normalized === '') return undefined;
    if (TRUTHY.includes(normalized)) return true;
    if (FALSY.includes(normalized)) return false;
    return normalized; // laissé tel quel → z.boolean() rejette, bruyamment
  }, z.boolean().default(defaultValue));

const envSchema = z.object({
  VITE_API_BASE_URL: z.string().min(1).default('/api/v1'),
  VITE_DEV_TENANT_SLUG: z.string().optional(),
  VITE_APP_NAME: z.string().min(1).default('Gaatshort — Back-office'),
  VITE_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  VITE_SHOW_ERROR_DETAILS: bool(false),
});

/**
 * Source des variables : le build d'abord, le conteneur ensuite.
 *
 * Vite fige `import.meta.env.VITE_*` en littéraux à la compilation. Une image
 * construite avec l'URL de la recette la portera donc jusqu'en production —
 * sauf à reconstruire par environnement, c'est-à-dire à ne jamais déployer
 * exactement l'artefact qu'on a testé. `/config.js`, écrit par l'entrypoint du
 * conteneur, a le dernier mot : une seule image, promue telle quelle.
 *
 * Les valeurs vides sont écartées pour que le schéma applique ses défauts
 * plutôt que de valider une chaîne vide injectée par une variable non définie.
 */
function collectEnv(): Record<string, unknown> {
  const injected = typeof window === 'undefined' ? undefined : window.__APP_CONFIG__;

  const merged: Record<string, unknown> = { ...import.meta.env };
  for (const [key, value] of Object.entries(injected ?? {})) {
    if (typeof value === 'string' && value.trim() !== '') merged[key] = value;
  }
  return merged;
}

function readEnv() {
  const parsed = envSchema.safeParse(collectEnv());

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.')} : ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration d'environnement invalide :\n${issues}`);
  }

  return parsed.data;
}

const env = readEnv();

export const config = {
  app: {
    name: env.VITE_APP_NAME,
    env: env.VITE_APP_ENV,
    isProduction: env.VITE_APP_ENV === 'production',
  },

  api: {
    /** Préfixe ET version compris : `/api/v1`. */
    baseUrl: env.VITE_API_BASE_URL,

    /**
     * Routes hors préfixe et hors version côté backend
     * (`setGlobalPrefix(..., { exclude: [...] })` + `VERSION_NEUTRAL`).
     * Les appeler via `baseUrl` donnerait un 404.
     */
    unversionedPaths: {
      healthLive: '/health/live',
      healthReady: '/health/ready',
    },
  },

  tenancy: {
    /**
     * Nom exact de l'en-tête attendu par le backend (`TENANCY_HEADER_NAME`,
     * défaut `x-tenant-id`). Il est déjà dans `allowedHeaders` du CORS
     * backend : rien à configurer côté serveur.
     */
    headerName: 'x-tenant-id',
    /** Non défini en production : le sous-domaine puis le JWT font foi. */
    devSlug: env.VITE_DEV_TENANT_SLUG,
  },

  ui: {
    /**
     * Afficher `error.details` et `requestId` dans les toasts. Utile en
     * développement, à proscrire en production : `details` peut contenir les
     * champs d'une requête invalide.
     */
    showErrorDetails: env.VITE_SHOW_ERROR_DETAILS,
    defaultPageSize: 20,
    /** Le backend plafonne `perPage` à 100 : proposer plus produirait un 400. */
    pageSizeOptions: [10, 20, 50, 100],
  },
} as const;

export type AppConfig = typeof config;
