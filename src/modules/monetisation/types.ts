export type OrderStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';

export interface CoinPack {
  id: string;
  code: string;
  coins: number;
  bonusCoins: number;
  currencyCode: string;
  amountMinor: number;
  badge: string | null;
  position: number;
  active: boolean;
}

export interface Order {
  id: string;
  reference: string;
  status: OrderStatus;
  coins: number;
  bonusCoins: number;
  currencyCode: string;
  amountMinor: number;
  provider: 'PAYTECH' | 'FAKE';
  paymentMethod: string | null;
  createdAt: string;
  paidAt: string | null;
  failureCode: string | null;
  account: { id: string; phoneE164: string | null; displayName: string | null } | null;
}

export interface OrderDetail extends Order {
  history: {
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    cause: string;
    createdAt: string;
  }[];
  events: {
    id: string;
    eventType: string | null;
    signatureValid: boolean;
    processingStatus: string;
    processingError: string | null;
    receivedAt: string;
  }[];
}

export interface PackInput {
  code?: string;
  coins?: number;
  bonusCoins?: number;
  currencyCode?: string;
  amountMinor?: number;
  badge?: string | null;
  position?: number;
  active?: boolean;
}
