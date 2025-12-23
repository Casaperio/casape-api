/**
 * Statistics Routes
 */

import type { FastifyInstance } from 'fastify';
import { format, subDays } from 'date-fns';
import { validateApiKey } from '../middleware/auth.js';
import {
  getBookingStatistics,
  getOccupancyByProperty,
  getCancellationAnalysis,
} from '../services/StatisticsService.js';

interface DateRangeQuery {
  from?: string;
  to?: string;
}

export async function statisticsRoutes(fastify: FastifyInstance): Promise<void> {
  // Add auth hook to all routes in this plugin
  fastify.addHook('preHandler', validateApiKey);

  // GET /api/v1/statistics/bookings - Get booking statistics
  fastify.get<{ Querystring: DateRangeQuery }>(
    '/statistics/bookings',
    async (request) => {
      const today = new Date();
      const from = request.query.from || format(subDays(today, 30), 'yyyy-MM-dd');
      const to = request.query.to || format(today, 'yyyy-MM-dd');

      const stats = await getBookingStatistics(from, to);
      return { statistics: stats, period: { from, to } };
    }
  );

  // GET /api/v1/statistics/occupancy - Get occupancy by property
  fastify.get<{ Querystring: DateRangeQuery }>(
    '/statistics/occupancy',
    async (request) => {
      const today = new Date();
      const from = request.query.from || format(subDays(today, 30), 'yyyy-MM-dd');
      const to = request.query.to || format(today, 'yyyy-MM-dd');

      const data = await getOccupancyByProperty(from, to);
      return { occupancy: data, period: { from, to } };
    }
  );

  // GET /api/v1/statistics/cancellations - Get cancellation analysis
  fastify.get<{ Querystring: DateRangeQuery }>(
    '/statistics/cancellations',
    async (request) => {
      const today = new Date();
      const from = request.query.from || format(subDays(today, 30), 'yyyy-MM-dd');
      const to = request.query.to || format(today, 'yyyy-MM-dd');

      const data = await getCancellationAnalysis(from, to);
      return { cancellations: data, period: { from, to } };
    }
  );
}
