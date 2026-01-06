/**
 * Testar API de calendário
 */

const API_KEY = 'c04d89b3d57aebfa9f81942d39984773';
const API_URL = 'http://localhost:3001/api/v1/calendar';

async function testAPI() {
  try {
    const response = await fetch(`${API_URL}?from=2025-11-01&to=2025-12-31`, {
      headers: {
        'X-API-Key': API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Encontrar a unidade L-RL-17-101
    const unit = data.units.find(u => u.code === 'L-RL-17-101 | LEB Rita Ludolf 17/101');

    if (!unit) {
      console.log('Unidade L-RL-17-101 não encontrada');
      return;
    }

    console.log(`\n✅ Unidade encontrada: ${unit.code}`);
    console.log(`Total de reservas: ${unit.reservations.length}\n`);

    // Filtrar reservas do Gerson
    const gersonReservations = unit.reservations.filter(r =>
      r.guestName.toLowerCase().includes('gerson')
    );

    console.log(`Reservas do Gerson: ${gersonReservations.length}\n`);

    gersonReservations.forEach((res, i) => {
      console.log(`${i + 1}. ${res.guestName}`);
      console.log(`   Check-in: ${res.startDate}`);
      console.log(`   Check-out: ${res.endDate}`);
      console.log(`   Noites: ${res.nights}`);
      console.log(`   Código: ${res.bookingId}`);
      console.log(`   ✅ priceValue: ${res.priceValue ?? 'NULL'}`);
      console.log(`   ✅ priceCurrency: ${res.priceCurrency ?? 'NULL'}`);
      console.log('');
    });

    // Verificar se os campos estão presentes
    const hasPrice = gersonReservations.every(r => r.priceValue !== undefined);
    const hasCurrency = gersonReservations.every(r => r.priceCurrency !== undefined);

    console.log(`\n📊 Verificação:`);
    console.log(`Todas têm priceValue? ${hasPrice ? '✅ SIM' : '❌ NÃO'}`);
    console.log(`Todas têm priceCurrency? ${hasCurrency ? '✅ SIM' : '❌ NÃO'}`);

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

testAPI();
