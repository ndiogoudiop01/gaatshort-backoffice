/**
 * Le socle fournit la POLITIQUE de navigation (gardes, typage de `meta`), pas
 * la carte des écrans.
 *
 * L'assemblage — quelles routes existent, dans quelle coquille — vit dans
 * `src/app/`, la racine de composition. C'est ce qui permet à la règle
 * « le socle ne connaît aucun module métier » d'être vraie plutôt que
 * simplement affichée : un `@core/**` qui importerait `@modules/**` pour
 * construire ses routes la briserait dès la première ligne.
 */
export { sessionGuard, permissionsGuard, titleGuard } from './guards';
