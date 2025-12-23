/**
 * Stays.net API client for Node.js
 * Handles authentication and API requests to Stays.net Booking and Content APIs
 */

import { config } from '../../config/env.js';
import type {
  GetBookingsParams,
  StaysBooking,
  StaysApiError,
  ListingDetails,
  StaysPayment,
  StaysExtraService,
  StaysClient,
  GetClientsParams,
  CalendarDay,
  StaysInventoryCategory,
  StaysInventoryItem,
  StaysInventoryCondition,
  StaysAmenity,
  EnhancedListingDetails
} from './types.js';

/**
 * Creates Basic Authentication header value
 */
function createBasicAuthHeader(clientId: string, clientSecret: string): string {
  const credentials = `${clientId}:${clientSecret}`;
  const base64Credentials = Buffer.from(credentials).toString('base64');
  return `Basic ${base64Credentials}`;
}

/**
 * Combined API client for Stays.net Booking and Content APIs
 */
export class StaysApiClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(
    baseUrl: string = config.stays.baseUrl,
    clientId: string = config.stays.clientId,
    clientSecret: string = config.stays.clientSecret
  ) {
    this.baseUrl = baseUrl;
    this.authHeader = createBasicAuthHeader(clientId, clientSecret);
  }

  /**
   * Makes an authenticated GET request to the Stays API
   */
  private async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error: StaysApiError = {
        message: `Stays API error: ${response.statusText}`,
        statusCode: response.status,
        details: await response.text().catch(() => null),
      };
      throw error;
    }

    return response.json() as Promise<T>;
  }

  // ==================== BOOKING API ====================

  /**
   * Retrieves booking/reservation data with pagination
   */
  async getBookings(params: GetBookingsParams): Promise<StaysBooking[]> {
    const { from, to, dateType = 'included', skip = 0, limit = 20 } = params;

    const queryParams: Record<string, string> = {
      from,
      to,
      dateType,
      skip: String(skip),
      limit: String(limit),
    };

    return this.get<StaysBooking[]>(
      '/external/v1/booking/reservations',
      queryParams
    );
  }

  /**
   * Retrieves all bookings with automatic pagination
   * The API returns maximum 20 records per request
   */
  async getAllBookings(
    from: string,
    to: string,
    dateType: GetBookingsParams['dateType'] = 'included'
  ): Promise<StaysBooking[]> {
    const allBookings: StaysBooking[] = [];
    let skip = 0;
    const limit = 20;
    let hasMore = true;

    console.log(`📥 Fetching bookings from ${from} to ${to}...`);

    while (hasMore) {
      const bookings = await this.getBookings({
        from,
        to,
        dateType,
        skip,
        limit,
      });

      allBookings.push(...bookings);

      // If we got less than limit, we've reached the end
      hasMore = bookings.length === limit;
      skip += limit;

      // Safety limit to prevent infinite loops
      if (skip > 1000) {
        console.warn('⚠️ Reached safety limit of 1000 bookings');
        break;
      }
    }

    console.log(`✅ Fetched ${allBookings.length} bookings`);
    return allBookings;
  }

  /**
   * Retrieves detailed information for a specific booking
   * This endpoint returns complete guest details including guest list and partner info
   */
  async getBookingDetails(reservationId: string): Promise<StaysBooking> {
    return this.get<StaysBooking>(
      `/external/v1/booking/reservations/${reservationId}`
    );
  }

  // ==================== CONTENT API ====================

  /**
   * Retrieves listing details including internalName (apartment code)
   */
  async getListingDetails(listingId: string): Promise<ListingDetails> {
    return this.get<ListingDetails>(
      `/external/v1/content/listings/${listingId}`
    );
  }

  /**
   * Retrieves all listings
   */
  async getAllListings(): Promise<ListingDetails[]> {
    const allListings: ListingDetails[] = [];
    let skip = 0;
    const limit = 20;
    let hasMore = true;

    console.log('📥 Fetching all listings...');

    while (hasMore) {
      const listings = await this.get<ListingDetails[]>(
        '/external/v1/content/listings',
        { skip: String(skip), limit: String(limit) }
      );

      allListings.push(...listings);
      hasMore = listings.length === limit;
      skip += limit;

      if (skip > 500) {
        console.warn('⚠️ Reached safety limit of 500 listings');
        break;
      }
    }

    console.log(`✅ Fetched ${allListings.length} listings`);
    return allListings;
  }

  // ==================== PAYMENTS API ====================

  /**
   * Retrieves payments for a specific reservation
   */
  async getReservationPayments(reservationId: string): Promise<StaysPayment[]> {
    try {
      return await this.get<StaysPayment[]>(
        `/external/v1/booking/reservations/${reservationId}/payments`
      );
    } catch (error) {
      console.warn(`⚠️ Failed to fetch payments for reservation ${reservationId}:`, error);
      return [];
    }
  }

  // ==================== EXTRA SERVICES API ====================

  /**
   * Retrieves extra services for a specific reservation
   */
  async getReservationExtraServices(reservationId: string): Promise<StaysExtraService[]> {
    try {
      return await this.get<StaysExtraService[]>(
        `/external/v1/booking/reservations/${reservationId}/extra-services`
      );
    } catch (error) {
      console.warn(`⚠️ Failed to fetch extra services for reservation ${reservationId}:`, error);
      return [];
    }
  }

  // ==================== CLIENTS API ====================

  /**
   * Retrieves clients with pagination and optional filters
   */
  async getClients(params: GetClientsParams = {}): Promise<StaysClient[]> {
    const { skip = 0, limit = 20, name, email, phone } = params;

    const queryParams: Record<string, string> = {
      skip: String(skip),
      limit: String(limit),
    };

    if (name) queryParams.name = name;
    if (email) queryParams.email = email;
    if (phone) queryParams.phone = phone;

    return this.get<StaysClient[]>(
      '/external/v1/booking/clients',
      queryParams
    );
  }

  /**
   * Retrieves all clients with automatic pagination
   */
  async getAllClients(): Promise<StaysClient[]> {
    const allClients: StaysClient[] = [];
    let skip = 0;
    const limit = 20;
    let hasMore = true;

    console.log('📥 Fetching all clients...');

    while (hasMore) {
      const clients = await this.getClients({ skip, limit });
      allClients.push(...clients);
      hasMore = clients.length === limit;
      skip += limit;

      if (skip > 2000) {
        console.warn('⚠️ Reached safety limit of 2000 clients');
        break;
      }
    }

    console.log(`✅ Fetched ${allClients.length} clients`);
    return allClients;
  }

  /**
   * Retrieves details for a specific client
   */
  async getClientDetails(clientId: string): Promise<StaysClient> {
    return this.get<StaysClient>(
      `/external/v1/booking/clients/${clientId}`
    );
  }

  // ==================== CALENDAR AVAILABILITY API ====================

  /**
   * Retrieves calendar availability for a listing
   */
  async getCalendarAvailability(
    listingId: string,
    from: string,
    to: string
  ): Promise<CalendarDay[]> {
    try {
      const response = await this.get<{ days?: CalendarDay[] }>(
        `/external/v1/calendars/listings/${listingId}`,
        { from, to }
      );
      return response.days || [];
    } catch (error) {
      console.warn(`⚠️ Failed to fetch calendar for listing ${listingId}:`, error);
      return [];
    }
  }

  // ==================== EXPORT API ====================

  /**
   * Export reservations as JSON with date filters
   * Useful for bulk data retrieval
   */
  async exportReservations(from: string, to: string): Promise<StaysBooking[]> {
    const response = await fetch(`${this.baseUrl}/external/v1/booking/reservations-export`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        dateType: 'included',
        format: 'json'
      }),
    });

    if (!response.ok) {
      throw {
        message: `Stays API export error: ${response.statusText}`,
        statusCode: response.status,
        details: await response.text().catch(() => null),
      } as StaysApiError;
    }

    return response.json() as Promise<StaysBooking[]>;
  }

  // ==================== INVENTORY REFERENCE API ====================

  /**
   * Retrieves inventory categories from Stays.net translation endpoint
   * Returns list of standard categories with multilingual titles
   */
  async getInventoryCategories(): Promise<StaysInventoryCategory[]> {
    try {
      return await this.get<StaysInventoryCategory[]>(
        '/external/v1/translation/inventory-categories'
      );
    } catch (error) {
      console.warn('⚠️ Failed to fetch inventory categories:', error);
      return [];
    }
  }

  /**
   * Retrieves inventory item types from Stays.net translation endpoint
   * Returns list of standard item types with multilingual titles
   */
  async getInventoryItems(): Promise<StaysInventoryItem[]> {
    try {
      return await this.get<StaysInventoryItem[]>(
        '/external/v1/translation/inventory-items'
      );
    } catch (error) {
      console.warn('⚠️ Failed to fetch inventory items:', error);
      return [];
    }
  }

  /**
   * Retrieves inventory item conditions from Stays.net translation endpoint
   * Returns list of condition states with multilingual titles
   */
  async getInventoryConditions(): Promise<StaysInventoryCondition[]> {
    try {
      return await this.get<StaysInventoryCondition[]>(
        '/external/v1/translation/inventory-items-conditions'
      );
    } catch (error) {
      console.warn('⚠️ Failed to fetch inventory conditions:', error);
      return [];
    }
  }

  // ==================== PROPERTY/AMENITIES API ====================

  /**
   * Retrieves all available amenities with multilingual titles
   * Used for enriching property data with translated amenity names
   */
  async getAmenities(): Promise<StaysAmenity[]> {
    try {
      return await this.get<StaysAmenity[]>(
        '/external/v1/translation/listing-amenities'
      );
    } catch (error) {
      console.warn('⚠️ Failed to fetch amenities:', error);
      return [];
    }
  }

  /**
   * Retrieves global custom fields configuration for listings
   * These are user-defined fields like WiFi, door codes, etc.
   */
  async getListingCustomFields(): Promise<any[]> {
    try {
      return await this.get<any[]>(
        '/external/v1/settings/global/listing-custom-fields'
      );
    } catch (error) {
      console.warn('⚠️ Failed to fetch custom fields:', error);
      return [];
    }
  }

  /**
   * Retrieves comprehensive property details (NOT listing!)
   * Uses /content/properties endpoint which returns more complete data
   * Including amenities, listings (units), and full property characteristics
   */
  async getPropertyDetails(propertyId: string): Promise<any> {
    try {
      return await this.get<any>(
        `/external/v1/content/properties/${propertyId}`
      );
    } catch (error) {
      console.warn(`⚠️ Failed to fetch property details for ${propertyId}, falling back to listing endpoint:`, error);
      // Fallback to listing endpoint if property endpoint fails
      return this.getEnhancedListingDetails(propertyId);
    }
  }

  /**
   * Retrieves comprehensive listing details for a single property
   * Includes all property metadata: amenities, images, pricing, descriptions, custom fields
   */
  async getEnhancedListingDetails(listingId: string): Promise<EnhancedListingDetails> {
    return this.get<EnhancedListingDetails>(
      `/external/v1/content/listings/${listingId}`
    );
  }

  /**
   * Retrieves all property listings with full details and automatic pagination
   * Fetches comprehensive property data including amenities, images, pricing, and custom fields
   */
  async getAllEnhancedListings(): Promise<EnhancedListingDetails[]> {
    const allListings: EnhancedListingDetails[] = [];
    let skip = 0;
    const limit = 20;
    let hasMore = true;

    console.log('📥 Fetching all enhanced property listings...');

    while (hasMore) {
      const listings = await this.get<EnhancedListingDetails[]>(
        '/external/v1/content/listings',
        {
          skip: String(skip),
          limit: String(limit)
        }
      );

      allListings.push(...listings);
      hasMore = listings.length === limit;
      skip += limit;

      if (skip > 500) {
        console.warn('⚠️ Reached safety limit of 500 properties');
        break;
      }
    }

    console.log(`✅ Fetched ${allListings.length} enhanced property listings`);
    return allListings;
  }
}

// Export singleton instance
export const staysApiClient = new StaysApiClient();
