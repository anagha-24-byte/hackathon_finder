export interface GeoCoords {
  city: string;
  state: string;
  country: string;
  lat: number;
  lng: number;
}

const KNOWN_CITIES: GeoCoords[] = [
  // India Tech Hubs
  { city: 'Bengaluru', state: 'Karnataka', country: 'India', lat: 12.9716, lng: 77.5946 },
  { city: 'Bangalore', state: 'Karnataka', country: 'India', lat: 12.9716, lng: 77.5946 },
  { city: 'Mumbai', state: 'Maharashtra', country: 'India', lat: 19.0760, lng: 72.8777 },
  { city: 'Delhi', state: 'Delhi', country: 'India', lat: 28.6139, lng: 77.2090 },
  { city: 'New Delhi', state: 'Delhi', country: 'India', lat: 28.6139, lng: 77.2090 },
  { city: 'Noida', state: 'Uttar Pradesh', country: 'India', lat: 28.5355, lng: 77.3910 },
  { city: 'Gurugram', state: 'Haryana', country: 'India', lat: 28.4595, lng: 77.0266 },
  { city: 'Gurgaon', state: 'Haryana', country: 'India', lat: 28.4595, lng: 77.0266 },
  { city: 'Hyderabad', state: 'Telangana', country: 'India', lat: 17.3850, lng: 78.4867 },
  { city: 'Pune', state: 'Maharashtra', country: 'India', lat: 18.5204, lng: 73.8567 },
  { city: 'Chennai', state: 'Tamil Nadu', country: 'India', lat: 13.0827, lng: 80.2707 },
  { city: 'Kolkata', state: 'West Bengal', country: 'India', lat: 22.5726, lng: 88.3639 },
  { city: 'Ahmedabad', state: 'Gujarat', country: 'India', lat: 23.0225, lng: 72.5714 },
  { city: 'Jaipur', state: 'Rajasthan', country: 'India', lat: 26.9124, lng: 75.7873 },
  { city: 'Kochi', state: 'Kerala', country: 'India', lat: 9.9312, lng: 76.2673 },
  { city: 'Chandigarh', state: 'Chandigarh', country: 'India', lat: 30.7333, lng: 76.7794 },
  { city: 'Indore', state: 'Madhya Pradesh', country: 'India', lat: 22.7196, lng: 75.8577 },
  { city: 'Bhubaneswar', state: 'Odisha', country: 'India', lat: 20.2961, lng: 85.8245 },
  { city: 'Coimbatore', state: 'Tamil Nadu', country: 'India', lat: 11.0168, lng: 76.9558 },
  { city: 'Mysuru', state: 'Karnataka', country: 'India', lat: 12.2958, lng: 76.6394 },
  { city: 'Mysore', state: 'Karnataka', country: 'India', lat: 12.2958, lng: 76.6394 },
  { city: 'Mangaluru', state: 'Karnataka', country: 'India', lat: 12.9141, lng: 74.8560 },
  { city: 'Manipal', state: 'Karnataka', country: 'India', lat: 13.3525, lng: 74.7928 },
  { city: 'Vellore', state: 'Tamil Nadu', country: 'India', lat: 12.9165, lng: 79.1325 },
  { city: 'Pilani', state: 'Rajasthan', country: 'India', lat: 28.3670, lng: 75.6040 },
  { city: 'Roorkee', state: 'Uttarakhand', country: 'India', lat: 29.8543, lng: 77.8880 },
  { city: 'Kanpur', state: 'Uttar Pradesh', country: 'India', lat: 26.4499, lng: 80.3319 },
  { city: 'Kharagpur', state: 'West Bengal', country: 'India', lat: 22.3460, lng: 87.2320 },
  { city: 'Guwahati', state: 'Assam', country: 'India', lat: 26.1445, lng: 91.7362 },
  // Global Hubs
  { city: 'San Francisco', state: 'California', country: 'USA', lat: 37.7749, lng: -122.4194 },
  { city: 'New York', state: 'New York', country: 'USA', lat: 40.7128, lng: -74.0060 },
  { city: 'Seattle', state: 'Washington', country: 'USA', lat: 47.6062, lng: -122.3321 },
  { city: 'Austin', state: 'Texas', country: 'USA', lat: 30.2672, lng: -97.7431 },
  { city: 'Boston', state: 'Massachusetts', country: 'USA', lat: 42.3601, lng: -71.0589 },
  { city: 'Chicago', state: 'Illinois', country: 'USA', lat: 41.8781, lng: -87.6298 },
  { city: 'Toronto', state: 'Ontario', country: 'Canada', lat: 43.6532, lng: -79.3832 },
  { city: 'London', state: 'Ontario', country: 'Canada', lat: 42.9849, lng: -81.2453 },
  { city: 'Waterloo', state: 'Ontario', country: 'Canada', lat: 43.4643, lng: -80.5204 },
  { city: 'Vancouver', state: 'British Columbia', country: 'Canada', lat: 49.2827, lng: -123.1207 },
  { city: 'London, UK', state: 'England', country: 'UK', lat: 51.5072, lng: -0.1276 },
  { city: 'Singapore', state: 'Singapore', country: 'Singapore', lat: 1.3521, lng: 103.8198 },
  { city: 'Berlin', state: 'Berlin', country: 'Germany', lat: 52.5200, lng: 13.4050 },
  { city: 'Tokyo', state: 'Tokyo', country: 'Japan', lat: 35.6762, lng: 139.6503 },
  { city: 'Sydney', state: 'NSW', country: 'Australia', lat: -33.8688, lng: 151.2093 },
];

export function resolveCoordinates(
  locationText?: string | null,
  city?: string | null,
  state?: string | null,
  country?: string | null
): { lat: number | null; lng: number | null; city: string | null; state: string | null; country: string | null } {
  const combined = [city, state, country, locationText].filter(Boolean).join(' ').toLowerCase();
  if (!combined || combined === 'online' || combined === 'virtual') {
    return {
      lat: null,
      lng: null,
      city: city || null,
      state: state || null,
      country: country || null,
    };
  }

  for (const entry of KNOWN_CITIES) {
    const cityLower = entry.city.toLowerCase();
    if (combined.includes(cityLower)) {
      // Disambiguate London, UK vs London, Ontario
      if (cityLower === 'london' && (combined.includes('uk') || combined.includes('england') || combined.includes('united kingdom'))) {
        const uk = KNOWN_CITIES.find((c) => c.city === 'London, UK')!;
        return { lat: uk.lat, lng: uk.lng, city: 'London', state: uk.state, country: uk.country };
      }
      return {
        lat: entry.lat,
        lng: entry.lng,
        city: city || (entry.city === 'Bangalore' ? 'Bengaluru' : entry.city === 'London, UK' ? 'London' : entry.city),
        state: state || entry.state,
        country: country || entry.country,
      };
    }
  }

  return {
    lat: null,
    lng: null,
    city: city || null,
    state: state || null,
    country: country || null,
  };
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}
