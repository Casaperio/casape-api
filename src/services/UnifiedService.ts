/**
 * Unified Service - Single endpoint returning all data for the frontend
 * Optimizes by fetching data once and processing for both dashboard and calendar
 */

import { format, addDays, addMonths, subDays, subMonths, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getCollections } from '../config/mongodb.js';
import { getPlatformColor } from '../config/platformImages.js';
import { getSyncStatus } from './sync/SyncService.js';
import type { FirestoreUnifiedBooking, GuestStatus } from './stays/types.js';
import type { DashboardResponse, DayData, GuestData, OccupancyStats, ReservationOrigin, OccupancyTrendPoint } from './DashboardService.js';
import type { CalendarResponse, CalendarUnit, CalendarReservation } from './CalendarService.js';

// Response types
export interface UnifiedResponse {
  dashboard: DashboardResponse;
  calendar: CalendarResponse;
  sync: {
    lastSyncAt: string | null;
    status: string;
    bookingsCount: number;
    listingsCount: number;
    durationMs: number;
  };
  meta: {
    generatedAt: string;
    queryTimeMs: number;
    bookingsCount: number;
  };
}

/**
 * Determines guest status based on check-in/out dates relative to a given date
 */
function getGuestStatus(checkIn: string, checkOut: string, date: Date): GuestStatus {
  const checkInDate = parseISO(checkIn);
  const checkOutDate = parseISO(checkOut);
  const targetDate = format(date, 'yyyy-MM-dd');
  const checkInStr = format(checkInDate, 'yyyy-MM-dd');
  const checkOutStr = format(checkOutDate, 'yyyy-MM-dd');

  if (checkInStr === targetDate) return 'checkin';
  if (checkOutStr === targetDate) return 'checkout';
  return 'staying';
}

/**
 * Maps booking type to calendar type
 */
function mapReservationType(type: string): 'reserved' | 'blocked' | 'provisional' {
  switch (type) {
    case 'blocked':
      return 'blocked';
    case 'provisional':
      return 'provisional';
    default:
      return 'reserved';
  }
}

/**
 * Process dashboard data from bookings
 */
