/**
 * Guests Routes
 */

import type { FastifyInstance } from 'fastify';
import { validateApiKey } from '../middleware/auth.js';
import {
  getReturningGuests,
  getGuestDemographics,
  getGuestSummary,
} from '../services/GuestsService.js';

export async function guestsRoutes(fastify: FastifyInstance): Promise<void> {
  // Add auth hook to all routes in this plugin
  fastify.addHook('preHandler', validateApiKey);

  // GET /api/v1/guests/summary - Get guest summary
  fastify.get('/guests/summary', async () => {
    const summary = await getGuestSummary();
    return summary;
  });

  // GET /api/v1/guests/returning - Get returning guests
  fastify.get('/guests/returning', async () => {
    const guests = await getReturningGuests();
    return { returningGuests: guests, total: guests.length };
  });

  // GET /api/v1/guests/demographics - Get guest demographics
  fastify.get('/guests/demographics', async () => {
    const demographics = await getGuestDemographics();
    return demographics;
  });
}
