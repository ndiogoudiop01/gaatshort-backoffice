# Gaatshort — Back-office

Interface d'administration de la plateforme de mini-séries **Gaatshort** : espace **plateforme**
(marques, catalogue, licences, finances) et espace **marque** (vitrine, catalogue et prix, membres).
Vue 3 + Vite, PrimeVue 4 et Tailwind, multi-tenant, adossée à l'API `gaatshort-backend`.

> **État du dépôt : Phase 3 — socle.** Socle complet (authentification, RBAC, i18n, client HTTP,
> thème Gaatshort) et modules `users` et `tenants` repris du socle. Les écrans BO-02 à BO-17
> (04-UI-UX-Design §11) sont développés phase par phase (06-IMPLEMENTATION-PLAN). Les traductions
> des anciens modules SOOBA restant dans `src/core/i18n/locales/fr.ts` seront purgées en T1.9.

---

## Démarrer

```bash
corepack enable
pnpm install
cp .env.example .env     # ajuster VITE_DEV_TENANT_SLUG
pnpm dev                 # http://localhost:5173
```

L'API doit tourner sur `http://localhost:3000` (ou ajuster `VITE_API_PROXY_TARGET`).

> **Pourquoi passer par le proxy Vite plutôt qu'appeler l'API en direct ?**
> Parce que le front et l'API partagent alors la même origine, donc le résolveur
> de tenant par sous-domaine se comporte comme en production. En tapant l'API
> directement, l'hôte serait `localhost` — un hôte sans point, que le backend
> rejette volontairement comme sous-domaine. On retomberait silencieusement sur
> l'en-tête `x-tenant-id` et l'on ne testerait pas le chemin de production.

### Scripts

| Commande | Rôle |
| --- | --- |
| `pnpm dev` | Serveur de développement, rechargement à chaud |
| `pnpm build` | `vue-tsc` puis `vite build` — la compilation échoue sur une erreur de types |
| `pnpm typecheck` | Types seuls, tests compris |
| `pnpm lint` / `lint:ci` | ESLint, dont les **frontières de modules** |
| `pnpm format:check` | Prettier en lecture seule (le job `format` de la CI) |
| `pnpm test` / `test:ci` | Vitest (`--coverage` + rapport JUnit en CI) |

---

## Architecture

```
src/
  app/        Racine de composition : assemble routeur et carte des écrans
  core/       Socle : config, HTTP, session, RBAC, i18n, gardes
  shared/     Briques sans métier : mise en page, composables, écrans d'erreur
  modules/    Modules métier — un dossier par domaine
```

**Sens des dépendances : `app → modules → shared → core`. Jamais l'inverse.**

Cette règle n'est pas une convention affichée : elle est **vérifiée par ESLint**
(`eslint.config.js`), et le job `lint` de la CI est bloquant. Concrètement :

- un module ne peut pas importer les entrailles d'un autre module — le jour où
  `storefront` veut un badge de `catalog`, ce badge appartient à `shared` ;
- `core` ne connaît ni `modules`, ni `shared`, ni `app` ;
- `shared` ne connaît ni `modules`, ni `app`.

C'est pour cela que la composition du routeur vit dans `src/app/` et non dans
`src/core/router/` : le socle fournit les **gardes**, pas la **carte des écrans**.

### Le socle en six fichiers

| Fichier | Ce qu'il tient |
| --- | --- |
| `core/config/index.ts` | Contrat d'environnement validé par zod, **au démarrage** |
| `core/http/envelope.ts` | L'enveloppe `{ success, data, meta, requestId, timestamp }` |
| `core/http/api-error.ts` | Les 25 codes d'erreur du backend, normalisés |
| `core/http/client.ts` | Axios, jeton porteur, **rafraîchissement en vol unique** |
| `core/auth/auth.store.ts` | Session, restauration au rechargement |
| `core/router/guards.ts` | Session puis droits, dans l'ordre des gardes du backend |

---

## Ce que le back-office sait de l'API, et pourquoi c'est écrit quelque part

Le front encode plusieurs contraintes du backend. Chacune a coûté une
vérification dans le code source de l'API ; les redécouvrir en production serait
plus cher.

**Enveloppe.** Toutes les réponses sont enveloppées par un intercepteur global.
`client.ts` déballe ; le reste de l'application ne voit jamais cette structure.

**Un 404 est ambigu par conception.** Il signifie « n'existe pas » **ou**
« appartient à un autre tenant » — une 403 confirmerait l'existence de la
ressource. Aucun message de l'interface ne tranche entre les deux.

**`expiresIn` ment.** Le backend le renvoie codé en dur à `900`, sans le dériver
de `JWT_ACCESS_TTL`. On lit donc la revendication `exp` **dans le jeton**
(`decodeJwtExpiry`).

