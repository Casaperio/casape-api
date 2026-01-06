/**
 * Verificar reservas específicas do Gerson Murunda
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;

async function checkGerson() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✓ Connected to MongoDB');

    const db = client.db(MONGODB_DB_NAME);
    const bookings = db.collection('stays_unified_bookings');

    // Buscar reservas do Gerson Murunda
    const gersonBookings = await bookings.find({
      guestName: { $regex: /Gerson.*Murunda/i }
    }).toArray();

    console.log(`\nEncontradas ${gersonBookings.length} reservas do Gerson Murunda:\n`);

    gersonBookings.forEach((booking, i) => {
      console.log(`${i + 1}. Reserva: ${booking.staysBookingCode} (ID: ${booking.staysReservationId})`);
      console.log(`   Imóvel: ${booking.apartmentCode}`);
      console.log(`   Check-in: ${booking.checkInDate} → Check-out: ${booking.checkOutDate}`);
      console.log(`   Noites: ${booking.nights}`);
      console.log(`   Type: ${booking.type}`);
      console.log(`   Status: ${booking.status}`);
      console.log(`   priceValue: ${booking.priceValue ?? 'NULL'}`);
      console.log(`   priceCurrency: ${booking.priceCurrency ?? 'NULL'}`);
      console.log(`   Platform: ${booking.platform ?? 'NULL'}`);
      console.log('');
    });

    // Buscar especificamente as que devem estar no período selecionado
    console.log('\n--- Reservas do L-RL-17-101 no período 26/11/2024 a 26/12/2025:');
    const property17Bookings = await bookings.find({
      apartmentCode: 'L-RL-17-101 | LEB Rita Ludolf 17/101',
      checkOutDate: { $gte: '2024-11-26' },
      checkInDate: { $lte: '2025-12-26' }
    }).toArray();

    console.log(`\nEncontradas ${property17Bookings.length} reservas:\n`);
    property17Bookings.forEach((booking) => {
      console.log(`- ${booking.guestName}: ${booking.checkInDate} a ${booking.checkOutDate}`);
      console.log(`  Código: ${booking.staysBookingCode}`);
      console.log(`  Preço: ${booking.priceValue ?? 'NULL'} ${booking.priceCurrency ?? ''}`);
      console.log('');
    });

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await client.close();
  }
}

checkGerson();
