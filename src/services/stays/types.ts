/**
 * Type definitions for Stays.net API responses
 * Based on Stays.net Booking API documentation
 */

/**
 * Booking type classification
 */
export type BookingType = 'normal' | 'provisional' | 'blocked';

/**
 * Date type filter for API queries
 */
export type DateType = 'arrival' | 'departure' | 'creation' | 'creationorig' | 'included';

/**
 * Hosting details fee
 */
export interface HostingFee {
  name: string;
  _f_val: number;
}

/**
 * Hosting details section
 */
export interface HostingDetails {
  fees: HostingFee[];
  discounts: unknown[];
  _f_nightPrice: number;
  _f_total: number;
}

/**
 * Extras details section
 */
export interface ExtrasDetails {
  fees: unknown[];
  extraServices: unknown[];
  discounts: unknown[];
  _f_total: number;
}

/**
 * Fee structure from Stays.net API
 */
export interface StaysFee {
  val: number;
  name?: string;
  description?: string;
}

/**
 * Booking price information - Updated to match actual Stays API response
 */
export interface BookingPrice {
  currency: string;
  // New fields from actual API
  _f_expected?: number;  // Total nights value
  _f_total?: number;     // Total including fees
  hostingDetails?: HostingDetails;
  extrasDetails?: ExtrasDetails;
  // Financial detailed fields (from Stays.net API)
  pricePerNight?: number;          // Valor por noite
  reserveTotal?: number;            // Total da reserva
  baseAmountForwarding?: number;    // Base de cálculo do Imposto
  sellPriceCorrected?: number;      // Preço de venda corrigido
  companyCommision?: number;        // Comissão da empresa
  buyPrice?: number;                // Preço de compra
  totalForwardFee?: number;         // Total de taxas repassadas
  fee?: StaysFee[];                 // Taxas (limpeza, etc)
  ownerFee?: StaysFee[];            // Taxas do proprietário
  // Legacy fields (kept for backward compatibility)
  value?: number;
  cleaning?: number;
  securityDeposit?: number;
  extras?: number;
}

/**
 * Booking statistics - Updated to match actual Stays API response
 */
export interface BookingStats {
  // New field from actual API
  _f_totalPaid?: number;  // Total paid amount
  // Legacy fields (kept for backward compatibility)
  nights?: number;
  pricePerNight?: number;
  adults?: number;
  children?: number;
  babies?: number;
}

/**
 * Individual guest in the guests list
 */
export interface GuestListItem {
  name: string;
  email?: string;
  primary?: boolean;
  type?: 'adult' | 'child' | 'baby';
}

/**
 * Partner/Platform information
 */
export interface Partner {
  id: string;
  name: string;
}

/**
 * Listing/Property information
 */
export interface Listing {
  _id: string;
  internalName?: string;
  name?: string;
  address?: string;
}

/**
 * Guest details information
 */
export interface GuestsDetails {
  name?: string;
  email?: string;
  phone?: string;
  document?: string;
  address?: string;
  city?: string;
  country?: string;
  notes?: string;
  adults?: number;
  children?: number;
  list?: GuestListItem[];
}

/**
 * Complete booking response from Stays API
 */
export interface StaysBooking {
  _id: string;
  id: string; // Guest code like "STA-7767", "CHE-6442"
  creationDate: string;
  checkInDate: string; // YYYY-MM-DD
  checkInTime: string; // HH:MM
  checkOutDate: string; // YYYY-MM-DD
  checkOutTime: string; // HH:MM
  _idlisting: string;
  _idclient: string;
  type: BookingType;
  price: BookingPrice;
  stats: BookingStats;
  guests: number;
  guestsDetails: GuestsDetails;
  source?: string;
  channelName?: string;
  status?: string;
  partner?: Partner;
  listing?: Listing;
}

/**
 * Request parameters for retrieving booking data
 */
export interface GetBookingsParams {
  /** Start date (YYYY-MM-DD) */
  from: string;
  /** End date (YYYY-MM-DD) */
  to: string;
  /** Date type filter - determines which date field to use */
  dateType?: DateType;
  /** Number of records to skip (pagination) */
  skip?: number;
  /** Maximum number of records to return (max 20) */
  limit?: number;
}

/**
 * Listing information from Content API
 */
