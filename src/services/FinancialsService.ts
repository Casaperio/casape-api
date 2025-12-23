/**
 * Financials Service - Calculates financial metrics from MongoDB data
 */

import { format, parseISO, differenceInDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { getCollections } from '../config/mongodb.js';
import type {
  FirestoreUnifiedBooking,
  FinancialSummary,
  PropertyFinancials,
  ChannelFinancials,
} from './stays/types.js';

/**
 * Fetches unified bookings for a date range
 */
async function getBookingsForPeriod(
  from: string,
  to: string,
  includeBlocked = false
): Promise<FirestoreUnifiedBooking[]> {
  const collections = getCollections();

  const query: Record<string, unknown> = {
    checkOutDate: { $gte: from },
    checkInDate: { $lte: to },
  };

  if (!includeBlocked) {
    query.type = { $ne: 'blocked' };
  }

  const docs = await collections.unifiedBookings.find(query).toArray();
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
 * Calculates financial summary for a period
 */
export async function getFinancialSummary(
  from: string,
  to: string
): Promise<FinancialSummary> {
  const bookings = await getBookingsForPeriod(from, to);
  const listings = await getAllListings();

  // Calculate period days
  const periodDays = differenceInDays(parseISO(to), parseISO(from)) + 1;
  const totalAvailableNights = listings.size * periodDays;

  let totalRevenue = 0;
  let totalNights = 0;
  let reservationsCount = 0;

  bookings.forEach((booking) => {
    if (booking.type !== 'blocked') {
      const value = booking.priceValue || 0;
      totalRevenue += value;
      totalNights += booking.nights || 0;
      reservationsCount++;
    }
  });

  const averageDailyRate = totalNights > 0 ? totalRevenue / totalNights : 0;
  const occupancyRate = totalAvailableNights > 0
    ? (totalNights / totalAvailableNights) * 100
    : 0;
  const revPAR = totalAvailableNights > 0
    ? totalRevenue / totalAvailableNights
    : 0;

  return {
    totalRevenue,
    paidRevenue: totalRevenue, // Simplified - would need payment data
    pendingRevenue: 0,
    averageDailyRate: Math.round(averageDailyRate * 100) / 100,
    revPAR: Math.round(revPAR * 100) / 100,
    totalNights,
    availableNights: totalAvailableNights,
    occupancyRate: Math.round(occupancyRate * 10) / 10,
    reservationsCount,
    extraServicesRevenue: 0, // Would need extra services data
    period: { from, to },
  };
}

/**
 * Calculates financial data by property
 */
export async function getFinancialsByProperty(
  from: string,
  to: string
): Promise<PropertyFinancials[]> {
  const bookings = await getBookingsForPeriod(from, to);
  const listings = await getAllListings();

  // Calculate period days for occupancy
  const periodDays = differenceInDays(parseISO(to), parseISO(from)) + 1;

  // Group bookings by property
  const propertyData = new Map<string, {
    revenue: number;
    nights: number;
    count: number;
    name: string | null;
  }>();

  // Initialize all properties with zero values
  listings.forEach((listing, listingId) => {
    propertyData.set(listingId, {
      revenue: 0,
      nights: 0,
      count: 0,
      name: listing.name,
    });
  });

  // Aggregate booking data
  bookings.forEach((booking) => {
    if (booking.type !== 'blocked') {
      const existing = propertyData.get(booking.listingId) || {
        revenue: 0,
        nights: 0,
        count: 0,
        name: booking.listingName,
      };

      existing.revenue += booking.priceValue || 0;
      existing.nights += booking.nights || 0;
      existing.count++;

      propertyData.set(booking.listingId, existing);
    }
  });

  // Build result array
  const result: PropertyFinancials[] = [];

  listings.forEach((listing, listingId) => {
    const data = propertyData.get(listingId)!;
    const adr = data.nights > 0 ? data.revenue / data.nights : 0;
    const occupancy = periodDays > 0 ? (data.nights / periodDays) * 100 : 0;

    result.push({
      propertyCode: listing.code,
      propertyName: listing.name,
      revenue: data.revenue,
      paidRevenue: data.revenue, // Simplified
      pendingRevenue: 0,
      bookingsCount: data.count,
      nights: data.nights,
      averageDailyRate: Math.round(adr * 100) / 100,
      occupancyRate: Math.round(occupancy * 10) / 10,
    });
  });

  // Sort by revenue descending
  result.sort((a, b) => b.revenue - a.revenue);

  return result;
}

/**
 * Calculates financial data by channel/platform
 */
export async function getFinancialsByChannel(
  from: string,
  to: string
): Promise<ChannelFinancials[]> {
  const bookings = await getBookingsForPeriod(from, to);

  // Group bookings by channel
  const channelData = new Map<string, {
    revenue: number;
    count: number;
  }>();

  let totalRevenue = 0;

  bookings.forEach((booking) => {
    if (booking.type !== 'blocked') {
      const channel = booking.platform || booking.channelName || 'Direct';
      const value = booking.priceValue || 0;

      const existing = channelData.get(channel) || { revenue: 0, count: 0 };
      existing.revenue += value;
      existing.count++;
      channelData.set(channel, existing);

      totalRevenue += value;
    }
  });

  // Build result array
  const result: ChannelFinancials[] = [];

  channelData.forEach((data, channel) => {
    const avgValue = data.count > 0 ? data.revenue / data.count : 0;
    const percentage = totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0;

    result.push({
      channel,
      revenue: data.revenue,
      bookingsCount: data.count,
      averageValue: Math.round(avgValue * 100) / 100,
      percentage: Math.round(percentage * 10) / 10,
    });
  });

  // Sort by revenue descending
  result.sort((a, b) => b.revenue - a.revenue);

  return result;
}

/**
 * Gets monthly revenue trend for the last 12 months
 */
export async function getRevenueTrend(): Promise<Array<{ month: string; revenue: number; bookings: number }>> {
  const today = new Date();
  const trend: Array<{ month: string; revenue: number; bookings: number }> = [];

  // Get last 12 months
  for (let i = 11; i >= 0; i--) {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);

    const from = format(monthStart, 'yyyy-MM-dd');
    const to = format(monthEnd, 'yyyy-MM-dd');

    const bookings = await getBookingsForPeriod(from, to);

    let monthRevenue = 0;
    let monthBookings = 0;

    bookings.forEach((booking) => {
      if (booking.type !== 'blocked') {
        monthRevenue += booking.priceValue || 0;
        monthBookings++;
      }
    });

    trend.push({
      month: format(monthStart, 'MMM/yy'),
      revenue: monthRevenue,
      bookings: monthBookings,
    });
  }

  return trend;
}

/**
 * Financial Panel Data - Consolidated data for the Financial Panel KPIs
 */
export interface FinancialPanelData {
  // Receita Mês Atual
  currentMonthRevenue: number;
  currentMonthReservations: number;
  previousMonthRevenue: number;
  monthGrowthPercent: number;

  // Receita YTD
  ytdRevenue: number;
  previousYearYtdRevenue: number;
  ytdGrowthPercent: number;

  // Ticket Médio (ADR)
  averageTicket: number;

  // Projeção Próximo Mês
  nextMonthProjection: number;
  projectionMethod: string;

  // Metadata
  calculatedAt: string;
  period: {
    currentMonth: string;
    previousMonth: string;
    ytdStart: string;
    ytdEnd: string;
  };
}

/**
 * Detailed financial data for a single reservation
 */
export interface ReservationFinancialDetails {
  // Identification
  reservationId: string;
  bookingCode: string;
  propertyCode: string;
  propertyName: string | null;
  guestName: string;

  // Dates
  checkInDate: string;
  checkOutDate: string;
  nights: number;

  // Channel
  channel: string;
  platform: string | null;

  // Financial Data
  pricePerNight: number;
  reserveTotal: number;
  baseAmountForwarding: number;
  sellPriceCorrected: number;
  companyCommission: number;
  buyPrice: number;
  totalForwardFee: number;

  // Fees breakdown
  cleaningFee: number;
  ownerFees: Array<{ name: string; value: number }>;
  otherFees: Array<{ name: string; value: number }>;

  // Currency
  currency: string;
}

/**
 * Gets financial panel data with all KPIs for the dashboard
 */
export async function getFinancialPanelData(): Promise<FinancialPanelData> {
  const today = new Date();
  const currentYear = today.getFullYear();
  const previousYear = currentYear - 1;

  // Current month boundaries
  const currentMonthStart = startOfMonth(today);
  const currentMonthEnd = endOfMonth(today);

  // Previous month boundaries
  const previousMonthStart = startOfMonth(subMonths(today, 1));
  const previousMonthEnd = endOfMonth(subMonths(today, 1));

  // YTD boundaries (January 1st to today)
  const ytdStart = new Date(currentYear, 0, 1);
  const ytdEnd = today;

  // Same period last year
  const previousYearYtdStart = new Date(previousYear, 0, 1);
  const previousYearYtdEnd = new Date(previousYear, today.getMonth(), today.getDate());

  // Format dates for queries
  const currentMonthFromStr = format(currentMonthStart, 'yyyy-MM-dd');
  const currentMonthToStr = format(currentMonthEnd, 'yyyy-MM-dd');
  const previousMonthFromStr = format(previousMonthStart, 'yyyy-MM-dd');
  const previousMonthToStr = format(previousMonthEnd, 'yyyy-MM-dd');
  const ytdFromStr = format(ytdStart, 'yyyy-MM-dd');
  const ytdToStr = format(ytdEnd, 'yyyy-MM-dd');
  const prevYearYtdFromStr = format(previousYearYtdStart, 'yyyy-MM-dd');
  const prevYearYtdToStr = format(previousYearYtdEnd, 'yyyy-MM-dd');

  // Fetch all required bookings in parallel
  const [
    currentMonthBookings,
    previousMonthBookings,
    ytdBookings,
    previousYearYtdBookings,
    last3MonthsBookings,
  ] = await Promise.all([
    getBookingsForPeriod(currentMonthFromStr, currentMonthToStr),
    getBookingsForPeriod(previousMonthFromStr, previousMonthToStr),
    getBookingsForPeriod(ytdFromStr, ytdToStr),
    getBookingsForPeriod(prevYearYtdFromStr, prevYearYtdToStr),
    getBookingsForPeriod(
      format(startOfMonth(subMonths(today, 3)), 'yyyy-MM-dd'),
      format(endOfMonth(subMonths(today, 1)), 'yyyy-MM-dd')
    ),
  ]);

  // Calculate current month revenue
  let currentMonthRevenue = 0;
  let currentMonthReservations = 0;
  currentMonthBookings.forEach((booking) => {
    if (booking.type !== 'blocked') {
      currentMonthRevenue += booking.priceValue || 0;
      currentMonthReservations++;
    }
  });

  // Calculate previous month revenue
  let previousMonthRevenue = 0;
  previousMonthBookings.forEach((booking) => {
    if (booking.type !== 'blocked') {
      previousMonthRevenue += booking.priceValue || 0;
    }
  });

  // Calculate YTD revenue
  let ytdRevenue = 0;
  ytdBookings.forEach((booking) => {
    if (booking.type !== 'blocked') {
      ytdRevenue += booking.priceValue || 0;
    }
  });

  // Calculate previous year YTD revenue
  let previousYearYtdRevenue = 0;
  previousYearYtdBookings.forEach((booking) => {
    if (booking.type !== 'blocked') {
      previousYearYtdRevenue += booking.priceValue || 0;
    }
  });

  // Calculate last 3 months revenue for projection
  let last3MonthsRevenue = 0;
  last3MonthsBookings.forEach((booking) => {
    if (booking.type !== 'blocked') {
      last3MonthsRevenue += booking.priceValue || 0;
    }
  });

  // Calculate growth percentages
  const monthGrowthPercent = previousMonthRevenue > 0
    ? ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100
    : 0;

  const ytdGrowthPercent = previousYearYtdRevenue > 0
    ? ((ytdRevenue - previousYearYtdRevenue) / previousYearYtdRevenue) * 100
    : 0;

  // Calculate average ticket (ADR per reservation)
  const averageTicket = currentMonthReservations > 0
    ? currentMonthRevenue / currentMonthReservations
    : 0;

  // Calculate next month projection
  // Method: Average of last 3 months with growth trend
  const avgLast3Months = last3MonthsRevenue / 3;
  const growthFactor = monthGrowthPercent > 0 ? 1 + (monthGrowthPercent / 100) : 1;
  const nextMonthProjection = avgLast3Months * Math.min(growthFactor, 1.2); // Cap at 20% growth

  return {
    currentMonthRevenue: Math.round(currentMonthRevenue * 100) / 100,
    currentMonthReservations,
    previousMonthRevenue: Math.round(previousMonthRevenue * 100) / 100,
    monthGrowthPercent: Math.round(monthGrowthPercent * 10) / 10,
    ytdRevenue: Math.round(ytdRevenue * 100) / 100,
    previousYearYtdRevenue: Math.round(previousYearYtdRevenue * 100) / 100,
    ytdGrowthPercent: Math.round(ytdGrowthPercent * 10) / 10,
    averageTicket: Math.round(averageTicket * 100) / 100,
    nextMonthProjection: Math.round(nextMonthProjection * 100) / 100,
    projectionMethod: 'Média últimos 3 meses com tendência de crescimento',
    calculatedAt: new Date().toISOString(),
    period: {
      currentMonth: format(currentMonthStart, 'MMM/yyyy'),
      previousMonth: format(previousMonthStart, 'MMM/yyyy'),
      ytdStart: format(ytdStart, 'yyyy-MM-dd'),
      ytdEnd: format(ytdEnd, 'yyyy-MM-dd'),
    },
  };
}

/**
 * Gets detailed financial data for reservations
 * This function retrieves detailed price breakdown from Stays.net bookings
 *
 * NOTE: Currently the unified bookings collection does not store the detailed
 * price fields from Stays.net API (pricePerNight, baseAmountForwarding, etc.)
 * We need to fetch from the original Stays API or implement a sync of these fields.
 *
 * For now, we'll return calculated/estimated values based on available data.
 */
export async function getDetailedFinancials(
  from: string,
  to: string
): Promise<ReservationFinancialDetails[]> {
  const bookings = await getBookingsForPeriod(from, to);
  const result: ReservationFinancialDetails[] = [];

  bookings.forEach((booking) => {
    if (booking.type === 'blocked') return;

    const totalValue = booking.priceValue || 0;
    const nights = booking.nights || 1;
    const pricePerNight = nights > 0 ? totalValue / nights : 0;

    // Calculate financial fields
    // NOTE: These are estimated values. For accurate data, we need to fetch
    // from Stays.net API directly or sync these fields to MongoDB
    const cleaningFee = totalValue * 0.1; // Estimate 10% cleaning fee
    const ownerFeesTotal = totalValue * 0.05; // Estimate 5% owner fees
    const companyCommission = totalValue * 0.15; // Estimate 15% commission
    const buyPrice = totalValue - companyCommission;
    const reserveTotal = totalValue;
    const baseAmountForwarding = buyPrice;
    const sellPriceCorrected = totalValue;
    const totalForwardFee = cleaningFee + ownerFeesTotal;

    result.push({
      // Identification
      reservationId: booking.staysReservationId,
      bookingCode: booking.staysBookingCode,
      propertyCode: booking.apartmentCode,
      propertyName: booking.listingName,
      guestName: booking.guestName,

      // Dates
      checkInDate: booking.checkInDate,
      checkOutDate: booking.checkOutDate,
      nights: booking.nights || 0,

      // Channel
      channel: booking.channelName || booking.platform || 'Direto',
      platform: booking.platform,

      // Financial Data
      pricePerNight: Math.round(pricePerNight * 100) / 100,
      reserveTotal: Math.round(reserveTotal * 100) / 100,
      baseAmountForwarding: Math.round(baseAmountForwarding * 100) / 100,
      sellPriceCorrected: Math.round(sellPriceCorrected * 100) / 100,
      companyCommission: Math.round(companyCommission * 100) / 100,
      buyPrice: Math.round(buyPrice * 100) / 100,
      totalForwardFee: Math.round(totalForwardFee * 100) / 100,

      // Fees breakdown
      cleaningFee: Math.round(cleaningFee * 100) / 100,
      ownerFees: [
        { name: 'Taxa de Gestão', value: Math.round(ownerFeesTotal * 100) / 100 }
      ],
      otherFees: [],

      // Currency
      currency: booking.priceCurrency || 'BRL',
    });
  });

  // Sort by check-in date descending (most recent first)
  result.sort((a, b) => b.checkInDate.localeCompare(a.checkInDate));

  return result;
}
