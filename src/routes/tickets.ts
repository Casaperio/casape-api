/**
 * Tickets API Routes
 */

import { FastifyInstance } from 'fastify';
import * as TicketsService from '../services/TicketsService.js';

export async function ticketsRoutes(fastify: FastifyInstance) {
  // Get all tickets with filters
  fastify.get('/tickets', async (request) => {
    const { status, assignedTo, propertyId, from, to, limit } = request.query as any;

    const tickets = await TicketsService.getTickets({
      status,
      assignedTo,
      propertyId,
      from,
      to,
      limit: limit ? parseInt(limit) : undefined,
    });

    return tickets;
  });

  // Get ticket statistics
  fastify.get('/tickets/statistics', async (request) => {
    const { from, to } = request.query as any;
    const stats = await TicketsService.getTicketStatistics(from, to);
    return stats;
  });

  // Get ticket by ID
  fastify.get('/tickets/:id', async (request, reply) => {
    const { id } = request.params as any;
    const ticket = await TicketsService.getTicketById(id);

    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    return ticket;
  });

  // Create ticket
  fastify.post('/tickets', async (request, reply) => {
    const input = request.body as any;
    const ticket = await TicketsService.createTicket(input);
    return reply.status(201).send(ticket);
  });

  // Update ticket
  fastify.patch('/tickets/:id', async (request, reply) => {
    const { id } = request.params as any;
    const update = request.body as any;

    const ticket = await TicketsService.updateTicket(id, update);

    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    return ticket;
  });

  // Delete ticket
  fastify.delete('/tickets/:id', async (request, reply) => {
    const { id } = request.params as any;
    const deleted = await TicketsService.deleteTicket(id);

    if (!deleted) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    return { success: true };
  });
}