export interface ListingDetails {
  _id: string;
  id: string;
  internalName?: string; // Apartment code like "I-VP-455-503"
  name?: string;
  address?: string;
  _mstitle?: Record<string, string>; // Multi-language titles
}

/**
 * API error response
 */
export interface StaysApiError {
  message: string;
  statusCode: number;
  details?: unknown;
}

// ==================== PAYMENT TYPES ====================

/**
 * Payment status
 */
export type PaymentStatus = 'pending' | 'paid' | 'partial' | 'refunded' | 'canceled';

/**
 * Payment method
 */
export type PaymentMethod = 'credit_card' | 'debit_card' | 'pix' | 'bank_transfer' | 'cash' | 'other';

/**
 * Individual payment for a reservation
 */
export interface StaysPayment {
  _id: string;
  value: number;
  currency: string;
  date: string;
  dueDate?: string;
  method?: PaymentMethod;
  status: PaymentStatus;
  description?: string;
  fees?: number;
  taxes?: number;
}

/**
 * Payment summary for a reservation
 */
export interface PaymentSummary {
  totalValue: number;
  paidValue: number;
  pendingValue: number;
  paymentStatus: PaymentStatus;
  payments: StaysPayment[];
}

// ==================== EXTRA SERVICE TYPES ====================

/**
 * Extra service for a reservation
 */
export interface StaysExtraService {
  _id: string;
  name: string;
  value: number;
  currency: string;
  quantity: number;
  category?: string;
  description?: string;
}

// ==================== CLIENT/GUEST TYPES ====================

/**
 * Client/Guest from Stays API
 */
export interface StaysClient {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  document?: string;
  documentType?: string;
  birthDate?: string;
  nationality?: string;
  country?: string;
  city?: string;
  address?: string;
  language?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Parameters for client search
 */
export interface GetClientsParams {
  skip?: number;
  limit?: number;
  name?: string;
  email?: string;
  phone?: string;
}

// ==================== FINANCIAL SUMMARY TYPES ====================

/**
 * Financial summary for a period
 */
export interface FinancialSummary {
  totalRevenue: number;
  paidRevenue: number;
  pendingRevenue: number;
  averageDailyRate: number;
  revPAR: number;
  totalNights: number;
  availableNights: number;
  occupancyRate: number;
  reservationsCount: number;
  extraServicesRevenue: number;
  period: {
    from: string;
    to: string;
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
  pricePerNight: number;           // Valor por noite
  reserveTotal: number;            // Total da reserva
  baseAmountForwarding: number;    // Base de cálculo do Imp
  sellPriceCorrected: number;      // Preço de venda corrigido
  companyCommission: number;       // Comissão da empresa
  buyPrice: number;                // Preço de compra
  totalForwardFee: number;         // Total de taxas

  // Fees breakdown
  cleaningFee: number;             // Taxa de Limpeza
  ownerFees: Array<{               // Taxas do proprietário
    name: string;
    value: number;
  }>;
  otherFees: Array<{               // Outras taxas
    name: string;
    value: number;
  }>;

  // Currency
  currency: string;
}

/**
 * Financial data by property
 */
export interface PropertyFinancials {
  propertyCode: string;
  propertyName: string | null;
  revenue: number;
  paidRevenue: number;
  pendingRevenue: number;
  bookingsCount: number;
  nights: number;
  averageDailyRate: number;
  occupancyRate: number;
}

/**
 * Financial data by channel/platform
 */
export interface ChannelFinancials {
  channel: string;
  revenue: number;
  bookingsCount: number;
  averageValue: number;
  percentage: number;
}

// ==================== STATISTICS TYPES ====================

/**
 * Booking statistics summary
 */
export interface BookingStatistics {
  totalBookings: number;
  confirmedBookings: number;
  canceledBookings: number;
  blockedDates: number;
  cancellationRate: number;
  averageLeadTime: number;
  averageStayLength: number;
  totalGuests: number;
  averageGuestsPerBooking: number;
  bySource: Record<string, number>;
  byMonth: Record<string, number>;
  byDayOfWeek: Record<string, number>;
}

/**
 * Occupancy data by property
 */
export interface OccupancyData {
  propertyCode: string;
  propertyName: string | null;
  totalNights: number;
  occupiedNights: number;
  blockedNights: number;
  availableNights: number;
  occupancyRate: number;
  blockRate: number;
}

/**
 * Cancellation analysis
 */
export interface CancellationData {
  totalCancellations: number;
  cancellationRate: number;
  averageAdvanceNotice: number;
  averageAdvanceNoticeNote?: string; // Note about calculation method
  byChannel: Record<string, number>;
  byMonth: Record<string, number>;
  revenueImpact: number;
}

// ==================== GUEST ANALYTICS TYPES ====================

/**
 * Returning guest data
 */
export interface ReturningGuest {
  clientId: string;
  name: string;
  email?: string;
  country?: string;
  language?: string;
  totalStays: number;
  totalNights: number;
  totalRevenue: number;
  firstStay: string;
  lastStay: string;
  properties: string[];
}

/**
 * Guest demographics summary
 */
export interface GuestDemographics {
  byCountry: Record<string, number>;
  byLanguage: Record<string, number>;
  returningGuestsRate: number;
  averageGroupSize: number;
  withChildren: number;
  withBabies: number;
}

// ==================== CALENDAR TYPES ====================

/**
 * Calendar day availability
 */
export interface CalendarDay {
  date: string;
  available: boolean;
  blocked: boolean;
  booked: boolean;
  price?: number;
  minStay?: number;
  reservationId?: string;
}

/**
 * Guest status classification for dashboard
 */
export type GuestStatus = 'checkin' | 'checkout' | 'staying';

// MongoDB document types (keeping "Firestore" prefix for backward compatibility)
export interface FirestoreListing {
  staysListingId: string;
  internalName: string | null;
  name: string | null;
  address: string | null;
  thumbnailUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FirestoreReservation {
  staysReservationId: string;
  staysBookingCode: string;
  listingId: string;
  type: BookingType;
  checkInDate: string;
  checkInTime: string | null;
  checkOutDate: string;
  checkOutTime: string | null;
  guestName: string | null;
  guestCount: number;
  adults: number;
  children: number;
  babies: number;
  nights: number;
  platform: string | null;
  channelName: string | null;
  source: string | null;
  status: string | null;
  priceValue: number | null;
  priceCurrency: string | null;
  createdAt: Date;
  updatedAt: Date;
  syncedAt: Date;
}

export interface FirestoreSyncStatus {
  lastSyncAt: Date | null;
  status: 'success' | 'error' | 'running' | 'never';
  lastError: string | null;
  bookingsCount: number;
  listingsCount: number;
  durationMs: number;
  updatedAt: Date;
}

/**
 * Unified booking document - combines reservation + listing data
 * Single source of truth for Dashboard and Calendar views
 */
export interface FirestoreUnifiedBooking {
  // Reservation IDs
  id: string; // Document ID = staysReservationId
  staysReservationId: string;
  staysBookingCode: string;

