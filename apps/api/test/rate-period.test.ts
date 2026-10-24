import { describe, expect, it } from 'vitest';
import { filterEffectiveRates, isRateEffectiveAt, ratePeriodsOverlap, selectEffectiveRate, type RatePeriod } from '../src/services/rate-period.service.js';

const period = (overrides: Partial<RatePeriod> = {}): RatePeriod => ({
  active: true,
  deviceType: 'CONSOLE',
  consoleType: 'PS3',
  billingMode: 'HOURLY',
  durationMinutes: null,
  effectiveFrom: new Date('2026-10-15T00:00:00.000Z'),
  effectiveTo: null,
  ...overrides,
});

describe('rate effective periods', () => {
  it('uses a half-open effective period and active flag', () => {
    const rate = period({ effectiveTo: new Date('2026-10-16T00:00:00.000Z') });

    expect(isRateEffectiveAt(rate, new Date('2026-10-15T12:00:00.000Z'))).toBe(true);
    expect(isRateEffectiveAt(rate, new Date('2026-10-16T00:00:00.000Z'))).toBe(false);
    expect(isRateEffectiveAt(period({ active: false }), new Date('2026-10-15T12:00:00.000Z'))).toBe(false);
  });

  it('selects only active records effective at the server timestamp', () => {
    const at = new Date('2026-10-15T12:00:00.000Z');
    const eligible = filterEffectiveRates([
      period(),
      period({ active: false }),
      period({ effectiveFrom: new Date('2026-10-16T00:00:00.000Z') }),
      period({ effectiveTo: new Date('2026-10-15T12:00:00.000Z') }),
    ], at);

    expect(eligible).toHaveLength(1);
    expect(eligible[0]).toEqual(period());
  });

  it('detects overlapping active periods only for the same pricing slot', () => {
    const existing = period({ effectiveTo: new Date('2026-10-17T00:00:00.000Z') });

    expect(ratePeriodsOverlap(existing, period({ effectiveFrom: new Date('2026-10-16T00:00:00.000Z') }))).toBe(true);
    expect(ratePeriodsOverlap(existing, period({ effectiveFrom: new Date('2026-10-17T00:00:00.000Z') }))).toBe(false);
    expect(ratePeriodsOverlap(existing, period({ deviceType: 'PS_BOX' }))).toBe(false);
    expect(ratePeriodsOverlap(existing, period({ active: false }))).toBe(false);
  });

  it('selects the requested package and rejects overlapping active versions of its pricing slot', () => {
    const at = new Date('2026-10-15T12:00:00.000Z');
    const package6 = { ...period(), key: 'BOX-PS3-06JAM', billingMode: 'PACKAGE', durationMinutes: 360 };
    const package12 = { ...period(), key: 'BOX-PS3-12JAM', billingMode: 'PACKAGE', durationMinutes: 720 };

    expect(selectEffectiveRate([package6, package12], 'BOX-PS3-12JAM', at)).toEqual({
      rate: package12,
      conflict: false,
    });
    expect(selectEffectiveRate([
      package6,
      { ...package6, effectiveFrom: new Date('2026-10-14T00:00:00.000Z') },
    ], 'BOX-PS3-06JAM', at)).toEqual({ rate: null, conflict: true });
  });
});
