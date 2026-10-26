import { db } from './src/services/db/connectionPool';
import crypto from 'crypto';

async function testWORM() {
  const hash = crypto.randomBytes(32).toString('hex');
  const id = `cbr_${Date.now()}`;
  
  console.log('Inserting credit_bureau_reports...');
  await db.execute(`
    INSERT INTO credit_bureau_reports (id, reporting_month, manifest_hash)
    VALUES (?, ?, ?)
  `, [id, '2026-10', hash]);
  
  console.log('Trying to update (should fail due to WORM)...');
  try {
    await db.execute(`
      UPDATE credit_bureau_reports SET manifest_hash = 'tampered' WHERE id = ?
    `, [id]);
    console.error('FAIL: Update succeeded, WORM not working!');
    process.exit(1);
  } catch (err: any) {
    if (err.message.includes('WORM_PROTECTION_CBR')) {
      console.log('SUCCESS: WORM update block triggered properly:', err.message);
    } else {
      console.error('FAIL: Unexpected error during update block test:', err.message);
      process.exit(1);
    }
  }

  console.log('Trying to delete (should fail due to WORM)...');
  try {
    await db.execute(`
      DELETE FROM credit_bureau_reports WHERE id = ?
    `, [id]);
    console.error('FAIL: Delete succeeded, WORM not working!');
    process.exit(1);
  } catch (err: any) {
    if (err.message.includes('WORM_PROTECTION_CBR')) {
      console.log('SUCCESS: WORM delete block triggered properly:', err.message);
    } else {
      console.error('FAIL: Unexpected error during delete block test:', err.message);
      process.exit(1);
    }
  }
}

testWORM().catch(console.error);