  // Listing info (denormalized)
  listingId: string;
  apartmentCode: string; // internalName from listing
  listingName: string | null;
  listingAddress: string | null;

  // Booking type and status
  type: BookingType;
  status: string | null;

  // Dates and times
  checkInDate: string;
  checkInTime: string | null;
  checkOutDate: string;
  checkOutTime: string | null;
  nights: number;
  creationDate: string | null; // Booking creation date (for lead time calculation)

  // Guest info
  guestName: string;
  guestCount: number;
  adults: number;
  children: number;
  babies: number;

  // Client demographics
  clientId: string | null; // Stays.net client ID (for demographics lookup)
  guestCountry: string | null; // Real guest country (from client API)
  guestLanguage: string | null; // Real guest language (from client API)
  guestNationality: string | null; // Real guest nationality (from client API)
  guestEmail: string | null; // Guest email (from client API)
  guestPhone: string | null; // Guest phone (from client API)

  // Team assignment (Guest Relations)
  responsibleId: string | null; // Guest Relations team member ID
  responsibleName: string | null; // Guest Relations team member name

  // Guest feedback
  feedbackRating: number | null; // 1-5 rating
  feedbackComment: string | null; // Guest comment
  feedbackDate: Date | null; // When feedback was submitted

  // Platform/Source
  platform: string | null;
  platformImage: string;
  channelName: string | null;
  source: string | null;

