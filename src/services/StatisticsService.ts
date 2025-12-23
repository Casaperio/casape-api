/**
 * Statistics Service - Calculates booking statistics from MongoDB data
 */

import { format, parseISO, differenceInDays } from 'date-fns';
import { getCollections } from '../config/mongodb.js';
import type {
  FirestoreUnifiedBooking,
  BookingStatistics,
  OccupancyData,
  CancellationData,
} from './stays/types.js';

/**
 * Fetches all bookings for a date range (including blocked)
 */
async function getAllBookingsForPeriod(
  from: string,
  to: string
): Promise<FirestoreUnifiedBooking[]> {
  const collections = getCollections();

  const docs = await collections.unifiedBookings
    .find({
      checkOutDate: { $gte: from },
      checkInDate: { $lte: to },
    })
    .toArray();

  return docs as unknown as FirestoreUnifiedBooking[];
}

/**
 * Gets all unique listings from MongoDB
 */
async function getAllListings(): Promise<Map<string, { code: string; name: string | null }>> {
  const collections = getCollections();
  const docs = await collections.unifiedBookings
    .aggregate([
      {
        $group: {
          _id: '$listingId',
          apartmentCode: { $first: '$apartmentCode' },
          listingName: { $first: '$listingName' },
        },
      },
    ])
    .toArray();

  const listings = new Map<string, { code: string; name: string | null }>();
  docs.forEach((doc) => {
    listings.set(doc._id as string, {
      code: doc.apartmentCode as string,
      name: doc.listingName as string | null,
    });
  });

  return listings;
}

/**
 * Calculates booking statistics for a period
 */
export async function getBookingStatistics(
  from: string,
  to: string
): Promise<BookingStatistics> {
  const bookings = await getAllBookingsForPeriod(from, to);

  let totalBookings = 0;
  let confirmedBookings = 0;
  let canceledBookings = 0;
  let blockedDates = 0;
  let totalLeadTime = 0;
  let totalStayLength = 0;
  let totalGuests = 0;

  const bySource = new Map<string, number>();
  const byMonth = new Map<string, number>();
  const byDayOfWeek = new Map<string, number>();

  bookings.forEach((booking) => {
    if (booking.type === 'blocked') {
      blockedDates++;
      return;
    }

    totalBookings++;

    // Status check (simplified - Stays uses numeric status)
    if (booking.status === 'canceled' || booking.status === '3') {
      canceledBookings++;
    } else {
      confirmedBookings++;
    }

    // Lead time calculation (days between creation and check-in)
    if (booking.creationDate && booking.checkInDate) {
      const created = parseISO(booking.creationDate);
      const checkIn = parseISO(booking.checkInDate);
      const leadDays = differenceInDays(checkIn, created);

      // Only count positive lead times (creation before check-in)
      if (leadDays >= 0) {
        totalLeadTime += leadDays;
      }
    }

    // Stay length
    totalStayLength += booking.nights || 1;

    // Guest count
    totalGuests += booking.guestCount || 1;

    // By source/platform
    const source = booking.platform || booking.channelName || 'Direct';
    bySource.set(source, (bySource.get(source) || 0) + 1);

    // By month
    const checkInDate = parseISO(booking.checkInDate);
    const monthKey = format(checkInDate, 'yyyy-MM');
    byMonth.set(monthKey, (byMonth.get(monthKey) || 0) + 1);

    // By day of week
    const dayOfWeek = format(checkInDate, 'EEEE');
    byDayOfWeek.set(dayOfWeek, (byDayOfWeek.get(dayOfWeek) || 0) + 1);
  });

  const cancellationRate = totalBookings > 0
    ? (canceledBookings / totalBookings) * 100
    : 0;
  const averageLeadTime = confirmedBookings > 0
    ? totalLeadTime / confirmedBookings
    : 0;
  const averageStayLength = confirmedBookings > 0
    ? totalStayLength / confirmedBookings
    : 0;
  const averageGuestsPerBooking = confirmedBookings > 0
    ? totalGuests / confirmedBookings
    : 0;

  return {
    totalBookings,
    confirmedBookings,
    canceledBookings,
    blockedDates,
    cancellationRate: Math.round(cancellationRate * 10) / 10,
    averageLeadTime: Math.round(averageLeadTime * 10) / 10,
    averageStayLength: Math.round(averageStayLength * 10) / 10,
    totalGuests,
    averageGuestsPerBooking: Math.round(averageGuestsPerBooking * 10) / 10,
    bySource: Object.fromEntries(bySource),
    byMonth: Object.fromEntries(byMonth),
    byDayOfWeek: Object.fromEntries(byDayOfWeek),
  };
}

