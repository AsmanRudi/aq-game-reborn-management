/// <reference types="node" />
import { BillingMode, ConsoleType, Prisma, PrismaClient, StationDeviceType } from '@prisma/client';
import { z } from 'zod';
import {
  createSeedPlan,
  type ExistingRate,
  type ExistingStation,
  type RateTarget,
  type StationTarget,
  validateSeedTargets,
} from './seed-plan.js';

const prisma = new PrismaClient();
const applyChanges = process.argv.includes('--apply');
const effectiveDateInput = process.env.AQ_RATE_EFFECTIVE_FROM;
const effectiveDateResult = effectiveDateInput === undefined
  ? null
  : z.string().datetime({ offset: true }).safeParse(effectiveDateInput);
const rateEffectiveFrom = effectiveDateResult?.success
  ? new Date(effectiveDateResult.data)
  : null;

const stationTargets: StationTarget[] = [
  { code: 'PS3-01', displayName: 'PlayStation 3 · Station 01', consoleType: 'PS3', deviceType: 'CONSOLE' },
  { code: 'PS3-02', displayName: 'PlayStation 3 · Station 02', consoleType: 'PS3', deviceType: 'CONSOLE' },
  { code: 'PS3-03', displayName: 'PlayStation 3 · Station 03', consoleType: 'PS3', deviceType: 'CONSOLE' },
  { code: 'PS4-01', displayName: 'PlayStation 4 · Station 01', consoleType: 'PS4', deviceType: 'CONSOLE' },
  { code: 'PS4-02', displayName: 'PlayStation 4 · Station 02', consoleType: 'PS4', deviceType: 'CONSOLE' },
  { code: 'BOX-PS3-01', displayName: 'PS Box PlayStation 3', consoleType: 'PS3', deviceType: 'PS_BOX' },
  { code: 'BOX-PS4-01', displayName: 'PS Box PlayStation 4', consoleType: 'PS4', deviceType: 'PS_BOX' },
];

const rateTargets: RateTarget[] = [
  {
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
    effectiveFrom: rateEffectiveFrom,
    effectiveTo: null,
    active: false,
  },
  {
    key: 'RATE-PS4-HOURLY',
    version: 2,
    name: 'PlayStation 4 · Per Jam',
    consoleType: 'PS4',
    deviceType: 'CONSOLE',
    billingMode: 'HOURLY',
    amount: 8000,
    durationMinutes: null,
    minimumMinutes: 60,
    roundingMinutes: 15,
    effectiveFrom: rateEffectiveFrom,
    effectiveTo: null,
    active: false,
  },
  {
    key: 'BOX-PS3-06JAM',
    version: 1,
    name: 'BOX-PS3-01 · Paket 6 Jam',
    consoleType: 'PS3',
    deviceType: 'PS_BOX',
    billingMode: 'PACKAGE',
    amount: 50000,
    durationMinutes: 360,
    minimumMinutes: 360,
    roundingMinutes: 15,
    effectiveFrom: rateEffectiveFrom,
    effectiveTo: null,
    active: false,
  },
  {
    key: 'BOX-PS3-12JAM',
    version: 1,
    name: 'BOX-PS3-01 · Paket 12 Jam',
    consoleType: 'PS3',
    deviceType: 'PS_BOX',
    billingMode: 'PACKAGE',
    amount: 90000,
    durationMinutes: 720,
    minimumMinutes: 720,
    roundingMinutes: 15,
    effectiveFrom: rateEffectiveFrom,
    effectiveTo: null,
    active: false,
  },
  {
    key: 'BOX-PS3-24JAM',
    version: 1,
    name: 'BOX-PS3-01 · Paket 24 Jam',
    consoleType: 'PS3',
    deviceType: 'PS_BOX',
    billingMode: 'PACKAGE',
    amount: 130000,
    durationMinutes: 1440,
    minimumMinutes: 1440,
    roundingMinutes: 15,
    effectiveFrom: rateEffectiveFrom,
    effectiveTo: null,
    active: false,
  },
  {
    key: 'BOX-PS4-06JAM',
    version: 1,
    name: 'BOX-PS4-01 · Paket 6 Jam',
    consoleType: 'PS4',
    deviceType: 'PS_BOX',
    billingMode: 'PACKAGE',
    amount: 60000,
    durationMinutes: 360,
    minimumMinutes: 360,
    roundingMinutes: 15,
    effectiveFrom: rateEffectiveFrom,
    effectiveTo: null,
    active: false,
  },
  {
    key: 'BOX-PS4-12JAM',
    version: 1,
    name: 'BOX-PS4-01 · Paket 12 Jam',
    consoleType: 'PS4',
    deviceType: 'PS_BOX',
    billingMode: 'PACKAGE',
    amount: 100000,
    durationMinutes: 720,
    minimumMinutes: 720,
    roundingMinutes: 15,
    effectiveFrom: rateEffectiveFrom,
    effectiveTo: null,
    active: false,
  },
  {
    key: 'BOX-PS4-24JAM',
    version: 1,
    name: 'BOX-PS4-01 · Paket 24 Jam',
    consoleType: 'PS4',
    deviceType: 'PS_BOX',
    billingMode: 'PACKAGE',
    amount: 140000,
    durationMinutes: 1440,
    minimumMinutes: 1440,
    roundingMinutes: 15,
    effectiveFrom: rateEffectiveFrom,
    effectiveTo: null,
    active: false,
  },
];

