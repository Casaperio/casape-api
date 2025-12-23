/**
 * MongoDB Configuration
 * Connects to MongoDB Atlas for booking data storage
 */

import { MongoClient, Db } from 'mongodb';
import { config } from './env.js';

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Connects to MongoDB Atlas
 */
export async function connectMongoDB(): Promise<Db> {
  if (db) return db;

  client = new MongoClient(config.mongodb.uri, {
    // Connection pool settings for performance
    minPoolSize: 5,           // Keep 5 connections warm
    maxPoolSize: 20,          // Max connections
    maxIdleTimeMS: 30000,     // Close idle connections after 30s

    // Timeout settings for faster failure detection
    serverSelectionTimeoutMS: 5000,  // Fail fast if no server
    socketTimeoutMS: 30000,          // 30s socket timeout
    connectTimeoutMS: 10000,         // 10s connection timeout

    // Keep-alive for MongoDB Atlas
    heartbeatFrequencyMS: 10000,     // Check connection every 10s

    // Compression for faster data transfer
    compressors: ['snappy', 'zlib'],
  });
  await client.connect();
  db = client.db(config.mongodb.dbName);

  console.log('🍃 MongoDB connected to database:', config.mongodb.dbName);

  // Create indexes for optimized queries
  await createIndexes();

  return db;
}

/**
 * Creates indexes for optimized queries
 */
async function createIndexes(): Promise<void> {
  if (!db) return;

  try {
    // Index for unified_bookings - optimizes date range queries
    await db.collection('stays_unified_bookings').createIndex(
      { checkOutDate: 1, checkInDate: 1 },
      { background: true }
    );

    // Index for unified_bookings - optimizes listing queries
    await db.collection('stays_unified_bookings').createIndex(
      { listingId: 1 },
      { background: true }
    );

    // Compound index for financial queries (date range + price)
    await db.collection('stays_unified_bookings').createIndex(
      { checkInDate: 1, priceValue: 1 },
      { background: true }
    );

    // Index for reservations - optimizes date range queries
    await db.collection('stays_reservations').createIndex(
      { checkOutDate: 1, checkInDate: 1 },
      { background: true }
    );

    // Index for reservations - optimizes listing queries
    await db.collection('stays_reservations').createIndex(
      { listingId: 1 },
      { background: true }
    );

    // ============ INVENTORY INDEXES ============

    // inventory_items indexes
    await db.collection('inventory_items').createIndex(
      { name: 1 },
      { background: true }
    );
    await db.collection('inventory_items').createIndex(
      { category: 1 },
      { background: true }
    );
    await db.collection('inventory_items').createIndex(
      { updatedAt: -1 },
      { background: true }
    );

    // inventory_transactions indexes
    await db.collection('inventory_transactions').createIndex(
      { itemId: 1, timestamp: -1 },
      { background: true }
    );
    await db.collection('inventory_transactions').createIndex(
      { timestamp: -1 },
      { background: true }
    );
    await db.collection('inventory_transactions').createIndex(
      { user: 1 },
      { background: true }
    );

    // Reference collections indexes (unique for sync upserts)
    await db.collection('inventory_reference_categories').createIndex(
      { staysCategoryId: 1 },
      { unique: true, background: true }
    );
    await db.collection('inventory_reference_items').createIndex(
      { staysItemId: 1 },
      { unique: true, background: true }
    );
    await db.collection('inventory_reference_conditions').createIndex(
      { staysConditionId: 1 },
      { unique: true, background: true }
    );

    // ============ PROPERTY INDEXES ============

    // Unique index on staysListingId for upserts
    await db.collection('stays_properties').createIndex(
      { staysListingId: 1 },
      { unique: true, background: true }
    );

    // Index on internalName (apartment code) for fast lookups
    await db.collection('stays_properties').createIndex(
      { internalName: 1 },
      { background: true }
    );

    // Compound index for filtering by active/listed status
    await db.collection('stays_properties').createIndex(
      { active: 1, listed: 1 },
      { background: true }
    );

    // Index for sorting by last update
    await db.collection('stays_properties').createIndex(
      { updatedAt: -1 },
      { background: true }
    );

    // Text search index for name, address, and internalName
    await db.collection('stays_properties').createIndex(
      { name: 'text', address: 'text', internalName: 'text' },
      { background: true }
    );

    // Index for manual override tracking
    await db.collection('stays_properties').createIndex(
      { lastManualUpdateAt: -1 },
      { background: true }
    );

    // Index for WiFi updates tracking
    await db.collection('stays_properties').createIndex(
      { 'manualOverrides.wifi.updatedAt': -1 },
      { background: true }
    );

    // ============ TICKET INDEXES ============

    // Unique index on ticket ID
    await db.collection('stays_tickets').createIndex(
      { id: 1 },
      { unique: true, background: true }
    );

    // Index for filtering by status
    await db.collection('stays_tickets').createIndex(
      { status: 1 },
      { background: true }
    );

    // Index for filtering by assigned user
    await db.collection('stays_tickets').createIndex(
      { assignedTo: 1 },
      { background: true }
    );

    // Index for property-based queries
    await db.collection('stays_tickets').createIndex(
      { propertyId: 1 },
      { background: true }
    );

    // Compound index for date range queries
    await db.collection('stays_tickets').createIndex(
      { createdAt: -1, status: 1 },
      { background: true }
    );

    console.log('📇 MongoDB indexes created');
  } catch (error) {
    // Indexes might already exist, which is fine
    console.log('📇 MongoDB indexes already exist or creation skipped');
  }
}

/**
 * Gets the database instance
 */
export function getDb(): Db {
  if (!db) {
    throw new Error('MongoDB not connected. Call connectMongoDB() first.');
  }
  return db;
}

/**
 * Collection references with type safety
 */
export function getCollections() {
  const database = getDb();
  return {
    // Stays booking collections
    listings: database.collection('stays_listings'),
    reservations: database.collection('stays_reservations'),
    unifiedBookings: database.collection('stays_unified_bookings'),
    syncStatus: database.collection('stays_sync_status'),
    // Inventory collections
    inventoryItems: database.collection('inventory_items'),
    inventoryTransactions: database.collection('inventory_transactions'),
    inventoryRefCategories: database.collection('inventory_reference_categories'),
    inventoryRefItems: database.collection('inventory_reference_items'),
    inventoryRefConditions: database.collection('inventory_reference_conditions'),
    // Property collections
    properties: database.collection('stays_properties'),
    propertySyncStatus: database.collection('stays_property_sync_status'),
    // Ticket collections
    tickets: database.collection('stays_tickets'),
  };
}

/**
 * Closes the MongoDB connection
 */
export async function closeMongoDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('🍃 MongoDB connection closed');
  }
}
