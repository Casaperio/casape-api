/**
 * Property Characteristics Service
 * Handles CRUD operations for property characteristics and manual overrides
 */

import { ObjectId } from 'mongodb';
import { getCollections } from '../config/mongodb.js';
import type { PropertyDocument, PropertyCharacteristics } from './stays/types.js';

/**
 * Get property characteristics by ID or internalName
 */
export async function getPropertyCharacteristics(
  identifier: string
): Promise<PropertyCharacteristics | null> {
  const collections = getCollections();

  // Try by MongoDB _id first
  let property: PropertyDocument | null = null;

  if (ObjectId.isValid(identifier)) {
    property = await collections.properties.findOne({ _id: new ObjectId(identifier) }) as PropertyDocument | null;
  }

  // Try by internalName (code like "I-VP-455-503")
  if (!property) {
    property = await collections.properties.findOne({ internalName: identifier }) as PropertyDocument | null;
  }

  // Try by staysListingId
  if (!property) {
    property = await collections.properties.findOne({ staysListingId: identifier }) as PropertyDocument | null;
  }

  if (!property) return null;

  return transformToCharacteristics(property);
}

/**
 * Get all property characteristics with optional filters
 */
export async function getAllPropertyCharacteristics(
  filters?: { active?: boolean; listed?: boolean }
): Promise<PropertyCharacteristics[]> {
  const collections = getCollections();

  const query: any = {};
  if (filters?.active !== undefined) query.active = filters.active;
  if (filters?.listed !== undefined) query.listed = filters.listed;

  const properties = await collections.properties.find(query).toArray() as any as PropertyDocument[];
  return properties.map(transformToCharacteristics);
}

/**
 * Update manual override fields
 */
export async function updatePropertyManualOverrides(
  propertyId: string,
  updates: {
    wifi?: Partial<PropertyDocument['manualOverrides']['wifi']>;
    access?: Partial<PropertyDocument['manualOverrides']['access']>;
    specifications?: Partial<PropertyDocument['manualOverrides']['specifications']>;
    maintenance?: Partial<PropertyDocument['manualOverrides']['maintenance']>;
  },
  userId: string
): Promise<PropertyCharacteristics | null> {
  const collections = getCollections();
  const now = new Date();

  // Build update object
  const setFields: any = {};

  if (updates.wifi) {
    Object.entries(updates.wifi).forEach(([key, value]) => {
      if (key !== 'updatedAt' && key !== 'updatedBy') {
        setFields[`manualOverrides.wifi.${key}`] = value;
      }
    });
    setFields['manualOverrides.wifi.updatedAt'] = now;
    setFields['manualOverrides.wifi.updatedBy'] = userId;
  }

  if (updates.access) {
    Object.entries(updates.access).forEach(([key, value]) => {
      if (key !== 'updatedAt' && key !== 'updatedBy') {
        setFields[`manualOverrides.access.${key}`] = value;
      }
    });
    setFields['manualOverrides.access.updatedAt'] = now;
    setFields['manualOverrides.access.updatedBy'] = userId;
  }

  if (updates.specifications) {
    Object.entries(updates.specifications).forEach(([key, value]) => {
      if (key !== 'updatedAt' && key !== 'updatedBy') {
        setFields[`manualOverrides.specifications.${key}`] = value;
      }
    });
    setFields['manualOverrides.specifications.updatedAt'] = now;
    setFields['manualOverrides.specifications.updatedBy'] = userId;
  }

  if (updates.maintenance) {
    Object.entries(updates.maintenance).forEach(([key, value]) => {
      if (key !== 'updatedAt' && key !== 'updatedBy') {
        setFields[`manualOverrides.maintenance.${key}`] = value;
      }
    });
    setFields['manualOverrides.maintenance.updatedAt'] = now;
    setFields['manualOverrides.maintenance.updatedBy'] = userId;
  }

  setFields.lastManualUpdateAt = now;

  // Update document
  const result = await collections.properties.findOneAndUpdate(
    { _id: new ObjectId(propertyId) },
    { $set: setFields },
    { returnDocument: 'after' }
  );

  if (!result) return null;

  return transformToCharacteristics(result as any as PropertyDocument);
}

/**
 * Transform PropertyDocument to PropertyCharacteristics
 */
function transformToCharacteristics(property: PropertyDocument): PropertyCharacteristics {
  return {
    propertyId: property._id.toString(),
    staysListingId: property.staysListingId,
    internalName: property.internalName,
    name: property.name,
    address: property.address,
    basicInfo: {
      rooms: property.rooms,
      beds: property.beds,
      bathrooms: property.bathrooms,
      squareFeet: property.squareFeet,
      maxGuests: property.maxGuests,
    },
    amenities: property.amenities,
    descriptions: property.descriptions,
    images: property.images,
    mainImage: property.mainImage,
    customFieldsFromStays: property.customFields,
    location: property.location,
    manualOverrides: property.manualOverrides,
    syncedAt: property.syncedAt,
    lastManualUpdateAt: property.lastManualUpdateAt,
  };
}