interface ColumnRecord {
  table_name: string;
  column_name: string;
}

interface RawStation extends ExistingStation {}
interface RawRate extends ExistingRate {}

async function getSchemaColumns(): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<ColumnRecord[]>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name IN ('Station', 'Rate')
  `;
  return new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
}

async function readExistingStations(columns: Set<string>): Promise<RawStation[]> {
  const deviceType = columns.has('Station.deviceType') ? '"deviceType"::text' : "'CONSOLE'::text";
  const displayName = columns.has('Station.displayName') ? '"displayName"' : 'NULL::text';
  const setupConfirmed = columns.has('Station.setupConfirmed') ? '"setupConfirmed"' : 'NULL::boolean';
  return prisma.$queryRawUnsafe<RawStation[]>(
    `SELECT "code", "consoleType"::text AS "consoleType", ${deviceType} AS "deviceType",
      ${displayName} AS "displayName", "active", "maintenanceReason",
      ${setupConfirmed} AS "setupConfirmed"
     FROM "Station" ORDER BY "code"`
  );
}

async function readExistingRates(columns: Set<string>): Promise<RawRate[]> {
  const deviceType = columns.has('Rate.deviceType') ? '"deviceType"::text' : "'CONSOLE'::text";
  return prisma.$queryRawUnsafe<RawRate[]>(
    `SELECT "key", "version", "name", "consoleType"::text AS "consoleType",
      ${deviceType} AS "deviceType", "billingMode"::text AS "billingMode",
      "amount", "durationMinutes", "minimumMinutes", "roundingMinutes",
      "effectiveFrom", "effectiveTo", "active"
     FROM "Rate" ORDER BY "key", "version"`
  );
}

async function readOperationalImpact() {
  const [sessions, bookings, invoices] = await Promise.all([
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM "RentalSession" WHERE "status"::text = 'ACTIVE'
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM "Booking" WHERE "status"::text = 'CONFIRMED'
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM "Invoice"
    `,
  ]);
  return {
    activeSessions: sessions[0]?.count ?? 0,
    confirmedBookings: bookings[0]?.count ?? 0,
    invoices: invoices[0]?.count ?? 0,
  };
}

function formatRate(rate: Pick<RateTarget, 'key' | 'version' | 'amount' | 'active' | 'effectiveFrom'>): string {
  return `${rate.key} v${rate.version} Rp${rate.amount.toLocaleString('id-ID')} · ${rate.active ? 'aktif' : 'nonaktif'} · berlaku ${rate.effectiveFrom?.toISOString() ?? 'BELUM DITENTUKAN'}`;
}

