// Platform logo mappings
const platformImageMap: Record<string, string> = {
  'airbnb': '/images/platforms/airbnb.png',
  'booking': '/images/platforms/booking.png',
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

export function getPlatformImage(platform: string | null | undefined): string {
  if (!platform) return '/images/platforms/default.png';

  const normalizedPlatform = platform.toLowerCase().trim();

  // Check direct match
  if (platformImageMap[normalizedPlatform]) {
    return platformImageMap[normalizedPlatform];
  }

  // Check partial matches
  for (const [key, value] of Object.entries(platformImageMap)) {
    if (normalizedPlatform.includes(key) || key.includes(normalizedPlatform)) {
      return value;
    }
  }

  return '/images/platforms/default.png';
}

// Platform colors for charts
export const platformColors: Record<string, string> = {
  'Airbnb': '#FF5A5F',
  'Booking.com': '#003580',
  'Booking': '#003580',
  'Expedia': '#00355F',
  'VRBO': '#0061E0',
  'TripAdvisor': '#00AF87',
  'HomeAway': '#F58220',
  'Stays': '#6366F1',
  'Stays.net': '#6366F1',
  'Direct': '#10B981',
  'Direto': '#10B981',
  'Website': '#10B981',
  'Manual': '#6B7280',
  'Other': '#9CA3AF',
};

export function getPlatformColor(platform: string | null | undefined): string {
  if (!platform) return platformColors['Other'];

  // Check exact match (case-insensitive keys)
  for (const [key, color] of Object.entries(platformColors)) {
    if (key.toLowerCase() === platform.toLowerCase()) {
      return color;
    }
  }

  // Check partial matches
  const normalizedPlatform = platform.toLowerCase();
  for (const [key, color] of Object.entries(platformColors)) {
    if (normalizedPlatform.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedPlatform)) {
      return color;
    }
  }

  return platformColors['Other'];
}
