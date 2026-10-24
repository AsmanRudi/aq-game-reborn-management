export type DeviceType = 'CONSOLE' | 'PS_BOX';
export type ConsoleType = 'PS3' | 'PS4';
export type BillingMode = 'HOURLY' | 'PACKAGE';

export interface StationTarget {
  code: string;
  displayName: string;
  consoleType: ConsoleType;
  deviceType: DeviceType;
}

export interface RateTarget {
  key: string;
  version: number;
  name: string;
  consoleType: ConsoleType;
  deviceType: DeviceType;
  billingMode: BillingMode;
  amount: number;
  durationMinutes: number | null;
  minimumMinutes: number;
  roundingMinutes: number;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  active: boolean;
}

export interface ExistingStation {
  code: string;
  consoleType: string;
  deviceType: string;
  displayName: string | null;
  active: boolean;
  maintenanceReason: string | null;
  setupConfirmed: boolean | null;
}

export interface ExistingRate {
  key: string;
  version: number;
  name: string;
  consoleType: string | null;
  deviceType: string;
  billingMode: string;
  amount: number;
  durationMinutes: number | null;
  minimumMinutes: number;
  roundingMinutes: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  active: boolean;
}

export interface SeedPlan {
  stationsToCreate: StationTarget[];
  stationsUnchanged: ExistingStation[];
  ratesToCreate: RateTarget[];
  ratesUnchanged: ExistingRate[];
  legacyRatesUnchanged: ExistingRate[];
  conflicts: string[];
  effectivePeriodRisks: string[];
}

const packagePrices: Record<ConsoleType, Map<number, number>> = {
  PS3: new Map([[360, 50000], [720, 90000], [1440, 130000]]),
  PS4: new Map([[360, 60000], [720, 100000], [1440, 140000]]),
};

export function validateSeedTargets(stations: StationTarget[], rates: RateTarget[]): string[] {
  const errors: string[] = [];
  const stationCodes = new Set<string>();
  const rateVersions = new Set<string>();

  for (const station of stations) {
    if (!/^[A-Z0-9-]{2,20}$/.test(station.code)) {
      errors.push(`Kode station tidak valid: ${station.code}`);
    }
    if (stationCodes.has(station.code)) errors.push(`Kode station duplikat: ${station.code}`);
    stationCodes.add(station.code);
    if ((station.code.startsWith('BOX-') !== (station.deviceType === 'PS_BOX'))) {
      errors.push(`Kode station dan jenis perangkat tidak cocok: ${station.code}`);
    }
    if (station.code.startsWith('BOX-PS3-') && station.consoleType !== 'PS3') {
      errors.push(`Generasi konsol tidak cocok dengan kode station: ${station.code}`);
    }
    if (station.code.startsWith('BOX-PS4-') && station.consoleType !== 'PS4') {
      errors.push(`Generasi konsol tidak cocok dengan kode station: ${station.code}`);
    }
  }

  for (const rate of rates) {
    const identifier = `${rate.key}:${rate.version}`;
    if (!/^[A-Z0-9_-]{3,50}$/.test(rate.key) || !Number.isInteger(rate.version) || rate.version < 1) {
      errors.push(`Identifier tarif tidak valid: ${identifier}`);
    }
    if (rateVersions.has(identifier)) errors.push(`Key/version tarif duplikat: ${identifier}`);
    rateVersions.add(identifier);

    if (!Number.isInteger(rate.amount) || rate.amount < 0 || !Number.isInteger(rate.minimumMinutes) ||
      rate.minimumMinutes < 0 || !Number.isInteger(rate.roundingMinutes) || rate.roundingMinutes <= 0) {
      errors.push(`Nominal atau parameter billing tidak valid: ${identifier}`);
    }

    if (rate.billingMode === 'HOURLY') {
      const expectedAmount = rate.consoleType === 'PS3' ? 6000 : 8000;
      if (rate.deviceType !== 'CONSOLE' || rate.amount !== expectedAmount || rate.durationMinutes !== null) {
        errors.push(`Konfigurasi tarif per jam tidak valid: ${identifier}`);
      }
    } else {
      const expectedAmount = rate.durationMinutes === null
        ? undefined
        : packagePrices[rate.consoleType].get(rate.durationMinutes);
      if (rate.deviceType !== 'PS_BOX' || expectedAmount === undefined || rate.amount !== expectedAmount ||
        rate.minimumMinutes !== rate.durationMinutes) {
        errors.push(`Konfigurasi paket PS Box tidak valid: ${identifier}`);
      }
    }

    if (rate.active !== false) errors.push(`Tarif target wajib tetap nonaktif: ${identifier}`);
    if (rate.effectiveFrom && rate.effectiveTo && rate.effectiveTo.getTime() <= rate.effectiveFrom.getTime()) {
      errors.push(`Rentang efektif tarif tidak valid: ${identifier}`);
    }
  }

  for (let index = 0; index < rates.length; index += 1) {
    const left = rates[index];
    if (!left?.effectiveFrom) continue;
    for (const right of rates.slice(index + 1)) {
      if (
        right.effectiveFrom &&
        samePricingSlot(left, right) &&
        left.effectiveFrom.getTime() < (right.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY) &&
        right.effectiveFrom.getTime() < (left.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY)
      ) {
        errors.push(`Periode target bertabrakan: ${left.key} v${left.version} dan ${right.key} v${right.version}.`);
      }
    }
  }

  return errors;
}

