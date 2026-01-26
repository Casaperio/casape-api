// Script to clean duplicates before adding unique index
import { MongoClient } from 'mongodb';

const MONGODB_URI = 'mongodb+srv://fillipe_db_user:OftpZuTwdqueiIJh@cluster-casape.mvnzlel.mongodb.net/?appName=Cluster-casape';

async function cleanDuplicates() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('stays_api');
    
    // Clean unified_bookings
    console.log('\n🧹 Cleaning unified_bookings duplicates...');
    const unifiedBookings = db.collection('stays_unified_bookings');
    
    // Find all documents, group by staysReservationId, keep only the first
    const duplicates = await unifiedBookings.aggregate([
      { $group: { 
          _id: '$staysReservationId', 
          ids: { $push: '$_id' },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();
    
    console.log(`   Found ${duplicates.length} duplicated staysReservationIds`);
    
    let deleted = 0;
    for (const dup of duplicates) {
      // Keep first, delete rest
      const idsToDelete = dup.ids.slice(1);
      const result = await unifiedBookings.deleteMany({ 
        _id: { $in: idsToDelete } 
      });
      deleted += result.deletedCount;
    }
    
    console.log(`   ✅ Deleted ${deleted} duplicate documents`);
    
    // Clean reservations
    console.log('\n🧹 Cleaning reservations duplicates...');
    const reservations = db.collection('stays_reservations');
    
    const dupReservations = await reservations.aggregate([
      { $group: { 
          _id: '$staysReservationId', 
          ids: { $push: '$_id' },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();
    
    console.log(`   Found ${dupReservations.length} duplicated staysReservationIds`);
    
    let deletedRes = 0;
    for (const dup of dupReservations) {
      const idsToDelete = dup.ids.slice(1);
      const result = await reservations.deleteMany({ 
        _id: { $in: idsToDelete } 
      });
      deletedRes += result.deletedCount;
    }
    
    console.log(`   ✅ Deleted ${deletedRes} duplicate documents`);
    
    console.log('\n✅ Cleanup complete! Now restart the server to create unique indexes.');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

cleanDuplicates();
