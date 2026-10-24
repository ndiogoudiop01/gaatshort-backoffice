import { api } from '@core/http';
import type { CoinPack, OrderDetail, OrderStatus, PackInput } from './types';

const enc = encodeURIComponent;

export const monetisationApi = {
  packs: () => api.get<CoinPack[]>('/admin/packs'),
  createPack: (p: PackInput & { code: string; coins: number; amountMinor: number }) =>
    api.post<CoinPack>('/admin/packs', p),
  /** Le code et la devise d'un pack ne changent pas : on ne les envoie jamais en modification. */
  updatePack: (id: string, p: PackInput) => {
    const { code: _code, currencyCode: _currency, ...rest } = p;
    return api.patch<CoinPack>(`/admin/packs/${enc(id)}`, rest);
  },
  order: (id: string) => api.get<OrderDetail>(`/admin/orders/${enc(id)}`),
};

export const ORDERS_URL = '/admin/orders';
export type OrderFilters = { status?: OrderStatus; q?: string };
