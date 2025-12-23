/**
 * Cron Job Scheduler
 * Handles periodic sync from Stays.net API to MongoDB
 */

import cron from 'node-cron';
import { syncStaysData, getSyncStatus } from '../services/sync/SyncService.js';
import { syncPropertiesData, getPropertySyncStatus } from '../services/sync/PropertySyncService.js';
import { enrichBookingsWithClientData } from '../services/sync/ClientEnrichmentService.js';
import { config } from '../config/env.js';

let syncJob: cron.ScheduledTask | null = null;
let propertySyncJob: cron.ScheduledTask | null = null;

/**
 * Starts the sync cron job
 */
export function startScheduler(): void {
  const intervalMinutes = config.sync.intervalMinutes;

  // Create cron expression: */5 * * * * means every 5 minutes
  const cronExpression = `*/${intervalMinutes} * * * *`;

  console.log(`⏰ Starting scheduler with interval: every ${intervalMinutes} minutes`);

  syncJob = cron.schedule(cronExpression, async () => {
    console.log(`\n🕐 [${new Date().toISOString()}] Scheduled sync triggered`);

    // Check if sync is already running
    const status = await getSyncStatus();
    if (status?.status === 'running') {
      console.log('⏭️ Skipping: sync already in progress');
      return;
    }

    try {
      const result = await syncStaysData();
      console.log(`📊 Sync result:`, {
        success: result.success,
        bookings: result.bookingsCount,
        listings: result.listingsCount,
        duration: `${result.durationMs}ms`,
      });

      // Run client enrichment after sync
      try {
        const enrichedCount = await enrichBookingsWithClientData();
        if (enrichedCount > 0) {
          console.log(`📊 Enriched ${enrichedCount} additional bookings`);
        }
      } catch (error) {
        console.error('❌ Client enrichment error:', error);
      }
    } catch (error) {
      console.error('❌ Scheduled sync error:', error);
    }
  });

  console.log('✅ Scheduler started');
}

/**
 * Stops the sync cron job
 */
export function stopScheduler(): void {
  if (syncJob) {
    syncJob.stop();
    syncJob = null;
    console.log('⏹️ Scheduler stopped');
  }
}

/**
 * Runs an initial sync on startup
 */
export async function runInitialSync(): Promise<void> {
  console.log('🚀 Running initial sync on startup...');

  const status = await getSyncStatus();

  // Skip if already running
  if (status?.status === 'running') {
    console.log('⏭️ Skipping initial sync: already in progress');
    return;
  }

  // Run sync if never synced or last sync was more than interval ago
  if (status?.status === 'never' || !status?.lastSyncAt) {
    try {
      const result = await syncStaysData();
      console.log('📊 Initial sync completed:', {
        success: result.success,
        bookings: result.bookingsCount,
        listings: result.listingsCount,
        duration: `${result.durationMs}ms`,
      });

      // Enrich bookings with client demographics
      try {
        const enrichedCount = await enrichBookingsWithClientData();
        console.log(`📊 Enriched ${enrichedCount} bookings with client data`);
      } catch (error) {
        console.error('❌ Client enrichment error:', error);
      }
    } catch (error) {
      console.error('❌ Initial sync error:', error);
    }
  } else {
    console.log('ℹ️ Skipping initial sync: recent data available');
  }
}

/**
 * Starts the property sync scheduler (daily at 3 AM)
 */
export function startPropertySyncScheduler(): void {
  const cronExpression = '0 3 * * *'; // Daily at 3 AM

  console.log('⏰ Starting property sync scheduler: daily at 3 AM');

  propertySyncJob = cron.schedule(cronExpression, async () => {
    console.log(`\n🏠 [${new Date().toISOString()}] Scheduled property sync triggered`);

    const status = await getPropertySyncStatus();
    if (status.status === 'running') {
      console.log('⏭️ Skipping: property sync already in progress');
      return;
    }

    try {
      const result = await syncPropertiesData();
      console.log('📊 Property sync result:', result);
    } catch (error) {
      console.error('❌ Scheduled property sync error:', error);
    }
  });

  console.log('✅ Property sync scheduler started');
}

/**
 * Stops the property sync scheduler
 */
export function stopPropertySyncScheduler(): void {
  if (propertySyncJob) {
    propertySyncJob.stop();
    propertySyncJob = null;
    console.log('⏹️ Property sync scheduler stopped');
  }
}