**Le jeton de rafraîchissement tourne à chaque appel, et rejouer un jeton
consommé révoque toute la famille.** Un écran qui lance quatre requêtes au
montage reçoit quatre 401 simultanés à l'expiration : sans sérialisation, trois
d'entre elles déconnecteraient l'utilisateur. D'où le **rafraîchissement en vol
unique** de `client.ts`, et le test qui le fige.

**`x-tenant-id` n'est envoyé que tant que personne n'est authentifié.** Le
backend compare la revendication `tid` du jeton au tenant résolu par l'en-tête,
refuse en cas de divergence et journalise une tentative d'intrusion.

**`sortBy` est validé par une liste blanche par route.** Une valeur hors liste
produit un 400 dont le message (« Requête invalide ») n'aiderait personne :
`useOffsetQuery` l'**omet** plutôt que de la transmettre. `perPage` est plafonné
à 100 pour la même raison.

**Les messages de validation vivent dans `error.details.issues`**, pas dans
`error.message`, qui vaut la chaîne fixe « Requête invalide ».

**`tenant:manage` n'est vérifiée nulle part.** Les routes tenants utilisent
`@RequireRoles('SUPER_ADMIN')`. Le menu teste donc le **rôle** — se fier à la
permission afficherait une entrée que l'API refuserait.

**`PARTNER` n'a aucune permission**, et **`ADMIN` n'a pas `application:read:own`**.
Ce ne sont pas des oublis côté backend : le premier explique pourquoi l'accueil
peut légitimement mener à « accès refusé », le second pourquoi les écrans
candidat sont fermés aux administrateurs.

---

## Autorisation côté interface

`useCan()`, la directive `v-can` et `meta.permissions` servent à **ne pas
afficher un bouton qui produirait un 403**. Ce n'est **pas** une sécurité : la
seule autorisation qui compte est celle du backend, et elle s'applique de toute
façon. Un front compromis ne doit rien pouvoir obtenir de plus qu'un `curl`.

La sémantique reproduit `PermissionsGuard` : **toutes** les permissions exigées,
**au moins un** des rôles exigés.

Les droits sont figés à l'émission du jeton — un changement de rôle en base ne
prend effet qu'après reconnexion. L'écran « accès refusé » le dit, plutôt que de
laisser l'utilisateur recharger la page en vain.

---

## Écrire un module

Les modules `users` et `tenants` servent de patron. Pour en écrire un nouveau :

1. créer `src/modules/<domaine>/` avec `routes.ts`, `types.ts`, `<domaine>.api.ts`,
   `views/`, `components/` ;
2. recopier dans `types.ts` les contrats du backend — statuts, listes blanches
   de tri, champs obligatoires — en citant le fichier source ;
3. retirer la ligne correspondante de `PLACEHOLDERS` dans `src/modules/routes.ts`
   et y brancher `...<domaine>Routes` ;
4. passer par `useOffsetQuery` pour toute liste, et par `useApiError` pour toute
   erreur affichée.

La navigation est **dérivée des routes** (`meta.nav`, `meta.permissions`,
`meta.roles`) : il n'y a pas de second fichier de menu à tenir à jour, et une
entrée ne peut apparaître que si la route existe *et* si l'utilisateur peut
l'ouvrir.

---

## Déploiement

Image en deux étages : compilation avec Node, service par nginx. L'image finale
ne contient ni Node, ni pnpm, ni les sources.

**Une seule image, promue telle quelle.** Vite fige les `VITE_*` à la
compilation ; une image construite pour la recette porterait à jamais l'URL de
la recette. L'entrypoint du conteneur écrit donc `/config.js` à partir de ses
variables d'environnement, et cette configuration a le dernier mot sur celle du
build. Voir [`docs/adr/0002-configuration-a-l-execution.md`](docs/adr/0002-configuration-a-l-execution.md).

```bash
docker compose up --build   # http://localhost:8080
```

Sonde de vivacité : `GET /healthz`. Chaîne CI/CD (GitHub Actions → GHCR → CapRover) et retour
arrière : [`docs/deploiement.md`](docs/deploiement.md). Les sourcemaps sont produites mais **non
servies** (`location ~ \.map$` → 404) : publiées, elles offriraient le code
source à qui le demande.

---

## Décisions d'architecture

| ADR | Sujet |
| --- | --- |
| [0001](docs/adr/0001-socle-front.md) | Vue 3 + Vite, PrimeVue 4 + Tailwind, versions retenues |
| [0002](docs/adr/0002-configuration-a-l-execution.md) | Configuration à l'exécution plutôt qu'au build |
| [0003](docs/adr/0003-stockage-des-jetons.md) | Où vivent les jetons, et ce que ça coûte |
| [0004](docs/adr/0004-frontieres-de-modules.md) | Frontières de modules, vérifiées par ESLint |
| — | Thème : jetons « Nuit de Dakar », thème clair (04-UI-UX-Design §2, `src/core/theme/preset.ts`) |
