/**
 * Calendar Routes
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { format, subMonths, addMonths } from 'date-fns';
import { getCalendarData } from '../services/CalendarService.js';
import { validateApiKey } from '../middleware/auth.js';

interface CalendarQuery {
  from?: string;
  to?: string;
}

export async function calendarRoutes(fastify: FastifyInstance): Promise<void> {
  // Add auth hook to all routes in this plugin
  fastify.addHook('preHandler', validateApiKey);

  // GET /api/v1/calendar - Get calendar data
  fastify.get('/calendar', async (request: FastifyRequest<{ Querystring: CalendarQuery }>) => {
    const today = new Date();

    // Default: 1 month back to 3 months forward
    const from = request.query.from || format(subMonths(today, 1), 'yyyy-MM-dd');
    const to = request.query.to || format(addMonths(today, 3), 'yyyy-MM-dd');

    const data = await getCalendarData(from, to);
    return data;
  });
}
