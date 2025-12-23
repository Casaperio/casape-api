/**
 * Financials Routes
 */

import type { FastifyInstance } from 'fastify';
import { format, subDays } from 'date-fns';
import { validateApiKey } from '../middleware/auth.js';
import {
  getFinancialSummary,
  getFinancialsByProperty,
  getFinancialsByChannel,
  getRevenueTrend,
  getFinancialPanelData,
  getDetailedFinancials,
} from '../services/FinancialsService.js';

interface DateRangeQuery {
  from?: string;
  to?: string;
}

export async function financialsRoutes(fastify: FastifyInstance): Promise<void> {
  // Add auth hook to all routes in this plugin
  fastify.addHook('preHandler', validateApiKey);

  // GET /api/v1/financials/summary - Get financial summary for a period
  fastify.get<{ Querystring: DateRangeQuery }>(
    '/financials/summary',
    async (request) => {
      const today = new Date();
      const from = request.query.from || format(subDays(today, 30), 'yyyy-MM-dd');
      const to = request.query.to || format(today, 'yyyy-MM-dd');

      const summary = await getFinancialSummary(from, to);
      return summary;
    }
  );

  // GET /api/v1/financials/by-property - Get financial data by property
  fastify.get<{ Querystring: DateRangeQuery }>(
    '/financials/by-property',
    async (request) => {
      const today = new Date();
      const from = request.query.from || format(subDays(today, 30), 'yyyy-MM-dd');
      const to = request.query.to || format(today, 'yyyy-MM-dd');

      const data = await getFinancialsByProperty(from, to);
      return { properties: data, period: { from, to } };
    }
  );

  // GET /api/v1/financials/by-channel - Get financial data by channel
  fastify.get<{ Querystring: DateRangeQuery }>(
    '/financials/by-channel',
    async (request) => {
      const today = new Date();
      const from = request.query.from || format(subDays(today, 30), 'yyyy-MM-dd');
      const to = request.query.to || format(today, 'yyyy-MM-dd');

      const data = await getFinancialsByChannel(from, to);
      return { channels: data, period: { from, to } };
    }
  );

  // GET /api/v1/financials/trend - Get monthly revenue trend (last 12 months)
  fastify.get('/financials/trend', async () => {
    const trend = await getRevenueTrend();
    return { trend };
  });

  // GET /api/v1/financials/panel - Get consolidated financial panel data
  // Returns: currentMonthRevenue, previousMonthRevenue, YTD, comparisons, projections
  fastify.get('/financials/panel', async () => {
    const data = await getFinancialPanelData();
    return data;
  });

  // POST /api/v1/financials/panel/refresh - Force refresh financial panel data
  fastify.post('/financials/panel/refresh', async () => {
    const data = await getFinancialPanelData();
    return {
      ...data,
      refreshedAt: new Date().toISOString(),
    };
  });

  // GET /api/v1/financials/detailed - Get detailed financial data for reservations
  // Returns complete price breakdown including fees, commissions, and owner payments
  fastify.get<{ Querystring: DateRangeQuery }>(
    '/financials/detailed',
    async (request) => {
      const today = new Date();
      const from = request.query.from || format(subDays(today, 30), 'yyyy-MM-dd');
      const to = request.query.to || format(today, 'yyyy-MM-dd');

      const reservations = await getDetailedFinancials(from, to);
      return {
        reservations,
        period: { from, to },
        count: reservations.length,
      };
    }
  );
}
