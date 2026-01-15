import { connectMongoDB, closeMongoDB } from './src/config/mongodb.js';
import { getCollections } from './src/config/mongodb.js';

async function checkDuplicate() {
  await connectMongoDB();
  
  const { unifiedBookings } = getCollections();
  
  // Buscar todas as reservas do L-VA-380-408 em janeiro/fevereiro 2026
  const bookings = await unifiedBookings.find({
    apartmentCode: 'L-VA-380-408',
    checkIn: { $gte: new Date('2026-01-01'), $lt: new Date('2026-03-01') }
  }).sort({ checkIn: 1 }).toArray();
  
  console.log(`\n📊 Reservas encontradas para L-VA-380-408:\n`);
  console.log(`Total: ${bookings.length} reservas\n`);
  
  for (const booking of bookings) {
    console.log(`════════════════════════════════════════════════════════════`);
    console.log(`Stays ID: ${booking._id}`);
    console.log(`Hóspede: ${booking.guestName}`);
    console.log(`Check-in: ${booking.checkIn.toISOString().split('T')[0]}`);
    console.log(`Check-out: ${booking.checkOut.toISOString().split('T')[0]}`);
    console.log(`Status: ${booking.status || 'N/A'}`);
    console.log(`Type: ${booking.type || 'N/A'}`);
    console.log(`Platform: ${booking.source || 'N/A'}`);
    console.log(`Updated: ${booking.updatedAt ? booking.updatedAt.toISOString() : 'N/A'}`);
    console.log('');
  }
  
  // Verificar se há sobreposição de datas
  if (bookings.length > 1) {
    console.log(`\n⚠️ ALERTA: Múltiplas reservas detectadas!`);
    console.log(`\nAnálise de sobreposição:\n`);
    
    for (let i = 0; i < bookings.length - 1; i++) {
      const b1 = bookings[i];
      const b2 = bookings[i + 1];
      
      if (b1.checkOut > b2.checkIn) {
        console.log(`❌ CONFLITO DETECTADO:`);
        console.log(`   ${b1.guestName} (${b1.checkIn.toISOString().split('T')[0]} → ${b1.checkOut.toISOString().split('T')[0]})`);
        console.log(`   ${b2.guestName} (${b2.checkIn.toISOString().split('T')[0]} → ${b2.checkOut.toISOString().split('T')[0]})`);
        console.log(``);
      }
    }
  }
  
  await closeMongoDB();
}

checkDuplicate().catch(console.error);
