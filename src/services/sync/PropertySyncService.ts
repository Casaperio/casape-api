/**
 * Property Sync Service
 * Synchronizes property/listing data from Stays.net to MongoDB
 * Properties change infrequently, so this runs less often than booking sync
 */

import { staysApiClient } from '../stays/StaysApiClient.js';
import { getCollections } from '../../config/mongodb.js';
import type {
  EnhancedListingDetails,
  PropertyDocument,
  StaysAmenity,
  PropertyAmenity,
} from '../stays/types.js';

/**
 * Transform amenity IDs to PropertyAmenity objects with translations
 */
function transformAmenities(
  amenityObjects: Array<{ _id: string }> | undefined,
  amenitiesReference: Map<string, StaysAmenity>
): PropertyAmenity[] {
  if (!amenityObjects || amenityObjects.length === 0) {
    return [];
  }

  const result: PropertyAmenity[] = [];

  for (const obj of amenityObjects) {
    const amenity = amenitiesReference.get(obj._id);
    if (!amenity) {
      continue;
    }

    result.push({
      stays_amenity_id: amenity._id,
      name: {
        pt_BR: amenity._mstitle['pt_BR'] || amenity._mstitle['en_US'] || 'Desconhecido',
        en_US: amenity._mstitle['en_US'] || amenity._mstitle['pt_BR'] || 'Unknown'
      },
      category: amenity.category,
      icon: amenity.icon,
      last_verified: new Date()
    });
  }

  return result;
}

/**
 * Transform listing data to PropertyDocument
 */
function transformPropertyDocument(
  listing: EnhancedListingDetails,
  amenitiesReference: Map<string, StaysAmenity>
): Omit<PropertyDocument, '_id'> {
  const now = new Date();

  // Extract multilingual title (prefer pt_BR)
  const name = listing._mstitle?.['pt_BR'] ||
               listing._mstitle?.['en_US'] ||
               listing.internalName ||
               'Unnamed Property';

  // Extract address string
  const addressStr = listing.address
    ? `${listing.address.street || ''} ${listing.address.streetNumber || ''}, ${listing.address.region || ''}, ${listing.address.city || ''} - ${listing.address.stateCode || ''}`.trim()
    : '';

  return {
    staysListingId: listing._id,
    internalName: listing.internalName || listing.id || listing._id,
    name,
    address: addressStr,

    // Property details from API
    rooms: listing._i_rooms || 0,
    beds: listing._i_beds || 0,
    bathrooms: listing._f_bathrooms || 0,
    squareFeet: listing._f_square || null,
    maxGuests: listing._i_maxGuests || 0,

    // Amenities with translations
    amenities: transformAmenities(listing.amenities, amenitiesReference),

    // Media
    mainImage: listing._t_mainImageMeta?.url
      ? { url: listing._t_mainImageMeta.url, order: 0 }
      : null,
    images: listing._t_mainImageMeta?.url
      ? [{ url: listing._t_mainImageMeta.url, order: 0 }]
      : [],

    // Pricing (will be fetched separately)
    pricing: listing.deff_curr
      ? { currency: listing.deff_curr, basePricePerNight: 0 }
      : null,

    // Multilingual descriptions
    descriptions: listing._msdesc || {},

    // Custom fields (will be populated separately)
    customFields: {},

    // Location from API
    location: listing.latLng
      ? {
          latitude: listing.latLng._f_lat,
          longitude: listing.latLng._f_lng,
          city: listing.address?.city,
          state: listing.address?.state,
          country: listing.address?.countryCode,
          postalCode: listing.address?.zip,
        }
      : null,

    // Status
    active: listing.status === 'active',
    listed: listing.status === 'active',

    // Timestamps
    createdAt: now,
    updatedAt: now,
    syncedAt: now,

    // Initialize manual overrides (empty on creation, preserved on update)
    manualOverrides: {
      wifi: {
        network: null,
        password: null,
        updatedAt: null,
        updatedBy: null,
      },
      access: {
        doorCode: null,
        conciergeHours: null,
        checkInInstructions: null,
        checkOutInstructions: null,
        parkingInfo: null,
        updatedAt: null,
        updatedBy: null,
      },
      specifications: {
        position: null,
        viewType: null,
        hasAntiNoiseWindow: null,
        cleaningFee: null,
        updatedAt: null,
        updatedBy: null,
      },
      maintenance: {
        specialNotes: null,
        maintenanceContacts: null,
        emergencyProcedures: null,
        updatedAt: null,
        updatedBy: null,
      },
    },
    lastManualUpdateAt: null,
  };
}

