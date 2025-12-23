/**
 * Team Service - Manages Guest Relations team performance
 */

import { getCollections } from '../config/mongodb.js';
import { startOfMonth, endOfMonth, addMonths, parseISO } from 'date-fns';
import type { TeamMemberPerformance, TeamStatistics } from './stays/types.js';

/**
 * Update reservation team assignment
 */
export async function assignResponsible(
  reservationId: string,
  userId: string,
  userName: string
): Promise<boolean> {
  const collections = getCollections();

  const result = await collections.unifiedBookings.updateOne(
    { id: reservationId } as any,
    {
      $set: {
        responsibleId: userId,
        responsibleName: userName,
        updatedAt: new Date(),
      },
    }
  );

  return result.modifiedCount > 0;
}

/**
 * Add feedback to reservation
 */
export async function addFeedback(
  reservationId: string,
  rating: number,
  comment?: string
): Promise<boolean> {
  const collections = getCollections();

  const result = await collections.unifiedBookings.updateOne(
    { id: reservationId } as any,
    {
      $set: {
        feedbackRating: rating,
        feedbackComment: comment || null,
        feedbackDate: new Date(),
        updatedAt: new Date(),
      },
    }
  );

  return result.modifiedCount > 0;
}

/**
 * Get team performance statistics
 */
export async function getTeamStatistics(): Promise<TeamStatistics> {
  const collections = getCollections();

  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  const previousMonthStart = startOfMonth(addMonths(now, -1));
  const previousMonthEnd = endOfMonth(addMonths(now, -1));

  // Get all reservations with assigned team members
  const allReservations = await collections.unifiedBookings
    .find({
      responsibleId: { $ne: null },
      type: { $ne: 'blocked' },
    })
    .toArray();

  // Group by team member
  const memberMap = new Map<string, TeamMemberPerformance>();

  allReservations.forEach((booking: any) => {
    const userId = booking.responsibleId;
    const userName = booking.responsibleName || 'Unknown';

    if (!memberMap.has(userId)) {
      memberMap.set(userId, {
        userId,
        userName,
        totalReservations: 0,
        currentMonthReservations: 0,
        futureReservations: 0,
        averageRating: 0,
        ratingsCount: 0,
        totalRevenue: 0,
      });
    }

    const member = memberMap.get(userId)!;
    member.totalReservations++;
    member.totalRevenue += booking.priceValue || 0;

    // Current month check
    const checkInDate = parseISO(booking.checkInDate);
    if (checkInDate >= currentMonthStart && checkInDate <= currentMonthEnd) {
      member.currentMonthReservations++;
    }

    // Future reservations
    if (checkInDate > now) {
      member.futureReservations++;
    }

    // Rating calculation
    if (booking.feedbackRating) {
      const currentAvg = member.averageRating;
      const currentCount = member.ratingsCount;
      member.averageRating =
        (currentAvg * currentCount + booking.feedbackRating) / (currentCount + 1);
      member.ratingsCount++;
    }
  });

  // Calculate distribution
  const distribution: Record<string, number> = {};
  memberMap.forEach((member) => {
    distribution[member.userName] = member.totalReservations;
  });

  // Calculate monthly comparison
  const currentMonth: Record<string, number> = {};
  const previousMonth: Record<string, number> = {};

  allReservations.forEach((booking: any) => {
    const checkInDate = parseISO(booking.checkInDate);
    const userName = booking.responsibleName || 'Unknown';

    if (checkInDate >= currentMonthStart && checkInDate <= currentMonthEnd) {
      currentMonth[userName] = (currentMonth[userName] || 0) + 1;
    }

    if (checkInDate >= previousMonthStart && checkInDate <= previousMonthEnd) {
      previousMonth[userName] = (previousMonth[userName] || 0) + 1;
    }
  });

  return {
    members: Array.from(memberMap.values()).sort(
      (a, b) => b.totalReservations - a.totalReservations
    ),
    distribution,
    monthlyComparison: {
      currentMonth,
      previousMonth,
    },
  };
}