function processDashboardFromBookings(
  allBookings: FirestoreUnifiedBooking[],
  todayStr: string,
  past30Str: string,
  future30Str: string
): Omit<DashboardResponse, 'lastSyncAt' | 'syncStatus'> {
  const today = new Date();

  // Calculate 7-day range starting from TODAY
  const weekDays: Date[] = [];
  for (let i = 0; i < 7; i++) {
    weekDays.push(addDays(today, i));
  }
  const weekStart = today;
  const weekEnd = addDays(weekStart, 6);
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  // Get unique listings
  const listings = new Map<string, string>();
  allBookings.forEach((b) => {
    if (!listings.has(b.listingId)) {
      listings.set(b.listingId, b.apartmentCode);
    }
  });
  const totalUnits = listings.size;

  // Filter bookings for different calculations
  const weekBookings = allBookings.filter((b) =>
    b.checkInDate <= weekEndStr && b.checkOutDate >= weekStartStr && b.type !== 'blocked'
  );

  const todayBookings = allBookings.filter((b) =>
    b.checkInDate <= todayStr && b.checkOutDate >= todayStr && b.type !== 'blocked'
  );

  const next30Bookings = allBookings.filter((b) =>
    b.checkInDate <= future30Str && b.checkOutDate >= todayStr && b.type !== 'blocked'
  );

  const past30Bookings = allBookings.filter((b) =>
    b.checkOutDate >= past30Str && b.checkInDate <= todayStr && b.type !== 'blocked'
  );

  // Build week data
  const weekData: DayData[] = weekDays.map((day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const dayOfWeek = format(day, 'EEE', { locale: ptBR }).toUpperCase();

    const dayAtMidnight = new Date(day);
    dayAtMidnight.setHours(0, 0, 0, 0);

    const dayGuests: GuestData[] = [];

    weekBookings.forEach((booking) => {
      const checkInDate = parseISO(booking.checkInDate);
      checkInDate.setHours(0, 0, 0, 0);

      const checkOutDate = parseISO(booking.checkOutDate);
      checkOutDate.setHours(0, 0, 0, 0);

      if (isWithinInterval(dayAtMidnight, { start: checkInDate, end: checkOutDate })) {
        const status = getGuestStatus(booking.checkInDate, booking.checkOutDate, day);

        dayGuests.push({
          id: booking.staysReservationId,
          bookingId: booking.staysBookingCode,
          guestName: booking.guestName,
          apartmentCode: booking.apartmentCode,
          status,
          checkInDate: booking.checkInDate,
          checkInTime: booking.checkInTime,
          checkOutDate: booking.checkOutDate,
          checkOutTime: booking.checkOutTime,
          guestCount: booking.guestCount,
          nights: booking.nights,
          platform: booking.platform,
          platformImage: booking.platformImage,
        });
      }
    });

    // Sort guests by status: CHECKOUT first, then CHECKIN, then STAYING
    dayGuests.sort((a, b) => {
      const statusOrder: Record<GuestStatus, number> = {
        checkout: 0,
        checkin: 1,
        staying: 2,
      };
      return statusOrder[a.status] - statusOrder[b.status];
    });

    return {
      date: dateStr,
      dayOfWeek,
      isToday: dateStr === todayStr,
      guests: dayGuests,
    };
  });

  // Calculate occupancy stats for today
  const occupiedToday = new Set(todayBookings.map((r) => r.listingId)).size;

  const occupancyStats: OccupancyStats = {
    available: totalUnits - occupiedToday,
    occupied: occupiedToday,
    total: totalUnits,
  };

  // Calculate next 30 days occupancy
  let occupiedUnitDays = 0;
  const totalUnitDays = totalUnits * 30;

  for (let i = 0; i < 30; i++) {
    const day = addDays(today, i);
    const dayStr = format(day, 'yyyy-MM-dd');
    const occupiedOnDay = new Set(
      next30Bookings.filter((b) =>
        b.checkInDate <= dayStr && b.checkOutDate >= dayStr
      ).map((b) => b.listingId)
    ).size;
    occupiedUnitDays += occupiedOnDay;
  }

  const occupancyNext30Days: OccupancyStats = {
    available: totalUnitDays - occupiedUnitDays,
    occupied: occupiedUnitDays,
    total: totalUnitDays,
  };

  // Calculate reservation origins (platforms)
  const platformCounts = new Map<string, number>();
  next30Bookings.forEach((booking) => {
    const platform = booking.platform || 'Other';
    platformCounts.set(platform, (platformCounts.get(platform) || 0) + 1);
  });

  const reservationOrigins: ReservationOrigin[] = Array.from(platformCounts.entries())
    .map(([name, count]) => ({
      name,
      count,
      color: getPlatformColor(name),
    }))
    .sort((a, b) => b.count - a.count);

  // Calculate occupancy trend (last 30 days)
  const occupancyTrend: OccupancyTrendPoint[] = [];
  for (let i = -30; i <= 0; i++) {
    const day = addDays(today, i);
    const dateStr = format(day, 'yyyy-MM-dd');

    const occupiedOnDay = new Set(
      past30Bookings.filter((b) =>
        b.checkInDate <= dateStr && b.checkOutDate >= dateStr
      ).map((b) => b.listingId)
    ).size;

    const rate = totalUnits > 0 ? (occupiedOnDay / totalUnits) * 100 : 0;

    occupancyTrend.push({
      date: dateStr,
      rate: Math.round(rate * 10) / 10,
    });
  }

  // Get available units today
  const occupiedListingIds = new Set(todayBookings.map((b) => b.listingId));
  const availableUnits = Array.from(listings.entries())
    .filter(([id]) => !occupiedListingIds.has(id))
    .map(([_, code]) => code)
    .sort();

  return {
    weekData,
    occupancyStats,
    occupancyNext30Days,
    reservationOrigins,
    occupancyTrend,
    availableUnits,
  };
}

/**
 * Process calendar data from bookings
 */