function sameRateConfiguration(target: RateTarget, existing: ExistingRate): boolean {
  return target.name === existing.name &&
    target.consoleType === existing.consoleType &&
    target.deviceType === existing.deviceType &&
    target.billingMode === existing.billingMode &&
    target.amount === existing.amount &&
    target.durationMinutes === existing.durationMinutes &&
    target.minimumMinutes === existing.minimumMinutes &&
    target.roundingMinutes === existing.roundingMinutes &&
    target.active === existing.active &&
    target.effectiveFrom !== null &&
    target.effectiveFrom.getTime() === existing.effectiveFrom.getTime() &&
    (target.effectiveTo?.getTime() ?? null) === (existing.effectiveTo?.getTime() ?? null);
}

function samePricingSlot(left: RateTarget | ExistingRate, right: RateTarget | ExistingRate): boolean {
  return left.deviceType === right.deviceType &&
    left.consoleType === right.consoleType &&
    left.billingMode === right.billingMode &&
    left.durationMinutes === right.durationMinutes;
}

function rangesOverlap(left: RateTarget, right: ExistingRate): boolean {
  if (!left.effectiveFrom) return false;
  const leftEnd = left.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightEnd = right.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY;
  return left.effectiveFrom.getTime() < rightEnd && right.effectiveFrom.getTime() < leftEnd;
}

export function createSeedPlan(
  stationTargets: StationTarget[],
  rateTargets: RateTarget[],
  existingStations: ExistingStation[],
  existingRates: ExistingRate[],
): SeedPlan {
  const conflicts = validateSeedTargets(stationTargets, rateTargets);
  const stationsByCode = new Map(existingStations.map((station) => [station.code, station]));
  const ratesByVersion = new Map(existingRates.map((rate) => [`${rate.key}:${rate.version}`, rate]));

  for (const target of stationTargets) {
    const existing = stationsByCode.get(target.code);
    if (existing && (existing.consoleType !== target.consoleType || existing.deviceType !== target.deviceType)) {
      conflicts.push(`Station ${target.code} sudah terdaftar dengan jenis perangkat berbeda.`);
    }
  }

  for (const target of rateTargets) {
    const existing = ratesByVersion.get(`${target.key}:${target.version}`);
    if (existing && !sameRateConfiguration(target, existing)) {
      conflicts.push(`Tarif ${target.key} versi ${target.version} telah ada dengan konfigurasi berbeda atau periode efektif belum dapat diverifikasi.`);
    }
  }

  const ratesToCreate = rateTargets.filter((target) => !ratesByVersion.has(`${target.key}:${target.version}`));
  const effectivePeriodRisks: string[] = [];
  for (const target of ratesToCreate) {
    const overlappingActive = existingRates.filter((existing) =>
      existing.active &&
      samePricingSlot(target, existing) &&
      (!target.effectiveFrom || rangesOverlap(target, existing))
    );
    for (const existing of overlappingActive) {
      effectivePeriodRisks.push(
        target.effectiveFrom
          ? `${target.key} v${target.version} masih nonaktif, tetapi periodenya bertumpang tindih dengan ${existing.key} v${existing.version} yang aktif; perlu transisi terjadwal sebelum aktivasi.`
          : `${target.key} v${target.version} masih nonaktif dan tanggal efektif belum ditentukan; tarif ini berpotensi bertabrakan dengan ${existing.key} v${existing.version} yang aktif.`
      );
    }
  }

  const legacyKeys = new Set(['PKG-PS3-3JAM', 'PKG-PS4-3JAM', 'RATE-PS3-HOURLY', 'RATE-PS4-HOURLY']);
  const legacyRatesUnchanged = existingRates.filter((rate) => legacyKeys.has(rate.key));

  return {
    stationsToCreate: stationTargets.filter((station) => !stationsByCode.has(station.code)),
    stationsUnchanged: stationTargets
      .map((station) => stationsByCode.get(station.code))
      .filter((station): station is ExistingStation => station !== undefined),
    ratesToCreate,
    ratesUnchanged: rateTargets
      .map((rate) => ratesByVersion.get(`${rate.key}:${rate.version}`))
      .filter((rate): rate is ExistingRate => rate !== undefined),
    legacyRatesUnchanged,
    conflicts,
    effectivePeriodRisks,
  };
}
