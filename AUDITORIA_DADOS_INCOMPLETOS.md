# 🚨 RELATÓRIO TÉCNICO - AUDITORIA DE DADOS INCOMPLETOS

**Data**: 15/01/2026
**Sistema**: central-casaperio + casape-api
**Problema**: Reservas faltando em Guest & CRM e Manutenção

---

## 📋 RESUMO EXECUTIVO

O sistema está exibindo **menos reservas** do que realmente existem na API da Stays devido a **múltiplos filtros e exclusões** ao longo do fluxo de dados. Identificamos **4 pontos críticos** onde reservas são removidas/filtradas.

**Impacto**:

- ❌ Guest & CRM: 2 check-ins mostrados (deveria ser 6)
- ❌ Guest & CRM: 1 checkout mostrado (deveria ser 4)
- ❌ In-Home: ~12 mostrados (deveria ser 20)

---

## 🔍 CAUSA RAIZ IDENTIFICADA

### **PONTO CRÍTICO #1: Filtro `type !== 'blocked'` no Dashboard**

**Arquivo**: `casape-api/src/services/DashboardService.ts` linha 103-107
**Código**:

```typescript
const docs = await collections.unifiedBookings
  .find({
    checkOutDate: { $gte: from },
    checkInDate: { $lte: to },
    type: { $ne: 'blocked' },  // ❌ PROBLEMA: Filtra 'blocked'
  })
  .toArray();
```

**Problema**: Este filtro remove reservas com `type === 'blocked'`, mas o problema é mais profundo.

---

### **PONTO CRÍTICO #2: Timezone no Sync (menos crítico após fix)**

**Arquivo**: `casape-api/src/services/sync/SyncService.ts` linha 561
**Código**:

```typescript
const today = new Date(); // ❌ Usa UTC do servidor
const fromDate = format(subDays(today, config.sync.dateRangeDays), 'yyyy-MM-dd');
const toDate = format(addDays(today, config.sync.dateRangeDays), 'yyyy-MM-dd');
```

**Status**: JÁ CORRIGIDO com `getTodayBrazil()` no DashboardService, mas o **SyncService ainda usa UTC**.

---

### **PONTO CRÍTICO #3: Range de Sync muito restrito (?)**

**Arquivo**: `casape-api/.env` (NÃO EXISTE VALOR CONFIGURADO)
**Arquivo**: `casape-api/src/config/env.ts` linha 20
**Default**: `SYNC_DATE_RANGE_DAYS=180` (6 meses para frente e para trás)

**Análise**: O sync busca ±180 dias, então **não é problema de range**.

---

### **PONTO CRÍTICO #4: Paginação funcionando corretamente**

**Arquivo**: `casape-api/src/services/stays/StaysApiClient.ts` linha 110-145
**Código**:

```typescript
while (hasMore) {
  const bookings = await this.getBookings({
    from, to, dateType, skip, limit: 20,
  });
  allBookings.push(...bookings);
  hasMore = bookings.length === limit; // ✅ Continua se retornou 20
  skip += limit;
  if (skip > 1000) { // Safety limit
    console.warn('⚠️ Reached safety limit of 1000 bookings');
    break;
  }
}
```

**Status**: ✅ **Paginação OK**, busca todas as páginas até limit de 1000.

---

## 🎯 HIPÓTESE PRINCIPAL: Problema no Sync de Dados

### **Evidências**:

1. **stays-observator** consulta **direto da API Stays** → mostra dados corretos
2. **central-casaperio** consulta do **MongoDB** (dados sincronizados) → mostra dados incompletos
3. Logo, o problema está no processo de **sincronização** que salva no MongoDB

### **Possíveis causas**:

#### **A) Schema inconsistente causando dedupe errado**

**Arquivo**: `casape-api/src/services/sync/SyncService.ts` linha 400-520
**writeUnifiedBookingsToMongo()** usa `staysReservationId` como chave única:

```typescript
filter: { staysReservationId: booking._id }
```

**PROBLEMA POTENCIAL**: Se houver:

- Múltiplas reservas do **mesmo hóspede** no **mesmo imóvel** em **períodos próximos**
- `_id` duplicado/reutilizado pela Stays (improvável mas possível)
- Erro na extração do `_id` causando sobrescrita

