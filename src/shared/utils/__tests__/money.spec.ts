import { describe, expect, it } from 'vitest';
import {
  currencyDigits,
  formatMinorAmount,
  majorInputToMinor,
  minorToDecimalString,
  minorToMajorInput,
  toBigInt,
} from '../money';

/** Intl insère des espaces insécables (U+00A0 / U+202F) : on les normalise. */
const plain = (value: string) => value.replace(/\s/g, ' ');

describe('currencyDigits — l’unité mineure dépend de la devise', () => {
  it.each([
    ['XOF', 0],
    ['XAF', 0],
    ['GNF', 0],
    ['EUR', 2],
    ['USD', 2],
  ])('%s → %i décimale(s)', (currency, digits) => {
    expect(currencyDigits(currency)).toBe(digits);
  });
});

describe('formatMinorAmount', () => {
  it('formate un FCFA SANS diviser par 100 (0 décimale)', () => {
    expect(plain(formatMinorAmount('5000000', 'XOF'))).toBe('5 000 000 F CFA');
  });

  it('formate un euro en divisant par 100', () => {
    expect(plain(formatMinorAmount('123456', 'EUR'))).toBe('1 234,56 €');
  });

  it('ne perd aucune unité au-delà de Number.MAX_SAFE_INTEGER (bigint en chaîne)', () => {
    // 2^53 + 1 : `Number("9007199254740993")` vaut 9007199254740992.
    expect(plain(formatMinorAmount('9007199254740993', 'XOF'))).toBe('9 007 199 254 740 993 F CFA');
    expect(plain(formatMinorAmount('9007199254740993', 'EUR'))).toBe('90 071 992 547 409,93 €');
  });

  it('accepte aussi un entier JSON (montants des profils partenaires)', () => {
    expect(plain(formatMinorAmount(3_000_000, 'XOF'))).toBe('3 000 000 F CFA');
  });

  it.each([null, undefined, '', 'abc', '12.5', 1.5, Number.MAX_SAFE_INTEGER + 2])(
    'affiche un tiret pour une valeur illisible (%s), jamais « NaN »',
    (value) => {
      expect(formatMinorAmount(value as never, 'XOF')).toBe('—');
    },
  );
});

describe('toBigInt / minorToDecimalString', () => {
  it('ne passe jamais par un flottant', () => {
    expect(toBigInt('9007199254740993')).toBe(9007199254740993n);
    expect(minorToDecimalString(-5n, 2)).toBe('-0.05');
    expect(minorToDecimalString(1200n, 0)).toBe('1200');
  });
});

describe('saisie en unités majeures', () => {
  it('convertit une saisie FCFA et euro en unités mineures', () => {
    expect(majorInputToMinor('3 000 000', 'XOF')).toBe(3_000_000n);
    expect(majorInputToMinor('1 250,50', 'EUR')).toBe(125_050n);
    expect(majorInputToMinor('12', 'EUR')).toBe(1_200n);
  });

  it('refuse plus de décimales que la devise n’en a', () => {
    expect(majorInputToMinor('10,5', 'XOF')).toBeNull();
    expect(majorInputToMinor('1,234', 'EUR')).toBeNull();
    expect(majorInputToMinor('abc', 'EUR')).toBeNull();
  });

  it('préremplit un champ à partir d’unités mineures (aller-retour exact)', () => {
    expect(minorToMajorInput(125_050, 'EUR')).toBe('1250.50');
    expect(majorInputToMinor(minorToMajorInput(125_050, 'EUR'), 'EUR')).toBe(125_050n);
    expect(minorToMajorInput(null, 'EUR')).toBe('');
  });
});
