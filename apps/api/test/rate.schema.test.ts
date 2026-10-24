import { describe, expect, it } from 'vitest';
import { createRateSchema, updateRateSchema } from '../src/schemas/rate.schema.js';

const baseRate = {
  key: 'TEST-RATE',
  version: 1,
  name: 'Tarif pengujian',
  consoleType: 'PS3',
  billingMode: 'HOURLY',
  amount: 6000,
  minimumMinutes: 60,
  roundingMinutes: 15,
  effectiveFrom: '2026-10-15T00:00:00.000Z',
};

describe('createRateSchema device and price rules', () => {
  it.each([
    ['PS3', 6000],
    ['PS4', 8000],
  ])('accepts the configured hourly rate for %s', (consoleType, amount) => {
    const result = createRateSchema.safeParse({ ...baseRate, consoleType, amount });
    expect(result.success).toBe(true);
  });

  it.each([
    ['PS3', 360, 50000],
    ['PS3', 720, 90000],
    ['PS3', 1440, 130000],
    ['PS4', 360, 60000],
    ['PS4', 720, 100000],
    ['PS4', 1440, 140000],
  ])('accepts the PS Box %s package for %i minutes', (consoleType, durationMinutes, amount) => {
    const result = createRateSchema.safeParse({
      ...baseRate,
      key: 'TEST-BOX-PACKAGE',
      consoleType,
      deviceType: 'PS_BOX',
      billingMode: 'PACKAGE',
      amount,
      durationMinutes,
      active: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects package tariffs for regular consoles and mismatched device pricing', () => {
    const normalConsolePackage = createRateSchema.safeParse({
      ...baseRate,
      billingMode: 'PACKAGE',
      durationMinutes: 360,
      amount: 50000,
    });
    const mismatchedBoxPackage = createRateSchema.safeParse({
      ...baseRate,
      deviceType: 'PS_BOX',
      billingMode: 'PACKAGE',
      durationMinutes: 360,
      amount: 60000,
      active: false,
    });
    const hourlyPsBox = createRateSchema.safeParse({
      ...baseRate,
      deviceType: 'PS_BOX',
    });

    expect(normalConsolePackage.success).toBe(false);
    expect(mismatchedBoxPackage.success).toBe(false);
    expect(hourlyPsBox.success).toBe(false);
  });

  it('rejects an empty or reversed effective period', () => {
    const result = createRateSchema.safeParse({
      ...baseRate,
      effectiveTo: '2026-10-15T00:00:00.000Z',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('effectiveTo'))).toBe(true);
    }
  });

  it('preserves an omitted effectiveTo in a partial rate update', () => {
    const result = updateRateSchema.safeParse({ name: 'Tarif baru' });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.effectiveTo).toBeUndefined();
  });
});
