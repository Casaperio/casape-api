/**
 * Sync Service - Synchronizes data from Stays.net API to MongoDB Atlas
 * Handles batch processing with rate limiting to avoid API throttling
 */

import PQueue from 'p-queue';
import { format, subDays, addDays, differenceInDays, parseISO } from 'date-fns';
import { staysApiClient } from '../stays/StaysApiClient.js';
import { getCollections } from '../../config/mongodb.js';
import { config } from '../../config/env.js';
import type {
  StaysBooking,
  ListingDetails,
  FirestoreSyncStatus,
} from '../stays/types.js';

// Queue configurations for rate limiting
// Optimized for faster sync while respecting API limits
const BOOKING_DETAILS_CONCURRENCY = 20; // Increased from 10 for faster processing
const BOOKING_DETAILS_DELAY = 100; // Reduced from 500ms for faster throughput
const LISTING_DETAILS_CONCURRENCY = 20; // Increased from 10 for faster processing
const LISTING_DETAILS_DELAY = 100; // Reduced from 200ms for faster throughput

/**
 * Extracts total price from booking using multiple fallback strategies
 * Updated to match actual Stays.net API response format:
 * - price._f_total (total including fees)
 * - price._f_expected (nights value)
 * - price.hostingDetails._f_total
 * - stats._f_totalPaid (total paid)
 */
function extractTotalPrice(booking: StaysBooking): number | null {
  // Strategy 1: Use _f_total from price (most reliable - includes all fees)
  if (booking.price?._f_total && booking.price._f_total > 0) {
    return booking.price._f_total;
  }

  // Strategy 2: Use _f_totalPaid from stats (actual paid amount)
  if (booking.stats?._f_totalPaid && booking.stats._f_totalPaid > 0) {
    return booking.stats._f_totalPaid;
  }

  // Strategy 3: Use hostingDetails._f_total
  if (booking.price?.hostingDetails?._f_total && booking.price.hostingDetails._f_total > 0) {
    const hostingTotal = booking.price.hostingDetails._f_total;
    const extrasTotal = booking.price.extrasDetails?._f_total || 0;
    return hostingTotal + extrasTotal;
  }

  // Strategy 4: Use _f_expected (just nights, without fees)
  if (booking.price?._f_expected && booking.price._f_expected > 0) {
    return booking.price._f_expected;
  }

  // Strategy 5: Legacy fallback - direct price value
  if (booking.price?.value && booking.price.value > 0) {
    return booking.price.value;
  }

  // Strategy 6: Legacy fallback - sum components
  if (booking.price) {
    const baseValue = booking.price.value || 0;
    const cleaning = booking.price.cleaning || 0;
    const extras = booking.price.extras || 0;
    const total = baseValue + cleaning + extras;
    if (total > 0) {
      return total;
    }
  }

  return null;
}

/**
 * Updates the sync status in MongoDB
 */
async function updateSyncStatus(
  status: FirestoreSyncStatus['status'],
  error: string | null = null,
  stats: { bookingsCount?: number; listingsCount?: number; durationMs?: number } = {}
): Promise<void> {
  const now = new Date();
  const collections = getCollections();

  const updateData: Record<string, unknown> = {
    status,
    updatedAt: now,
  };

  if (status === 'success' || status === 'error') {
    updateData.lastSyncAt = now;
  }

  if (error !== null) {
    updateData.lastError = error;
  }

  if (stats.bookingsCount !== undefined) {
    updateData.bookingsCount = stats.bookingsCount;
  }

  if (stats.listingsCount !== undefined) {
    updateData.listingsCount = stats.listingsCount;
  }

  if (stats.durationMs !== undefined) {
    updateData.durationMs = stats.durationMs;
  }

  await collections.syncStatus.updateOne(
    { _id: 'current' } as any,
    { $set: updateData },
    { upsert: true }
  );
}

/**
 * Fetches detailed booking information with rate limiting
 * Uses booking._id as the reservation identifier for the API endpoint
 */
