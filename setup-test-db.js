// Test database setup script
// This script ensures the test database is created with all migrations and test data

const { execSync } = require('child_process');
const path = require('path');

console.log('Setting up test database...');

const testDbUrl = 'postgresql://aq_game:change-me@localhost:5432/aq_game_reborn_test';
const initMigration = path.join(__dirname, 'prisma/migrations/20261015095412_init_operational_foundation/migration.sql');
const deviceMigration = path.join(__dirname, 'prisma/migrations/20261015183000_add_device_pricing_and_rewards/migration.sql');
const authMigration = path.join(__dirname, 'prisma/migrations/20261015191000_add_staff_auth_sessions/migration.sql');

// Set environment variables
process.env.DATABASE_URL = testDbUrl;
process.env.AQ_TEST_DATABASE_URL = testDbUrl;

// Drop existing test database and recreate
try {
  console.log('Dropping existing test database if exists...');
  execSync(`DROP DATABASE IF EXISTS aq_game_reborn_test;`, { stdio: 'pipe' });
} catch (error) {
  console.log('Could not drop database (might not exist):', error.message);
}

// Create test database
console.log('Creating test database...');
execSync(`CREATE DATABASE aq_game_reborn_test;`, { stdio: 'pipe' });

// Apply migrations
console.log('Applying initial migration...');
execSync(`psql -d aq_game_reborn_test -f "${initMigration}"`, { stdio: 'pipe' });

console.log('Applying device pricing and rewards migration...');
execSync(`psql -d aq_game_reborn_test -f "${deviceMigration}"`, { stdio: 'pipe' });

console.log('Applying staff auth sessions migration...');
execSync(`psql -d aq_game_reborn_test -f "${authMigration}"`, { stdio: 'pipe' });

console.log('Test database setup completed successfully!');
