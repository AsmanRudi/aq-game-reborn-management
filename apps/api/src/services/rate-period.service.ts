export interface RatePeriod {
  active: boolean;
  deviceType: string;
  consoleType?: string | null;
  billingMode: string;
  durationMinutes?: number | null;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
}

export function isRateEffectiveAt(rate: RatePeriod, at: Date): boolean {
  return rate.active &&
    rate.effectiveFrom.getTime() <= at.getTime() &&
    (rate.effectiveTo == null || rate.effectiveTo.getTime() > at.getTime());
}

export function filterEffectiveRates<T extends RatePeriod>(rates: T[], at: Date): T[] {
  return rates.filter((rate) => isRateEffectiveAt(rate, at));
}

export function selectEffectiveRate<T extends RatePeriod & { key: string }>(
  rates: T[],
  key: string,
  at: Date,
): { rate: T | null; conflict: boolean } {
  const matchingRates = filterEffectiveRates(rates, at);
  const selectedRates = matchingRates.filter((rate) => rate.key === key);
  const selected = selectedRates[0] ?? null;
  if (!selected) return { rate: null, conflict: false };

  const overlappingRates = matchingRates.filter((rate) => ratePeriodsOverlap(selected, rate));
  return overlappingRates.length > 1
    ? { rate: null, conflict: true }
    : { rate: selected, conflict: false };
}

export function ratePeriodsOverlap(left: RatePeriod, right: RatePeriod): boolean {
  if (
    !left.active ||
    !right.active ||
    left.deviceType !== right.deviceType ||
    (left.consoleType ?? null) !== (right.consoleType ?? null) ||
    left.billingMode !== right.billingMode ||
    (left.durationMinutes ?? null) !== (right.durationMinutes ?? null)
  ) {
    return false;
  }

  const leftEnd = left.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightEnd = right.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
  return left.effectiveFrom.getTime() < rightEnd && right.effectiveFrom.getTime() < leftEnd;
}
