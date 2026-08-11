export type BonusTier = { threshold: number; bonus: number };

export const BONUS_TIERS: BonusTier[] = [
  { threshold: 100_000, bonus: 100 },
  { threshold: 250_000, bonus: 250 },
  { threshold: 500_000, bonus: 500 },
  { threshold: 1_000_000, bonus: 1_000 },
];

export function achievedTiers(total: number): BonusTier[] {
  return BONUS_TIERS.filter((t) => total >= t.threshold);
}

export function nextTier(total: number): BonusTier | null {
  return BONUS_TIERS.find((t) => total < t.threshold) ?? null;
}

export function progressToNextTier(total: number): number {
  const tier = nextTier(total);
  if (!tier) return 100;
  const prevThreshold = [...BONUS_TIERS].reverse().find((t) => t.threshold < tier.threshold && total >= t.threshold)?.threshold ?? 0;
  const span = tier.threshold - prevThreshold;
  return Math.min(100, Math.max(0, ((total - prevThreshold) / span) * 100));
}

export function missingForNextTier(total: number): number {
  const tier = nextTier(total);
  return tier ? Math.max(0, tier.threshold - total) : 0;
}
