import { StaysApiClient } from './src/services/stays/StaysApiClient.js';

async function checkStaysApi() {
  const client = new StaysApiClient();
  
  // Buscar reservas de dezembro 2025 a fevereiro 2026 para pegar ambas
  const from = '2025-12-01';
  const to = '2026-03-01';
  
  console.log(`\n🔍 Buscando reservas do L-VA-380-408 na Stays API...\n`);
  
  const allBookings = await client.getAllBookings(from, to, 'included');
  
  console.log(`Total de reservas: ${allBookings.length}`);
  
  // Buscar por listingId conhecido
  const listingIds380 = ['L-VA-380-408', '380-408', 'VA-380-408'];
  
  const target = allBookings.filter(b => {
    return listingIds380.some(id => 
      b.listingId?.includes(id) || 
      b.id?.includes('380') // Às vezes o ID da reserva contém referência ao imóvel
    );
  });
  
  console.log(`Total de reservas encontradas: ${target.length}\n`);
  
  // Debug: mostrar primeira reserva para ver estrutura
  if (allBookings.length > 0) {
    console.log(`\n🔍 Exemplo de reserva (para debug):`);
    const sample = allBookings[0];
    console.log(JSON.stringify(sample, null, 2).substring(0, 2000));
    console.log(`\n`);
  }
  
  for (const booking of target) {
    console.log(`════════════════════════════════════════════════════════════`);
    console.log(`Stays ID: ${booking.id}`);
    console.log(`Status: ${booking.status}`);
    console.log(`Type: ${booking.type}`);
    console.log(`Check-in: ${booking.checkIn}`);
    console.log(`Check-out: ${booking.checkOut}`);
    console.log(`Platform: ${booking.source}`);
    console.log(`Guest Name: ${booking.guestsDetails?.name || 'N/A'}`);
    console.log(`Created: ${booking.creationDate}`);
    console.log(`Updated: ${booking.lastUpdateDate}`);
    console.log('');
  }
  
  // Análise de conflitos
  if (target.length > 1) {
    console.log(`\n⚠️ Múltiplas reservas detectadas na Stays API!\n`);
    
    // Ordenar por check-in
    target.sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime());
    
    for (let i = 0; i < target.length - 1; i++) {
      const b1 = target[i];
      const b2 = target[i + 1];
      
      const checkOut1 = new Date(b1.checkOut);
      const checkIn2 = new Date(b2.checkIn);
      
      if (checkOut1 > checkIn2) {
        console.log(`❌ SOBREPOSIÇÃO DETECTADA:`);
        console.log(`   [${b1.id}] ${b1.guestsDetails?.name} (${b1.checkIn} → ${b1.checkOut}) - Status: ${b1.status}`);
        console.log(`   [${b2.id}] ${b2.guestsDetails?.name} (${b2.checkIn} → ${b2.checkOut}) - Status: ${b2.status}`);
        console.log(``);
      }
    }
  }
}

checkStaysApi().catch(console.error);
