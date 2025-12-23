/**
 * Script para verificar se a reserva de teste foi adicionada
 * Execute: npx tsx check-test-reservation.ts
 */

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB = process.env.MONGODB_DB || 'stays-db';

async function checkTestReservation() {
  console.log('🔍 ===== VERIFICANDO RESERVAS DE TESTE =====\n');

  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI não configurado no .env');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Conectado ao MongoDB\n');

    const db = client.db(MONGODB_DB);
    const collection = db.collection('stays_unified_bookings');

    // Buscar reservas de teste
    const testReservations = await collection
      .find({ _id: /^test-/ })
      .toArray();

    console.log(`📊 Total de reservas de teste encontradas: ${testReservations.length}\n`);

    if (testReservations.length > 0) {
      console.log('📋 Reservas de teste:\n');
      testReservations.forEach((res, index) => {
        console.log(`${index + 1}. ${res._id}`);
        console.log(`   Nome: ${res.guestName}`);
        console.log(`   Propriedade: ${res.propertyCode}`);
        console.log(`   Check-in: ${res.checkInDate}`);
        console.log(`   Check-out: ${res.checkOutDate}`);
        console.log(`   Type: ${res.type}`);
        console.log(`   Status: ${res.status}`);
        console.log('');
      });
    }

    // Buscar UMA reserva real para comparação
    console.log('🔎 Buscando uma reserva real para comparação...\n');
    const realReservation = await collection.findOne({ _id: { $not: /^test-/ } });

    if (realReservation) {
      console.log('📄 Exemplo de reserva real (campos):\n');
      console.log(JSON.stringify(realReservation, null, 2));
    } else {
      console.log('⚠️ Nenhuma reserva real encontrada no banco');
    }

    // Contar total de reservas
    const totalCount = await collection.countDocuments();
    console.log(`\n📈 Total de reservas no banco: ${totalCount}`);

    // Verificar range de datas
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const futureReservations = await collection
      .find({
        checkInDate: { $gte: tomorrow.toISOString(), $lte: nextWeek.toISOString() },
      })
      .toArray();

    console.log(`\n📅 Reservas com check-in nos próximos 7 dias: ${futureReservations.length}`);

  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n🔌 Desconectado do MongoDB');
  }
}

checkTestReservation();
