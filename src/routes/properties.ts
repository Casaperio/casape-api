/**
 * Properties Routes
 * REST API endpoints for property/listing data
 */

import type { FastifyInstance } from 'fastify';
import { validateApiKey } from '../middleware/auth.js';
import {
  getAllProperties,
  getPropertyById,
  searchProperties,
  getPropertyStats,
} from '../services/PropertiesService.js';
import {
  syncPropertiesData,
  getPropertySyncStatus
} from '../services/sync/PropertySyncService.js';
import propertyCharacteristicsRoutes from './propertyCharacteristics.js';

export async function propertiesRoutes(fastify: FastifyInstance): Promise<void> {
  // Add auth to all routes
  fastify.addHook('preHandler', validateApiKey);

  // GET /api/v1/properties - List all properties
  fastify.get('/properties', async (request) => {
    const { active, listed } = request.query as {
      active?: string;
      listed?: string;
    };

    const filters: any = {};
    if (active !== undefined) filters.active = active === 'true';
    if (listed !== undefined) filters.listed = listed === 'true';

    const properties = await getAllProperties(filters);

    return {
      properties,
      count: properties.length,
    };
  });

  // GET /api/v1/properties/stats - Property statistics
  fastify.get('/properties/stats', async () => {
    const stats = await getPropertyStats();
    return stats;
  });

  // GET /api/v1/properties/search - Search properties
  fastify.get('/properties/search', async (request) => {
    const { q } = request.query as { q?: string };

    if (!q || q.trim().length < 2) {
      return {
        properties: [],
        count: 0,
        message: 'Query must be at least 2 characters',
      };
    }

    const properties = await searchProperties(q.trim());

    return {
      properties,
      count: properties.length,
      query: q,
    };
  });

  // GET /api/v1/properties/:id - Get single property
  fastify.get('/properties/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const property = await getPropertyById(id);

    if (!property) {
      reply.code(404).send({
        error: 'Not Found',
        message: `Property with ID ${id} not found`,
      });
      return;
    }

    return property;
  });

  // POST /api/v1/properties/sync - Trigger manual property sync
  fastify.post('/properties/sync', async (_request, reply) => {
    const currentStatus = await getPropertySyncStatus();

    if (currentStatus.status === 'running') {
      reply.code(409).send({
        error: 'Conflict',
        message: 'Property sync is already running',
      });
      return;
    }

    // Start sync in background
    syncPropertiesData()
      .then(result => console.log('📊 Manual property sync result:', result))
      .catch(error => console.error('❌ Manual property sync error:', error));

    return {
      message: 'Property sync started',
      timestamp: new Date().toISOString(),
    };
  });

  // GET /api/v1/properties/sync/status - Get property sync status
  fastify.get('/properties/sync/status', async () => {
    const status = await getPropertySyncStatus();

    return {
      lastSyncAt: status.lastSyncAt?.toISOString() || null,
      status: status.status,
      lastError: status.lastError,
      propertiesCount: status.propertiesCount,
      durationMs: status.durationMs,
    };
  });

  // GET /api/v1/properties/test-custom-fields - TEST ENDPOINT
  fastify.get('/properties/test-custom-fields', async () => {
    const { staysApiClient } = await import('../services/stays/StaysApiClient.js');
    const customFields = await staysApiClient.getListingCustomFields();
    return {
      count: customFields.length,
      customFields
    };
  });

  // GET /api/v1/properties/test-property-api/:id - TEST ENDPOINT
  // Testa o endpoint /content/properties vs /content/listings
  fastify.get('/properties/test-property-api/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { staysApiClient } = await import('../services/stays/StaysApiClient.js');

    try {
      const [propertyData, listingData] = await Promise.allSettled([
        staysApiClient.getPropertyDetails(id),
        staysApiClient.getEnhancedListingDetails(id)
      ]);

      return {
        propertyEndpoint: {
          status: propertyData.status,
          data: propertyData.status === 'fulfilled' ? propertyData.value : null,
          error: propertyData.status === 'rejected' ? propertyData.reason : null,
        },
        listingEndpoint: {
          status: listingData.status,
          data: listingData.status === 'fulfilled' ? listingData.value : null,
          error: listingData.status === 'rejected' ? listingData.reason : null,
        },
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Register property characteristics routes
  await fastify.register(propertyCharacteristicsRoutes, { prefix: '/properties' });
}
