export interface Dashboard {
  viewers: number;
  newViewers7d: number;
  activeViewers7d: number;
  paidOrders30d: number;
  revenue30d: { currencyCode: string; amountMinor: number }[];
  unlocks30d: number;
  liveSeries: number;
  publishedEpisodes: number;
  topSeries30d: { seriesId: string; title: string; posterUrl: string | null; viewers: number }[];
  revenueByDay30d: { day: string; orders: number; amountMinor: number }[];
}

export interface ViewerRow {
  accountId: string;
  membershipId: string;
  phoneE164: string | null;
  status: string;
  accountStatus: string | null;
  countryCode: string | null;
  joinedAt: string;
  lastLoginAt: string | null;
  balance: number;
}

export interface ViewerDetail {
  account: { id: string; phoneE164: string | null; countryCode: string | null; locale: string; status: string; createdAt: string };
  membership: { id: string; status: string; createdAt: string; lastLoginAt: string | null };
  balance: { paidBalance: number; bonusBalance: number; total: number };
  ledger: { id: string; kind: string; delta: number; paidDelta: number; bonusDelta: number; reason: string | null; createdAt: string }[];
  orders: { id: string; reference: string; status: string; amountMinor: number; currencyCode: string; createdAt: string }[];
  unlockedEpisodes: number;
}
