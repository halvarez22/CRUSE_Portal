import { runMigrations } from './src/services/db/migrationRunner';

runMigrations().then(res => {
  console.log('Migrations applied:', res.appliedCount);
  console.log(res.details.join('\n'));
  process.exit(0);
}).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
