# ADR 0001 — Socle technique du back-office

- **Statut** : accepté
- **Date** : 2026-09
- **Contexte projet** : `sooba-impact-backoffice`, adossé à `sooba-impact-backend`

## Contexte

Le back-office doit couvrir treize domaines fonctionnels, dont plusieurs sont
essentiellement des **tableaux de données** : CRM candidats, vivier, leads
partenaires, pièces justificatives. Les volumes interdisent de tout charger
côté client — le backend pagine, trie et filtre, et le front doit s'y plier.

L'API est multi-tenant, sans mot de passe, avec une matrice de 28 permissions
et 5 rôles. Les écrans doivent refléter cette matrice sans jamais la
réinventer.

## Décision

### Vue 3 + Vite, en SPA

Pas de SSR. Le back-office est **entièrement derrière authentification** : il
n'y a ni référencement à gagner, ni premier rendu à optimiser pour un visiteur
anonyme. Un rendu serveur ajouterait un processus Node à exploiter et à
surveiller pour un bénéfice nul ici. La sortie est un lot de fichiers statiques
servis par nginx — rien à faire tourner, rien à mettre à jour côté serveur.

### PrimeVue 4 + Tailwind

PrimeVue apporte les composants coûteux à écrire correctement : `DataTable` en
mode paresseux, `MultiSelect`, `Dialog`, `Timeline`. Tailwind pilote la mise en
page. Le plugin `tailwindcss-primeui` expose les jetons du thème PrimeVue en
classes Tailwind, ce qui évite d'avoir deux palettes qui divergent.

L'ordre des couches CSS (`tailwind-base, primevue, tailwind-utilities`) est
déclaré **dans `style.css` avant tout import** et répété dans l'option
`cssLayer` de PrimeVue. Les deux doivent coïncider : sinon une classe utilitaire
perd contre le style d'un composant, et l'on se met à écrire des `!important`.

De même, `darkModeSelector` (PrimeVue) et `darkMode` (Tailwind) visent tous deux
`[data-theme="dark"]`. S'ils divergent, la moitié de l'interface bascule en
sombre et l'autre non.

### Versions retenues

| Paquet | Version | Pourquoi celle-ci |
| --- | --- | --- |
| Vue | 3.5 | Ligne stable |
| Vite | 6 | Ligne stable, compatible avec l'outillage Vue courant |
| vue-router | 4 | Ligne stable |
| Pinia | 3 | Ligne stable |
| TypeScript | 5.7 | **Même ligne que le backend** |
| ESLint | 9 | **Même ligne que le backend** (configuration à plat) |
| PrimeVue | 4 | Thème par jetons, requis par `tailwindcss-primeui` |

Le registre propose des majeures plus récentes pour plusieurs de ces paquets.
Elles n'ont pas été retenues, pour deux raisons qui se cumulent :

1. **Alignement avec le backend.** TypeScript et ESLint partagent une ligne avec
   `sooba-impact-backend`. Deux dépôts d'une même équipe qui divergent sur la
   version du compilateur, c'est une revue de code sur deux règles différentes.
2. **Honnêteté sur ce qui est vérifié.** Écrire un socle contre des API de
   majeures que l'on n'a pas exercées revient à livrer du code dont on espère
   qu'il compile. La montée se fera par MR dédiée, avec la CI comme juge.

## Conséquences

- Pas de rendu serveur : toute donnée passe par l'API, jamais par un état
  pré-rendu. C'est aussi ce qui garde le multi-tenant simple — un seul endroit
  résout le tenant, l'API.
- Le mode `lazy` de `DataTable` est **obligatoire** partout. Le mode par défaut
  trierait la page courante seulement : « tri par score décroissant » sur
  20 lignes parmi 4 000 donne une réponse fausse, en silence.
- La montée de version de Vite, vue-router, Pinia, TypeScript, PrimeVue et
  ESLint reste à faire, dans cet ordre de risque croissant.
