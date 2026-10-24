const { execSync } = require('child_process');
try {
  const result = execSync('npm run test --workspace apps/api -- test/stations.test.ts', { encoding: 'utf8', timeout: 60000, cwd: 'D:\\eduwork\\Project\\aq-game-reborn-management' });
  console.log(result);
} catch (error) {
  console.log('STDOUT:');
  console.log(error.stdout);
  console.log('\nSTDERR:');
  console.log(error.stderr);
}