function processCalendarFromBookings(
  allBookings: FirestoreUnifiedBooking[],
  from: string,
  to: string
): Omit<CalendarResponse, 'lastSyncAt' | 'syncStatus'> {
  // Filter bookings for calendar range
  const calendarBookings = allBookings.filter(
    (b) => b.checkOutDate >= from && b.checkInDate <= to
  );

  // Group bookings by listing
  const bookingsByListing = new Map<string, FirestoreUnifiedBooking[]>();
  const listingInfo = new Map<string, { code: string; name: string | null }>();

  calendarBookings.forEach((booking) => {
    const listingId = booking.listingId;

    if (!bookingsByListing.has(listingId)) {
      bookingsByListing.set(listingId, []);
      listingInfo.set(listingId, {
        code: booking.apartmentCode,
        name: booking.listingName,
      });
    }

    bookingsByListing.get(listingId)!.push(booking);
  });

  // Build calendar units
  const units: CalendarUnit[] = [];

  listingInfo.forEach((info, listingId) => {
    const listingBookings = bookingsByListing.get(listingId) || [];

    const calendarReservations: CalendarReservation[] = listingBookings.map((booking) => ({
      id: booking.staysReservationId,
      bookingId: booking.staysBookingCode,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      guestPhone: booking.guestPhone,
      type: mapReservationType(booking.type),
      startDate: booking.checkInDate,
      endDate: booking.checkOutDate,
      platform: booking.platform,
      platformImage: booking.platformImage,
      nights: booking.nights,
      guestCount: booking.guestCount,
      adults: booking.adults,
      children: booking.children,
      babies: booking.babies,
      checkInTime: booking.checkInTime,
      checkOutTime: booking.checkOutTime,
      priceValue: booking.priceValue,
      priceCurrency: booking.priceCurrency,
    }));

    // Sort reservations by start date
    calendarReservations.sort((a, b) => a.startDate.localeCompare(b.startDate));

    units.push({
      id: listingId,
      code: info.code,
      name: info.name,
      reservations: calendarReservations,
    });
  });

  // Sort units by code
  units.sort((a, b) => a.code.localeCompare(b.code));

  return { units };
}

/**
 * Gets unified data for the frontend (dashboard + calendar + sync status)
 * Optimized to fetch data once and process for both views
 */
export async function getUnifiedData(
  calendarFrom?: string,
  calendarTo?: string
): Promise<UnifiedResponse> {
  const startTime = Date.now();
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  // Calculate date ranges
  const past30Str = format(subDays(today, 30), 'yyyy-MM-dd');
  const future30Str = format(addDays(today, 30), 'yyyy-MM-dd');

  // Default calendar range: 1 month ago to 3 months ahead
  const calFrom = calendarFrom || format(subMonths(today, 1), 'yyyy-MM-dd');
  const calTo = calendarTo || format(addMonths(today, 3), 'yyyy-MM-dd');

  // Calculate the largest range needed (union of dashboard + calendar ranges)
  const minDate = calFrom < past30Str ? calFrom : past30Str;
  const maxDate = calTo > future30Str ? calTo : future30Str;

  // Fetch all data in ONE query
  const collections = getCollections();
  const [allBookings, syncStatus] = await Promise.all([
    collections.unifiedBookings
      .find({
        checkOutDate: { $gte: minDate },
        checkInDate: { $lte: maxDate },
      })
      .toArray(),
    getSyncStatus(),
  ]);

  const bookingsTyped = allBookings as unknown as FirestoreUnifiedBooking[];

  // Process data for both dashboard and calendar
  const dashboardData = processDashboardFromBookings(
    bookingsTyped.filter((b) => b.type !== 'blocked'),
    todayStr,
    past30Str,
    future30Str
  );

  const calendarData = processCalendarFromBookings(bookingsTyped, calFrom, calTo);

  const queryTimeMs = Date.now() - startTime;

  // Build sync info
  const syncInfo = {
    lastSyncAt: syncStatus?.lastSyncAt instanceof Date
      ? syncStatus.lastSyncAt.toISOString()
      : (syncStatus?.lastSyncAt || null),
    status: syncStatus?.status || 'never',
    bookingsCount: syncStatus?.bookingsCount || 0,
    listingsCount: syncStatus?.listingsCount || 0,
    durationMs: syncStatus?.durationMs || 0,
  };

  return {
    dashboard: {
      ...dashboardData,
      lastSyncAt: syncInfo.lastSyncAt,
      syncStatus: syncInfo.status,
    },
    calendar: {
      ...calendarData,
      lastSyncAt: syncInfo.lastSyncAt,
      syncStatus: syncInfo.status,
    },
    sync: syncInfo,
    meta: {
      generatedAt: new Date().toISOString(),
      queryTimeMs,
      bookingsCount: allBookings.length,
    },
  };
}
