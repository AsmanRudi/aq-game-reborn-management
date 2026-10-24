import { describe, expect, it } from 'vitest';
import { calculateSessionBill, RateSnapshot } from '../src/services/billing.service.js';

describe('Rental Billing Calculation', () => {
  const ps3HourlyRate: RateSnapshot = {
    key: 'RATE-PS3-HOURLY',
    name: 'PS3 Reguler Per Jam',
    consoleType: 'PS3',
    billingMode: 'HOURLY',
    amount: 6000,
    minimumMinutes: 60,
    roundingMinutes: 15,
  };

  const ps4HourlyRate: RateSnapshot = {
    key: 'RATE-PS4-HOURLY',
    name: 'PS4 Reguler Per Jam',
    consoleType: 'PS4',
    billingMode: 'HOURLY',
    amount: 8000,
    minimumMinutes: 60,
    roundingMinutes: 15,
  };

  const psBox6hRate: RateSnapshot = {
    key: 'RATE-BOX-PS3-6H',
    name: 'PS Box PS3 6 Jam',
    consoleType: 'PS3',
    billingMode: 'PACKAGE',
    amount: 50000,
    durationMinutes: 360,
    minimumMinutes: 360,
    roundingMinutes: 15,
  };

  it('calculates PS3 hourly session correctly (1 hour)', () => {
    const startedAt = new Date('2026-10-24T10:00:00Z');
    const endedAt = new Date('2026-10-24T11:00:00Z'); // exactly 60 mins
    const bill = calculateSessionBill(startedAt, endedAt, ps3HourlyRate);

    expect(bill.actualMinutes).toBe(60);
    expect(bill.billedDurationMinutes).toBe(60);
    expect(bill.totalAmount).toBe(6000);
  });

  it('enforces minimum minutes when rental is shorter than minimum', () => {
    const startedAt = new Date('2026-10-24T10:00:00Z');
    const endedAt = new Date('2026-10-24T10:20:00Z'); // 20 mins
    const bill = calculateSessionBill(startedAt, endedAt, ps3HourlyRate);

    expect(bill.actualMinutes).toBe(20);
    expect(bill.billedDurationMinutes).toBe(60); // minimum 60 mins
    expect(bill.totalAmount).toBe(6000);
  });

  it('rounds up to 15-minute intervals for PS4 hourly rental', () => {
    const startedAt = new Date('2026-10-24T10:00:00Z');
    const endedAt = new Date('2026-10-24T11:18:00Z'); // 78 mins -> rounded to 90 mins (1.5h)
    const bill = calculateSessionBill(startedAt, endedAt, ps4HourlyRate);

    expect(bill.actualMinutes).toBe(78);
    expect(bill.billedDurationMinutes).toBe(90);
    expect(bill.totalAmount).toBe(12000); // 1.5 * 8000 = 12000
  });

  it('bills package amount within package duration for PS Box', () => {
    const startedAt = new Date('2026-10-24T10:00:00Z');
    const endedAt = new Date('2026-10-24T15:00:00Z'); // 5 hours (300 mins <= 360 mins)
    const bill = calculateSessionBill(startedAt, endedAt, psBox6hRate);

    expect(bill.actualMinutes).toBe(300);
    expect(bill.billedDurationMinutes).toBe(360);
    expect(bill.totalAmount).toBe(50000);
  });

  it('calculates overtime correctly when PS Box exceeds package duration', () => {
    const startedAt = new Date('2026-10-24T10:00:00Z');
    const endedAt = new Date('2026-10-24T16:30:00Z'); // 6.5 hours (390 mins = 360 + 30 mins overtime)
    const bill = calculateSessionBill(startedAt, endedAt, psBox6hRate);

    expect(bill.actualMinutes).toBe(390);
    expect(bill.billedDurationMinutes).toBe(390);
    expect(bill.totalAmount).toBeGreaterThan(50000);
  });
});

