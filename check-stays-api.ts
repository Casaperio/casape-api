/**
 * Check Stays.net API response format
 * Run with: npx tsx check-stays-api.ts
 */

import { config } from './src/config/env.js';
import { staysApiClient } from './src/services/stays/StaysApiClient.js';

async function checkStaysApi() {
  console.log('🔍 Connecting to Stays.net API...\n');

  try {
    // Fetch a few recent bookings
    const today = new Date();
    const from = new Date();
    from.setDate(today.getDate() - 30); // Last 30 days

    const bookings = await staysApiClient.getBookings({
      from: from.toISOString().split('T')[0],
      to: today.toISOString().split('T')[0],
      dateType: 'arrival',
      limit: 5,
    });

    console.log(`📊 Fetched ${bookings.length} bookings\n`);

    if (bookings.length > 0) {
      const sample = bookings[0];

      console.log('📄 FULL Sample Booking (first one):');
      console.log(JSON.stringify(sample, null, 2));
      console.log('\n');

      console.log('🔍 Key fields check:');
      console.log(`  - _id: ${sample._id}`);
      console.log(`  - id (booking code): ${sample.id}`);
      console.log(`  - type: ${sample.type}`);
      console.log(`  - status: ${sample.status} (${typeof sample.status})`);
      console.log(`  - creationDate: ${sample.creationDate} (${typeof sample.creationDate})`);
      console.log(`  - checkInDate: ${sample.checkInDate}`);
      console.log(`  - checkOutDate: ${sample.checkOutDate}`);
      console.log(`  - guestsDetails.name: ${sample.guestsDetails?.name}`);
      console.log(`  - partner: ${JSON.stringify(sample.partner)}`);
      console.log(`  - source: ${sample.source}`);
      console.log(`  - channelName: ${sample.channelName}`);

      console.log('\n💰 Price structure:');
      console.log(JSON.stringify(sample.price, null, 2));

      console.log('\n📊 Stats structure:');
      console.log(JSON.stringify(sample.stats, null, 2));

      console.log('\n\n📋 Checking all bookings for status values:');
      const statusCounts = new Map<string, number>();
      const typeCounts = new Map<string, number>();
      let creationDateCount = 0;

      bookings.forEach(b => {
        const statusKey = `${b.status} (${typeof b.status})`;
        statusCounts.set(statusKey, (statusCounts.get(statusKey) || 0) + 1);

        const typeKey = `${b.type} (${typeof b.type})`;
        typeCounts.set(typeKey, (typeCounts.get(typeKey) || 0) + 1);

        if (b.creationDate) creationDateCount++;
      });

      console.log('\nStatus distribution:');
      statusCounts.forEach((count, status) => {
        console.log(`  - ${status}: ${count}`);
      });

      console.log('\nType distribution:');
      typeCounts.forEach((count, type) => {
        console.log(`  - ${type}: ${count}`);
      });

      console.log(`\nCreationDate present: ${creationDateCount}/${bookings.length}`);

    } else {
      console.log('⚠️  No bookings found in this period');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('Details:', error.message);
    }
  }

  console.log('\n✅ Check complete!\n');
  process.exit(0);
}

checkStaysApi();
