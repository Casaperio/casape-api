/**
 * Stays API - Entry Point
 * Centralized API for Stays.net booking data with MongoDB Atlas
 */

import { createServer } from './server.js';
import { config } from './config/env.js';
import { connectMongoDB, closeMongoDB } from './config/mongodb.js';
import { startScheduler, runInitialSync, startPropertySyncScheduler } from './jobs/scheduler.js';

async function main() {
  console.log('🚀 Starting Stays API...');
  console.log(`📌 Environment: ${config.nodeEnv}`);
  console.log(`📌 Port: ${config.port}`);
  console.log(`📌 Sync interval: ${config.sync.intervalMinutes} minutes`);
  console.log(`📌 Date range: ±${config.sync.dateRangeDays} days`);

  try {
    // Connect to MongoDB
    await connectMongoDB();

    // Create and start the server
    const server = await createServer();

    await server.listen({ port: config.port, host: '0.0.0.0' });

    console.log(`\n✅ Server running at http://localhost:${config.port}`);
    console.log('\n📚 Available endpoints:');
    console.log('   GET  /health              - Health check (no auth)');
    console.log('   GET  /health/ready        - Ready check (no auth)');
    console.log('   GET  /api/v1/dashboard    - Dashboard data (auth required)');
    console.log('   GET  /api/v1/calendar     - Calendar data (auth required)');
    console.log('   GET  /api/v1/sync/status  - Sync status (auth required)');
    console.log('   POST /api/v1/sync/trigger - Trigger sync (auth required)');

    // Run initial sync (in background)
    runInitialSync().catch((error) => {
      console.error('❌ Initial sync failed:', error);
    });

    // Start the booking sync scheduler
    startScheduler();

    // Start the property sync scheduler
    startPropertySyncScheduler();

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n📴 Received ${signal}, shutting down...`);
      await server.close();
      await closeMongoDB();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    await closeMongoDB();
    process.exit(1);
  }
}

main();
