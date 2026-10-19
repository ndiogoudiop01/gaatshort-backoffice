# ADR 0006 — Connexion automatique de développement (temporaire)

- **Statut** : **remplacé** (2026-09-23) — le back-office se connecte désormais
  par e-mail et mot de passe (`POST /auth/login`) ; `dev-auto-login.ts`, son
  test et les variables `VITE_DEV_AUTO_LOGIN_EMAIL` / `VITE_DEV_MAILPIT_URL`
  ont été supprimés côté front. Reste à retirer côté backend :
  `prisma/seed/demo-user.seed.ts` s'il ne sert plus à créer le compte admin.
- **Date** : 2026-09

## Contexte

Le back-office n'a aujourd'hui qu'un seul canal de connexion : un code à usage
unique (OTP) envoyé par e-mail ou SMS (`POST /auth/challenge` puis
`POST /auth/verify`). C'est un choix délibéré et réel côté backend — pas un
canal de test.

Le futur ticket de connexion e-mail/mot de passe n'est pas encore arrivé.
En attendant, on veut pouvoir ouvrir le back-office en développement sans
relire un code à chaque rechargement. Deux options ont été écartées d'emblée :

- **Affaiblir `sessionGuard`/`permissionsGuard`** (`src/core/router/guards.ts`) :
  romprait le critère d'acceptation du ticket Pilotage — « un MANAGER
  n'atterrit pas sur le dashboard et n'y accède pas » n'aurait plus de sens
  sans rôles/permissions réels.
- **Ajouter une route de contournement côté backend** (un jeton émis sans
  passer par l'OTP) : une porte dérobée d'authentification, même gardée par
  `NODE_ENV`, est le genre de code qui survit accidentellement à
  l'environnement pour lequel il a été écrit.

## Décision

Le VRAI flux OTP est rejoué automatiquement, uniquement en développement,
pour un compte de démonstration :

- **Backend** — `prisma/seed/demo-user.seed.ts` crée `admin@sooba.test`
  (rôle `ADMIN`, donc `metrics:read`), rejouable par `pnpm db:seed`. Sans lui,
  `AuthService.findOrCreateUser` aurait attribué le rôle `CANDIDATE` au
  premier login — inutile pour tester le back-office.
- **Front** — `src/core/auth/dev-auto-login.ts` (`devAutoLogin`), appelé
  depuis `auth.store.ts` → `bootstrap()` uniquement quand aucun jeton de
  rafraîchissement n'est stocké :
  1. `requestChallenge({ channel: 'EMAIL_OTP', identifier })` — le même appel
     que `LoginView.vue` ;
  2. lecture du code dans **Mailpit** (`GET /api/v1/messages` puis
     `GET /api/v1/message/:id`), l'attrape-e-mails déjà présent dans
     `docker-compose.yml` du backend (port 8025) — ce qu'un développeur ferait
     à la main est simplement automatisé ;
  3. `verifyChallenge(identifier, code)` — le même appel que `LoginView.vue`.

Trois gardes indépendantes empêchent toute activation hors développement :

1. `config.dev.autoLoginEmail` (`VITE_DEV_AUTO_LOGIN_EMAIL`) n'est défini que
   dans `.env`/`.env.example` de développement.
2. `devAutoLogin()` vérifie explicitement `!config.app.isProduction`.
3. `docker/entrypoint.sh` — qui écrit la configuration du conteneur déployé —
   ne fait PAS partie de la liste blanche de variables injectées : même si
   `VITE_DEV_AUTO_LOGIN_EMAIL` fuitait dans un environnement de build, aucun
   conteneur déployé ne la recevrait à l'exécution.

Toute erreur (Mailpit ou backend indisponibles, e-mail introuvable) est
avalée silencieusement : l'utilisateur retombe sur l'écran de connexion
normal, sans message d'erreur qui n'aurait de sens qu'en développement.

## Conséquences

- **Aucun garde de route, aucune vérification de permission n'est modifié.**
  La session obtenue porte les vrais rôles/permissions renvoyés par le
  backend — les critères d'acceptation RBAC du ticket Pilotage restent
  vérifiables tels quels.
- Les tests unitaires (`vitest.config.ts`) vident explicitement
  `VITE_DEV_AUTO_LOGIN_EMAIL` : un test ne doit jamais dépendre d'un réseau
  réel (Mailpit).
- **À supprimer intégralement** quand le login e-mail/mot de passe sera
  livré :
  - `src/core/auth/dev-auto-login.ts` et son test ;
  - l'appel dans `auth.store.ts` → `bootstrap()` ;
  - `VITE_DEV_AUTO_LOGIN_EMAIL` / `VITE_DEV_MAILPIT_URL` (`.env`,
    `.env.example`, `env.d.ts`, `config/index.ts`) ;
  - `config.dev` dans `core/config/index.ts` ;
  - `prisma/seed/demo-user.seed.ts` côté backend, si le nouveau flux fournit
    sa propre façon de créer un premier compte administrateur.
