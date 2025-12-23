/**
 * Guests Service - Analyzes guest data from MongoDB
 */

import { parseISO } from 'date-fns';
import { getCollections } from '../config/mongodb.js';
import type {
  FirestoreUnifiedBooking,
  ReturningGuest,
  GuestDemographics,
} from './stays/types.js';

/**
 * Fetches all bookings (for guest analysis)
 */
async function getAllBookings(): Promise<FirestoreUnifiedBooking[]> {
  const collections = getCollections();

  const docs = await collections.unifiedBookings
    .find({
      type: { $ne: 'blocked' },
    })
    .toArray();

  return docs as unknown as FirestoreUnifiedBooking[];
}

/**
 * Gets returning guests (guests with more than one booking)
 */
export async function getReturningGuests(): Promise<ReturningGuest[]> {
  const bookings = await getAllBookings();

  // Group bookings by guest name (simplified - ideally would use clientId)
  const guestBookings = new Map<string, FirestoreUnifiedBooking[]>();

  bookings.forEach((booking) => {
    const guestName = booking.guestName?.toLowerCase().trim() || 'unknown';
    if (guestName === 'unknown' || guestName === '') return;

    const existing = guestBookings.get(guestName) || [];
    existing.push(booking);
    guestBookings.set(guestName, existing);
  });

  // Find guests with more than one booking
  const returningGuests: ReturningGuest[] = [];

  guestBookings.forEach((guestBooks) => {
    if (guestBooks.length > 1) {
      // Sort by check-in date
      guestBooks.sort((a, b) =>
        parseISO(a.checkInDate).getTime() - parseISO(b.checkInDate).getTime()
      );

      let totalNights = 0;
      let totalRevenue = 0;
      const properties = new Set<string>();

      guestBooks.forEach((b) => {
        totalNights += b.nights || 0;
        totalRevenue += b.priceValue || 0;
        properties.add(b.apartmentCode);
      });

      returningGuests.push({
        clientId: guestBooks[0].staysReservationId, // Placeholder
        name: guestBooks[0].guestName,
        email: undefined, // Would need from client data
        country: undefined,
        language: undefined,
        totalStays: guestBooks.length,
        totalNights,
        totalRevenue,
        firstStay: guestBooks[0].checkInDate,
        lastStay: guestBooks[guestBooks.length - 1].checkInDate,
        properties: Array.from(properties),
      });
    }
  });

  // Sort by total stays descending
  returningGuests.sort((a, b) => b.totalStays - a.totalStays);

  return returningGuests;
}

/**
 * Gets guest demographics summary
 */
export async function getGuestDemographics(): Promise<GuestDemographics> {
  const bookings = await getAllBookings();

  const byCountry = new Map<string, number>();
  const byLanguage = new Map<string, number>();
  const guestNames = new Set<string>();

  let totalWithChildren = 0;
  let totalWithBabies = 0;
  let totalGroupSize = 0;
  let totalBookings = 0;

  bookings.forEach((booking) => {
    totalBookings++;

    // Track unique guests
    const guestName = booking.guestName?.toLowerCase().trim() || '';
    if (guestName) guestNames.add(guestName);

    // Count children and babies
    if (booking.children > 0) totalWithChildren++;
    if (booking.babies > 0) totalWithBabies++;

    // Group size
    totalGroupSize += booking.guestCount || 1;

    // Use real guest country/language from enriched client data
    const country = booking.guestCountry || 'Unknown';
    const language = booking.guestLanguage || 'Unknown';

    byCountry.set(country, (byCountry.get(country) || 0) + 1);
    byLanguage.set(language, (byLanguage.get(language) || 0) + 1);
  });

  // Find returning guests (appear more than once)
  const guestBookingCounts = new Map<string, number>();

  bookings.forEach((booking) => {
    const guestName = booking.guestName?.toLowerCase().trim() || '';
    if (guestName) {
      guestBookingCounts.set(
        guestName,
        (guestBookingCounts.get(guestName) || 0) + 1
      );
    }
  });

  let returningGuestsCount = 0;
  guestBookingCounts.forEach((count) => {
    if (count > 1) returningGuestsCount++;
  });

  const totalUniqueGuests = guestNames.size;
  const returningGuestsRate = totalUniqueGuests > 0
    ? (returningGuestsCount / totalUniqueGuests) * 100
    : 0;

  const averageGroupSize = totalBookings > 0
    ? totalGroupSize / totalBookings
    : 0;

  return {
    byCountry: Object.fromEntries(byCountry),
    byLanguage: Object.fromEntries(byLanguage),
    returningGuestsRate: Math.round(returningGuestsRate * 10) / 10,
    averageGroupSize: Math.round(averageGroupSize * 10) / 10,
    withChildren: totalWithChildren,
    withBabies: totalWithBabies,
  };
}

/**
 * Gets summary of guest statistics
 */
export async function getGuestSummary(): Promise<{
  totalUniqueGuests: number;
  totalBookings: number;
  returningGuests: number;
  returningGuestsRate: number;
  topGuests: Array<{ name: string; stays: number; revenue: number }>;
}> {
  const returning = await getReturningGuests();
  const bookings = await getAllBookings();

  const guestNames = new Set<string>();
  bookings.forEach((b) => {
    const name = b.guestName?.toLowerCase().trim() || '';
    if (name) guestNames.add(name);
  });

  const totalUniqueGuests = guestNames.size;
  const returningGuestsCount = returning.length;
  const returningGuestsRate = totalUniqueGuests > 0
    ? (returningGuestsCount / totalUniqueGuests) * 100
    : 0;

  return {
    totalUniqueGuests,
    totalBookings: bookings.length,
    returningGuests: returningGuestsCount,
    returningGuestsRate: Math.round(returningGuestsRate * 10) / 10,
    topGuests: returning.slice(0, 10).map((g) => ({
      name: g.name,
      stays: g.totalStays,
      revenue: g.totalRevenue,
    })),
  };
}
