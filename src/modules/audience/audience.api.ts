import { api } from '@core/http';
import type { Dashboard, ViewerDetail } from './types';

const enc = encodeURIComponent;
export const VIEWERS_URL = '/admin/viewers';

export const audienceApi = {
  dashboard: () => api.get<Dashboard>('/admin/dashboard'),
  viewer: (accountId: string) => api.get<ViewerDetail>(`${VIEWERS_URL}/${enc(accountId)}`),
  adjust: (accountId: string, delta: number, reason: string) =>
    api.post<{ paidBalance: number; bonusBalance: number; total: number }>(`${VIEWERS_URL}/${enc(accountId)}/wallet/adjust`, { delta, reason }),
};

/** Hauteur relative des barres du graphique de revenus (0–100). */
export function barHeights(values: readonly number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max ? Math.max(2, Math.round((v / max) * 100)) : 0));
}