/**
 * Calculates occupancy data by property
 */
export async function getOccupancyByProperty(
  from: string,
  to: string
): Promise<OccupancyData[]> {
  const bookings = await getAllBookingsForPeriod(from, to);
  const listings = await getAllListings();

  const periodDays = differenceInDays(parseISO(to), parseISO(from)) + 1;

  // Group bookings by property
  const propertyData = new Map<string, {
    occupiedNights: number;
    blockedNights: number;
    name: string | null;
  }>();

  // Initialize all properties
  listings.forEach((listing, listingId) => {
    propertyData.set(listingId, {
      occupiedNights: 0,
      blockedNights: 0,
      name: listing.name,
    });
  });

  // Aggregate booking data
  bookings.forEach((booking) => {
    const existing = propertyData.get(booking.listingId) || {
      occupiedNights: 0,
      blockedNights: 0,
      name: booking.listingName,
    };

    if (booking.type === 'blocked') {
      existing.blockedNights += booking.nights || 1;
    } else {
      existing.occupiedNights += booking.nights || 1;
    }

    propertyData.set(booking.listingId, existing);
  });

  // Build result array
  const result: OccupancyData[] = [];

  listings.forEach((listing, listingId) => {
    const data = propertyData.get(listingId)!;
    const availableNights = periodDays - data.blockedNights;
    const occupancyRate = availableNights > 0
      ? (data.occupiedNights / availableNights) * 100
      : 0;
    const blockRate = periodDays > 0
      ? (data.blockedNights / periodDays) * 100
      : 0;

    result.push({
      propertyCode: listing.code,
      propertyName: listing.name,
      totalNights: periodDays,
      occupiedNights: data.occupiedNights,
      blockedNights: data.blockedNights,
      availableNights,
      occupancyRate: Math.round(occupancyRate * 10) / 10,
      blockRate: Math.round(blockRate * 10) / 10,
    });
  });

  // Sort by occupancy rate descending
  result.sort((a, b) => b.occupancyRate - a.occupancyRate);

  return result;
}

/**
 * Calculates cancellation analysis
 */
export async function getCancellationAnalysis(
  from: string,
  to: string
): Promise<CancellationData> {
  const bookings = await getAllBookingsForPeriod(from, to);

  let totalBookings = 0;
  let totalCancellations = 0;
  let totalAdvanceNotice = 0;
  let revenueImpact = 0;

  const byChannel = new Map<string, number>();
  const byMonth = new Map<string, number>();

  bookings.forEach((booking) => {
    if (booking.type === 'blocked') return;

    totalBookings++;

    // Check if canceled
    if (booking.status === 'canceled' || booking.status === '3') {
      totalCancellations++;

      // Revenue impact
      revenueImpact += booking.priceValue || 0;

      // Advance notice approximation using updatedAt as proxy for cancellation date
      // Note: This is an approximation since Stays.net doesn't provide actual cancellation timestamp
      // updatedAt is likely close to when the booking was canceled
      if (booking.updatedAt && booking.checkInDate) {
        const updated = booking.updatedAt instanceof Date ? booking.updatedAt : parseISO(booking.updatedAt as any);
        const checkIn = parseISO(booking.checkInDate);
        const noticeDays = differenceInDays(checkIn, updated);

        // Only count if canceled before check-in (positive notice)
        if (noticeDays >= 0) {
          totalAdvanceNotice += noticeDays;
        }
      }

      // By channel
      const channel = booking.platform || booking.channelName || 'Direct';
      byChannel.set(channel, (byChannel.get(channel) || 0) + 1);

      // By month
      const checkInDate = parseISO(booking.checkInDate);
      const monthKey = format(checkInDate, 'yyyy-MM');
      byMonth.set(monthKey, (byMonth.get(monthKey) || 0) + 1);
    }
  });

  const cancellationRate = totalBookings > 0
    ? (totalCancellations / totalBookings) * 100
    : 0;
  const averageAdvanceNotice = totalCancellations > 0
    ? totalAdvanceNotice / totalCancellations
    : 0;

  return {
    totalCancellations,
    cancellationRate: Math.round(cancellationRate * 10) / 10,
    averageAdvanceNotice: Math.round(averageAdvanceNotice * 10) / 10,
    averageAdvanceNoticeNote: 'Approximation using last update date (Stays.net does not provide actual cancellation timestamp)',
    byChannel: Object.fromEntries(byChannel),
    byMonth: Object.fromEntries(byMonth),
    revenueImpact,
  };
}