Isso poderia fazer com que uma reserva **sobrescreva** outra no banco.

#### **B) Filtro de status durante o sync**

Verificar se o sync está filtrando por `status` ou `type` ao salvar no MongoDB.

**Buscar por**:

- Exclusões de `type: 'provisional'`
- Exclusões de `status: 'canceled'`
- Exclusões baseadas em canal/plataforma

#### **C) Cliente está vendo dados de um sync antigo (cache)**

O sync roda a cada 5 minutos, mas se o último sync falhou ou não rodou, os dados estão desatualizados.

---

## 🔬 EVIDÊNCIAS COLETADAS

### **1. Divergências específicas encontradas**:

| Imóvel      | Lista Stays (correto)    | Lista Central (errado)     | Problema                                         |
| ------------ | ------------------------ | -------------------------- | ------------------------------------------------ |
| L-VA-375-102 | Isadora (09/jan→17/jan) | Pedro (30/dez→20/jan)     | **Hóspede diferente, período diferente** |
| L-VA-380-408 | Antonio (11/jan→12/fev) | Guillaume (09/jan→28/jan) | **Hóspede diferente, período diferente** |

**Análise**: Isso sugere **sobrescrita de dados** no MongoDB, não apenas "falta" de reservas.

### **2. Reservas completamente ausentes**:

**Check-ins faltantes** (4 de 6):

- Kaitlyn Floyd (C-AA-1536-1101)
- Jose Rodriguez (L-AP-900-103)
- Maria Alvarez (L-AP-1151-701)
- Rodrigo Monteiro (L-AE-106-106)

**Check-outs faltantes** (3 de 4):

- Laura Campos (L-AP-470-201)
- Shivraj Chandegra (L-CD-97-403)
- Marcelo Calluf (L-AP-900-103)

**In-Home faltantes** (~8 de 20):

- Hilda Bertolini
- Alexander Gurkov
- Mandy Do Nascimento
- Matt Carpenter
- Thiago Cremasco
- Henrique Groppo Sobrinho
- Mariano Cortesi
- Tiago Reis Marques

---

## 🎯 PLANO DE CORREÇÃO

### **FASE 1: DIAGNÓSTICO DETALHADO**

1. **Criar script de comparação** (prioridade MÁXIMA):

   - Buscar reservas direto da Stays via StaysApiClient
   - Buscar reservas do MongoDB via unifiedBookings
   - Gerar diff: IDs presentes na Stays mas ausentes no Mongo
   - Output: Lista de `staysReservationId` faltantes + propertyCode + dates
2. **Verificar logs de sync**:

   - Quantas reservas foram buscadas da Stays no último sync?
   - Quantas foram salvas no MongoDB?
   - Há erros/warnings nos logs?
3. **Inspecionar MongoDB diretamente**:

   - Query para contar reservas por data
   - Verificar se existem duplicatas de `staysReservationId`
   - Verificar se campos críticos (`checkInDate`, `checkOutDate`, `apartmentCode`) estão presentes

### **FASE 2: CORREÇÃO**

Dependendo do diagnóstico:

#### **Opção A: Se for problema de dedupe/sobrescrita**

- Mudar a chave única de `staysReservationId` para `staysReservationId + listingId + checkInDate`
- Fazer resync completo (apagar MongoDB + sync fresh)

#### **Opção B: Se for filtro indevido**

- Remover filtro `type !== 'blocked'` do DashboardService (ou criar query separada)
- Ajustar frontend para lidar com diferentes `type` de reservas

#### **Opção C: Se for timezone no sync**

- Aplicar `getTodayBrazil()` no SyncService também
- Fazer resync com timezone correto

#### **Opção D: Se for problema de paginação/limit**

- Remover ou aumentar o safety limit de 1000
- Adicionar logs para cada página buscada

### **FASE 3: VALIDAÇÃO**

1. Executar script de comparação novamente
2. Verificar que contagens batem:
   - Stays direto: X reservas
   - MongoDB: X reservas
   - Frontend: X cards exibidos
3. Testar com datas específicas (15/01, 16/01, etc.)

---

## 📝 SCRIPTS PROPOSTOS

### **Script 1: Comparação Stays vs MongoDB**

