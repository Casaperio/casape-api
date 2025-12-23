/**
 * Sync Routes - Status and manual trigger
 */

import type { FastifyInstance } from 'fastify';
import { syncStaysData, getSyncStatus } from '../services/sync/SyncService.js';
import { validateApiKey } from '../middleware/auth.js';

export async function syncRoutes(fastify: FastifyInstance): Promise<void> {
  // Add auth hook to all routes in this plugin
  fastify.addHook('preHandler', validateApiKey);

  // GET /api/v1/sync/status - Get current sync status
  fastify.get('/sync/status', async () => {
    const status = await getSyncStatus();

    return {
      lastSyncAt: status?.lastSyncAt instanceof Date
        ? status.lastSyncAt.toISOString()
        : (status?.lastSyncAt || null),
      status: status?.status || 'never',
      lastError: status?.lastError || null,
      bookingsCount: status?.bookingsCount || 0,
      listingsCount: status?.listingsCount || 0,
      durationMs: status?.durationMs || 0,
    };
  });

  // POST /api/v1/sync/trigger - Manually trigger sync
  fastify.post('/sync/trigger', async (_request, reply) => {
    // Check if sync is already running
    const currentStatus = await getSyncStatus();

    if (currentStatus?.status === 'running') {
      reply.code(409).send({
        error: 'Conflict',
        message: 'Sync is already running',
      });
      return;
    }

    // Start sync in background (don't await)
    syncStaysData()
      .then((result) => {
        console.log('📊 Manual sync result:', result);
      })
      .catch((error) => {
        console.error('❌ Manual sync error:', error);
      });

    return {
      message: 'Sync started',
      timestamp: new Date().toISOString(),
    };
  });
}
