/**
 * Unified Routes - Single endpoint returning all frontend data
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getUnifiedData } from '../services/UnifiedService.js';
import { validateApiKey } from '../middleware/auth.js';

interface AllDataQuerystring {
  from?: string;
  to?: string;
}

export async function unifiedRoutes(fastify: FastifyInstance): Promise<void> {
  // Add auth hook to all routes in this plugin
  fastify.addHook('preHandler', validateApiKey);

  // GET /api/v1/all-data - Get all data in one call (dashboard + calendar + sync)
  fastify.get<{ Querystring: AllDataQuerystring }>(
    '/all-data',
    async (request: FastifyRequest<{ Querystring: AllDataQuerystring }>) => {
      const { from, to } = request.query;
      const data = await getUnifiedData(from, to);
      return data;
    }
  );
}
