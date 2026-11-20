export type HackathonFormat = 'online' | 'offline' | 'hybrid';
export type RegistrationStatus = 'open' | 'upcoming' | 'expired';
export type SourcePlatform =
  | 'Devpost'
  | 'Unstop'
  | 'Devfolio'
  | 'HackerEarth'
  | 'MLH'
  | 'Hack2Skill';

export interface Hackathon {
  id: string;
  external_id: string | null;
  dedup_key: string;
  title: string;
  organizer: string;
  description: string;
  category: string;
  domains: string[];
  format: HackathonFormat;
  location: string;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  start_date: string | null;
  end_date: string | null;
  registration_deadline: string | null;
  registration_status: RegistrationStatus;
  prize_pool: string;
  prize_value_inr: number | null;
  eligibility: string;
  team_size_min: number | null;
  team_size_max: number | null;
  registration_url: string;
  source_platform: SourcePlatform;
  is_verified: boolean;
  discovered_at: string;
  updated_at: string;
  last_viewed_at: string | null;
  distance_km?: number | null;
  is_saved?: boolean;
  saved_notes?: string;
  reminder_7d?: boolean;
  reminder_3d?: boolean;
  reminder_24h?: boolean;
  custom_reminder_hours?: number | null;
  compatibility_score?: number;
  recommendation?: RecommendationDetails | null;
}

export interface ScoreBreakdown {
  skill_compatibility: number;
  domain_interest: number;
  location_preference: number;
  eligibility: number;
  experience_level: number;
  event_format: number;
  deadline_suitability: number;
}

export interface RecommendationDetails {
  hackathon_id: string;
  compatibility_score: number;
  breakdown: ScoreBreakdown;
  why_matches: string;
  relevant_skills: string[];
  eligibility_assessment: string;
  important_deadlines: string;
  preparation_checklist: string[];
  ai_enhanced: boolean;
  computed_at: string;
}

export interface UserProfile {
  id: number;
  name: string;
  skills: string[];
  languages: string[];
  interests: string[];
  preferred_domains: string[];
  experience_level: 'beginner' | 'intermediate' | 'advanced';
  preferred_location: string;
  preferred_city: string;
  preferred_state: string;
  preferred_lat: number | null;
  preferred_lng: number | null;
  team_size_preference: 'solo' | '2-4' | 'any';
  format_preference: 'any' | 'online' | 'offline' | 'hybrid';
  updated_at: string;
}

export interface MatchingWeights {
  id: number;
  skill_compatibility: number;
  domain_interest: number;
  location_preference: number;
  eligibility: number;
  experience_level: number;
  event_format: number;
  deadline_suitability: number;
  updated_at: string;
}

export interface Preferences {
  id: number;
  auto_sync_enabled: boolean;
  sync_interval_minutes: number;
  default_reminder_7d: boolean;
  default_reminder_3d: boolean;
  default_reminder_24h: boolean;
  notify_new_discoveries: boolean;
  notify_deadline_approaching: boolean;
  notify_saved_changes: boolean;
  notify_new_recommendations: boolean;
  min_match_threshold: number;
  updated_at: string;
}

export interface NotificationItem {
  id: string;
  dedup_key: string;
  type: 'discovery' | 'deadline' | 'change' | 'recommendation' | 'system';
  title: string;
  message: string;
  hackathon_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface PlatformStatus {
  platform: SourcePlatform;
  status: 'success' | 'error' | 'partial' | 'never';
  last_sync_at: string | null;
  total_listings: number;
  last_discovered_count: number;
  last_new_count: number;
  error_message: string | null;
  duration_ms: number | null;
}

export interface NLSearchFilters {
  query?: string;
  domain?: string;
  city?: string;
  state?: string;
  format?: 'online' | 'offline' | 'hybrid' | '';
  min_prize_inr?: number | null;
  closing_within_days?: number | null;
  solo_only?: boolean;
  beginner_friendly?: boolean;
  status?: 'open' | 'upcoming' | '';
  interpretation_summary?: string;
}

export interface DashboardSummary {
  total_discovered: number;
  matching_profile_count: number;
  upcoming_deadlines_count: number;
  saved_count: number;
  unread_notifications_count: number;
  last_sync_at: string | null;
  newly_discovered: Hackathon[];
  recommended: Hackathon[];
  recently_viewed: Hackathon[];
  closing_soon: Hackathon[];
}

export interface AnalyticsData {
  total_hackathons: number;
  open_count: number;
  upcoming_count: number;
  expired_count: number;
  saved_count: number;
  discovered_over_time: Array<{ date: string; count: number }>;
  by_domain: Array<{ domain: string; count: number }>;
  by_location: Array<{ location: string; count: number }>;
  by_format: Array<{ format: string; count: number }>;
  by_platform: Array<{ platform: string; count: number }>;
  upcoming_deadlines_buckets: Array<{ bucket: string; count: number }>;
  saved_engagement: {
    total_saved: number;
    open_saved: number;
    closing_within_7d: number;
    avg_match_score_saved: number;
    avg_match_score_all: number;
    with_notes: number;
  };
}
