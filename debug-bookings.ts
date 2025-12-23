/**
 * Debug script to inspect booking data in MongoDB
 * Run with: tsx debug-bookings.ts
 */

import { connectMongoDB, getCollections } from './src/config/mongodb.js';

async function debugBookings() {
  console.log('🔍 Connecting to MongoDB...\n');
  await connectMongoDB();

  const collections = getCollections();

  // 1. Count total bookings
  const totalCount = await collections.unifiedBookings.countDocuments();
  console.log(`📊 Total bookings in database: ${totalCount}\n`);

  // 2. Check status values
  console.log('📋 Status distribution:');
  const statusAgg = await collections.unifiedBookings.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]).toArray();

  statusAgg.forEach(item => {
    console.log(`  - Status "${item._id}": ${item.count} bookings`);
  });

  // 3. Check booking types
  console.log('\n📋 Type distribution:');
  const typeAgg = await collections.unifiedBookings.aggregate([
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]).toArray();

  typeAgg.forEach(item => {
    console.log(`  - Type "${item._id}": ${item.count} bookings`);
  });

  // 4. Check creationDate field
  console.log('\n📅 CreationDate field check:');
  const withCreationDate = await collections.unifiedBookings.countDocuments({
    creationDate: { $ne: null, $exists: true }
  });
  const withoutCreationDate = totalCount - withCreationDate;

  console.log(`  ✅ With creationDate: ${withCreationDate}`);
  console.log(`  ❌ Without creationDate: ${withoutCreationDate}`);

  // 5. Sample booking with all fields
  console.log('\n📄 Sample booking (first one):');
  const sample = await collections.unifiedBookings.findOne({});
  if (sample) {
    console.log(JSON.stringify({
      id: sample.id,
      staysBookingCode: sample.staysBookingCode,
      type: sample.type,
      status: sample.status,
      checkInDate: sample.checkInDate,
      checkOutDate: sample.checkOutDate,
      creationDate: sample.creationDate,
      guestName: sample.guestName,
      platform: sample.platform,
      priceValue: sample.priceValue,
    }, null, 2));
  }

  // 6. Check for potentially canceled bookings
  console.log('\n🚫 Checking for canceled bookings:');

  // Try different variations
  const canceled1 = await collections.unifiedBookings.countDocuments({ status: 'canceled' });
  const canceled2 = await collections.unifiedBookings.countDocuments({ status: 'cancelled' });
  const canceled3 = await collections.unifiedBookings.countDocuments({ status: '3' });
  const canceled4 = await collections.unifiedBookings.countDocuments({ status: 3 });

  console.log(`  - status === "canceled": ${canceled1}`);
  console.log(`  - status === "cancelled": ${canceled2}`);
  console.log(`  - status === "3" (string): ${canceled3}`);
  console.log(`  - status === 3 (number): ${canceled4}`);

  // 7. Check date range for current period
  console.log('\n📆 Current month bookings:');
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const currentMonthCount = await collections.unifiedBookings.countDocuments({
    checkInDate: {
      $gte: startOfMonth.toISOString().split('T')[0],
      $lte: endOfMonth.toISOString().split('T')[0]
    }
  });

  console.log(`  Check-ins this month (${startOfMonth.toISOString().split('T')[0]} to ${endOfMonth.toISOString().split('T')[0]}): ${currentMonthCount}`);

  // 8. Check tickets
  console.log('\n🎫 Tickets check:');
  const ticketsCount = await collections.tickets.countDocuments();
  console.log(`  Total tickets: ${ticketsCount}`);

  if (ticketsCount > 0) {
    const ticketSample = await collections.tickets.findOne({});
    console.log('  Sample ticket:', JSON.stringify(ticketSample, null, 2));
  } else {
    console.log('  ⚠️  No tickets found in database (tickets need to be created manually)');
  }

  console.log('\n✅ Debug complete!\n');
  process.exit(0);
}

debugBookings().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