async function fetchBookingDetails(
  bookings: StaysBooking[]
): Promise<Map<string, StaysBooking>> {
  const detailsMap = new Map<string, StaysBooking>();
  const queue = new PQueue({ concurrency: BOOKING_DETAILS_CONCURRENCY });

  console.log(`📋 Fetching details for ${bookings.length} bookings...`);

  let successCount = 0;
  let failCount = 0;

  const tasks = bookings.map((booking) =>
    queue.add(async () => {
      try {
        // Use booking.id (code like "FA01J") for the API endpoint, NOT _id
        const details = await staysApiClient.getBookingDetails(booking.id);

        // Log guest details for debugging
        if (details.guestsDetails) {
          const hasName = !!details.guestsDetails.name;
          const hasList = details.guestsDetails.list && details.guestsDetails.list.length > 0;
          if (!hasName && !hasList) {
            console.log(`⚠️ Booking ${booking.id}: No guest name data in guestsDetails`);
          }
        } else {
          console.log(`⚠️ Booking ${booking.id}: guestsDetails is undefined`);
        }

        // Store by _id (internal ID) for consistency with MongoDB
        detailsMap.set(booking._id, details);
        successCount++;
      } catch (error) {
        console.warn(`⚠️ Failed to fetch details for booking ${booking.id}:`, error);
        // Use the basic booking data if details fetch fails
        detailsMap.set(booking._id, booking);
        failCount++;
      }
    })
  );

  // Add delay between batches
  queue.on('next', () => {
    if (queue.pending === 0 && queue.size > 0) {
      return new Promise((resolve) => setTimeout(resolve, BOOKING_DETAILS_DELAY));
    }
  });

  await Promise.all(tasks);
  console.log(`✅ Fetched details: ${successCount} success, ${failCount} failed`);

  return detailsMap;
}

/**
 * Fetches listing details for unique listings with rate limiting
 */
async function fetchListingDetails(
  listingIds: string[]
): Promise<Map<string, ListingDetails>> {
  const detailsMap = new Map<string, ListingDetails>();
  const uniqueIds = [...new Set(listingIds)];
  const queue = new PQueue({ concurrency: LISTING_DETAILS_CONCURRENCY });

  console.log(`🏠 Fetching details for ${uniqueIds.length} listings...`);

  const tasks = uniqueIds.map((listingId) =>
    queue.add(async () => {
      try {
        const details = await staysApiClient.getListingDetails(listingId);
        detailsMap.set(listingId, details);
      } catch (error) {
        console.warn(`⚠️ Failed to fetch listing ${listingId}:`, error);
      }
    })
  );

  // Add delay between batches
  queue.on('next', () => {
    if (queue.pending === 0 && queue.size > 0) {
      return new Promise((resolve) => setTimeout(resolve, LISTING_DETAILS_DELAY));
    }
  });

  await Promise.all(tasks);
  console.log(`✅ Fetched details for ${detailsMap.size} listings`);

  return detailsMap;
}

/**
 * Writes listings to MongoDB using bulkWrite
 */