function printPlan(
  plan: ReturnType<typeof createSeedPlan>,
  allStations: ExistingStation[],
  allRates: ExistingRate[],
  schemaReady: boolean,
  impact: { activeSessions: number; confirmedBookings: number; invoices: number },
) {
  console.log(`Seed mode: ${applyChanges ? 'APPLY REQUESTED' : schemaReady ? 'DRY-RUN READ-ONLY' : 'DRY-RUN INCOMPLETE — SCHEMA PREREQUISITE MISSING'}`);
  console.log('\nStations:');
  for (const target of stationTargets) {
    const existing = allStations.find((station) => station.code === target.code);
    console.log(existing
      ? `  UNCHANGED ${target.code}: ${existing.consoleType}/${existing.deviceType}, displayName=${existing.displayName ?? 'kosong'} (target ${target.displayName}; existing value is preserved), active=${existing.active}, maintenance=${existing.maintenanceReason ?? 'none'}, setupConfirmed=${existing.setupConfirmed ?? 'kolom belum tersedia'}`
      : `  CREATE ${target.code}: ${target.consoleType}/${target.deviceType}, setupConfirmed=false, active=true`);
  }
  console.log(`  Existing station rows not targeted: ${allStations.filter((station) => !stationTargets.some((target) => target.code === station.code)).length} — unchanged`);

  console.log('\nRates:');
  for (const target of rateTargets) {
    const existing = allRates.find((rate) => rate.key === target.key && rate.version === target.version);
    console.log(existing ? `  UNCHANGED ${existing.key} v${existing.version}: existing record retained` : `  CREATE ${formatRate(target)}`);
  }
  console.log(`  Existing rate records: ${allRates.length} — not updated or deleted`);
  console.log(`  Active legacy rates: ${allRates.filter((rate) => rate.active).map((rate) => `${rate.key} v${rate.version} Rp${rate.amount.toLocaleString('id-ID')}`).join('; ') || 'none'} — remain active and unchanged`);
  console.log('  Automatic tariff deactivation: none. Automatic tariff activation: none.');

  console.log('\nOperational impact:');
  console.log(`  Active sessions: ${impact.activeSessions}; confirmed bookings: ${impact.confirmedBookings}; invoices: ${impact.invoices}. Seed will not update or delete them or their rate snapshots.`);
  console.log('  A migration applies setupConfirmed=false to pre-existing stations; this plan preserves operational visibility and does not change station readiness.');

  if (rateEffectiveFrom === null) {
    console.log('\nEffective date: AQ_RATE_EFFECTIVE_FROM is not set. New rates are not ready to apply; select and review an explicit ISO-8601 date first.');
  }
  for (const risk of plan.effectivePeriodRisks) console.log(`\nPERIOD RISK: ${risk}`);
  for (const conflict of plan.conflicts) console.log(`\nCONFLICT: ${conflict}`);

  if (!schemaReady) {
    console.log('\nPREREQUISITE: Apply the reviewed device-pricing migration before seed --apply. The current database lacks Station.deviceType, Station.setupConfirmed, and/or Rate.deviceType; this report is incomplete and is not evidence of an apply-ready plan.');
  }
  if (plan.conflicts.length > 0) console.log('\nPLAN BLOCKED: resolve conflicts before any write.');
  if (!applyChanges) console.log('\nNo database changes made.');
}

async function loadPlan() {
  const columns = await getSchemaColumns();
  const schemaReady = [
    'Station.deviceType',
    'Station.displayName',
    'Station.setupConfirmed',
    'Rate.deviceType',
  ].every((column) => columns.has(column));
  const [stations, rates, impact] = await Promise.all([
    readExistingStations(columns),
    readExistingRates(columns),
    readOperationalImpact(),
  ]);
  const plan = createSeedPlan(stationTargets, rateTargets, stations, rates);
  return { columns, schemaReady, stations, rates, impact, plan };
}

