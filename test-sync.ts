import { syncPropertiesData } from './src/services/sync/PropertySyncService.js';
import { connectMongoDB, getCollections } from './src/config/mongodb.js';

async function testSync() {
  console.log('🧪 Running direct sync test...\n');

  await connectMongoDB();

  const result = await syncPropertiesData();

  console.log('\n📊 Sync Result:');
  console.log(`  Success: ${result.success}`);
  console.log(`  Properties: ${result.propertiesCount}`);
  console.log(`  Duration: ${result.durationMs}ms`);
  if (result.error) {
    console.log(`  Error: ${result.error}`);
  }

  // Check amenities in DB
  console.log('\n🔍 Checking amenities in database...');
  const collections = getCollections();
  const property = await collections.properties.findOne({ active: true }) as any;
  if (property) {
    console.log(`  Property: ${property.name}`);
    console.log(`  Amenities count: ${property.amenities?.length || 0}`);
    if (property.amenities && property.amenities.length > 0) {
      console.log(`  Sample amenities:`);
      property.amenities.slice(0, 5).forEach((a: any, i: number) => {
        console.log(`    ${i + 1}. ${a.namePtBr} (${a.name})`);
      });
    }
  }

  process.exit(0);
}

testSync().catch(console.error);
