/**
 * API Key Authentication Middleware
 * Validates X-API-Key header against configured API key
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/env.js';

export async function validateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Missing X-API-Key header',
    });
    return;
  }

  if (apiKey !== config.apiKey) {
    reply.code(403).send({
      error: 'Forbidden',
      message: 'Invalid API key',
    });
    return;
  }
}