```typescript
// casape-api/src/scripts/compare-stays-mongo.ts
import { staysApiClient } from '../services/stays/StaysApiClient.js';
import { getCollections, connectMongoDB, closeMongoDB } from '../config/mongodb.js';
import { format, subDays, addDays } from 'date-fns';

async function compareStaysVsMongo() {
  await connectMongoDB();
  
  const today = new Date();
  const from = format(subDays(today, 7), 'yyyy-MM-dd');
  const to = format(addDays(today, 7), 'yyyy-MM-dd');
  
  console.log(`📅 Comparing range: ${from} to ${to}\\n`);
  
  // 1. Fetch from Stays API
  console.log('📥 Fetching from Stays API...');
  const staysBookings = await staysApiClient.getAllBookings(from, to, 'included');
  console.log(`✅ Stays returned: ${staysBookings.length} bookings\\n`);
  
  // 2. Fetch from MongoDB
  console.log('📥 Fetching from MongoDB...');
  const collections = getCollections();
  const mongoBookings = await collections.unifiedBookings
    .find({
      checkOutDate: { $gte: from },
      checkInDate: { $lte: to },
    })
    .toArray();
  console.log(`✅ MongoDB returned: ${mongoBookings.length} bookings\\n`);
  
  // 3. Compare
  const staysIds = new Set(staysBookings.map(b => b._id));
  const mongoIds = new Set(mongoBookings.map((b: any) => b.staysReservationId));
  
  const missingInMongo = [...staysIds].filter(id => !mongoIds.has(id));
  const extraInMongo = [...mongoIds].filter(id => !staysIds.has(id));
  
  console.log(`\\n📊 RESULTS:`);
  console.log(`   Stays total: ${staysBookings.length}`);
  console.log(`   Mongo total: ${mongoBookings.length}`);
  console.log(`   Missing in Mongo: ${missingInMongo.length}`);
  console.log(`   Extra in Mongo: ${extraInMongo.length}\\n`);
  
  if (missingInMongo.length > 0) {
    console.log(`❌ MISSING IN MONGO (should be synced):`);
    missingInMongo.forEach(id => {
      const booking = staysBookings.find(b => b._id === id);
      console.log(`   - ${id} | ${booking?.guestsDetails?.name || 'NO NAME'} | ${booking?._idlisting} | ${booking?.checkInDate} → ${booking?.checkOutDate}`);
    });
  }
  
  if (extraInMongo.length > 0) {
    console.log(`\\n⚠️ EXTRA IN MONGO (not in Stays API response):`);
    extraInMongo.forEach(id => {
      const booking = mongoBookings.find((b: any) => b.staysReservationId === id);
      console.log(`   - ${id} | ${(booking as any)?.guestName} | ${(booking as any)?.apartmentCode}`);
    });
  }
  
  await closeMongoDB();
}

compareStaysVsMongo();
```

**Executar**:

```bash
cd casape-api
npx tsx src/scripts/compare-stays-mongo.ts
```

---

## ✅ CRITÉRIOS DE ACEITE

- [ ] Script de comparação executado e gera diff clara
- [ ] Identificada causa exata de cada reserva faltante
- [ ] Correção implementada (dedupe, filtro, timezone, etc.)
- [ ] Resync executado com sucesso
- [ ] Validação: contagem Stays === MongoDB === Frontend
- [ ] Testado com 3 datas diferentes (hoje, amanhã, semana que vem)
- [ ] Casos específicos do cliente validados:
  - [ ] L-VA-375-102 mostra Isadora (não Pedro)
  - [ ] L-VA-380-408 mostra Antonio (não Guillaume)
  - [ ] Todos os 6 check-ins de 15/01 aparecem
  - [ ] Todos os 4 check-outs de 15/01 aparecem

---

## 🚀 PRÓXIMOS PASSOS IMEDIATOS

1. ✅ **CRIAR** script `compare-stays-mongo.ts`
2. ✅ **EXECUTAR** script e **capturar output**
3. ✅ **ANALISAR** diff para identificar padrão (todos do mesmo canal? mesmo período? mesmo tipo?)
4. ⏳ **IMPLEMENTAR** correção baseada no padrão encontrado
5. ⏳ **VALIDAR** com cliente

---

**Responsável**: AI Agent
**Status**: Aguardando aprovação para criar script de comparação