  // Price
  priceValue: number | null;
  priceCurrency: string | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  syncedAt: Date;
}

// ==================== INVENTORY REFERENCE TYPES ====================

/**
 * Inventory category from Stays.net translation endpoint
 */
export interface StaysInventoryCategory {
  _id: string;
  _mstitle: Record<string, string>; // { 'pt_BR': 'Enxoval', 'en_US': 'Linen' }
}

/**
 * Inventory item type from Stays.net translation endpoint
 */
export interface StaysInventoryItem {
  _id: string;
  _mstitle: Record<string, string>;
  categoryId?: string;
}

/**
 * Inventory item condition from Stays.net translation endpoint
 */
export interface StaysInventoryCondition {
  _id: string;
  _mstitle: Record<string, string>;
}

// ==================== INVENTORY DOCUMENT TYPES ====================

/**
 * Inventory category enum (matching centralcasape types.ts)
 */
export type InventoryCategory = 'LINEN' | 'ELECTRONICS' | 'AMENITY' | 'FURNITURE' | 'UTENSIL' | 'OTHER';

/**
 * Transaction type enum (matching centralcasape types.ts)
 */
export type TransactionType = 'PURCHASE' | 'TRANSFER' | 'CONSUMPTION' | 'BREAKAGE' | 'LOSS' | 'ADJUSTMENT';

/**
 * Inventory item document stored in MongoDB
 */
export interface InventoryItemDoc {
  _id: string;
  id: string;
  name: string;
  brand?: string;
  model?: string;
  dimensions?: string;
  description?: string;
  category: InventoryCategory;
  minStock: number;
  stock: Record<string, number>; // { 'CENTRAL': 10, 'I-VP-455': 2 }
  staysReferenceItemId?: string;
  staysReferenceCategoryId?: string;
  stays_condition_id?: string;
  source?: 'manual' | 'stays_catalog' | 'amenity_suggestion';
  multilingual_names?: {
    pt_BR?: string;
    en_US?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Inventory transaction document stored in MongoDB
 */
export interface InventoryTransactionDoc {
  _id: string;
  id: string;
  itemId: string;
  itemName: string;
  type: TransactionType;
  quantity: number;
  source: string;
  destination: string;
  user: string;
  notes?: string;
  timestamp: Date;
  createdAt: Date;
}

/**
 * Reference category document (synced from Stays.net)
 */
export interface InventoryReferenceCategory {
  _id: string;
  staysCategoryId: string;
  titles: Record<string, string>;
  titlePtBr: string;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Reference item document (synced from Stays.net)
 */
export interface InventoryReferenceItem {
  _id: string;
  staysItemId: string;
  titles: Record<string, string>;
  titlePtBr: string;
  categoryId?: string;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Reference condition document (synced from Stays.net)
 */
export interface InventoryReferenceCondition {
  _id: string;
  staysConditionId: string;
  titles: Record<string, string>;
  titlePtBr: string;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new inventory item
 */
export interface CreateInventoryItemInput {
  name: string;
  brand?: string;
  model?: string;
  dimensions?: string;
  description?: string;
  category: InventoryCategory;
  minStock: number;
  stock?: Record<string, number>;
  staysReferenceItemId?: string;
  staysReferenceCategoryId?: string;
}

/**
 * Input for updating an inventory item
 */
export interface UpdateInventoryItemInput {
  name?: string;
  brand?: string;
  model?: string;
  dimensions?: string;
  description?: string;
  category?: InventoryCategory;
  minStock?: number;
  stock?: Record<string, number>;
}

/**
 * Input for creating a transaction
 */
export interface CreateTransactionInput {
  itemId: string;
  type: TransactionType;
  quantity: number;
  source: string;
  destination: string;
  user: string;
  notes?: string;
}

// ==================== INVENTORY SYNC TYPES ====================

/**
 * Statistics for a sync operation category
 */
export interface SyncCategoryStats {
  added: number;
  updated: number;
  total: number;
}

/**
 * Comprehensive sync statistics for Stays.net inventory data
 */
export interface InventorySyncStats {
  categories: SyncCategoryStats;
  items: SyncCategoryStats;
  conditions: SyncCategoryStats;
  amenities: SyncCategoryStats;
  properties_updated: number;
  inventory_populated?: {
    created: number;
    skipped: number;
    total: number;
  };
  sync_duration_ms: number;
  sync_timestamp: Date;
  errors?: string[];
}

/**
 * Reference data for frontend consumption
 */
export interface InventoryReferenceData {
  categories: Array<{
    stays_category_id: string;
    names: { pt_BR: string; en_US: string };
  }>;
  items: Array<{
    stays_item_id: string;
    stays_category_id?: string;
    names: { pt_BR: string; en_US: string };
  }>;
  conditions: Array<{
    stays_condition_id: string;
    names: { pt_BR: string; en_US: string };
  }>;
  amenities: Array<{
    stays_amenity_id: string;
    names: { pt_BR: string; en_US: string };
    category?: string;
    icon?: string;
  }>;
}

/**
 * Property amenity with inventory linking
 */
export interface PropertyAmenity {
  stays_amenity_id: string;
  name: {
    pt_BR: string;
    en_US: string;
  };
  description?: {
    pt_BR?: string;
    en_US?: string;
  };
  category?: string;
  icon?: string;
  linked_inventory_item_id?: string;
  suggested_inventory_items?: string[];
  last_verified: Date;
}

/**
 * Amenity reference document (synced from Stays.net)
 */
export interface InventoryReferenceAmenity {
  _id: string;
  stays_amenity_id: string;
  names: {
    pt_BR: string;
    en_US: string;
    es_ES?: string;
  };
  description?: {
    pt_BR?: string;
    en_US?: string;
  };
  category?: string;
  icon?: string;
  last_synced: Date;
  metadata?: {
    stays_raw_data?: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

// ==================== PROPERTY/LISTING TYPES ====================

/**
 * Amenity from Stays.net translation API
 */
export interface StaysAmenity {
  _id: string;
  _mstitle: Record<string, string>; // { 'pt_BR': 'WiFi', 'en_US': 'WiFi' }
  category?: string;
  icon?: string;
}

/**
 * Image from listing
 */
export interface ListingImage {
  url: string;
  caption?: string;
  order: number;
  _id?: string;
}

/**
 * Property pricing details
 */
export interface PropertyPricing {
  basePricePerNight: number;
  currency: string;
  cleaningFee?: number;
  weeklyDiscount?: number;
  monthlyDiscount?: number;
  minimumStay?: number;
}

/**
 * Property location details
 */
export interface PropertyLocation {
  latitude?: number;
  longitude?: number;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

/**
 * Enhanced listing details with full property data from Stays.net API
 * Exact structure as returned by /external/v1/content/listings
 */
export interface EnhancedListingDetails {
  // Core IDs
  _id: string;                    // MongoDB ObjectId
  id: string;                     // Short ID (e.g., "TW01H")
  _idproperty?: string;
  _idtype?: string;
  internalName?: string;           // e.g., "L-VF-230-106 | LEB General Venâncio Flores 230/106"
  status?: string;                // "active" | "inactive"

  // Multilingual fields
  _mstitle?: Record<string, string>;  // { 'pt_BR': '...', 'en_US': '...', 'es_ES': '...' }
  _msdesc?: Record<string, string>;   // Multilingual descriptions

  // Property specs
  _i_maxGuests?: number;
  _i_rooms?: number;              // Bedroom count
  _i_beds?: number;               // Total beds
  _f_bathrooms?: number;
  _f_square?: number;             // Square meters
  deff_curr?: string;             // Default currency (e.g., "BRL")
  _f_commercialPriority?: number;

  // Address structure
  address?: {
    countryCode?: string;
    state?: string;
    stateCode?: string;
    city?: string;
    region?: string;
    street?: string;
    streetNumber?: string;
    additional?: string;
    zip?: string;
  };

  // Location coordinates
  latLng?: {
    _f_lat: number;
    _f_lng: number;
  };

  // Main image
  _idmainImage?: string;
  _t_mainImageMeta?: {
    url: string;
  };

  // Type metadata
  _t_propertyTypeMeta?: {
    _mstitle?: Record<string, string>;
  };
  _t_typeMeta?: {
    _mstitle?: Record<string, string>;
  };

  // Channels and features
  subtype?: string;
  instantBooking?: boolean;
  groupIds?: string[];
  otaChannels?: Array<{
    name: string;
  }>;

  // Amenities (array of IDs that need translation)
  amenities?: Array<{
    _id: string;
  }>;
}

/**
 * Property document in MongoDB
 */
export interface PropertyDocument {
  _id: string;
  staysListingId: string;
  internalName: string;
  name: string;
  address: string;
  rooms: number;
  beds: number;
  bathrooms: number;
  squareFeet: number | null;
  maxGuests: number;
  amenities: PropertyAmenity[];
  mainImage: ListingImage | null;
  images: ListingImage[];
  pricing: PropertyPricing | null;
  descriptions: Record<string, string>;
  customFields: Record<string, any>;
  location: PropertyLocation | null;
  active: boolean;
  listed: boolean;
  createdAt: Date;
  updatedAt: Date;
  syncedAt: Date;
  // Manual overrides - data entered manually by users
  manualOverrides: {
    wifi: {
      network: string | null;
      password: string | null;
      updatedAt: Date | null;
      updatedBy: string | null;
    };
    access: {
      doorCode: string | null;
      conciergeHours: string | null;
      checkInInstructions: string | null;
      checkOutInstructions: string | null;
      parkingInfo: string | null;
      updatedAt: Date | null;
      updatedBy: string | null;
    };
    specifications: {
      position: string | null; // Frente/Fundos/Lateral/Cobertura
      viewType: string | null; // Vista para mar/montanha/cidade
      hasAntiNoiseWindow: boolean | null;
      cleaningFee: number | null;
      updatedAt: Date | null;
      updatedBy: string | null;
    };
    maintenance: {
      specialNotes: string | null;
      maintenanceContacts: string | null;
      emergencyProcedures: string | null;
      updatedAt: Date | null;
      updatedBy: string | null;
    };
  };
  lastManualUpdateAt: Date | null;
}

/**
 * Property characteristics for API response
 * Combines synced data from Stays.net with manual overrides
 */
export interface PropertyCharacteristics {
  propertyId: string;
  staysListingId: string;
  internalName: string;
  name: string;
  address: string;
  basicInfo: {
    rooms: number;
    beds: number;
    bathrooms: number;
    squareFeet: number | null;
    maxGuests: number;
  };
  amenities: PropertyAmenity[];
  descriptions: Record<string, string>;
  images: ListingImage[];
  mainImage: ListingImage | null;
  customFieldsFromStays: Record<string, any>;
  location: PropertyLocation | null;
  manualOverrides: PropertyDocument['manualOverrides'];
  syncedAt: Date;
  lastManualUpdateAt: Date | null;
}

// ==================== TICKET TYPES ====================

/**
 * Ticket priority levels
 */
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Ticket status workflow
 */
export type TicketStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

/**
 * Ticket categories for maintenance issues
 */
export type TicketCategory =
  | 'cleaning'
  | 'maintenance'
  | 'plumbing'
  | 'electrical'
  | 'hvac'
  | 'appliance'
  | 'furniture'
  | 'internet'
  | 'other';

/**
 * Ticket document stored in MongoDB
 */
export interface TicketDoc {
  _id: string;
  id: string; // Human-readable ID (e.g., "TKT-001")
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;

  // Property association
  propertyId: string | null;
  propertyCode: string | null;
  propertyName: string | null;

  // Assignment
  assignedTo: string | null; // User ID
  assignedToName: string | null; // User name

  // Reservation link (optional)
  reservationId: string | null;
  guestName: string | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;

  // Resolution tracking
  resolutionTime: number | null; // Minutes to resolve
  resolutionNotes: string | null;
}

/**
 * Input for creating a new ticket
 */
export interface CreateTicketInput {
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  propertyId?: string;
  assignedTo?: string;
  reservationId?: string;
}

/**
 * Input for updating a ticket
 */
export interface UpdateTicketInput {
  title?: string;
  description?: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  status?: TicketStatus;
  assignedTo?: string;
  resolutionNotes?: string;
}

/**
 * Ticket statistics for Operacional tab
 */
export interface TicketStatistics {
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  doneTickets: number;
  cancelledTickets: number;
  averageResolutionTime: number; // In minutes
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  byAssignee: Record<string, { count: number; avgTime: number }>;
  byProperty: Record<string, number>;
  byMonth: Record<string, number>;
}

// ==================== TEAM TYPES ====================

/**
 * Team member performance metrics
 */
export interface TeamMemberPerformance {
  userId: string;
  userName: string;
  totalReservations: number;
  currentMonthReservations: number;
  futureReservations: number;
  averageRating: number;
  ratingsCount: number;
  totalRevenue: number;
}

/**
 * Team statistics for Equipe Guest tab
 */
export interface TeamStatistics {
  members: TeamMemberPerformance[];
  distribution: Record<string, number>; // userName -> count
  monthlyComparison: {
    currentMonth: Record<string, number>;
    previousMonth: Record<string, number>;
  };
}
