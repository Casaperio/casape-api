/**
 * Tickets Service - Manages maintenance tickets
 */

import { getCollections } from '../config/mongodb.js';
import type {
  TicketDoc,
  CreateTicketInput,
  UpdateTicketInput,
  TicketStatistics,
  TicketStatus,
} from './stays/types.js';
import { differenceInMinutes, format, parseISO } from 'date-fns';

/**
 * Get all tickets with optional filters
 */
export async function getTickets(params: {
  status?: TicketStatus;
  assignedTo?: string;
  propertyId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<TicketDoc[]> {
  const collections = getCollections();
  const { status, assignedTo, propertyId, from, to, limit = 100 } = params;

  const query: any = {};

  if (status) query.status = status;
  if (assignedTo) query.assignedTo = assignedTo;
  if (propertyId) query.propertyId = propertyId;

  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = parseISO(from);
    if (to) query.createdAt.$lte = parseISO(to);
  }

  const tickets = await collections.tickets
    .find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return tickets as unknown as TicketDoc[];
}

/**
 * Get ticket by ID
 */
export async function getTicketById(id: string): Promise<TicketDoc | null> {
  const collections = getCollections();
  const ticket = await collections.tickets.findOne({ id });
  return ticket as unknown as TicketDoc | null;
}

/**
 * Create new ticket
 */
export async function createTicket(input: CreateTicketInput): Promise<TicketDoc> {
  const collections = getCollections();
  const now = new Date();

  // Generate ticket ID
  const ticketCount = await collections.tickets.countDocuments();
  const ticketId = `TKT-${String(ticketCount + 1).padStart(4, '0')}`;

  const ticket: Partial<TicketDoc> = {
    id: ticketId,
    title: input.title,
    description: input.description,
    category: input.category,
    priority: input.priority,
    status: 'open',
    propertyId: input.propertyId || null,
    propertyCode: null, // Will be enriched
    propertyName: null, // Will be enriched
    assignedTo: input.assignedTo || null,
    assignedToName: null, // Will be enriched
    reservationId: input.reservationId || null,
    guestName: null, // Will be enriched
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    resolutionTime: null,
    resolutionNotes: null,
  };

  await collections.tickets.insertOne(ticket as any);
  return ticket as TicketDoc;
}

/**
 * Update ticket
 */
export async function updateTicket(
  id: string,
  update: UpdateTicketInput
): Promise<TicketDoc | null> {
  const collections = getCollections();
  const now = new Date();

  const ticket = await getTicketById(id);
  if (!ticket) return null;

  const updateData: any = {
    ...update,
    updatedAt: now,
  };

  // If status changed to 'done', calculate resolution time
  if (update.status === 'done' && ticket.status !== 'done') {
    updateData.resolvedAt = now;
    updateData.resolutionTime = differenceInMinutes(now, ticket.createdAt);
  }

  await collections.tickets.updateOne({ id }, { $set: updateData });

  return await getTicketById(id);
}

/**
 * Delete ticket
 */
export async function deleteTicket(id: string): Promise<boolean> {
  const collections = getCollections();
  const result = await collections.tickets.deleteOne({ id });
  return result.deletedCount > 0;
}

/**
 * Get ticket statistics
 */
export async function getTicketStatistics(
  from?: string,
  to?: string
): Promise<TicketStatistics> {
  const tickets = await getTickets({ from, to, limit: 10000 });

  const stats: TicketStatistics = {
    totalTickets: tickets.length,
    openTickets: 0,
    inProgressTickets: 0,
    doneTickets: 0,
    cancelledTickets: 0,
    averageResolutionTime: 0,
    byCategory: {},
    byPriority: {},
    byAssignee: {},
    byProperty: {},
    byMonth: {},
  };

  let totalResolutionTime = 0;
  let resolvedCount = 0;

  tickets.forEach((ticket) => {
    // Status counts
    if (ticket.status === 'open') stats.openTickets++;
    else if (ticket.status === 'in_progress') stats.inProgressTickets++;
    else if (ticket.status === 'done') stats.doneTickets++;
    else if (ticket.status === 'cancelled') stats.cancelledTickets++;

    // Resolution time
    if (ticket.resolutionTime) {
      totalResolutionTime += ticket.resolutionTime;
      resolvedCount++;
    }

    // By category
    stats.byCategory[ticket.category] = (stats.byCategory[ticket.category] || 0) + 1;

    // By priority
    stats.byPriority[ticket.priority] = (stats.byPriority[ticket.priority] || 0) + 1;

    // By assignee
    const assignee = ticket.assignedToName || 'Unassigned';
    if (!stats.byAssignee[assignee]) {
      stats.byAssignee[assignee] = { count: 0, avgTime: 0 };
    }
    stats.byAssignee[assignee].count++;
    if (ticket.resolutionTime) {
      const current = stats.byAssignee[assignee];
      current.avgTime =
        (current.avgTime * (current.count - 1) + ticket.resolutionTime) / current.count;
    }

    // By property
    const property = ticket.propertyCode || 'Unknown';
    stats.byProperty[property] = (stats.byProperty[property] || 0) + 1;

    // By month
    const month = format(ticket.createdAt, 'yyyy-MM');
    stats.byMonth[month] = (stats.byMonth[month] || 0) + 1;
  });

  stats.averageResolutionTime =
    resolvedCount > 0 ? Math.round(totalResolutionTime / resolvedCount) : 0;

  return stats;
}
