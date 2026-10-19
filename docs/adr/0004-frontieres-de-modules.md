# ADR 0004 — Frontières de modules, vérifiées et non affichées

- **Statut** : accepté
- **Date** : 2026-09

## Contexte

Le back-office couvre treize domaines. Un front modulaire qui ne se défend pas
finit toujours de la même façon : `applications` importe un composant de
`partners` « juste pour un badge », `core` importe un module pour construire ses
routes, et six mois plus tard plus rien ne peut évoluer séparément.

Le backend fait respecter ses frontières par ESLint **et** dependency-cruiser,
les deux bloquants en CI. Un document d'architecture, lui, ne bloque rien.

## Décision

Quatre couches, un seul sens de dépendance :

```
app → modules → shared → core
```

| Couche | Rôle | Ce qu'elle ne connaît pas |
| --- | --- | --- |
| `app` | Racine de composition : routeur, carte des écrans | — |
| `modules` | Domaines métier, un dossier chacun | les autres modules, `app` |
| `shared` | Briques sans métier | `modules`, `app` |
| `core` | Config, HTTP, session, RBAC, i18n, gardes | `modules`, `shared`, `app` |

Ces règles sont écrites dans `eslint.config.js` sous forme de
`no-restricted-imports`, avec un message qui dit **quoi faire à la place**, et le
job `lint` de la CI est bloquant.

### Conséquence la plus visible : `core` ne construit pas les routes

Une première version plaçait la carte des écrans dans `core/router/index.ts`.
Elle importait `@/modules/routes` et un composant de module — donc violait la
règle « le socle ne connaît aucun module » dès sa première ligne.

D'où `src/app/` : le socle fournit la **politique** (gardes, typage de `meta`),
`app` fournit l'**assemblage**. La règle est alors vraie plutôt qu'affichée.

Même raisonnement pour `AppLayout.vue`, qui utilise `useRouter()` au lieu
d'importer l'instance du routeur : une brique partagée n'a pas à connaître la
racine de composition — et elle reste montable dans un test avec un routeur
fabriqué pour l'occasion.

## Comment deux modules communiquent

Ils ne communiquent pas directement. Trois voies, dans cet ordre de préférence :

1. **`core`** — état partagé (session, droits) et contrats (enveloppe, erreurs).
2. **`shared`** — une brique utile à plusieurs modules et sans métier propre
   (`PageHeader`, `useOffsetQuery`, `useApiError`).
3. **L'API** — si deux modules ont besoin de la même donnée, c'est le backend
   qui la sert, pas l'un des deux qui la prête à l'autre.

Un composant que deux modules veulent partager appartient à `shared` : s'il ne
peut pas y aller parce qu'il porte du métier, c'est qu'il ne devait pas être
partagé.

## Conséquences

- Écrire un module, c'est ajouter un dossier et retirer une ligne de
  `PLACEHOLDERS` dans `src/modules/routes.ts`. Rien d'autre ne bouge.
- La navigation est dérivée des routes (`meta.nav`, `meta.permissions`,
  `meta.roles`) : il n'y a pas de second fichier de menu à tenir synchronisé,
  et donc pas de menu qui pointe vers une route supprimée.
- L'équivalent de `dependency-cruiser` côté front — un graphe de dépendances
  vérifié en CI — n'est pas en place. ESLint couvre les imports ; il ne dessine
  pas le graphe. À ajouter si les frontières se compliquent.