/**
 * Fetch amenities reference data (cached for all properties)
 */
async function fetchAmenitiesReference(): Promise<Map<string, StaysAmenity>> {
  console.log('🎨 Fetching amenities reference...');
  const amenities = await staysApiClient.getAmenities();

  const amenitiesMap = new Map<string, StaysAmenity>();
  amenities.forEach(amenity => amenitiesMap.set(amenity._id, amenity));

  console.log(`✅ Loaded ${amenitiesMap.size} amenity types`);
  return amenitiesMap;
}

/**
 * Initialize manualOverrides for properties that have null values
 */
async function initializeManualOverridesForExistingProperties(): Promise<number> {
  const collections = getCollections();

  const defaultManualOverrides = {
    wifi: {
      network: null,
      password: null,
      updatedAt: null,
      updatedBy: null,
    },
    access: {
      doorCode: null,
      conciergeHours: null,
      checkInInstructions: null,
      checkOutInstructions: null,
      parkingInfo: null,
      updatedAt: null,
      updatedBy: null,
    },
    specifications: {
      position: null,
      viewType: null,
      hasAntiNoiseWindow: null,
      cleaningFee: null,
      updatedAt: null,
      updatedBy: null,
    },
    maintenance: {
      specialNotes: null,
      maintenanceContacts: null,
      emergencyProcedures: null,
      updatedAt: null,
      updatedBy: null,
    },
  };

  const result = await collections.properties.updateMany(
    { manualOverrides: null },
    {
      $set: {
        manualOverrides: defaultManualOverrides,
        lastManualUpdateAt: null
      }
    }
  );

  return result.modifiedCount;
}

/**
 * Write properties to MongoDB using bulkWrite
 */
async function writePropertiesToMongo(
  properties: Omit<PropertyDocument, '_id'>[]
): Promise<number> {
  const collections = getCollections();
  if (properties.length === 0) return 0;

  const now = new Date();

  const operations = properties.map(property => {
    // Remove fields that should NOT be overwritten during sync
    const { createdAt, manualOverrides, lastManualUpdateAt, ...syncedFields } = property;

    return {
      updateOne: {
        filter: { staysListingId: property.staysListingId },
        update: {
          // ONLY update fields synced from Stays.net (including amenities)
          $set: {
            ...syncedFields,
            updatedAt: now,
            syncedAt: now,
          },
          // Initialize fields ONLY on document creation (never overwrite)
          $setOnInsert: {
            createdAt: now,
            manualOverrides: property.manualOverrides,
            lastManualUpdateAt: null,
          },
        },
        upsert: true,
      },
    };
  });

  const result = await collections.properties.bulkWrite(operations as any);
  return result.upsertedCount + result.modifiedCount;
}

/**
 * Update property sync status
 */
async function updatePropertySyncStatus(
  status: 'success' | 'error' | 'running' | 'never',
  error: string | null = null,
  stats: { propertiesCount?: number; durationMs?: number } = {}
): Promise<void> {
  const now = new Date();
  const collections = getCollections();

  const updateData: any = {
    status,
    updatedAt: now,
  };

  if (status === 'success' || status === 'error') {
    updateData.lastSyncAt = now;
  }

  if (error !== null) {
    updateData.lastError = error;
  }

  if (stats.propertiesCount !== undefined) {
    updateData.propertiesCount = stats.propertiesCount;
  }

  if (stats.durationMs !== undefined) {
    updateData.durationMs = stats.durationMs;
  }

  await collections.propertySyncStatus.updateOne(
    { _id: 'current' } as any,
    { $set: updateData },
    { upsert: true }
  );
}

