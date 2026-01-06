/**
 * Script para verificar se as reservas no MongoDB têm valores de preço
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;

async function checkPrices() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✓ Connected to MongoDB');

    const db = client.db(MONGODB_DB_NAME);
    const bookings = db.collection('stays_unified_bookings');

    // Pegar 5 reservas de exemplo
    const samples = await bookings.find({ type: { $ne: 'blocked' } }).limit(5).toArray();

    console.log(`\nEncontradas ${samples.length} reservas de exemplo:\n`);

    samples.forEach((booking, i) => {
      console.log(`${i + 1}. Reserva: ${booking.staysBookingCode}`);
      console.log(`   Hóspede: ${booking.guestName}`);
      console.log(`   Imóvel: ${booking.apartmentCode}`);
      console.log(`   Check-in: ${booking.checkInDate} → Check-out: ${booking.checkOutDate}`);
      console.log(`   Noites: ${booking.nights}`);
      console.log(`   priceValue: ${booking.priceValue ?? 'NULL'}`);
      console.log(`   priceCurrency: ${booking.priceCurrency ?? 'NULL'}`);
      console.log('');
    });

    // Contar quantas reservas têm preço
    const totalBookings = await bookings.countDocuments({ type: { $ne: 'blocked' } });
    const withPrice = await bookings.countDocuments({
      type: { $ne: 'blocked' },
      priceValue: { $ne: null, $exists: true, $gt: 0 }
    });

    console.log(`\n📊 Estatísticas:`);
    console.log(`Total de reservas (não bloqueadas): ${totalBookings}`);
    console.log(`Reservas com preço: ${withPrice}`);
    console.log(`Reservas sem preço: ${totalBookings - withPrice}`);
    console.log(`Percentual com preço: ${((withPrice / totalBookings) * 100).toFixed(1)}%`);

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await client.close();
  }
}

checkPrices();
