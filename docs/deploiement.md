# Déploiement du back-office (GitHub Actions → GHCR → CapRover)

| | |
|---|---|
| Image | `ghcr.io/<owner>/gaatshort-backoffice:<sha court>` (nginx, fichiers statiques) |
| Déclencheurs | push sur `develop` → **staging** ; tag `vX.Y.Z` → **production** (approbation) |
| Méthode | `caprover deploy --imageName` + jeton d'application |

Rien n'est reconstruit au déploiement : CapRover exécute l'image validée par la CI. L'URL de l'API
et le nom de l'application ne sont pas dans l'image : ce sont les variables `VITE_*` de l'app CapRover,
injectées dans `config.js` au démarrage par `docker/entrypoint.sh` (ADR 0002).

## Mise en place (une fois par environnement)

1. **DNS** : `backoffice.<domaine>` (A) → IP du serveur CapRover.
2. **CapRover** : créer l'app `gaatshort-backoffice` (staging : `gaatshort-backoffice-staging`), activer
   HTTPS ; variables `VITE_API_BASE_URL`, `VITE_APP_NAME`, `VITE_APP_ENV`. Générer l'App Token.
3. **Registre** : Cluster › Docker Registries › `ghcr.io` (jeton GitHub `read:packages`), commun à
   tous les dépôts.
4. **API** : ajouter l'origine du back-office à `CORS_ORIGINS` de l'API.
5. **GitHub** : environnements `staging` et `production` avec `CAPROVER_URL`, `CAPROVER_APP`,
   `PUBLIC_URL` (variables) et `CAPROVER_APP_TOKEN` (secret) ; reviewers obligatoires en production ;
   protection des branches `main` et `develop` (PR + statut `quality` requis).

## Retour arrière

Le back-office est sans état : redéployer l'image précédente
(`caprover deploy … --imageName ghcr.io/<owner>/gaatshort-backoffice:<sha précédent>`) ou relancer
le workflow `deploy` du tag précédent. Le back-office et l'API sont compatibles N-1 (API versionnée).
