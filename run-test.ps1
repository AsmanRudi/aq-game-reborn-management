$env:AQ_TEST_DATABASE_URL = "postgresql://aq_game:change-me@localhost:5432/aq_game_reborn_test"
$env:DATABASE_URL = $env:AQ_TEST_DATABASE_URL
$command = "npm run test --workspace apps/api -- test/stations.test.ts"
$env:PATH += ";C:\Program Files\PostgreSQL\18\bin"

& $command
