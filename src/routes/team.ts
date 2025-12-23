/**
 * Team API Routes
 */

import { FastifyInstance } from 'fastify';
import * as TeamService from '../services/TeamService.js';

export async function teamRoutes(fastify: FastifyInstance) {
  // Get team performance statistics
  fastify.get('/team/statistics', async () => {
    const stats = await TeamService.getTeamStatistics();
    return stats;
  });

  // Assign responsible to reservation
  fastify.post('/team/assign', async (request, reply) => {
    const { reservationId, userId, userName } = request.body as any;

    if (!reservationId || !userId || !userName) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    const success = await TeamService.assignResponsible(reservationId, userId, userName);

    if (!success) {
      return reply.status(404).send({ error: 'Reservation not found' });
    }

    return { success: true };
  });

  // Add feedback to reservation
  fastify.post('/team/feedback', async (request, reply) => {
    const { reservationId, rating, comment } = request.body as any;

    if (!reservationId || !rating) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    if (rating < 1 || rating > 5) {
      return reply.status(400).send({ error: 'Rating must be between 1 and 5' });
    }

    const success = await TeamService.addFeedback(reservationId, rating, comment);

    if (!success) {
      return reply.status(404).send({ error: 'Reservation not found' });
    }

    return { success: true };
  });
}
