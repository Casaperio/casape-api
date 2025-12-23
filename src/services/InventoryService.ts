/**
 * Inventory Service
 * CRUD operations for inventory management and Stays.net reference data sync
 */

import { ObjectId } from 'mongodb';
import { getDb } from '../config/mongodb.js';
import { staysApiClient } from './stays/StaysApiClient.js';
import type {
  InventoryItemDoc,
  InventoryTransactionDoc,
  InventoryReferenceCategory,
  InventoryReferenceItem,
  InventoryReferenceCondition,
  CreateInventoryItemInput,
  UpdateInventoryItemInput,
  CreateTransactionInput,
  InventorySyncStats,
  SyncCategoryStats,
  InventoryReferenceData,
  PropertyAmenity,
} from './stays/types.js';

// Collection names
const COLLECTIONS = {
  ITEMS: 'inventory_items',
  TRANSACTIONS: 'inventory_transactions',
  REF_CATEGORIES: 'inventory_reference_categories',
  REF_ITEMS: 'inventory_reference_items',
  REF_CONDITIONS: 'inventory_reference_conditions',
} as const;

// ============ INVENTORY ITEMS CRUD ============

/**
 * Get all inventory items sorted by name
 */
export async function getAllItems(): Promise<InventoryItemDoc[]> {
  const db = getDb();
  const docs = await db.collection(COLLECTIONS.ITEMS)
    .find({})
    .sort({ name: 1 })
    .toArray();

  return docs.map(doc => ({
    ...doc,
    _id: doc._id.toString(),
    id: doc._id.toString(),
  })) as unknown as InventoryItemDoc[];
}

/**
 * Get a single inventory item by ID
 */
export async function getItemById(id: string): Promise<InventoryItemDoc | null> {
  const db = getDb();

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return null;
  }

  const doc = await db.collection(COLLECTIONS.ITEMS).findOne({ _id: objectId });

  if (!doc) return null;

  return {
    ...doc,
    _id: doc._id.toString(),
    id: doc._id.toString(),
  } as unknown as InventoryItemDoc;
}

/**
 * Create a new inventory item
 */
