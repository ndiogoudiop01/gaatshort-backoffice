# ADR 0003 — Où vivent les jetons

- **Statut** : accepté, avec une suite à donner côté backend
- **Date** : 2026-09

## Contexte

L'authentification est **sans mot de passe** : `POST /auth/verify` renvoie un
couple `{ accessToken, refreshToken }` **dans le corps de la réponse**.
`JwtStrategy` ne lit que l'en-tête `Authorization` ; le backend ne pose aucun
cookie et n'en lit aucun.

Le jeton d'accès vit 15 minutes. Le jeton de rafraîchissement est une chaîne
opaque de 48 octets, **tournée à chaque usage** : rejouer un jeton déjà consommé
révoque toute la famille de sessions.

## Décision

- **Jeton d'accès : en mémoire du module uniquement.** Il n'est jamais écrit sur
  disque. Le perdre au rechargement de l'onglet ne coûte qu'un rafraîchissement
  silencieux, exécuté par `auth.bootstrap()` avant le premier garde de route.
- **Jeton de rafraîchissement : `localStorage`.** Sans persistance, chaque
  rechargement de page déconnecterait l'utilisateur — inacceptable pour un outil
  de travail où l'on rouvre l'onglet vingt fois par jour.

Les lectures et écritures de `localStorage` sont enveloppées dans un `try/catch` :
en navigation privée, avec un stockage bloqué par la politique du navigateur ou
un quota plein, l'application dégrade en session non persistante au lieu de
refuser de démarrer.

## Ce que ça coûte, dit clairement

`localStorage` est lisible par tout script s'exécutant sur l'origine. **En cas de
XSS, le jeton de rafraîchissement est exfiltrable.** Ce n'est pas un détail, et
la formulation habituelle « c'est un compromis » n'en dispense pas.

Trois choses limitent les dégâts, et aucune ne les annule :

1. **La rotation côté backend.** L'attaquant et l'utilisateur légitime ne
   peuvent pas se servir du même jeton : le second usage révoque la famille.
   Un vol se solde donc par une déconnexion **visible**, plutôt que par un accès
   durable et discret.
2. **La CSP stricte** servie par nginx (`script-src 'self'`), qui rend
   l'injection de script nettement plus difficile.
3. **Le jeton d'accès n'est pas stocké** : un vol de `localStorage` seul ne donne
   pas d'accès immédiat, il faut d'abord échanger le jeton — ce qui déclenche la
   rotation, donc la trace.

## Alternative préférable, non disponible aujourd'hui

Un cookie `HttpOnly; Secure; SameSite=Strict` porté par le backend serait à
l'abri d'un XSS. C'est **la bonne direction**, et elle ne dépend pas du front :
il faut que `/auth/verify` et `/auth/refresh` posent le cookie et que
`JwtStrategy` sache le lire.

**Suite à donner** : ouvrir une demande côté `sooba-impact-backend` pour une
authentification par cookie sur les clients de première partie. Tant qu'elle
n'existe pas, cet ADR décrit ce que le backend permet, pas ce que l'on préfère.

## Conséquences

- La clé `ig.bo.refreshToken` est un détail d'implémentation : rien d'autre que
  `token-storage.ts` ne doit la connaître.
- `onSessionLost()` purge les deux jetons. Une session morte ne laisse aucune
  trace exploitable dans le navigateur.
- La CSP de `docker/nginx.conf` fait partie de cette décision : l'assouplir
  (`script-src 'unsafe-inline'`, par exemple) retirerait le deuxième des trois
  garde-fous ci-dessus. À ne pas faire sans revenir sur cet ADR.
