/**
 * Property Characteristics Routes
 * API endpoints for property characteristics and manual overrides
 */

import type { FastifyInstance } from 'fastify';
import * as PropertyCharacteristicsService from '../services/PropertyCharacteristicsService.js';

export default async function propertyCharacteristicsRoutes(fastify: FastifyInstance) {
  // GET /api/v1/properties/:id/characteristics
  fastify.get<{ Params: { id: string } }>(
    '/:id/characteristics',
    async (request, reply) => {
      const { id } = request.params;

      try {
        const characteristics = await PropertyCharacteristicsService.getPropertyCharacteristics(id);

        if (!characteristics) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Property not found',
            statusCode: 404,
          });
        }

        return { data: characteristics };
      } catch (error) {
        console.error('Error fetching property characteristics:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Unknown error',
          statusCode: 500,
        });
      }
    }
  );

  // GET /api/v1/properties/characteristics (all)
  fastify.get('/characteristics', async (request, reply) => {
    try {
      const query = request.query as { active?: string; listed?: string };

      const filters: any = {};
      if (query.active !== undefined) filters.active = query.active === 'true';
      if (query.listed !== undefined) filters.listed = query.listed === 'true';

      const characteristics = await PropertyCharacteristicsService.getAllPropertyCharacteristics(filters);

      return {
        data: characteristics,
        count: characteristics.length,
      };
    } catch (error) {
      console.error('Error fetching all property characteristics:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
        statusCode: 500,
      });
    }
  });

  // PATCH /api/v1/properties/:id/characteristics
  fastify.patch<{
    Params: { id: string };
    Body: {
      userId: string;
      updates: {
        wifi?: { network?: string; password?: string };
        access?: {
          doorCode?: string;
          conciergeHours?: string;
          checkInInstructions?: string;
          checkOutInstructions?: string;
          parkingInfo?: string;
        };
        specifications?: {
          position?: string;
          viewType?: string;
          hasAntiNoiseWindow?: boolean;
          cleaningFee?: number;
        };
        maintenance?: {
          specialNotes?: string;
          maintenanceContacts?: string;
          emergencyProcedures?: string;
        };
      };
    };
  }>(
    '/:id/characteristics',
    async (request, reply) => {
      const { id } = request.params;
      const { userId, updates } = request.body;

      try {
        if (!userId) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'userId is required',
            statusCode: 400,
          });
        }

        const updated = await PropertyCharacteristicsService.updatePropertyManualOverrides(
          id,
          updates,
          userId
        );

        if (!updated) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Property not found',
            statusCode: 404,
          });
        }

        return { data: updated };
      } catch (error) {
        console.error('Error updating property characteristics:', error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Unknown error',
          statusCode: 500,
        });
      }
    }
  );
}
