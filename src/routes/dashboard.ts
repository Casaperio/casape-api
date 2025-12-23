/**
 * Dashboard Routes
 */

import type { FastifyInstance } from 'fastify';
import { getDashboardData } from '../services/DashboardService.js';
import { validateApiKey } from '../middleware/auth.js';

export async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {
  // Add auth hook to all routes in this plugin
  fastify.addHook('preHandler', validateApiKey);

  // GET /api/v1/dashboard - Get dashboard data
  fastify.get('/dashboard', async () => {
    const data = await getDashboardData();
    return data;
  });
}
