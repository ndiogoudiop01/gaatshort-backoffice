/**
 * Montants en UNITÉS MINEURES — lecture et saisie, sans perte de précision.
 *
 * L'unité mineure DÉPEND DE LA DEVISE : le franc CFA (XOF, XAF) et le franc
 * guinéen (GNF) n'ont pas de centimes (0 décimale), l'euro en a 2. C'est la
 * règle du backend (`Money.DECIMALS`, référentiel `currencies.decimals`), et
 * c'est ISO 4217 — qu'`Intl` connaît. Diviser « toujours par 100 » affiche
 * un apport de 5 000 000 FCFA comme 50 000 FCFA.
 *
 * Deux formes arrivent du réseau :
 *  • une CHAÎNE pour un `bigint` (ex. `contributionMinor` des candidatures) :
 *    `JSON.stringify` ne sait pas sérialiser un `bigint`, le backend le
 *    convertit. `Number("9007199254740993")` perdrait des unités : on passe
 *    par `BigInt`, jamais par `Number` ;
 *  • un NOMBRE entier (ex. montants des profils partenaires, validés
 *    `z.number().int()` côté backend).
 * Les deux sont acceptés ; le calcul se fait en `BigInt` dans tous les cas.
 */

export type MinorAmount = string | number | bigint;

/** Nombre de décimales de la devise selon ISO 4217 (XOF → 0, EUR → 2). */
export function currencyDigits(currency: string, locale = 'fr-FR'): number {
  try {
    return (
      new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    // Code devise invalide : on ne devine pas, on suppose 2 (cas le plus courant).
    return 2;
  }
}

/** Convertit en `bigint` sans jamais passer par un flottant ; `null` si illisible. */
export function toBigInt(value: MinorAmount | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? BigInt(value) : null;
  }
  const trimmed = value.trim();
  return /^-?\d+$/.test(trimmed) ? BigInt(trimmed) : null;
}

/**
 * Chaîne décimale EXACTE de la valeur en unités majeures
 * (`"123456"` en EUR → `"1234.56"`) — `Intl.NumberFormat.format` accepte une
 * chaîne décimale et la formate sans la convertir en flottant.
 */
export function minorToDecimalString(amount: bigint, digits: number): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  if (digits === 0) return `${negative ? '-' : ''}${abs}`;
  const factor = 10n ** BigInt(digits);
  const fraction = (abs % factor).toString().padStart(digits, '0');
  return `${negative ? '-' : ''}${abs / factor}.${fraction}`;
}

/**
 * Formate un montant en unités mineures dans sa devise.
 * Renvoie `'—'` pour une valeur absente ou illisible, plutôt qu'un « NaN ».
 */
export function formatMinorAmount(
  amount: MinorAmount | null | undefined,
  currency: string,
  locale = 'fr-FR',
): string {
  const minor = toBigInt(amount);
  if (minor === null) return '—';
  const digits = currencyDigits(currency, locale);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
      minorToDecimalString(minor, digits) as unknown as number,
    );
  } catch {
    return `${minorToDecimalString(minor, digits)} ${currency}`;
  }
}

/**
 * Saisie → unités mineures. L'utilisateur tape un montant en unités
 * MAJEURES (« 3 000 000 » FCFA, « 1 250,50 » €) ; on renvoie l'entier en
 * unités mineures, ou `null` si la saisie est invalide ou a trop de
 * décimales pour la devise (« 10,5 » FCFA n'existe pas).
 */
export function majorInputToMinor(input: string, currency: string): bigint | null {
  // `\s` couvre aussi les espaces insécables qu'insère Intl (U+00A0, U+202F).
  const normalized = input.replace(/\s/g, '').replace(',', '.');
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) return null;
  const [, sign, whole, fraction = ''] = match;
  const digits = currencyDigits(currency);
  if (fraction.length > digits) return null;
  const minor = BigInt(`${whole}${fraction.padEnd(digits, '0')}`);
  return sign === '-' ? -minor : minor;
}

/** Inverse de `majorInputToMinor`, pour préremplir un champ de saisie. */
export function minorToMajorInput(
  amount: MinorAmount | null | undefined,
  currency: string,
): string {
  const minor = toBigInt(amount);
  return minor === null ? '' : minorToDecimalString(minor, currencyDigits(currency));
}