async function main() {
  const validationErrors = validateSeedTargets(stationTargets, rateTargets);
  if (effectiveDateInput !== undefined && (!effectiveDateResult?.success || !Number.isFinite(rateEffectiveFrom?.getTime()))) {
    validationErrors.push('AQ_RATE_EFFECTIVE_FROM harus berupa tanggal ISO-8601 dengan zona waktu yang valid.');
  }
  if (rateEffectiveFrom) {
    for (const rate of rateTargets) rate.effectiveFrom = rateEffectiveFrom;
  }
  if (applyChanges && !rateEffectiveFrom) {
    validationErrors.push('Seed apply memerlukan AQ_RATE_EFFECTIVE_FROM dengan tanggal ISO-8601 yang telah disetujui.');
  }
  if (validationErrors.length > 0) {
    throw new Error(`Validasi konfigurasi seed gagal:\n- ${validationErrors.join('\n- ')}`);
  }

  const loaded = await loadPlan();
  printPlan(loaded.plan, loaded.stations, loaded.rates, loaded.schemaReady, loaded.impact);
  if (loaded.plan.conflicts.length > 0) {
    throw new Error('Seed dibatalkan tanpa perubahan karena konflik ditemukan.');
  }

  if (!applyChanges) return;
  if (!loaded.schemaReady) {
    throw new Error('Seed apply dibatalkan tanpa perubahan: migrasi device-pricing belum diterapkan.');
  }
  if (!rateEffectiveFrom) throw new Error('Seed apply dibatalkan: tanggal efektif tarif belum ditentukan.');

  await prisma.$transaction(async (tx) => {
    const currentStations = await tx.station.findMany({
      where: { code: { in: stationTargets.map((station) => station.code) } },
      select: {
        code: true,
        consoleType: true,
        deviceType: true,
        displayName: true,
        active: true,
        maintenanceReason: true,
        setupConfirmed: true,
      },
    });
    const currentRates = await tx.rate.findMany({
      where: {
        OR: rateTargets.map(({ key, version }) => ({ key, version })),
      },
    });
    const transactionPlan = createSeedPlan(
      stationTargets,
      rateTargets,
      currentStations,
      currentRates.map((rate): ExistingRate => ({
        key: rate.key,
        version: rate.version,
        name: rate.name,
        consoleType: rate.consoleType,
        deviceType: rate.deviceType,
        billingMode: rate.billingMode,
        amount: rate.amount,
        durationMinutes: rate.durationMinutes,
        minimumMinutes: rate.minimumMinutes,
        roundingMinutes: rate.roundingMinutes,
        effectiveFrom: rate.effectiveFrom,
        effectiveTo: rate.effectiveTo,
        active: rate.active,
      })),
    );
    if (transactionPlan.conflicts.length > 0) {
      throw new Error(`Seed dibatalkan di dalam transaksi karena konfigurasi berubah: ${transactionPlan.conflicts.join('; ')}`);
    }

    for (const station of transactionPlan.stationsToCreate) {
      await tx.station.create({
        data: {
          ...station,
          consoleType: station.consoleType as ConsoleType,
          deviceType: station.deviceType as StationDeviceType,
          setupConfirmed: false,
          active: true,
        },
      });
    }

    for (const rate of transactionPlan.ratesToCreate) {
      if (!rate.effectiveFrom) throw new Error(`Tanggal efektif tarif ${rate.key} belum ditentukan.`);
      await tx.rate.create({
        data: {
          ...rate,
          consoleType: rate.consoleType as ConsoleType,
          deviceType: rate.deviceType as StationDeviceType,
          billingMode: rate.billingMode as BillingMode,
          effectiveFrom: rate.effectiveFrom,
          effectiveTo: null,
          active: false,
        },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  console.log(`Seed completed: created ${loaded.plan.stationsToCreate.length} stations and ${loaded.plan.ratesToCreate.length} inactive rates. Existing station/rate settings and all operational history were retained.`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