export async function createItem(input: CreateInventoryItemInput): Promise<InventoryItemDoc> {
  const db = getDb();
  const now = new Date();

  const doc = {
    name: input.name,
    brand: input.brand,
    model: input.model,
    dimensions: input.dimensions,
    description: input.description,
    category: input.category,
    minStock: input.minStock,
    stock: input.stock || { CENTRAL: 0 },
    staysReferenceItemId: input.staysReferenceItemId,
    staysReferenceCategoryId: input.staysReferenceCategoryId,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection(COLLECTIONS.ITEMS).insertOne(doc);

  return {
    ...doc,
    _id: result.insertedId.toString(),
    id: result.insertedId.toString(),
  } as unknown as InventoryItemDoc;
}

/**
 * Update an existing inventory item
 */
export async function updateItem(
  id: string,
  updates: UpdateInventoryItemInput
): Promise<InventoryItemDoc | null> {
  const db = getDb();

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return null;
  }

  // Remove undefined values from updates
  const cleanUpdates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      cleanUpdates[key] = value;
    }
  }

  const result = await db.collection(COLLECTIONS.ITEMS).findOneAndUpdate(
    { _id: objectId },
    { $set: { ...cleanUpdates, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );

  if (!result) return null;

  return {
    ...result,
    _id: result._id.toString(),
    id: result._id.toString(),
  } as unknown as InventoryItemDoc;
}

/**
 * Delete an inventory item
 */
export async function deleteItem(id: string): Promise<boolean> {
  const db = getDb();

  let objectId: ObjectId;
  try {
    objectId = new ObjectId(id);
  } catch {
    return false;
  }

  const result = await db.collection(COLLECTIONS.ITEMS).deleteOne({ _id: objectId });
  return result.deletedCount > 0;
}

// ============ INVENTORY TRANSACTIONS ============

/**
 * Get all transactions with optional filters
 */
export async function getAllTransactions(options?: {
  itemId?: string;
  limit?: number;
  skip?: number;
}): Promise<InventoryTransactionDoc[]> {
  const db = getDb();
  const query: Record<string, unknown> = {};

  if (options?.itemId) {
    query.itemId = options.itemId;
  }

  let cursor = db.collection(COLLECTIONS.TRANSACTIONS)
    .find(query)
    .sort({ timestamp: -1 });

  if (options?.skip) {
    cursor = cursor.skip(options.skip);
  }

  if (options?.limit) {
    cursor = cursor.limit(options.limit);
  }

  const docs = await cursor.toArray();

  return docs.map(doc => ({
    ...doc,
    _id: doc._id.toString(),
    id: doc._id.toString(),
  })) as unknown as InventoryTransactionDoc[];
}

/**
 * Create a transaction (stock movement) with stock validation and update
 */
export async function createTransaction(
  input: CreateTransactionInput
): Promise<{ transaction: InventoryTransactionDoc; updatedItem: InventoryItemDoc }> {
  const db = getDb();
  const now = new Date();

  // 1. Get the item
  const item = await getItemById(input.itemId);
  if (!item) {
    throw new Error(`Item not found: ${input.itemId}`);
  }

  // 2. Validate stock availability (except for PURCHASE from VENDOR)
  if (input.source !== 'VENDOR') {
    const currentStock = item.stock[input.source] || 0;
    if (currentStock < input.quantity) {
      throw new Error(
        `Insufficient stock in ${input.source}. Available: ${currentStock}, Requested: ${input.quantity}`
      );
    }
  }

  // 3. Calculate new stock
  const newStock = { ...item.stock };

  // Remove from source (if not vendor)
  if (input.source !== 'VENDOR') {
    newStock[input.source] = Math.max(0, (newStock[input.source] || 0) - input.quantity);
    // Clean up zero values to keep stock object clean
    if (newStock[input.source] === 0 && input.source !== 'CENTRAL') {
      delete newStock[input.source];
    }
  }

  // Add to destination (if not trash)
  if (input.destination !== 'TRASH') {
    newStock[input.destination] = (newStock[input.destination] || 0) + input.quantity;
  }

  // 4. Create transaction document
  const txDoc = {
    itemId: input.itemId,
    itemName: item.name,
    type: input.type,
    quantity: input.quantity,
    source: input.source,
    destination: input.destination,
    user: input.user,
    notes: input.notes,
    timestamp: now,
    createdAt: now,
  };

  // 5. Insert transaction and update item stock
  const [txResult] = await Promise.all([
    db.collection(COLLECTIONS.TRANSACTIONS).insertOne(txDoc),
    db.collection(COLLECTIONS.ITEMS).updateOne(
      { _id: new ObjectId(input.itemId) },
      { $set: { stock: newStock, updatedAt: now } }
    ),
  ]);

  const transaction: InventoryTransactionDoc = {
    ...txDoc,
    _id: txResult.insertedId.toString(),
    id: txResult.insertedId.toString(),
  } as unknown as InventoryTransactionDoc;

  const updatedItem: InventoryItemDoc = {
    ...item,
    stock: newStock,
    updatedAt: now,
  };

  return { transaction, updatedItem };
}

// ============ REFERENCE DATA SYNC ============

/**
 * Sync reference data from Stays.net
 */
export async function syncReferenceData(): Promise<{
  categories: number;
  items: number;
  conditions: number;
}> {
  const db = getDb();
  const now = new Date();

  console.log('📥 Syncing inventory reference data from Stays.net...');

  // Fetch from Stays.net API in parallel
  const [categories, items, conditions] = await Promise.all([
    staysApiClient.getInventoryCategories(),
    staysApiClient.getInventoryItems(),
    staysApiClient.getInventoryConditions(),
  ]);

  console.log(`  Found: ${categories.length} categories, ${items.length} items, ${conditions.length} conditions`);

  let catCount = 0;
  let itemCount = 0;
  let condCount = 0;

  // Upsert categories
  if (categories.length > 0) {
    const catOps = categories.map(cat => ({
      updateOne: {
        filter: { staysCategoryId: cat._id },
        update: {
          $set: {
            staysCategoryId: cat._id,
            titles: cat._mstitle,
            titlePtBr: cat._mstitle?.pt_BR || cat._mstitle?.en_US || '',
            syncedAt: now,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    }));

    const catResult = await db.collection(COLLECTIONS.REF_CATEGORIES).bulkWrite(catOps);
    catCount = (catResult.upsertedCount || 0) + (catResult.modifiedCount || 0);
  }

  // Upsert items
  if (items.length > 0) {
    const itemOps = items.map(item => ({
      updateOne: {
        filter: { staysItemId: item._id },
        update: {
          $set: {
            staysItemId: item._id,
            titles: item._mstitle,
            titlePtBr: item._mstitle?.pt_BR || item._mstitle?.en_US || '',
            categoryId: item.categoryId,
            syncedAt: now,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    }));

    const itemResult = await db.collection(COLLECTIONS.REF_ITEMS).bulkWrite(itemOps);
    itemCount = (itemResult.upsertedCount || 0) + (itemResult.modifiedCount || 0);
  }

  // Upsert conditions
  if (conditions.length > 0) {
    const condOps = conditions.map(cond => ({
      updateOne: {
        filter: { staysConditionId: cond._id },
        update: {
          $set: {
            staysConditionId: cond._id,
            titles: cond._mstitle,
            titlePtBr: cond._mstitle?.pt_BR || cond._mstitle?.en_US || '',
            syncedAt: now,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    }));

    const condResult = await db.collection(COLLECTIONS.REF_CONDITIONS).bulkWrite(condOps);
    condCount = (condResult.upsertedCount || 0) + (condResult.modifiedCount || 0);
  }

  console.log(`✅ Reference sync complete: ${catCount} categories, ${itemCount} items, ${condCount} conditions`);

  return {
    categories: catCount,
    items: itemCount,
    conditions: condCount,
  };
}

/**
 * Get all reference categories
 */
export async function getReferenceCategories(): Promise<InventoryReferenceCategory[]> {
  const db = getDb();
  const docs = await db.collection(COLLECTIONS.REF_CATEGORIES).find({}).toArray();
  return docs.map(doc => ({
    ...doc,
    _id: doc._id.toString(),
  })) as unknown as InventoryReferenceCategory[];
}

/**
 * Get all reference items
 */
export async function getReferenceItems(): Promise<InventoryReferenceItem[]> {
  const db = getDb();
  const docs = await db.collection(COLLECTIONS.REF_ITEMS).find({}).toArray();
  return docs.map(doc => ({
    ...doc,
    _id: doc._id.toString(),
  })) as unknown as InventoryReferenceItem[];
}

/**
 * Get all reference conditions
 */
export async function getReferenceConditions(): Promise<InventoryReferenceCondition[]> {
  const db = getDb();
  const docs = await db.collection(COLLECTIONS.REF_CONDITIONS).find({}).toArray();
  return docs.map(doc => ({
    ...doc,
    _id: doc._id.toString(),
  })) as unknown as InventoryReferenceCondition[];
}

// ==================== COMPREHENSIVE SYNC FUNCTIONS ====================

/**
 * Comprehensive sync of ALL Stays.net reference data
 * Extends existing syncReferenceData to include amenities and property linking
 */
export async function syncAllStaysReferenceData(options: {
  populate?: boolean;
} = {}): Promise<InventorySyncStats> {
  const startTime = Date.now();
  const stats: InventorySyncStats = {
    categories: { added: 0, updated: 0, total: 0 },
    items: { added: 0, updated: 0, total: 0 },
    conditions: { added: 0, updated: 0, total: 0 },
    amenities: { added: 0, updated: 0, total: 0 },
    properties_updated: 0,
    sync_duration_ms: 0,
    sync_timestamp: new Date(),
    errors: []
  };

  try {
    console.log('📥 Starting comprehensive Stays.net sync...');

    // Step 1: Sync existing reference data (categories, items, conditions)
    const basicSyncResult = await syncReferenceData();
    stats.categories = {
      added: basicSyncResult.categories,
      updated: 0,
      total: basicSyncResult.categories
    };
    stats.items = {
      added: basicSyncResult.items,
      updated: 0,
      total: basicSyncResult.items
    };
    stats.conditions = {
      added: basicSyncResult.conditions,
      updated: 0,
      total: basicSyncResult.conditions
    };

    // Step 2: Sync amenities catalog
    const amenitiesStats = await syncAmenities();
    stats.amenities = amenitiesStats;

    // Step 3: Sync property amenities from enhanced listings
    const propertiesStats = await syncPropertyAmenities();
    stats.properties_updated = propertiesStats.updated;

    // Step 4: Generate amenity→inventory suggestions
    await generateAmenitySuggestions();

    // Step 5 (optional): Populate inventory from reference catalog
    if (options.populate) {
      console.log('📦 Populating inventory items from reference catalog...');
      const populateStats = await populateInventoryFromReference();
      stats.inventory_populated = populateStats;
    }

    stats.sync_duration_ms = Date.now() - startTime;

    // Log sync event
    await logSyncEvent(stats);

    console.log(`✅ Comprehensive sync complete in ${(stats.sync_duration_ms / 1000).toFixed(2)}s`);

    return stats;
  } catch (error) {
    stats.errors?.push((error as Error).message);
    stats.sync_duration_ms = Date.now() - startTime;
    console.error('❌ Sync failed:', error);
    throw error;
  }
}

/**
 * Sync amenities catalog from Stays.net
 */
async function syncAmenities(): Promise<SyncCategoryStats> {
  console.log('📥 Syncing amenities from Stays.net...');
  const db = getDb();

  const amenitiesData = await staysApiClient.getAmenities();

  if (!amenitiesData?.length) {
    console.log('⚠️ No amenities data received from Stays.net');
    return { added: 0, updated: 0, total: 0 };
  }

  const collection = db.collection('inventory_reference_amenities');
  const bulkOps = amenitiesData.map((amenity: any) => ({
    updateOne: {
      filter: { stays_amenity_id: amenity._id },
      update: {
        $set: {
          stays_amenity_id: amenity._id,
          names: {
            pt_BR: amenity._mstitle?.pt_BR || amenity._mstitle?.['pt-BR'] || amenity.name || 'Sem nome',
            en_US: amenity._mstitle?.en_US || amenity._mstitle?.['en-US'] || amenity.name || 'No name',
            es_ES: amenity._mstitle?.es_ES || amenity._mstitle?.['es-ES']
          },
          description: amenity.description ? {
            pt_BR: amenity.description.pt_BR || amenity.description['pt-BR'],
            en_US: amenity.description.en_US || amenity.description['en-US']
          } : undefined,
          category: categorizeAmenity(amenity._mstitle?.pt_BR || amenity.name || ''),
          icon: mapAmenityIcon(amenity._mstitle?.pt_BR || amenity.name || ''),
          last_synced: new Date(),
          updatedAt: new Date(),
          metadata: { stays_raw_data: amenity }
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      upsert: true
    }
  }));

  const result = await collection.bulkWrite(bulkOps);

  console.log(`✅ Synced ${amenitiesData.length} amenities (${result.upsertedCount} new, ${result.modifiedCount} updated)`);

  return {
    added: result.upsertedCount,
    updated: result.modifiedCount,
    total: amenitiesData.length
  };
}

/**
 * Sync property amenities from enhanced listings
 */
async function syncPropertyAmenities(): Promise<{ updated: number }> {
  console.log('📥 Syncing property amenities...');
  const db = getDb();

  const listings = await staysApiClient.getAllEnhancedListings();
  const propertiesCollection = db.collection('stays_properties');
  const amenitiesCollection = db.collection('inventory_reference_amenities');

  let updated = 0;

  for (const listing of listings) {
    if (!listing.amenities?.length) continue;

    // Enrich amenity data from reference collection
    const enrichedAmenities: PropertyAmenity[] = [];

    for (const amenityId of listing.amenities) {
      const refAmenity: any = await amenitiesCollection.findOne({
        stays_amenity_id: typeof amenityId === 'string' ? amenityId : amenityId._id
      });

      if (refAmenity) {
        enrichedAmenities.push({
          stays_amenity_id: refAmenity.stays_amenity_id,
          name: {
            pt_BR: refAmenity.names.pt_BR,
            en_US: refAmenity.names.en_US
          },
          description: refAmenity.description,
          category: refAmenity.category,
          icon: refAmenity.icon,
          last_verified: new Date()
        });
      }
    }

    if (enrichedAmenities.length > 0) {
      await propertiesCollection.updateOne(
        { stays_listing_id: listing._id },
        {
          $set: {
            amenities: enrichedAmenities,
            amenities_last_synced: new Date()
          }
        },
        { upsert: true }
      );

      updated++;
    }
  }

  console.log(`✅ Updated amenities for ${updated} properties`);
  return { updated };
}

/**
 * Generate AI suggestions for linking amenities to inventory items
 */
async function generateAmenitySuggestions(): Promise<void> {
  console.log('🔍 Generating amenity→inventory suggestions...');
  const db = getDb();

  const propertiesCollection = db.collection('stays_properties');
  const inventoryCollection = db.collection(COLLECTIONS.ITEMS);

  const properties = await propertiesCollection.find({
    amenities: { $exists: true, $ne: [] }
  }).toArray();

  for (const property of properties) {
    const updatedAmenities = [];

    for (const amenity of (property.amenities || [])) {
      // Proteção: amenity.name.pt_BR pode ser undefined
      const amenityName = amenity.name?.pt_BR || amenity.name?.en_US || '';
      if (!amenityName) continue; // Skip amenidades sem nome

      const keywords = extractKeywords(amenityName);

      const suggestions = await inventoryCollection
        .find({
          $or: [
            { name: { $regex: keywords, $options: 'i' } },
            { 'multilingual_names.pt_BR': { $regex: keywords, $options: 'i' } },
            { description: { $regex: keywords, $options: 'i' } }
          ]
        })
        .limit(3)
        .toArray();

      updatedAmenities.push({
        ...amenity,
        suggested_inventory_items: suggestions.map(s => s._id.toString())
      });
    }

    await propertiesCollection.updateOne(
      { _id: property._id },
      { $set: { amenities: updatedAmenities } }
    );
  }

  console.log('✅ Generated suggestions for all properties');
}

/**
 * Get all reference data for frontend consumption
 */
export async function getReferenceData(): Promise<InventoryReferenceData> {
  const db = getDb();

  const [categories, items, conditions, amenities] = await Promise.all([
    db.collection(COLLECTIONS.REF_CATEGORIES).find({}).toArray(),
    db.collection(COLLECTIONS.REF_ITEMS).find({}).toArray(),
    db.collection(COLLECTIONS.REF_CONDITIONS).find({}).toArray(),
    db.collection('inventory_reference_amenities').find({}).toArray()
  ]);

  return {
    categories: categories.map((c: any) => ({
      stays_category_id: c.staysCategoryId,
      names: { pt_BR: c.titlePtBr, en_US: c.titles?.en_US || c.titlePtBr }
    })),
    items: items.map((i: any) => ({
      stays_item_id: i.staysItemId,
      stays_category_id: i.categoryId,
      names: { pt_BR: i.titlePtBr, en_US: i.titles?.en_US || i.titlePtBr }
    })),
    conditions: conditions.map((c: any) => ({
      stays_condition_id: c.staysConditionId,
      names: { pt_BR: c.titlePtBr, en_US: c.titles?.en_US || c.titlePtBr }
    })),
    amenities: amenities.map((a: any) => ({
      stays_amenity_id: a.stays_amenity_id,
      names: a.names,
      category: a.category,
      icon: a.icon
    }))
  };
}

/**
 * Get property amenities with suggestions
 */
export async function getPropertyAmenities(propertyId: string): Promise<PropertyAmenity[]> {
  const db = getDb();
  const propertiesCollection = db.collection('stays_properties');

  // Try to find by MongoDB _id or stays_listing_id
  const property = await propertiesCollection.findOne({
    $or: [
      { _id: propertyId as any },
      { stays_listing_id: propertyId }
    ]
  });

  return property?.amenities || [];
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Categorize amenity for organization
 */
function categorizeAmenity(name: string): string {
  const categories: Record<string, string[]> = {
    'kitchen': ['cozinha', 'kitchen', 'geladeira', 'fridge', 'fogão', 'stove', 'microondas', 'microwave', 'cafeteira', 'coffee'],
    'bathroom': ['banheiro', 'bathroom', 'chuveiro', 'shower', 'toalha', 'towel', 'secador', 'dryer'],
    'bedroom': ['quarto', 'bedroom', 'cama', 'bed', 'travesseiro', 'pillow', 'lençol', 'sheet', 'cobertor', 'blanket'],
    'electronics': ['tv', 'wi-fi', 'wifi', 'ar condicionado', 'air conditioning', 'ventilador', 'fan', 'aquecedor', 'heater'],
    'outdoor': ['piscina', 'pool', 'jardim', 'garden', 'churrasqueira', 'grill', 'varanda', 'balcony', 'terraço', 'terrace'],
    'safety': ['alarme', 'alarm', 'extintor', 'extinguisher', 'cofre', 'safe', 'câmera', 'camera'],
    'cleaning': ['limpeza', 'cleaning', 'vassoura', 'broom', 'aspirador', 'vacuum', 'ferro', 'iron'],
    'entertainment': ['jogos', 'games', 'livros', 'books', 'música', 'music', 'netflix'],
    'laundry': ['lavanderia', 'laundry', 'máquina de lavar', 'washing machine', 'secadora', 'dryer'],
    'accessibility': ['acessibilidade', 'accessibility', 'rampa', 'ramp', 'elevador', 'elevator']
  };

  const nameLower = name.toLowerCase();

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => nameLower.includes(kw))) {
      return category;
    }
  }

  return 'general';
}

/**
 * Map amenity to icon identifier (Lucide React icons)
 */
function mapAmenityIcon(name: string): string {
  const iconMap: Record<string, string> = {
    'kitchen': 'ChefHat',
    'bathroom': 'Bath',
    'bedroom': 'Bed',
    'electronics': 'Tv',
    'outdoor': 'Trees',
    'safety': 'Shield',
    'cleaning': 'Sparkles',
    'entertainment': 'Gamepad2',
    'laundry': 'WashingMachine',
    'accessibility': 'Accessibility',
    'general': 'Package'
  };

  const category = categorizeAmenity(name);
  return iconMap[category] || 'Package';
}

/**
 * Extract keywords for matching
 */
function extractKeywords(text: string): string {
  // Proteção contra undefined/null/empty
  if (!text) return '';

  // Remove articles, prepositions, extract core words
  const stopWords = ['de', 'da', 'do', 'para', 'com', 'sem', 'the', 'of', 'for', 'with', 'a', 'o', 'as', 'os'];
  const words = text.toLowerCase().split(/\s+/);
  const keywords = words.filter(w => !stopWords.includes(w) && w.length > 2);
  return keywords.join('|');
}

/**
 * Populate inventory_items from reference catalog with quantity 0
 * Creates items that don't exist yet, preserving existing items
 */
export async function populateInventoryFromReference(): Promise<{
  created: number;
  skipped: number;
  total: number;
}> {
  console.log('📦 Populating inventory from reference catalog...');
  const db = getDb();

  const refItemsCollection = db.collection(COLLECTIONS.REF_ITEMS);
  const itemsCollection = db.collection(COLLECTIONS.ITEMS);

  // Get all reference items
  const referenceItems = await refItemsCollection.find({}).toArray();

  let created = 0;
  let skipped = 0;

  for (const refItem of referenceItems) {
    // Check if item already exists by staysReferenceItemId (correct field)
    // OR by old field name (for migration)
    const exists = await itemsCollection.findOne({
      $or: [
        { staysReferenceItemId: refItem.stays_item_id },
        { stays_reference_item_id: refItem.stays_item_id }
      ]
    });

    if (exists) {
      // If exists with OLD field names, update it
      if (exists.stays_reference_item_id || exists.min_stock !== undefined) {
        await itemsCollection.updateOne(
          { _id: exists._id },
          {
            $set: {
              category: (refItem.category as any) || 'OTHER',
              minStock: 0,
              staysReferenceItemId: refItem.stays_item_id,
              staysReferenceCategoryId: refItem.stays_category_id,
              source: 'stays_catalog',
              updatedAt: new Date()
            },
            $unset: {
              stays_reference_item_id: '',
              stays_category_id: '',
              min_stock: '',
              unit: '',
              status: ''
            }
          }
        );
      }
      skipped++;
      continue;
    }

    // Create new inventory item with quantity 0
    const newItem = {
      name: refItem.names.pt_BR || refItem.names.en_US || 'Item sem nome',
      multilingual_names: refItem.names,
      category: (refItem.category as any) || 'OTHER', // Use 'OTHER' as fallback (valid InventoryCategory)
      description: `Item sincronizado do catálogo Stays.net`,
      stock: { CENTRAL: 0 }, // Quantidade 0 no estoque central
      minStock: 0, // Changed from min_stock to minStock (camelCase)
      staysReferenceItemId: refItem.stays_item_id, // Changed from stays_reference_item_id to staysReferenceItemId
      staysReferenceCategoryId: refItem.stays_category_id, // Changed from stays_category_id to staysReferenceCategoryId
      source: 'stays_catalog' as const,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await itemsCollection.insertOne(newItem);
    created++;
  }

  const result = {
    created,
    skipped,
    total: referenceItems.length
  };

  console.log(`✅ Populated inventory: ${created} created, ${skipped} skipped, ${result.total} total`);

  return result;
}

/**
 * Log sync event for monitoring
 */
async function logSyncEvent(stats: InventorySyncStats): Promise<void> {
  const db = getDb();
  await db.collection('sync_logs').insertOne({
    type: 'inventory_sync',
    stats,
    timestamp: new Date()
  });
}

// ============ INDEX CREATION ============

/**
 * Create indexes for inventory collections
 * Should be called during MongoDB connection setup
 */
export async function createInventoryIndexes(): Promise<void> {
  const db = getDb();

  try {
    // inventory_items indexes
    await db.collection(COLLECTIONS.ITEMS).createIndex(
      { name: 1 },
      { background: true }
    );
    await db.collection(COLLECTIONS.ITEMS).createIndex(
      { category: 1 },
      { background: true }
    );
    await db.collection(COLLECTIONS.ITEMS).createIndex(
      { updatedAt: -1 },
      { background: true }
    );

    // inventory_transactions indexes
    await db.collection(COLLECTIONS.TRANSACTIONS).createIndex(
      { itemId: 1, timestamp: -1 },
      { background: true }
    );
    await db.collection(COLLECTIONS.TRANSACTIONS).createIndex(
      { timestamp: -1 },
      { background: true }
    );
    await db.collection(COLLECTIONS.TRANSACTIONS).createIndex(
      { user: 1 },
      { background: true }
    );

    // Reference collections indexes
    await db.collection(COLLECTIONS.REF_CATEGORIES).createIndex(
      { staysCategoryId: 1 },
      { unique: true, background: true }
    );
    await db.collection(COLLECTIONS.REF_ITEMS).createIndex(
      { staysItemId: 1 },
      { unique: true, background: true }
    );
    await db.collection(COLLECTIONS.REF_CONDITIONS).createIndex(
      { staysConditionId: 1 },
      { unique: true, background: true }
    );

    console.log('📇 Inventory indexes created');
  } catch (error) {
    console.log('📇 Inventory indexes already exist or creation skipped');
  }
}
