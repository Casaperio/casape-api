# 🧪 Como Adicionar uma Reserva de Teste

Este guia explica como adicionar uma reserva de teste **diretamente no MongoDB** para validar o sistema de detecção automática e popup de comemoração.

## 📋 Pré-requisitos

1. MongoDB configurado (arquivo `.env` com `MONGODB_URI` e `MONGODB_DB`)
2. stays-api rodando ou parada (não importa)
3. centralcasape2 rodando no navegador

## 🚀 Passo a Passo

### 1. Navegue até o diretório da stays-api

```bash
cd /Volumes/DouglasNvme/Documents/GitHub/casape/stays-api
```

### 2. Execute o script de teste

```bash
npm run test:add-reservation
```

### 3. O que vai acontecer

O script irá:
- ✅ Conectar ao MongoDB
- ✅ Criar uma reserva de teste com dados fictícios
- ✅ Inserir na collection `stays_unified_bookings`
- ✅ Mostrar os detalhes da reserva criada

Exemplo de saída:

```
🧪 ===== ADICIONANDO RESERVA DE TESTE =====

✅ Conectado ao MongoDB
📝 Reserva de teste: {
  id: 'test-1702847123456',
  hóspede: 'Teste Automático 14:32:03',
  propriedade: 'I-AC-101',
  checkIn: '2025-12-17T14:32:03.000Z',
  checkOut: '2025-12-21T14:32:03.000Z',
  valor: 'BRL 3500'
}

✅ Reserva adicionada com sucesso!
📌 ID no MongoDB: test-1702847123456

⏳ Aguarde até 5 minutos para o próximo polling do sistema...
🎉 O popup de comemoração deve aparecer automaticamente!
```

### 4. Validar o Popup de Comemoração

#### Opção A: Aguardar o Polling Automático (Recomendado)
- O sistema faz polling a cada **5 minutos**
- Quando o próximo polling executar, o sistema detectará a nova reserva
- O popup de comemoração aparecerá automaticamente com:
  - 🎊 Confetes animados
  - 🎵 Som de celebração
  - 📋 Dados da reserva (nome, propriedade, datas, valor)
  - ⏱️ Auto-fechamento após 10 segundos

#### Opção B: Forçar Refresh Manual (Mais Rápido)
1. Abra o centralcasape2 no navegador
2. Clique no botão de **refresh/sync manual** (se disponível)
3. Ou recarregue a página (F5)
4. O popup deve aparecer imediatamente

## 🔍 Como Verificar se Funcionou

### No Console do Navegador (F12):

Você verá logs como:

```
🔍 [NEW RESERVATION DETECTOR] useEffect executou
  📊 Total atual: 24 reservas
  📚 Total anterior: 23 reservas
  🔎 Comparação: 1 nova(s) reserva(s) detectada(s)
🎉 ========================================
🎉 NOVAS RESERVAS DETECTADAS!
🎉 ========================================
  Quantidade: 1
  Detalhes: [ { nome: 'Teste Automático 14:32:03', propriedade: 'I-AC-101', checkIn: '2025-12-17T14:32:03.000Z' } ]
  ✅ Popup ativado, som tocado, log e notificação criados
  ⏱️ Auto-fechará em 10 segundos
```

### No MongoDB (opcional):

Você pode verificar a reserva diretamente:

```bash
# Conectar ao MongoDB e buscar a reserva de teste
mongosh "<sua-connection-string>"
> use stays-db
> db.stays_unified_bookings.find({ _id: /^test-/ })
```

## 🗑️ Remover a Reserva de Teste

Depois de validar, você pode remover a reserva:

```bash
# Via mongosh
mongosh "<sua-connection-string>"
> use stays-db
> db.stays_unified_bookings.deleteMany({ _id: /^test-/ })
```

## ⚙️ Configuração do Sistema

O sistema de detecção automática funciona assim:

1. **React Query** faz polling da stays-api a cada **5 minutos** (REFETCH_INTERVAL)
2. **useEffect** no App.tsx compara `staysReservations` atual vs. anterior
3. Se detectar novos IDs, dispara o popup automaticamente
4. **Funciona em qualquer tela administrativa** (exceto kiosk e field app)

## 🐛 Troubleshooting

### "❌ MONGODB_URI não configurado no .env"
- Verifique se o arquivo `.env` existe em `stays-api/`
- Certifique-se que contém `MONGODB_URI=mongodb+srv://...`

### Popup não apareceu
1. Verifique os logs do console (F12)
2. Confirme que está em uma tela administrativa (não kiosk)
3. Force um refresh manual
4. Verifique se a stays-api está acessível

### Reserva não foi adicionada
- Verifique a conexão com o MongoDB
- Confirme as credenciais no `.env`
- Veja os erros no terminal ao executar o script

## 📝 Modificar os Dados de Teste

Edite o arquivo `add-test-reservation.ts` e ajuste os valores:

```typescript
const testReservation = {
  guestName: 'SEU NOME AQUI',  // Altere o nome
  propertyCode: 'I-AC-105',     // Altere a propriedade
  totalValue: 5000,             // Altere o valor
  nights: 7,                    // Altere as noites
  // ...
};
```

Depois execute novamente: `npm run test:add-reservation`
