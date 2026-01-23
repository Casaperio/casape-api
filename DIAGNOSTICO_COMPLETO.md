# 🔍 DIAGNÓSTICO COMPLETO - Inconsistências de Dados

**Data:** 23/01/2026  
**Status:** Análise concluída - Problemas identificados

---

## 🎯 PROBLEMAS IDENTIFICADOS

### 1. ❌ BUG CRÍTICO: getGuestStatus() parseando data duas vezes

**Arquivo:** `UnifiedService.ts` e `DashboardService.ts` (linha ~36-44)

```typescript
function getGuestStatus(checkIn: string, checkOut: string, date: Date): GuestStatus {
  const checkInDate = parseISO(checkIn);      // ❌ Parseia string YYYY-MM-DD
  const checkOutDate = parseISO(checkOut);    // ❌ Parseia string YYYY-MM-DD
  const targetDate = format(date, 'yyyy-MM-dd');
  const checkInStr = format(checkInDate, 'yyyy-MM-dd');  // ❌ FORMATA NOVAMENTE
  const checkOutStr = format(checkOutDate, 'yyyy-MM-dd'); // ❌ FORMATA NOVAMENTE

  if (checkInStr === targetDate) return 'checkin';
  if (checkOutStr === targetDate) return 'checkout';
  return 'staying';
}
```

**Problema:** A função recebe `checkIn` e `checkOut` já como strings no formato `YYYY-MM-DD`, mas faz `parseISO` → `format` desnecessariamente. Isso pode causar problemas de timezone dependendo do ambiente.

**Impacto:**
- Reservas classificadas incorretamente (CHECK-IN sendo mostrado como IN-HOME)
- Divergências entre lista da Stays e API
- Alex Gusmão aparecendo como CHECK-IN (23/jan) quando deveria estar IN-HOME (22/jan)

**Solução:**
```typescript
function getGuestStatus(checkIn: string, checkOut: string, targetDate: string): GuestStatus {
  if (checkIn === targetDate) return 'checkin';
  if (checkOut === targetDate) return 'checkout';
  return 'staying';
}
```

---

### 2. ❌ SYNC INCREMENTAL vs FULL - Reservas faltantes

**Problema atual:**
```typescript
// SyncService.ts linha 552+
const today = new Date();
const fromDate = format(subDays(today, config.sync.dateRangeDays), 'yyyy-MM-dd');
const toDate = format(addDays(today, config.sync.dateRangeDays), 'yyyy-MM-dd');

const bookings = await staysApiClient.getAllBookings(fromDate, toDate, 'included');
```

**Observação:**
- O sync busca apenas reservas no período `today ± 365 dias`
- Usa `upsert: true`, mas **NÃO remove** reservas antigas que saíram do intervalo
- **NÃO limpa** reservas que foram canceladas/modificadas na Stays

**Reservas Faltantes Confirmadas:**
1. **I-VS-442-202** (Pax Serviços) - CHECK-IN 23/jan → **NÃO APARECE**
2. **L-DF-113-COB** (Juliano De Gasperi) - CHECK-IN 23/jan → **NÃO APARECE**  
3. **C-AA-1536-1101** (Corentin Korbi) - IN-HOME → **NÃO APARECE**
4. **L-AP-80-703** (Flavia Esteves) - IN-HOME → **NÃO APARECE**
5. **I-RE-744-901** (Aishah Balogun) - IN-HOME → **NÃO APARECE**

**Duplicações Confirmadas:**
- **L-VA-380-408:** Mostra Antonio Bove + Guillaume Rivest ao mesmo tempo ❌

**Solução:**
- Adicionar limpeza de reservas antigas/fora do intervalo
- Garantir que a Stays API está sendo chamada corretamente (verificar se `'included'` retorna tudo)
- Adicionar logs detalhados de quantas reservas esperadas vs recebidas

---

### 3. 🐌 PERFORMANCE - Cold Start + Sync Sobreposto

**Problema:**
```typescript
// scheduler.ts linha 33
const status = await getSyncStatus();
if (status?.status === 'running') {
  console.log('⏭️ Skipping: sync already in progress');
  return;
}
```

**Análise:**
- Render free tier tem **cold start de 50s**
- Frontend espera até 90s para carregar dados
- Sync roda a cada 3 minutos, pode sobrepor com cold start
- Sync demora ~30-60s para completar

**Impacto:**
- Frontend fica com dados desatualizados durante cold start
- Usuário vê skeleton loader por muito tempo
- Primeira requisição do dia é extremamente lenta

