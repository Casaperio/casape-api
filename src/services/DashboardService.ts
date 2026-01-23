/**
 * Dashboard Service - Reads from unified MongoDB collection
 * Simplified version that reads pre-denormalized data
 */

import { format, addDays, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getCollections } from '../config/mongodb.js';
import { getPlatformColor } from '../config/platformImages.js';
import { getSyncStatus } from './sync/SyncService.js';
import type { FirestoreUnifiedBooking, GuestStatus } from './stays/types.js';

/**
 * Retorna a data de HOJE no timezone do Brasil (America/Sao_Paulo)
 * Evita problemas com servidores rodando em UTC
 */
function getTodayBrazil(): Date {
  const now = new Date();
  // Converte para string no formato YYYY-MM-DD usando timezone do Brasil
  const brazilDateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  // Retorna Date com hora zerada (meia-noite)
  return new Date(brazilDateStr + 'T00:00:00');
}

// Response types
export interface DayData {
  date: string;
  dayOfWeek: string;
  isToday: boolean;
  guests: GuestData[];
}

export interface GuestData {
  id: string;
  bookingId: string;
  guestName: string;
  apartmentCode: string;
  status: GuestStatus;
  checkInDate: string;
  checkInTime: string | null;
  checkOutDate: string;
  checkOutTime: string | null;
  guestCount: number;
  nights: number;
  platform: string | null;
  platformImage: string;
}

export interface OccupancyStats {
  available: number;
  occupied: number;
  total: number;
}

export interface ReservationOrigin {
  name: string;
  count: number;
  color: string;
}

export interface OccupancyTrendPoint {
  date: string;
  rate: number;
}

export interface DashboardResponse {
  weekData: DayData[];
  occupancyStats: OccupancyStats;
  occupancyNext30Days: OccupancyStats;
  reservationOrigins: ReservationOrigin[];
  occupancyTrend: OccupancyTrendPoint[];
  availableUnits: string[];
  lastSyncAt: string | null;
  syncStatus: string;
}

/**
 * Determines guest status based on check-in/out dates relative to a given date
 * Fixed: Now compares date strings directly without unnecessary parseISO/format
 * checkIn and checkOut are already in 'YYYY-MM-DD' format from MongoDB
 */
function getGuestStatus(checkIn: string, checkOut: string, targetDate: string): GuestStatus {
  if (checkIn === targetDate) return 'checkin';
  if (checkOut === targetDate) return 'checkout';
  return 'staying';
}

/**
 * Fetches all unified bookings from MongoDB
 */
async function getUnifiedBookings(
  from: string,
  to: string
): Promise<FirestoreUnifiedBooking[]> {
  const collections = getCollections();

  // Get bookings that overlap with the date range
  const docs = await collections.unifiedBookings
    .find({
      checkOutDate: { $gte: from },
      checkInDate: { $lte: to },
      type: { $ne: 'blocked' },
    })
    .toArray();

  return docs as unknown as FirestoreUnifiedBooking[];
}

/**
 * Gets unique listing IDs from bookings
 */
function getUniqueListings(bookings: FirestoreUnifiedBooking[]): Map<string, string> {
  const listings = new Map<string, string>();
  bookings.forEach((b) => {
    if (!listings.has(b.listingId)) {
      listings.set(b.listingId, b.apartmentCode);
    }
  });
  return listings;
}

/**
 * Generates the dashboard data
 */
export async function getDashboardData(): Promise<DashboardResponse> {
  // Use timezone do Brasil para evitar problemas com servidores em UTC
  const today = getTodayBrazil();
  const todayStr = format(today, 'yyyy-MM-dd');

  // Calculate 7-day range starting from TODAY (not Monday of week)
  // This aligns with the frontend's expectation and stays-observator behavior
  const weekDays: Date[] = [];
  for (let i = 0; i < 7; i++) {
    weekDays.push(addDays(today, i));
  }
  const weekStart = today;

  // Calculate date ranges we need
  const past30Str = format(addDays(today, -30), 'yyyy-MM-dd');
  const future30Str = format(addDays(today, 30), 'yyyy-MM-dd');

  // Fetch all unified bookings in one query (past 30 to future 30 days)
  const [allBookings, syncStatus] = await Promise.all([
    getUnifiedBookings(past30Str, future30Str),
    getSyncStatus(),
  ]);

  // Get unique listings
  const listings = getUniqueListings(allBookings);
  const totalUnits = listings.size;

  // Build week data
  const weekEnd = addDays(weekStart, 6);
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  const weekBookings = allBookings.filter((b) =>
    b.checkInDate <= weekEndStr && b.checkOutDate >= weekStartStr
  );

  const weekData: DayData[] = weekDays.map((day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const dayOfWeek = format(day, 'EEE', { locale: ptBR }).toUpperCase();

    // Normalize day to midnight for consistent date comparison
    const dayAtMidnight = new Date(day);

    // Find guests for this day
    const dayGuests: GuestData[] = [];

    weekBookings.forEach((booking) => {
      // Parse dates and normalize to midnight for consistent comparison
      const checkInDate = parseISO(booking.checkInDate);

      const checkOutDate = parseISO(booking.checkOutDate);

      // Check if booking overlaps with this day
      // A booking is active on a day if: checkInDate <= day <= checkOutDate
      if (isWithinInterval(dayAtMidnight, { start: checkInDate, end: checkOutDate })) {
        const status = getGuestStatus(booking.checkInDate, booking.checkOutDate, dateStr);

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

    // Sort guests by status: CHECKOUT first (most urgent), then CHECKIN, then INHOUSE
    dayGuests.sort((a, b) => {
      const statusOrder: Record<GuestStatus, number> = {
        checkout: 0, // Highest priority - appears first
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
  const todayBookings = allBookings.filter((b) =>
    b.checkInDate <= todayStr && b.checkOutDate >= todayStr
  );
  const occupiedToday = new Set(todayBookings.map((r) => r.listingId)).size;

  const occupancyStats: OccupancyStats = {
    available: totalUnits - occupiedToday,
    occupied: occupiedToday,
    total: totalUnits,
  };

  // Calculate next 30 days occupancy
  const next30Bookings = allBookings.filter((b) =>
    b.checkInDate <= future30Str && b.checkOutDate >= todayStr
  );

  // Count occupied unit-days
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
  const past30Bookings = allBookings.filter((b) =>
    b.checkOutDate >= past30Str && b.checkInDate <= todayStr
  );

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
    lastSyncAt: syncStatus?.lastSyncAt instanceof Date
      ? syncStatus.lastSyncAt.toISOString()
      : (syncStatus?.lastSyncAt || null),
    syncStatus: syncStatus?.status || 'never',
  };
}