/**
 * Main property sync function
 */
export async function syncPropertiesData(): Promise<{
  success: boolean;
  propertiesCount: number;
  durationMs: number;
  error?: string;
}> {
  const startTime = Date.now();
  console.log('🏠 Starting property sync...');

  try {
    await updatePropertySyncStatus('running');

    // 1. Fetch amenities reference (needed for translations)
    console.log('🎨 Fetching amenities reference for translations...');
    const amenitiesReference = await fetchAmenitiesReference();

    // 2. Fetch all property listings (without amenities - amenities only in individual endpoint)
    const listingsList = await staysApiClient.getAllEnhancedListings();
    console.log(`📋 Fetching detailed data for ${listingsList.length} properties (including amenities)...`);

    // 2.1. Fetch detailed data for each listing to get amenities
    const listings: EnhancedListingDetails[] = [];
    for (const basicListing of listingsList) {
      try {
        const detailed = await staysApiClient.getEnhancedListingDetails(basicListing._id);
        listings.push(detailed);
      } catch (error) {
        console.warn(`⚠️ Failed to fetch details for ${basicListing.internalName}, using basic data`);
        listings.push(basicListing);
      }
    }
    console.log(`✅ Fetched detailed data for ${listings.length} properties`);

    if (listings.length === 0) {
      console.log('ℹ️ No properties found');
      const durationMs = Date.now() - startTime;
      await updatePropertySyncStatus('success', null, {
        propertiesCount: 0,
        durationMs
      });
      return { success: true, propertiesCount: 0, durationMs };
    }

    // 3. Transform listings to property documents
    const propertyDocuments = listings.map(listing =>
      transformPropertyDocument(listing, amenitiesReference)
    );

    // 4. Write to MongoDB
    const propertiesWritten = await writePropertiesToMongo(propertyDocuments);
    console.log(`💾 Wrote ${propertiesWritten} properties to MongoDB`);

    // 4.5. Initialize manualOverrides for existing properties that have null values
    const initialized = await initializeManualOverridesForExistingProperties();
    if (initialized > 0) {
      console.log(`🔧 Initialized manualOverrides for ${initialized} existing properties`);
    }

    // 5. Update sync status
    const durationMs = Date.now() - startTime;
    await updatePropertySyncStatus('success', null, {
      propertiesCount: propertiesWritten,
      durationMs,
    });

    console.log(`✅ Property sync completed in ${durationMs}ms`);

    return {
      success: true,
      propertiesCount: propertiesWritten,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('❌ Property sync failed:', errorMessage);
    console.error('Full error details:', error);
    await updatePropertySyncStatus('error', errorMessage, { durationMs });

    return {
      success: false,
      propertiesCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

/**
 * Get property sync status
 */
export async function getPropertySyncStatus(): Promise<{
  status: 'success' | 'error' | 'running' | 'never';
  lastSyncAt: Date | null;
  lastError: string | null;
  propertiesCount: number;
  durationMs: number;
  updatedAt: Date;
}> {
  const collections = getCollections();
  const doc = await collections.propertySyncStatus.findOne({ _id: 'current' } as any);

  if (!doc) {
    return {
      status: 'never',
      lastSyncAt: null,
      lastError: null,
      propertiesCount: 0,
      durationMs: 0,
      updatedAt: new Date(),
    };
  }

  return {
    status: doc.status || 'never',
    lastSyncAt: doc.lastSyncAt || null,
    lastError: doc.lastError || null,
    propertiesCount: doc.propertiesCount || 0,
    durationMs: doc.durationMs || 0,
    updatedAt: doc.updatedAt || new Date(),
  };
}