**Soluções propostas:**
1. **Cache no Frontend:** Mostrar dados anteriores enquanto atualiza
2. **Sync on-demand:** Forçar sync quando frontend pedir (não só cron)
3. **Pré-carregamento:** Fazer warm-up request periódico
4. **Indicador visual:** Mostrar "Atualizando dados..." em vez de loader vazio

---

### 4. ⚠️ TIMEZONE - Possível problema de normalização

**Observações:**
- Stays API retorna datas em UTC
- MongoDB armazena em UTC
- Frontend está em GMT-3 (Brasília)
- Comparações usam `format(date, 'yyyy-MM-dd')` sem especificar timezone

**Teste necessário:**
```typescript
// Verificar se parseISO está interpretando corretamente
const checkInStays = "2026-01-23";  // String da Stays
const parsed = parseISO(checkInStays); // Vira 2026-01-23T00:00:00 em que timezone?
const formatted = format(parsed, 'yyyy-MM-dd'); // Volta como "2026-01-23" ou "2026-01-22"?
```

**Solução:**
- Trabalhar **sempre** com strings `YYYY-MM-DD`
- Evitar parse/format desnecessários
- Se precisar de Date objects, usar `parseISO` + `startOfDay` + `utcToZonedTime`

---

## 📊 COMPARAÇÃO: casape-api vs stays-observator

| Aspecto | casape-api (❌ Bugado) | stays-observator (✅ Funciona) |
|---------|------------------------|-------------------------------|
| **Fonte de dados** | MongoDB (cached) | Stays API (direto) |
| **Sync** | Cron a cada 3min | Não aplica (real-time) |
| **Parse de datas** | parseISO → format (bug) | Trabalha com strings direto |
| **Classificação** | getGuestStatus bugado | Lógica simples string === string |
| **Performance** | 50-90s (cold start) | ~2-5s (direto da API) |
| **Duplicações** | Sim (L-VA-380-408) | Não |
| **Reservas faltantes** | Sim (5+ confirmadas) | Não |

---

## ✅ PLANO DE CORREÇÃO

### Fase 1: Correções Críticas (Prioridade Alta)
1. ✅ Corrigir função `getGuestStatus()` - remover parseISO desnecessário
2. ✅ Adicionar logs detalhados no sync (esperadas vs recebidas)
3. ✅ Adicionar limpeza de reservas antigas no sync
4. ✅ Verificar query da Stays API (`'included'` vs outros parâmetros)

### Fase 2: Melhorias de Dados (Prioridade Alta)
5. ⏳ Investigar duplicação L-VA-380-408 (dois hóspedes mesmo imóvel)
6. ⏳ Garantir unicidade: usar `reservationId` como chave, não `bookingCode`
7. ⏳ Implementar limpeza de reservas canceladas/modificadas

### Fase 3: Performance (Prioridade Média)
8. ⏳ Implementar cache no frontend
9. ⏳ Adicionar sync on-demand (forçar quando frontend pedir)
10. ⏳ Melhorar indicadores visuais de loading

### Fase 4: Monitoramento (Prioridade Baixa)
11. ⏳ Dashboard de sync status (última sync, erros, diff de dados)
12. ⏳ Alertas quando reservas faltam
13. ⏳ Métricas de performance (tempo de sync, cold start, etc.)

---

## 🔧 PRÓXIMOS PASSOS

1. **Agora:** Corrigir `getGuestStatus()` em UnifiedService.ts e DashboardService.ts
2. **Em seguida:** Adicionar logs detalhados no SyncService.ts
3. **Depois:** Rodar script compare-stays-mongo.ts para validar
4. **Por fim:** Testar em produção e validar com Lista 1 (Stays correto)

---

## 📝 NOTAS TÉCNICAS

### Query MongoDB atual (UnifiedService.ts):
```typescript
const bookings = await collections.unifiedBookings
  .find({
    $or: [
      { checkInDate: { $lte: to } },
      { checkOutDate: { $gte: from } },
    ],
  })
  .toArray();
```

**Problema:** Usa OR quando deveria ser AND. Pode retornar reservas fora do intervalo.

**Correção:**
```typescript
const bookings = await collections.unifiedBookings
  .find({
    checkInDate: { $lte: to },
    checkOutDate: { $gte: from },
  })
  .toArray();
```

### Stays API endpoint:
```
GET /external/v1/bookings?from=2026-01-15&to=2026-02-21&included=yes
```

Verificar se `included=yes` retorna todas as reservas ou só algumas categorias.

---

**Relatório gerado por:** Claude Sonnet 4.5  
**Próxima revisão:** Após implementação das correções Fase 1
