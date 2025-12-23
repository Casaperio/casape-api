/**
 * Properties Service
 * Business logic for property/listing data queries and transformations
 */

import { getCollections } from '../config/mongodb.js';
import type { PropertyDocument } from './stays/types.js';
import { ObjectId } from 'mongodb';

/**
 * Get all properties with optional filters
 */
export async function getAllProperties(filters?: {
  active?: boolean;
  listed?: boolean;
}): Promise<PropertyDocument[]> {
  const collections = getCollections();

  const query: any = {};
  if (filters?.active !== undefined) {
    query.active = filters.active;
  }
  if (filters?.listed !== undefined) {
    query.listed = filters.listed;
  }

  const properties = await collections.properties
    .find(query)
    .sort({ internalName: 1 })
    .toArray();

  return properties as unknown as PropertyDocument[];
}

/**
 * Get single property by ID, stays listing ID, or internal name
 */
export async function getPropertyById(id: string): Promise<PropertyDocument | null> {
  const collections = getCollections();

  // Try as ObjectId first, then as string
  const query: any = {
    $or: [
      { staysListingId: id },
      { internalName: id },
    ],
  };

  // If id is valid ObjectId format, add to query
  if (ObjectId.isValid(id)) {
    query.$or.push({ _id: new ObjectId(id) });
  }

  const property = await collections.properties.findOne(query);

  return property as unknown as PropertyDocument | null;
}

/**
 * Get properties by apartment codes (batch)
 */
export async function getPropertiesByCodes(codes: string[]): Promise<PropertyDocument[]> {
  const collections = getCollections();

  const properties = await collections.properties
    .find({ internalName: { $in: codes } })
    .toArray();

  return properties as unknown as PropertyDocument[];
}

/**
 * Search properties by name or address (text search)
 */
export async function searchProperties(query: string): Promise<PropertyDocument[]> {
  const collections = getCollections();

  const properties = await collections.properties
    .find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { address: { $regex: query, $options: 'i' } },
        { internalName: { $regex: query, $options: 'i' } },
      ],
    })
    .limit(50)
    .toArray();

  return properties as unknown as PropertyDocument[];
}

/**
 * Get property statistics
 */
export async function getPropertyStats(): Promise<{
  totalProperties: number;
  activeProperties: number;
  listedProperties: number;
  totalRooms: number;
  totalBeds: number;
  averageRooms: number;
}> {
  const collections = getCollections();

  const totalProperties = await collections.properties.countDocuments();
  const activeProperties = await collections.properties.countDocuments({ active: true });
  const listedProperties = await collections.properties.countDocuments({ listed: true });

  const pipeline = [
    {
      $group: {
        _id: null,
        totalRooms: { $sum: '$rooms' },
        totalBeds: { $sum: '$beds' },
        avgRooms: { $avg: '$rooms' },
      },
    },
  ];

  const aggregation = await collections.properties.aggregate(pipeline).toArray();
  const stats = aggregation[0] || { totalRooms: 0, totalBeds: 0, avgRooms: 0 };

  return {
    totalProperties,
    activeProperties,
    listedProperties,
    totalRooms: stats.totalRooms,
    totalBeds: stats.totalBeds,
    averageRooms: stats.avgRooms,
  };
}
