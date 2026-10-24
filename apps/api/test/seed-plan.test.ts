import { describe, expect, it } from 'vitest';
import {
  createSeedPlan,
  type ExistingRate,
  type ExistingStation,
  type RateTarget,
  type StationTarget,
  validateSeedTargets,
} from '../../../prisma/seed-plan.js';

const stationTarget: StationTarget = {
  code: 'PS3-01',
  displayName: 'PlayStation 3 · Station 01',
  consoleType: 'PS3',
  deviceType: 'CONSOLE',
};

const rateTarget: RateTarget = {
  key: 'RATE-PS3-HOURLY',
  version: 2,
  name: 'PlayStation 3 · 2 controller (Per Jam)',
  consoleType: 'PS3',
  deviceType: 'CONSOLE',
  billingMode: 'HOURLY',
  amount: 6000,
  durationMinutes: null,
  minimumMinutes: 60,
  roundingMinutes: 15,
  effectiveFrom: new Date('2026-11-01T00:00:00.000Z'),
  effectiveTo: null,
  active: false,
};

const existingStation: ExistingStation = {
  code: 'PS3-01',
  consoleType: 'PS3',
  deviceType: 'CONSOLE',
  displayName: null,
  active: true,
  maintenanceReason: null,
  setupConfirmed: null,
};

const existingRate: ExistingRate = {
  ...rateTarget,
  version: 1,
  name: 'Tarif PS3 lama',
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
  active: true,
};

describe('seed plan', () => {
  it('plans creates while preserving existing active tariffs and reporting a future overlap risk', () => {
    const plan = createSeedPlan(
      [stationTarget, { ...stationTarget, code: 'PS3-03' }],
      [rateTarget],
      [existingStation],
      [existingRate],
    );

    expect(plan.stationsToCreate.map((station) => station.code)).toEqual(['PS3-03']);
    expect(plan.stationsUnchanged).toEqual([existingStation]);
    expect(plan.ratesToCreate).toEqual([rateTarget]);
    expect(plan.legacyRatesUnchanged).toEqual([existingRate]);
    expect(plan.effectivePeriodRisks).toHaveLength(1);
    expect(plan.conflicts).toEqual([]);
  });

  it('skips exact existing records on rerun and rejects mismatched stable identifiers', () => {
    const identicalTarget = { ...rateTarget, effectiveFrom: existingRate.effectiveFrom, active: true };
    const exactRate: ExistingRate = { ...identicalTarget };
    const rerun = createSeedPlan([stationTarget], [identicalTarget], [existingStation], [exactRate]);

    expect(rerun.stationsToCreate).toEqual([]);
    expect(rerun.ratesToCreate).toEqual([]);
    expect(rerun.ratesUnchanged).toEqual([exactRate]);

    const conflict = createSeedPlan(
      [stationTarget],
      [rateTarget],
      [{ ...existingStation, deviceType: 'PS_BOX' }],
      [{ ...existingRate, key: rateTarget.key, version: rateTarget.version }],
    );
    expect(conflict.conflicts).toHaveLength(2);
  });

  it('rejects invalid station, package, and effective-period configuration', () => {
    const errors = validateSeedTargets(
      [{ ...stationTarget, code: 'BOX-PS4-01' }],
      [{
        ...rateTarget,
        key: 'INVALID-PACKAGE',
        billingMode: 'PACKAGE',
        deviceType: 'PS_BOX',
        durationMinutes: 360,
        amount: 1,
        effectiveTo: new Date('2026-10-31T00:00:00.000Z'),
      }],
    );

    expect(errors.some((error) => error.includes('Kode station dan jenis perangkat tidak cocok'))).toBe(true);
    expect(errors.some((error) => error.includes('Konfigurasi paket PS Box tidak valid'))).toBe(true);
    expect(errors.some((error) => error.includes('Rentang efektif tarif tidak valid'))).toBe(true);
  });
});
