/**
 * Compara dados da Stays API vs MongoDB para identificar reservas faltantes
 * Run with: npx tsx src/scripts/compare-stays-mongo.ts
 */

import { staysApiClient } from '../services/stays/StaysApiClient.js';
import { getCollections, connectMongoDB, closeMongoDB } from '../config/mongodb.js';
import { format, subDays, addDays } from 'date-fns';

async function compareStaysVsMongo() {
  console.log('🔍 COMPARAÇÃO: Stays API vs MongoDB\n');
  
  await connectMongoDB();
  
  const today = new Date();
  const from = format(subDays(today, 7), 'yyyy-MM-dd');
  const to = format(addDays(today, 7), 'yyyy-MM-dd');
  
  console.log(`📅 Período de análise: ${from} até ${to}\n`);
  
  try {
    // 1. Fetch from Stays API
    console.log('📥 Buscando da Stays API...');
    const staysBookings = await staysApiClient.getAllBookings(from, to, 'included');
    console.log(`✅ Stays retornou: ${staysBookings.length} reservas\n`);
    
    // 2. Fetch from MongoDB
    console.log('📥 Buscando do MongoDB...');
    const collections = getCollections();
    const mongoBookings = await collections.unifiedBookings
      .find({
        checkOutDate: { $gte: from },
        checkInDate: { $lte: to },
      })
      .toArray();
    console.log(`✅ MongoDB retornou: ${mongoBookings.length} reservas\n`);
    
    // 3. Build ID sets
    const staysIds = new Set(staysBookings.map(b => b._id));
    const mongoIds = new Set(mongoBookings.map((b: any) => b.staysReservationId));
    
    // 4. Find differences
    const missingInMongo = [...staysIds].filter(id => !mongoIds.has(id));
    const extraInMongo = [...mongoIds].filter(id => !staysIds.has(id));
    
    // 5. Print summary
    console.log('═'.repeat(80));
    console.log('📊 RESUMO DA COMPARAÇÃO');
    console.log('═'.repeat(80));
    console.log(`   Stays API total:      ${staysBookings.length}`);
    console.log(`   MongoDB total:        ${mongoBookings.length}`);
    console.log(`   Faltando no Mongo:    ${missingInMongo.length} ❌`);
    console.log(`   Extra no Mongo:       ${extraInMongo.length} ⚠️`);
    console.log(`   Match perfeito:       ${staysBookings.length === mongoBookings.length && missingInMongo.length === 0 ? 'SIM ✅' : 'NÃO ❌'}`);
    console.log('═'.repeat(80));
    console.log('');
    
    // 6. Detailed analysis of missing bookings
    if (missingInMongo.length > 0) {
      console.log('❌ RESERVAS FALTANDO NO MONGODB:');
      console.log('');
      
      // Group by date for better visibility
      const missingByDate = new Map<string, any[]>();
      
      missingInMongo.forEach(id => {
        const booking = staysBookings.find(b => b._id === id);
        if (booking) {
          const date = booking.checkInDate;
          if (!missingByDate.has(date)) {
            missingByDate.set(date, []);
          }
          missingByDate.get(date)!.push(booking);
        }
      });
      
      // Sort by date
      const sortedDates = Array.from(missingByDate.keys()).sort();
      
      sortedDates.forEach(date => {
        console.log(`\n📅 Check-in: ${date}`);
        console.log('─'.repeat(80));
        
        const bookings = missingByDate.get(date)!;
        bookings.forEach(booking => {
          const guestName = booking.guestsDetails?.name || 'SEM NOME';
          const apartment = booking.listing?.internalName || booking._idlisting || 'IMÓVEL DESCONHECIDO';
          const nights = booking.stats?.nightsCount || '?';
          const platform = booking.partner?.name || booking.source || 'Direto';
          
          console.log(`   🏠 ${apartment}`);
          console.log(`   👤 ${guestName}`);
          console.log(`   📆 ${booking.checkInDate} → ${booking.checkOutDate} (${nights} noites)`);
          console.log(`   📱 Plataforma: ${platform}`);
          console.log(`   🔑 ID: ${booking._id}`);
          console.log(`   📊 Tipo: ${booking.type} | Status: ${booking.status || 'N/A'}`);
          console.log('');
        });
      });
      
      // Analyze patterns
      console.log('\n🔍 ANÁLISE DE PADRÕES:');
      console.log('─'.repeat(80));
      
      const typeCount = new Map<string, number>();
      const platformCount = new Map<string, number>();
      const statusCount = new Map<string, number>();
      
      missingInMongo.forEach(id => {
        const booking = staysBookings.find(b => b._id === id);
        if (booking) {
          // Type
          const type = booking.type || 'unknown';
          typeCount.set(type, (typeCount.get(type) || 0) + 1);
          
          // Platform
          const platform = booking.partner?.name || booking.source || 'Direct';
          platformCount.set(platform, (platformCount.get(platform) || 0) + 1);
          
          // Status
          const status = booking.status?.toString() || 'unknown';
          statusCount.set(status, (statusCount.get(status) || 0) + 1);
        }
      });
      
      console.log('\n   Por Tipo:');
      typeCount.forEach((count, type) => {
        const percent = ((count / missingInMongo.length) * 100).toFixed(1);
        console.log(`      ${type}: ${count} (${percent}%)`);
      });
      
      console.log('\n   Por Plataforma:');
      platformCount.forEach((count, platform) => {
        const percent = ((count / missingInMongo.length) * 100).toFixed(1);
        console.log(`      ${platform}: ${count} (${percent}%)`);
      });
      
      console.log('\n   Por Status:');
      statusCount.forEach((count, status) => {
        const percent = ((count / missingInMongo.length) * 100).toFixed(1);
        console.log(`      ${status}: ${count} (${percent}%)`);
      });
    }
    
    // 7. Check for extras (shouldn't happen but good to know)
    if (extraInMongo.length > 0) {
      console.log('\n\n⚠️ RESERVAS NO MONGODB MAS NÃO NA STAYS API:');
      console.log('(Podem ser antigas, deletadas ou fora do range)');
      console.log('─'.repeat(80));
      
      extraInMongo.slice(0, 10).forEach(id => {
        const booking = mongoBookings.find((b: any) => b.staysReservationId === id);
        if (booking) {
          const b = booking as any;
          console.log(`   ${b.apartmentCode || 'N/A'} | ${b.guestName || 'N/A'} | ${b.checkInDate} → ${b.checkOutDate}`);
        }
      });
      
      if (extraInMongo.length > 10) {
        console.log(`   ... e mais ${extraInMongo.length - 10} reservas`);
      }
    }
    
    // 8. Final recommendations
    console.log('\n\n💡 RECOMENDAÇÕES:');
    console.log('═'.repeat(80));
    
    if (missingInMongo.length === 0) {
      console.log('✅ Dados sincronizados perfeitamente!');
    } else {
      console.log('❌ Ação necessária:');
      console.log('   1. Verificar se sync está rodando corretamente');
      console.log('   2. Verificar logs de erro no último sync');
      console.log('   3. Considerar fazer resync manual:');
      console.log('      cd casape-api && npm run sync');
      console.log('   4. Verificar se há filtros indevidos no SyncService');
    }
    
    console.log('');
    
  } catch (error) {
    console.error('❌ Erro na comparação:', error);
    throw error;
  } finally {
    await closeMongoDB();
  }
}

compareStaysVsMongo()
  .then(() => {
    console.log('\n✅ Análise concluída');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Análise falhou:', error);
    process.exit(1);
  });
