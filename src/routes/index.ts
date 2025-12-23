/**
 * Route Registration
 */

import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { syncRoutes } from './sync.js';
import { dashboardRoutes } from './dashboard.js';
import { calendarRoutes } from './calendar.js';
import { financialsRoutes } from './financials.js';
import { statisticsRoutes } from './statistics.js';
import { guestsRoutes } from './guests.js';
import { unifiedRoutes } from './unified.js';
import { inventoryRoutes } from './inventory.js';
import { propertiesRoutes } from './properties.js';
import { ticketsRoutes } from './tickets.js';
import { teamRoutes } from './team.js';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Health routes (no prefix, no auth)
  await fastify.register(healthRoutes);

  // API v1 routes (with prefix and auth)
  await fastify.register(
    async (api) => {
      await api.register(syncRoutes);
      await api.register(dashboardRoutes);
      await api.register(calendarRoutes);
      await api.register(financialsRoutes);
      await api.register(statisticsRoutes);
      await api.register(guestsRoutes);
      await api.register(unifiedRoutes);
      await api.register(inventoryRoutes);
      await api.register(propertiesRoutes);
      await api.register(ticketsRoutes);
      await api.register(teamRoutes);
    },
    { prefix: '/api/v1' }
  );
}
