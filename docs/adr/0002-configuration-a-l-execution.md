# ADR 0002 — Configuration à l'exécution plutôt qu'au build

- **Statut** : accepté
- **Date** : 2026-09

## Contexte

Vite remplace `import.meta.env.VITE_*` par des **littéraux** au moment de la
compilation. Le comportement naturel est donc : une image par environnement.

Cela pose un problème concret avec CapRover / Docker Swarm, où l'on veut
**promouvoir** l'artefact validé en recette vers la production. Avec une
configuration figée au build, l'image déployée en production n'est pas celle qui
a été testée — c'est une reconstruction, avec d'autres variables, à partir du
même code mais pas du même résultat. Toute la valeur de la recette repose sur
l'idée que l'on teste ce que l'on déploie.

Il fallait aussi éviter d'introduire un serveur applicatif : le conteneur ne sert
que des fichiers statiques, et cela doit le rester.

## Décision

`docker/entrypoint.sh` écrit `/usr/share/nginx/html/config.js` **à chaque
démarrage du conteneur**, à partir de ses variables d'environnement :

```js
window.__APP_CONFIG__ = {
  VITE_API_BASE_URL: '/api/v1',
  VITE_APP_ENV: 'production',
};
```

`index.html` le charge en script **classique** (pas `type="module"`) avant le
module applicatif : un module serait différé, et `config.ts` lirait `undefined`.

`core/config/index.ts` fusionne les deux sources — `import.meta.env` d'abord,
`window.__APP_CONFIG__` ensuite — puis valide l'ensemble avec zod. Les valeurs
vides sont écartées, pour qu'une variable non définie laisse le schéma appliquer
son défaut au lieu de valider une chaîne vide.

En développement, `/config.js` n'existe pas : `onerror="this.remove()"` absorbe
le 404 et `import.meta.env` suffit.

## Alternatives écartées

- **Une image par environnement.** Simple, mais on ne déploie plus l'artefact
  testé. C'est précisément le problème à résoudre.
- **Réécrire les fichiers compilés au démarrage** (`sed` sur les lots JS).
  Fonctionne, mais invalide les empreintes de contenu : les fichiers de
  `assets/` sont servis en `immutable`, et les modifier sous le même nom
  produirait des caches incohérents chez les utilisateurs.
- **Un point d'API `/config`.** Ajoute un aller-retour bloquant avant le premier
  rendu, et déplace le problème vers un service qu'il faut alors joindre avant
  de savoir où joindre les services.

## Conséquences

- `config.js` et `index.html` sont servis en `no-store` : les mettre en cache
  ferait pointer un conteneur redémarré vers l'API précédente.
- La liste des variables injectables est **close**, dans l'entrypoint. Ajouter
  une variable demande de la déclarer à trois endroits : `.env.example`,
  `env.d.ts` et `entrypoint.sh`. C'est le prix, assumé, d'une configuration qui
  échoue bruyamment au lieu de valoir `undefined` trois écrans plus loin.
- La configuration est lisible par n'importe quel visiteur du back-office.
  Rien de secret n'y est mis — et rien de secret ne doit jamais y être mis :
  un front n'a pas de secret, ce qu'il connaît, son utilisateur le connaît.
