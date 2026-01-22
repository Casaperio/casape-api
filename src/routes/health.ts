/**
 * Health Check Routes
 */

import type { FastifyInstance } from 'fastify';

const API_VERSION = '1.0.2';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  // Basic health check - no auth required
  fastify.get('/health', async () => {
    return {
      api: 'ok',
      version: API_VERSION,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // Detailed health check - no auth required
  fastify.get('/health/ready', async () => {
    return {
      status: 'ready',
      version: API_VERSION,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    };
  });
}
