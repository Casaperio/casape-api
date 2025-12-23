/**
 * Script para adicionar uma reserva de teste no MongoDB
 * Execute: npx tsx add-test-reservation.ts
 */

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB = process.env.MONGODB_DB || 'stays-db';

async function addTestReservation() {
  console.log('🧪 ===== ADICIONANDO RESERVA DE TESTE =====\n');

  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI não configurado no .env');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    // Conectar ao MongoDB
    await client.connect();
    console.log('✅ Conectado ao MongoDB');

    const db = client.db(MONGODB_DB);
    const collection = db.collection('stays_unified_bookings');

    // Criar reserva de teste
    const now = new Date();
    const checkInDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 dias no futuro
    const checkOutDate = new Date(checkInDate.getTime() + 4 * 24 * 60 * 60 * 1000); // 4 noites

    const testReservation = {
      // IDs únicos
      _id: `test-${Date.now()}`,
      externalId: `EXT-TEST-${Date.now()}`,
      bookingCode: `BK${Date.now()}`,

      // Informações do hóspede
      guestName: `Teste Automático ${now.toLocaleTimeString('pt-BR')}`,
      guestEmail: 'teste@casape.com.br',

      // Propriedade
      listingId: '12345', // ID fictício
      propertyCode: 'I-AC-101',
      propertyName: 'Icaraí 101',
      propertyAddress: 'Rua Teste, 101',

      // Datas
      checkInDate: checkInDate.toISOString(),
      checkOutDate: checkOutDate.toISOString(),
      createdAt: now.toISOString(),

      // Estatísticas
      nights: 4,
      guestCount: 3,
      adults: 2,
      children: 1,
      babies: 0,

      // Canal/Plataforma
      channel: 'Booking.com',
      channelName: 'Booking.com',
      source: 'bookingcom',
      platformImage: 'https://a0.muscache.com/airbnb/static/logos/belo-200x200-4d851c5b28f61931bf1df28dd15e60ef.jpg',

      // Financeiro
      currency: 'BRL',
      priceValue: 3500,
      totalValue: 3500,
      pricePerNight: 875,
      reserveTotal: 3500,

      // Status
      status: 'confirmed',
      type: 'normal',

      // Check-in/Check-out times
      checkInTime: '15:00',
      checkOutTime: '11:00',

      // Timestamps
      syncedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    console.log('📝 Reserva de teste:', {
      id: testReservation._id,
      hóspede: testReservation.guestName,
      propriedade: testReservation.propertyCode,
      checkIn: testReservation.checkInDate,
      checkOut: testReservation.checkOutDate,
      valor: `${testReservation.currency} ${testReservation.totalValue}`,
    });

    // Inserir no MongoDB
    const result = await collection.insertOne(testReservation);

    console.log('\n✅ Reserva adicionada com sucesso!');
    console.log(`📌 ID no MongoDB: ${result.insertedId}`);
    console.log('\n⏳ Aguarde até 5 minutos para o próximo polling do sistema...');
    console.log('🎉 O popup de comemoração deve aparecer automaticamente!');
    console.log('\n📊 Para verificar, você pode:');
    console.log('   - Esperar o polling automático (até 5 min)');
    console.log('   - Ou forçar um refresh manual na interface');
  } catch (error) {
    console.error('❌ Erro ao adicionar reserva:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n🔌 Desconectado do MongoDB');
  }
}

// Executar
addTestReservation();
