/**
 * Client Enrichment Service
 * Fetches client demographics from Stays.net API and enriches bookings
 */

import PQueue from 'p-queue';
import { staysApiClient } from '../stays/StaysApiClient.js';
import { getCollections } from '../../config/mongodb.js';
import type { StaysClient } from '../stays/types.js';

const CLIENT_FETCH_CONCURRENCY = 5;
const CLIENT_FETCH_DELAY = 300; // ms between batches

/**
 * Enriches bookings with client demographic data
 * @returns Number of bookings enriched
 */
export async function enrichBookingsWithClientData(): Promise<number> {
  const collections = getCollections();

  console.log('🔍 Finding bookings without client demographics...');

  // Find all bookings with clientId but missing demographics
  const bookingsToEnrich = await collections.unifiedBookings
    .find({
      clientId: { $ne: null },
      guestCountry: null, // Not yet enriched
    })
    .limit(100) // Process in batches to avoid overwhelming the API
    .toArray();

  if (bookingsToEnrich.length === 0) {
    console.log('✅ All bookings already enriched');
    return 0;
  }

  console.log(`📋 Found ${bookingsToEnrich.length} bookings to enrich`);

  // Group by clientId to avoid duplicate API calls
  const uniqueClientIds = [...new Set(bookingsToEnrich.map(b => b.clientId).filter(Boolean))];
  console.log(`👥 Fetching data for ${uniqueClientIds.length} unique clients`);

  const clientDataMap = new Map<string, StaysClient>();
  const queue = new PQueue({ concurrency: CLIENT_FETCH_CONCURRENCY });

  let successCount = 0;
  let failCount = 0;

  const tasks = uniqueClientIds.map((clientId) =>
    queue.add(async () => {
      try {
        const clientData = await staysApiClient.getClientDetails(clientId as string);
        clientDataMap.set(clientId as string, clientData);
        successCount++;
      } catch (error) {
        console.warn(`⚠️ Failed to fetch client ${clientId}:`, error);
        failCount++;
      }
    })
  );

  // Add delay between batches
  queue.on('next', () => {
    if (queue.pending === 0 && queue.size > 0) {
      return new Promise((resolve) => setTimeout(resolve, CLIENT_FETCH_DELAY));
    }
  });

  await Promise.all(tasks);
  console.log(`✅ Fetched ${successCount} clients, ${failCount} failed`);

  // Update bookings with client data
  let enrichedCount = 0;

  for (const booking of bookingsToEnrich) {
    if (!booking.clientId) continue;

    const clientData = clientDataMap.get(booking.clientId);
    if (!clientData) continue;

    await collections.unifiedBookings.updateOne(
      { _id: booking._id },
      {
        $set: {
          guestCountry: clientData.country || null,
          guestLanguage: clientData.language || null,
          guestNationality: clientData.nationality || null,
          guestEmail: clientData.email || null,
          guestPhone: clientData.phone || null,
          enrichedAt: new Date(),
        },
      }
    );

    enrichedCount++;
  }

  console.log(`💾 Enriched ${enrichedCount} bookings with client demographics`);
  return enrichedCount;
}
