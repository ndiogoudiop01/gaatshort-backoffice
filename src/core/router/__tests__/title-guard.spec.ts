import { describe, expect, it } from 'vitest';
import type { RouteLocationNormalized } from 'vue-router';
import { titleGuard } from '../guards';
import { config } from '@core/config';

function route(titleKeys: (string | undefined)[]): RouteLocationNormalized {
  return {
    matched: titleKeys.map((titleKey) => ({ meta: titleKey ? { titleKey } : {} })),
  } as RouteLocationNormalized;
}

const translate = (key: string) => `[${key}]`;

describe('titleGuard', () => {
  it('prend le titre le PLUS PROFOND de la hiérarchie', () => {
    // Coquille puis écran : c'est l'écran qui nomme l'onglet, pas la coquille.
    titleGuard(route(['nav.applications', 'applications.detailTitle']), translate);
    expect(document.title).toBe(`[applications.detailTitle] · ${config.app.name}`);
  });

  it('ignore les niveaux sans titre', () => {
    titleGuard(route(['nav.applications', undefined]), translate);
    expect(document.title).toBe(`[nav.applications] · ${config.app.name}`);
  });

  it('retombe sur le nom de l’application quand aucun niveau n’en porte', () => {
    titleGuard(route([undefined]), translate);
    expect(document.title).toBe(config.app.name);
  });
});