async function writeListingsToMongo(
  listings: Map<string, ListingDetails>
): Promise<number> {
  const collections = getCollections();
  const entries = Array.from(listings.entries());
  const now = new Date();

  if (entries.length === 0) return 0;

  const operations = entries.map(([listingId, listing]) => ({
    updateOne: {
      filter: { _id: listingId } as any,
      update: {
        $set: {
          staysListingId: listing._id,
          internalName: listing.internalName || null,
          name: listing.name || null,
          address: listing.address || null,
          thumbnailUrl: null,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      upsert: true,
    },
  }));

  const result = await collections.listings.bulkWrite(operations as any);
  return result.upsertedCount + result.modifiedCount;
}

/**
 * Writes reservations to MongoDB using bulkWrite
 */
async function writeReservationsToMongo(
  bookings: Map<string, StaysBooking>
): Promise<number> {
  const collections = getCollections();
  const entries = Array.from(bookings.entries());
  const now = new Date();

  if (entries.length === 0) return 0;

  const operations = entries.map(([bookingId, booking]) => {
    // Get platform from partner or source
    const platform = booking.partner?.name || booking.source || null;

    // Get guest name (from list or guestsDetails)
    const guestName = extractGuestName(booking);

    return {
      updateOne: {
        filter: { _id: bookingId } as any,
        update: {
          $set: {
            staysReservationId: booking._id,
            staysBookingCode: booking.id,
            listingId: booking._idlisting,
            type: booking.type,
            checkInDate: booking.checkInDate,
            checkInTime: booking.checkInTime || null,
            checkOutDate: booking.checkOutDate,
            checkOutTime: booking.checkOutTime || null,
            guestName,
            guestCount: booking.guests || ((booking.stats?.adults || 0) + (booking.stats?.children || 0) + (booking.stats?.babies || 0)) || 0,
            adults: booking.stats?.adults || 0,
            children: booking.stats?.children || 0,
            babies: booking.stats?.babies || 0,
            nights: booking.stats?.nights || 0,
            platform,
            channelName: booking.channelName || null,
            source: booking.source || null,
            status: booking.status || null,
            priceValue: extractTotalPrice(booking),
            priceCurrency: booking.price?.currency || 'BRL',
            updatedAt: now,
            syncedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        upsert: true,
      },
    };
  });

  const result = await collections.reservations.bulkWrite(operations as any);
  return result.upsertedCount + result.modifiedCount;
}

/**
 * Check if a guest name is a valid real name (not a placeholder)
 */
function isValidGuestName(name: string | undefined): boolean {
  if (!name || name.trim() === '') return false;

  // Filter out placeholder names
  const placeholders = [
    'adult_0', 'adult_1', 'adult_2', 'adult_3',
    'child_0', 'child_1', 'child_2', 'child_3',
    'baby_0', 'baby_1', 'baby_2', 'baby_3',
    'guest', 'hóspede', 'hospede',
  ];

  const lowerName = name.toLowerCase().trim();

  // Check if it's a known placeholder
  if (placeholders.includes(lowerName)) return false;

  // Check if it starts with placeholder prefixes
  if (lowerName.startsWith('adult_') || lowerName.startsWith('child_') || lowerName.startsWith('baby_')) {
    return false;
  }

  return true;
}

/**
 * Extract guest name from booking data
 * Priority: 1) guestsDetails.name, 2) primary guest in list, 3) first guest in list, 4) fallback
 * Changed priority to check guestsDetails.name first as it's more reliable in Stays API
 */
function extractGuestName(booking: StaysBooking, debug = false): string {
  // First, check guestsDetails.name (most reliable source)
  if (booking.guestsDetails?.name && isValidGuestName(booking.guestsDetails.name)) {
    if (debug) console.log(`   ✅ Found name in guestsDetails.name: "${booking.guestsDetails.name}"`);
    return booking.guestsDetails.name.trim();
  }

  // Check guestsDetails.list for guests
  const guestsList = booking.guestsDetails?.list;
  if (debug) {
    console.log(`   📋 guestsDetails.list exists: ${!!guestsList}`);
    console.log(`   📋 guestsDetails.list is array: ${Array.isArray(guestsList)}`);
    console.log(`   📋 guestsDetails.list length: ${guestsList?.length || 0}`);
  }

  if (guestsList && Array.isArray(guestsList) && guestsList.length > 0) {
    // Find primary guest first
    const primaryGuest = guestsList.find(g => g.primary === true);
    if (debug) console.log(`   🔍 Primary guest: ${JSON.stringify(primaryGuest)}`);

    if (primaryGuest?.name && isValidGuestName(primaryGuest.name)) {
      if (debug) console.log(`   ✅ Found name in primary guest: "${primaryGuest.name}"`);
      return primaryGuest.name.trim();
    }

    // Otherwise, get first guest with a valid name
    const firstValidGuest = guestsList.find(g => isValidGuestName(g.name));
    if (debug) console.log(`   🔍 First valid guest: ${JSON.stringify(firstValidGuest)}`);

    if (firstValidGuest?.name) {
      if (debug) console.log(`   ✅ Found name in first valid guest: "${firstValidGuest.name}"`);
      return firstValidGuest.name.trim();
    }
  }

  // Final fallback
  if (debug) console.log(`   ❌ No valid name found, using fallback "Hóspede"`);
  return 'Hóspede';
}

/**
 * Get platform image path
 */
function getPlatformImage(platform: string | null): string {
  if (!platform) return '/images/platforms/default.png';

  const normalizedPlatform = platform.toLowerCase().trim();
  const platformImageMap: Record<string, string> = {
    'airbnb': '/images/platforms/airbnb.png',
    'api airbnb': '/images/platforms/airbnb.png',
    'booking': '/images/platforms/booking.svg',
    'booking.com': '/images/platforms/booking.png',
    'expedia': '/images/platforms/expedia.png',
    'vrbo': '/images/platforms/vrbo.png',
    'tripadvisor': '/images/platforms/tripadvisor.png',
    'homeaway': '/images/platforms/homeaway.png',
    'stays': '/images/platforms/stays.png',
    'stays.net': '/images/platforms/stays.png',
    'direct': '/images/platforms/direct.png',
    'direto': '/images/platforms/direct.png',
    'website': '/images/platforms/direct.png',
    'manual': '/images/platforms/direct.png',
  };

  // Check for partial matches
  for (const [key, value] of Object.entries(platformImageMap)) {
    if (normalizedPlatform.includes(key)) {
      return value;
    }
  }

  return '/images/platforms/default.png';
}

/**
 * Calculate nights between two dates (YYYY-MM-DD format)
 */
function calculateNights(checkInDate: string, checkOutDate: string): number {
  try {
    const checkIn = parseISO(checkInDate);
    const checkOut = parseISO(checkOutDate);
    const nights = differenceInDays(checkOut, checkIn);
    return nights > 0 ? nights : 0;
  } catch {
    return 0;
  }
}

/**
 * Writes unified bookings to MongoDB (reservation + listing data combined)
 */
async function writeUnifiedBookingsToMongo(
  bookings: Map<string, StaysBooking>,
  listings: Map<string, ListingDetails>
): Promise<number> {
  const collections = getCollections();
  const entries = Array.from(bookings.entries());
  const now = new Date();

  if (entries.length === 0) return 0;

  // Debug first 3 bookings
  let debugCount = 0;
  const MAX_DEBUG = 3;

  const operations = entries.map(([bookingId, booking]) => {
    const shouldDebug = debugCount < MAX_DEBUG;
    if (shouldDebug) {
      console.log(`\n🔍 DEBUG Booking ${debugCount + 1}/${MAX_DEBUG}:`);
      console.log(`   ID: ${bookingId} (code: ${booking.id})`);
      console.log(`   guestsDetails: ${JSON.stringify(booking.guestsDetails)}`);
      debugCount++;
    }
    // Get listing info
    const listing = listings.get(booking._idlisting);
    const apartmentCode = listing?.internalName || booking._idlisting;
    const listingName = listing?.name || null;
    const listingAddress = listing?.address || null;

    // Get platform
    const platform = booking.partner?.name || booking.source || null;

    // Get guest name (from list or guestsDetails)
    const guestName = extractGuestName(booking, shouldDebug);
    if (shouldDebug) {
      console.log(`   🎯 Extracted guestName: "${guestName}"`);
    }

    // Calculate guest count
    const guestCount = booking.guests ||
      (booking.stats?.adults || 0) + (booking.stats?.children || 0) + (booking.stats?.babies || 0) || 0;

    // Calculate nights - use stats.nights if available, otherwise calculate from dates
    const nights = booking.stats?.nights || calculateNights(booking.checkInDate, booking.checkOutDate);

    return {
      updateOne: {
        filter: { _id: bookingId } as any,
        update: {
          $set: {
            id: booking._id,
            staysReservationId: booking._id,
            staysBookingCode: booking.id,

            // Listing info (denormalized)
            listingId: booking._idlisting,
            apartmentCode,
            listingName,
            listingAddress,

            // Booking type and status
            type: booking.type,
            status: booking.status || null,

            // Dates and times
            checkInDate: booking.checkInDate,
            checkInTime: booking.checkInTime || null,
            checkOutDate: booking.checkOutDate,
            checkOutTime: booking.checkOutTime || null,
            nights,
            creationDate: booking.creationDate || null,

            // Guest info
            guestName,
            guestCount,
            adults: booking.stats?.adults || 0,
            children: booking.stats?.children || 0,
            babies: booking.stats?.babies || 0,

            // Client demographics (will be enriched separately)
            clientId: booking._idclient || null,
            guestCountry: null,
            guestLanguage: null,
            guestNationality: null,
            guestEmail: null,
            guestPhone: null,

            // Platform/Source
            platform,
            platformImage: getPlatformImage(platform),
            channelName: booking.channelName || null,
            source: booking.source || null,

            // Price - extracted with multiple fallback strategies
            priceValue: extractTotalPrice(booking),
            priceCurrency: booking.price?.currency || 'BRL',

            // Timestamps
            updatedAt: now,
            syncedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        upsert: true,
      },
    };
  });

  const result = await collections.unifiedBookings.bulkWrite(operations as any);
  return result.upsertedCount + result.modifiedCount;
}

/**
 * Main sync function - orchestrates the entire sync process
 */
export async function syncStaysData(): Promise<{
  success: boolean;
  bookingsCount: number;
  listingsCount: number;
  durationMs: number;
  error?: string;
}> {
  const startTime = Date.now();
  console.log('🔄 Starting Stays.net sync...');

  try {
    // 1. Update status to running
    await updateSyncStatus('running');

    // 2. Calculate date range (today ± configured days)
    const today = new Date();
    const fromDate = format(subDays(today, config.sync.dateRangeDays), 'yyyy-MM-dd');
    const toDate = format(addDays(today, config.sync.dateRangeDays), 'yyyy-MM-dd');

    console.log(`📅 Date range: ${fromDate} to ${toDate}`);

    // 3. Fetch all bookings from Stays API
    const bookings = await staysApiClient.getAllBookings(fromDate, toDate, 'included');

    if (bookings.length === 0) {
      console.log('ℹ️ No bookings found in date range');
      const durationMs = Date.now() - startTime;
      await updateSyncStatus('success', null, { bookingsCount: 0, listingsCount: 0, durationMs });
      return { success: true, bookingsCount: 0, listingsCount: 0, durationMs };
    }

    // 4. Fetch detailed booking information
    const bookingDetails = await fetchBookingDetails(bookings);

    // 5. Get unique listing IDs and fetch listing details
    const listingIds = bookings.map((b) => b._idlisting);
    const listingDetails = await fetchListingDetails(listingIds);

    // 6. Write listings to MongoDB
    const listingsWritten = await writeListingsToMongo(listingDetails);
    console.log(`💾 Wrote ${listingsWritten} listings to MongoDB`);

    // 7. Write reservations to MongoDB
    const reservationsWritten = await writeReservationsToMongo(bookingDetails);
    console.log(`💾 Wrote ${reservationsWritten} reservations to MongoDB`);

    // 8. Write unified bookings to MongoDB (denormalized for fast reads)
    const unifiedWritten = await writeUnifiedBookingsToMongo(bookingDetails, listingDetails);
    console.log(`💾 Wrote ${unifiedWritten} unified bookings to MongoDB`);

    // 9. Update sync status to success
    const durationMs = Date.now() - startTime;
    await updateSyncStatus('success', null, {
      bookingsCount: reservationsWritten,
      listingsCount: listingsWritten,
      durationMs,
    });

    console.log(`✅ Sync completed in ${durationMs}ms`);

    return {
      success: true,
      bookingsCount: reservationsWritten,
      listingsCount: listingsWritten,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    let errorMessage = 'Unknown error';

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = String((error as { message: unknown }).message);
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    console.error('❌ Sync failed:', errorMessage, error);
    await updateSyncStatus('error', errorMessage, { durationMs });

    return {
      success: false,
      bookingsCount: 0,
      listingsCount: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

/**
 * Gets the current sync status from MongoDB
 */
export async function getSyncStatus(): Promise<FirestoreSyncStatus | null> {
  const collections = getCollections();
  const doc = await collections.syncStatus.findOne({ _id: 'current' } as any);

  if (!doc) {
    return {
      lastSyncAt: null,
      status: 'never',
      lastError: null,
      bookingsCount: 0,
      listingsCount: 0,
      durationMs: 0,
      updatedAt: new Date(),
    };
  }

  return {
    lastSyncAt: doc.lastSyncAt || null,
    status: doc.status || 'never',
    lastError: doc.lastError || null,
    bookingsCount: doc.bookingsCount || 0,
    listingsCount: doc.listingsCount || 0,
    durationMs: doc.durationMs || 0,
    updatedAt: doc.updatedAt || new Date(),
  };
}
