import type {
  AnalyticsData,
  DashboardSummary,
  Hackathon,
  MatchingWeights,
  NLSearchFilters,
  NotificationItem,
  PlatformStatus,
  Preferences,
  SourcePlatform,
  UserProfile,
} from './types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export const api = {
  getDashboard: () => request<DashboardSummary>('/api/dashboard'),

  getHackathons: (params: Record<string, string | number | boolean | undefined | null>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '' && v !== false) {
        qs.set(k, String(v));
      }
    }
    return request<{ hackathons: Hackathon[]; total: number }>(`/api/hackathons?${qs.toString()}`);
  },

  recordView: (id: string) =>
    request<{ ok: boolean }>(`/api/hackathons/${encodeURIComponent(id)}/view`, {
      method: 'POST',
    }),

  discoverPlatforms: (platforms?: SourcePlatform[]) =>
    request<{
      runs: Array<{
        platform: SourcePlatform;
        status: string;
        discovered_count: number;
        new_count: number;
        updated_count: number;
        error_message: string | null;
        duration_ms: number;
      }>;
      total_new: number;
      total_updated: number;
      platforms: PlatformStatus[];
      synced_at: string;
    }>('/api/hackathons/discover', {
      method: 'POST',
      body: JSON.stringify(platforms ? { platforms } : {}),
    }),

  getPlatformStatuses: () =>
    request<{ platforms: PlatformStatus[]; last_successful_sync: string | null }>(
      '/api/discovery/platforms'
    ),

  searchNL: (query: string, lat?: number | null, lng?: number | null) =>
    request<{
      raw_query: string;
      filters: NLSearchFilters;
      model: string;
      hackathons: Hackathon[];
      total: number;
    }>('/api/search/nl', {
      method: 'POST',
      body: JSON.stringify({ query, lat, lng }),
    }),

  getRecommendations: () =>
    request<{
      recommendations: Hackathon[];
      weights: MatchingWeights;
      profile: UserProfile;
    }>('/api/recommendations'),

  analyzeWithGemini: (hackathonIds?: string[]) =>
    request<{
      analyzed_count: number;
      model: string;
      recommendations: Hackathon[];
    }>('/api/recommendations/analyze', {
      method: 'POST',
      body: JSON.stringify(hackathonIds ? { hackathon_ids: hackathonIds } : {}),
    }),

  getSaved: () => request<{ saved: Hackathon[]; total: number }>('/api/saved'),

  saveHackathon: (id: string) =>
    request<{ ok: boolean }>(`/api/saved/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  updateSavedSettings: (
    id: string,
    payload: {
      notes?: string;
      reminder_7d?: boolean;
      reminder_3d?: boolean;
      reminder_24h?: boolean;
      custom_reminder_hours?: number | null;
    }
  ) =>
    request<{ ok: boolean }>(`/api/saved/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  unsaveHackathon: (id: string) =>
    request<{ ok: boolean }>(`/api/saved/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  getDeadlines: (savedOnly = false) =>
    request<{
      closing_today: Hackathon[];
      closing_soon: Hackathon[];
      upcoming: Hackathon[];
      expired: Hackathon[];
    }>(`/api/deadlines?saved_only=${savedOnly}`),

  getNotifications: () =>
    request<{ notifications: NotificationItem[]; unread_count: number }>(
      '/api/notifications/history'
    ),

  markNotificationRead: (id: string, is_read = true) =>
    request<{ ok: boolean }>(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
      body: JSON.stringify({ is_read }),
    }),

  markAllNotificationsRead: () =>
    request<{ ok: boolean }>('/api/notifications/mark-all-read', {
      method: 'POST',
    }),

  deleteNotification: (id: string) =>
    request<{ ok: boolean }>(`/api/notifications/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  getAnalytics: () => request<AnalyticsData>('/api/analytics'),

  getProfile: () => request<UserProfile>('/api/profile'),

  updateProfile: (payload: Partial<UserProfile>) =>
    request<UserProfile>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  getMatchingWeights: () => request<MatchingWeights>('/api/matching-weights'),

  updateMatchingWeights: (payload: Partial<MatchingWeights>) =>
    request<MatchingWeights>('/api/matching-weights', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  getPreferences: () => request<Preferences>('/api/preferences'),

  updatePreferences: (payload: Partial<Preferences>) =>
    request<Preferences>('/api/preferences', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};
