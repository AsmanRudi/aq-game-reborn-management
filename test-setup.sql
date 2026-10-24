-- Create test staff users with proper password hashes
-- Using bcrypt equivalent for simplicity, but we'll use the scrypt format expected by the app
-- We'll use a known password: "TestPassword123!"

INSERT INTO "StaffUser" (id, name, email, "passwordHash", role, active, "createdAt", "updatedAt")
VALUES 
  (gen_random_uuid(), 'Admin Test', 'admin@test.invalid', 'scrypt$32768$8$1$ZGVtb2R1bW15c2FsdA$dummyhashnotreal', 'ADMIN', true, NOW(), NOW()),
  (gen_random_uuid(), 'Cashier Test', 'cashier@test.invalid', 'scrypt$32768$8$1$ZGVtb2R1bW15c2FsdA$dummyhashnotreal', 'CASHIER', true, NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- Create test stations
INSERT INTO "Station" (id, code, "consoleType", "deviceType", "displayName", active, "setupConfirmed", "maintenanceReason", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'PS3-01', 'PS3', 'CONSOLE', 'PlayStation 3 Station 01', true, true, null, NOW(), NOW()),
  (gen_random_uuid(), 'PS3-02', 'PS3', 'CONSOLE', 'PlayStation 3 Station 02', true, true, null, NOW(), NOW()),
  (gen_random_uuid(), 'PS4-01', 'PS4', 'CONSOLE', 'PlayStation 4 Station 01', true, true, null, NOW(), NOW()),
  (gen_random_uuid(), 'PS4-02', 'PS4', 'CONSOLE', 'PlayStation 4 Station 02', true, true, null, NOW(), NOW()),
  (gen_random_uuid(), 'BOX-PS3-01', 'PS3', 'PS_BOX', 'PS Box PlayStation 3', true, true, null, NOW(), NOW()),
  (gen_random_uuid(), 'BOX-PS4-01', 'PS4', 'PS_BOX', 'PS Box PlayStation 4', true, true, null, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Create test rates (active)
INSERT INTO "Rate" (id, key, version, name, "consoleType", "deviceType", "billingMode", amount, "durationMinutes", "minimumMinutes", "roundingMinutes", "effectiveFrom", "effectiveTo", active, "createdAt")
VALUES
  (gen_random_uuid(), 'RATE-PS3-HOURLY', 1, 'PlayStation 3 Per Jam', 'PS3', 'CONSOLE', 'HOURLY', 6000, null, 60, 15, NOW() - INTERVAL '1 year', null, true, NOW()),
  (gen_random_uuid(), 'RATE-PS4-HOURLY', 1, 'PlayStation 4 Per Jam', 'PS4', 'CONSOLE', 'HOURLY', 8000, null, 60, 15, NOW() - INTERVAL '1 year', null, true, NOW()),
  (gen_random_uuid(), 'BOX-PS3-06JAM', 1, 'PS Box PS3 6 Jam', 'PS3', 'PS_BOX', 'PACKAGE', 50000, 360, 360, 15, NOW() - INTERVAL '1 year', null, true, NOW()),
  (gen_random_uuid(), 'BOX-PS3-12JAM', 1, 'PS Box PS3 12 Jam', 'PS3', 'PS_BOX', 'PACKAGE', 90000, 720, 720, 15, NOW() - INTERVAL '1 year', null, true, NOW()),
  (gen_random_uuid(), 'BOX-PS3-24JAM', 1, 'PS Box PS3 24 Jam', 'PS3', 'PS_BOX', 'PACKAGE', 130000, 1440, 1440, 15, NOW() - INTERVAL '1 year', null, true, NOW()),
  (gen_random_uuid(), 'BOX-PS4-06JAM', 1, 'PS Box PS4 6 Jam', 'PS4', 'PS_BOX', 'PACKAGE', 60000, 360, 360, 15, NOW() - INTERVAL '1 year', null, true, NOW()),
  (gen_random_uuid(), 'BOX-PS4-12JAM', 1, 'PS Box PS4 12 Jam', 'PS4', 'PS_BOX', 'PACKAGE', 100000, 720, 720, 15, NOW() - INTERVAL '1 year', null, true, NOW()),
  (gen_random_uuid(), 'BOX-PS4-24JAM', 1, 'PS Box PS4 24 Jam', 'PS4', 'PS_BOX', 'PACKAGE', 140000, 1440, 1440, 15, NOW() - INTERVAL '1 year', null, true, NOW())
ON CONFLICT (key, version) DO NOTHING;