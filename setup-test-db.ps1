# PowerShell script to set up test database

$env:PATH += ";C:\Program Files\PostgreSQL\18\bin"
$env:PGPASSWORD = "change-me"

Write-Host "Setting up test database..."

# Drop existing test database and recreate
try {
    Write-Host "Dropping existing test database if exists..."
    & psql -h localhost -U aq_game -c "DROP DATABASE IF EXISTS aq_game_reborn_test;"
} catch {
    Write-Host "Could not drop database (might not exist): $($_.Exception.Message)"
}

# Create test database
Write-Host "Creating test database..."
& psql -h localhost -U aq_game -c "CREATE DATABASE aq_game_reborn_test;"

# Apply migrations
$initMigration = "D:\\eduwork\\Project\\aq-game-reborn-management\\prisma\\migrations\\20261015095412_init_operational_foundation\\migration.sql"
$deviceMigration = "D:\\eduwork\\Project\\aq-game-reborn-management\\prisma\\migrations\\20261015183000_add_device_pricing_and_rewards\\migration.sql"
$authMigration = "D:\\eduwork\\Project\\aq-game-reborn-management\\prisma\\migrations\\20261015191000_add_staff_auth_sessions\\migration.sql"

Write-Host "Applying initial migration..."
& psql -h localhost -U aq_game -d aq_game_reborn_test -f $initMigration

Write-Host "Applying device pricing and rewards migration..."
& psql -h localhost -U aq_game -d aq_game_reborn_test -f $deviceMigration

Write-Host "Applying staff auth sessions migration..."
& psql -h localhost -U aq_game -d aq_game_reborn_test -f $authMigration

Write-Host "Test database setup completed successfully!"