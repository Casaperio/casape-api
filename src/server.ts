/**
 * Fastify Server Setup
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerRoutes } from './routes/index.js';
import { config } from './config/env.js';

export async function createServer() {
  const fastify = Fastify({
    logger: {
      level: config.nodeEnv === 'production' ? 'info' : 'debug',
      transport:
        config.nodeEnv !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // Register CORS
  await fastify.register(cors, {
    origin: [
      'http://localhost:5173',
      'http://localhost:4173',
      'https://central.casaperio.com',
      'https://casaperio.com',
      'https://www.casaperio.com',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  });

  // Register all routes
  await registerRoutes(fastify);

  // Error handler
  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error(error);

    const err = error as { statusCode?: number; name?: string; message?: string };
    reply.code(err.statusCode || 500).send({
      error: err.name || 'Internal Server Error',
      message: err.message || 'An unexpected error occurred',
      statusCode: err.statusCode || 500,
    });
  });

  return fastify;
}
