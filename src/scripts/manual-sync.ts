/**
 * Manual Sync Script
 * Run with: npm run sync
 */

import { syncStaysData } from '../services/sync/SyncService.js';
import { connectMongoDB, closeMongoDB } from '../config/mongodb.js';

async function main() {
  console.log('🔄 Running manual sync...\n');

  await connectMongoDB();

  const result = await syncStaysData();

  console.log('\n📊 Sync Result:');
  console.log(`   Success: ${result.success}`);
  console.log(`   Bookings: ${result.bookingsCount}`);
  console.log(`   Listings: ${result.listingsCount}`);
  console.log(`   Duration: ${result.durationMs}ms`);

  if (result.error) {
    console.log(`   Error: ${result.error}`);
  }

  await closeMongoDB();
  process.exit(result.success ? 0 : 1);
}

main().catch(async (error) => {
  console.error('❌ Manual sync failed:', error);
  await closeMongoDB();
  process.exit(1);
});
