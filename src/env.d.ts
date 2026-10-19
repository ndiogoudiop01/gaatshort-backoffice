/// <reference types="vite/client" />

/**
 * Les variables d'environnement sont typées ici pour que `import.meta.env`
 * cesse d'être un `Record<string, string>` sans garantie. Toute variable
 * ajoutée à `.env.example` doit apparaître ici — sinon elle sera lue par
 * `config.ts` sans que le compilateur puisse dire si elle existe.
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_DEV_TENANT_SLUG?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_ENV?: string;
  readonly VITE_SHOW_ERROR_DETAILS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Configuration injectée à l'EXÉCUTION par `docker/entrypoint.sh`, via
 * `/config.js` chargé avant le module applicatif.
 *
 * Vite remplace `import.meta.env.VITE_*` par des littéraux à la compilation :
 * une image construite pour la recette porte à jamais l'URL de la recette.
 * Promouvoir exactement l'artefact testé vers la production — ce qu'on veut —
 * demande donc que l'URL vienne du conteneur, pas du build.
 */
declare const __APP_CONFIG__: Record<string, string> | undefined;

interface Window {
  __APP_CONFIG__?: Record<string, string>;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
