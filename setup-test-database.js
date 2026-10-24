// Comprehensive test database setup script
// This ensures the test database is clean and has all necessary test data

const { execSync } = require('child_process');
const path = require('path');

console.log('Setting up clean test database...');

const testDbUrl = 'postgresql://aq_game:change-me@localhost:5432/aq_game_reborn_test';
const initMigration = path.join(__dirname, 'prisma/migrations/20261015095412_init_operational_foundation/migration.sql');
const deviceMigration = path.join(__dirname, 'prisma/migrations/20261015183000_add_device_pricing_and_rewards/migration.sql');
const authMigration = path.join(__dirname, 'prisma/migrations/20261015191000_add_staff_auth_sessions/migration.sql');

// Set environment variables
process.env.DATABASE_URL = testDbUrl;
process.env.AQ_TEST_DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'development'; // Set to non-production for bootstrap endpoint

// Drop existing test database and recreate cleanly
console.log('Dropping existing test database...');
execSync(`DROP DATABASE IF EXISTS aq_game_reborn_test WITH (FORCE);`, { stdio: 'pipe' });

// Create fresh test database
console.log('Creating fresh test database...');
execSync(`CREATE DATABASE aq_game_reborn_test;`, { stdio: 'pipe' });

// Apply migrations in order
console.log('Applying initial migration...');
execSync(`psql -d aq_game_reborn_test -f "${initMigration}"`, { stdio: 'pipe' });

console.log('Applying device pricing and rewards migration...');
execSync(`psql -d aq_game_reborn_test -f "${deviceMigration}"`, { stdio: 'pipe' });

console.log('Applying staff auth sessions migration...');
execSync(`psql -d aq_game_reborn_test -f "${authMigration}"`, { stdio: 'pipe' });

// Create admin user for auth tests (same as the test expects)
console.log('Creating admin user...');
execSync(`
psql -d aq_game_reborn_test -c "
INSERT INTO \"StaffUser\" (id, name, email, passwordHash, role, active, \"createdAt\", \"updatedAt\")
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Admin Test', 'admin-sessions-test@test.invalid', 'scrypt\$32768\$8\$1\$testhash1\$testhash1', 'ADMIN', true, NOW(), NOW()),
  ('22222222-2222-2222-2222-222222222222', 'Cashier Test', 'cashier-sessions-test@test.invalid', 'scrypt\$32768\$8\$1\$testhash2\$testhash2', 'CASHIER', true, NOW(), NOW())
ON CONFLICT (email) DO NOTHING;
"
`, { stdio: 'pipe' });

// Insert test stations
console.log('Creating test stations...');
execSync(`
psql -d aq_game_reborn_test -c "
INSERT INTO \"Station\" (id, code, \"consoleType\", \"deviceType\", \"displayName\", active, \"setupConfirmed\", \"maintenanceReason\", \"createdAt\", \"updatedAt\") VALUES
  ('33333333-3333-3333-3333-333333333333', 'PS3-01', 'PS3', 'CONSOLE', 'PlayStation 3 Station 01', true, true, NULL, NOW(), NOW()),
  ('44444444-4444-4444-4444-444444444444', 'PS3-02', 'PS3', 'CONSOLE', 'PlayStation 3 Station 02', true, true, NULL, NOW(), NOW()),
  ('55555555-5555-5555-5555-555555555555', 'PS4-01', 'PS4', 'CONSOLE', 'PlayStation 4 Station 01', true, true, NULL, NOW(), NOW()),
  ('66666666-6666-6666-6666-666666666666', 'PS4-02', 'PS4', 'CONSOLE', 'PlayStation 4 Station 02', true, true, NULL, NOW(), NOW()),
  ('77777777-7777-7777-7777-777777777777', 'BOX-PS3-01', 'PS3', 'PS_BOX', 'PS Box PlayStation 3', true, true, NULL, NOW(), NOW()),
  ('88888888-8888-8888-8888-888888888888', 'BOX-PS4-01', 'PS4', 'PS_BOX', 'PS Box PlayStation 4', true, true, NULL, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;
"
`, { stdio: 'pipe' });

// Insert test rates (active rates for current date)
console.log('Creating test rates...');
execSync(`
psql -d aq_game_reborn_test -c "
INSERT INTO \"Rate\" (id, key, version, name, \"consoleType\", \"deviceType\", \"billingMode\", amount, \"durationMinutes\", \"minimumMinutes\", \"roundingMinutes\", \"effectiveFrom\", \"effectiveTo\", active, \"createdAt\") VALUES
  ('99999999-9999-9999-9999-999999999999', 'RATE-PS4-HOURLY', 1, 'PlayStation 4 Per Jam', 'PS4', 'CONSOLE', 'HOURLY', 8000, NULL, 60, 15, NOW() - INTERVAL '1 year', NULL, true, NOW()),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RATE-PS3-HOURLY', 1, 'PlayStation 3 Per Jam', 'PS3', 'CONSOLE', 'HOURLY', 6000, NULL, 60, 15, NOW() - INTERVAL '1 year', NULL, true, NOW()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BOX-PS3-06JAM', 1, 'PS Box PS3 6 Jam', 'PS3', 'PS_BOX', 'PACKAGE', 50000, 360, 360, 15, NOW() - INTERVAL '1 year', NULL, true, NOW()),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'BOX-PS4-06JAM', 1, 'PS Box PS4 6 Jam', 'PS4', 'PS_BOX', 'PACKAGE', 60000, 360, 360, 15, NOW() - INTERVAL '1 year', NULL, true, NOW())
ON CONFLICT (key, version) DO NOTHING;
"
`, { stdio: 'pipe' });

console.log('Test database setup completed successfully!');