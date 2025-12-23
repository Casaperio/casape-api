/**
 * Debug script to analyze guest name data from Stays API
 * Run with: npx tsx src/debug-guest-names.ts
 */

import { staysApiClient } from './services/stays/StaysApiClient.js';
import { connectMongoDB, getCollections, closeMongoDB } from './config/mongodb.js';
import { format, subDays, addDays } from 'date-fns';

async function debugGuestNames() {
  console.log('🔍 DEBUG: Analyzing guest name data...\n');

  // 1. Test API connection and fetch sample bookings
  const today = new Date();
  const fromDate = format(subDays(today, 30), 'yyyy-MM-dd');
  const toDate = format(addDays(today, 30), 'yyyy-MM-dd');

  console.log(`📅 Date range: ${fromDate} to ${toDate}\n`);

  // Fetch bookings from list endpoint
  const bookings = await staysApiClient.getBookings({
    from: fromDate,
    to: toDate,
    dateType: 'included',
    skip: 0,
    limit: 5, // Just fetch 5 for debugging
  });

  console.log(`📋 Found ${bookings.length} bookings from LIST endpoint\n`);

  // Analyze each booking
  for (const booking of bookings) {
    console.log('═'.repeat(60));
    console.log(`📦 Booking ID: ${booking._id}`);
    console.log(`   Code: ${booking.id}`);
    console.log(`   Check-in: ${booking.checkInDate}`);
    console.log(`   Listing: ${booking._idlisting}`);

    console.log('\n   📋 FROM LIST ENDPOINT:');
    console.log(`   guestsDetails: ${JSON.stringify(booking.guestsDetails, null, 2)}`);
    console.log(`   guestsDetails.name: ${booking.guestsDetails?.name || 'UNDEFINED'}`);
    console.log(`   guestsDetails.list: ${JSON.stringify(booking.guestsDetails?.list || 'UNDEFINED')}`);

    // Fetch detailed booking data
    try {
      const details = await staysApiClient.getBookingDetails(booking._id);
      console.log('\n   📋 FROM DETAILS ENDPOINT:');
      console.log(`   guestsDetails: ${JSON.stringify(details.guestsDetails, null, 2)}`);
      console.log(`   guestsDetails.name: ${details.guestsDetails?.name || 'UNDEFINED'}`);
      console.log(`   guestsDetails.list: ${JSON.stringify(details.guestsDetails?.list || 'UNDEFINED')}`);

      // Check all top-level fields that might contain guest name
      console.log('\n   🔍 ALL POTENTIAL NAME FIELDS:');
      const allFields = Object.keys(details);
      const potentialNameFields = allFields.filter(f =>
        f.toLowerCase().includes('guest') ||
        f.toLowerCase().includes('name') ||
        f.toLowerCase().includes('client')
      );
      for (const field of potentialNameFields) {
        console.log(`   ${field}: ${JSON.stringify((details as any)[field])}`);
      }
    } catch (error) {
      console.log(`   ❌ Failed to fetch details: ${error}`);
    }

    console.log('');
  }

  // 2. Check MongoDB data
  console.log('\n' + '═'.repeat(60));
  console.log('📊 CHECKING MONGODB DATA...\n');

  await connectMongoDB();
  const collections = getCollections();

  // Check stays_unified_bookings
  const mongoBookings = await collections.unifiedBookings.find({}).limit(10).toArray();
  console.log(`Found ${mongoBookings.length} bookings in MongoDB (stays_unified_bookings)\n`);

  for (const mb of mongoBookings) {
    console.log(`   ID: ${mb._id}`);
    console.log(`   guestName: "${mb.guestName}"`);
    console.log(`   apartmentCode: ${mb.apartmentCode}`);
    console.log(`   checkInDate: ${mb.checkInDate}`);
    console.log('');
  }

  // Count how many have "Hóspede" as guest name
  const hospedaCount = await collections.unifiedBookings.countDocuments({ guestName: 'Hóspede' });
  const totalCount = await collections.unifiedBookings.countDocuments({});
  console.log(`\n📊 STATISTICS:`);
  console.log(`   Total bookings: ${totalCount}`);
  console.log(`   With "Hóspede": ${hospedaCount}`);
  console.log(`   With real names: ${totalCount - hospedaCount}`);
  console.log(`   Percentage with fallback: ${((hospedaCount / totalCount) * 100).toFixed(1)}%`);

  await closeMongoDB();
}

async function resetSyncStatus() {
  console.log('🔄 Resetting sync status...');
  await connectMongoDB();
  const collections = getCollections();
  await collections.syncStatus.updateOne(
    { _id: 'current' } as any,
    { $set: { status: 'idle', updatedAt: new Date() } }
  );
  console.log('✅ Sync status reset to idle');
  await closeMongoDB();
}

// Check command line args
const args = process.argv.slice(2);
if (args.includes('--reset')) {
  resetSyncStatus()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Reset failed:', error);
      process.exit(1);
    });
} else {
  debugGuestNames()
    .then(() => {
      console.log('\n✅ Debug complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Debug failed:', error);
      process.exit(1);
    });
}
