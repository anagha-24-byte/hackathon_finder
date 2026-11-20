import React from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import type { DashboardSummary, Hackathon } from '../types';
import { HackathonCard, formatShortDate, getDeadlineText } from '../components/HackathonCard';
import { Hackathon3DHero } from '../components/Hackathon3DHero';

interface DashboardViewProps {
  data: DashboardSummary | null;
  loading: boolean;
  syncing: boolean;
  onSyncNow: () => void;
  onNavigate: (tab: string) => void;
  onSelectHackathon: (h: Hackathon) => void;
  onToggleSave: (h: Hackathon) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  loading,
  syncing,
  onSyncNow,
  onNavigate,
  onSelectHackathon,
  onToggleSave,
}) => {
  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-72 rounded-2xl bg-pink-100 border border-pink-200 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 rounded-xl bg-white border border-pink-200 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const summary = data || {
    total_discovered: 0,
    matching_profile_count: 0,
    upcoming_deadlines_count: 0,
    saved_count: 0,
    unread_notifications_count: 0,
    last_sync_at: null,
    newly_discovered: [],
    recommended: [],
    recently_viewed: [],
    closing_soon: [],
  };

  return (
    <div className="space-y-8">
      {/* Interactive Three.js 3D Spatial Showcase Hero */}
      <Hackathon3DHero
        totalDiscovered={summary.total_discovered}
        matchingCount={summary.matching_profile_count}
        savedCount={summary.saved_count}
        onSyncNow={onSyncNow}
        onExploreDiscover={() => onNavigate('discover')}
        syncing={syncing}
      />

      {/* Top KPI Row */}
      <section aria-label="Key discovery metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => onNavigate('discover')}
            className="text-left surface-3d surface-3d-hover rounded-xl p-5"
          >
            <span className="text-xs text-[#8C3F64] font-medium">
              Total Hackathons Discovered
            </span>
            <p className="mt-2 text-3xl font-bold text-[#4A0526] font-mono tabular-nums">
              {summary.total_discovered}
            </p>
            <span className="mt-2 block text-xs text-[#9D4E72]">
              Verified across 6 public platforms
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('recommendations')}
            className="text-left surface-3d surface-3d-hover rounded-xl p-5"
          >
            <span className="text-xs text-[#8C3F64] font-medium">
              Matching Your Profile
            </span>
            <p className="mt-2 text-3xl font-bold text-pink-700 font-mono tabular-nums">
              {summary.matching_profile_count}
            </p>
            <span className="mt-2 block text-xs text-[#9D4E72]">
              Above compatibility threshold
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('deadlines')}
            className="text-left surface-3d surface-3d-hover rounded-xl p-5"
          >
            <span className="text-xs text-[#8C3F64] font-medium">
              Closing Within 7 Days
            </span>
            <p className="mt-2 text-3xl font-bold text-amber-700 font-mono tabular-nums">
              {summary.upcoming_deadlines_count}
            </p>
            <span className="mt-2 block text-xs text-[#9D4E72]">
              Active upcoming registration deadlines
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('saved')}
            className="text-left surface-3d surface-3d-hover rounded-xl p-5"
          >
            <span className="text-xs text-[#8C3F64] font-medium">Saved Hackathons</span>
            <p className="mt-2 text-3xl font-bold text-[#831843] font-mono tabular-nums">
              {summary.saved_count}
            </p>
            <span className="mt-2 block text-xs text-[#9D4E72]">
              Tracked with automated reminders
            </span>
          </button>
        </div>
      </section>

      {/* Recommended Hackathons */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#4A0526]">Recommended for Your Stack</h2>
            <p className="text-xs text-[#8C3F64] mt-0.5">
              Ranked transparently using your skills, domains, location, and active weights.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('recommendations')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-pink-700 hover:text-[#4A0526] whitespace-nowrap shrink-0"
          >
            View AI Recommendations
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {summary.recommended.length === 0 ? (
          <div className="surface-3d rounded-xl p-8 text-center">
            <p className="text-sm text-[#5E2440]">
              No live hackathons have been synced yet.
            </p>
            <button
              type="button"
              onClick={onSyncNow}
              disabled={syncing}
              className="btn-3d-pink mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Discovering Platforms...' : 'Discover Live Hackathons'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {summary.recommended.map((h) => (
              <HackathonCard
                key={h.id}
                hackathon={h}
                onSelect={onSelectHackathon}
                onToggleSave={onToggleSave}
              />
            ))}
          </div>
        )}
      </section>

      {/* Newly Discovered + Closing Soon & Recently Viewed Split */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-[#4A0526]">
                Newly Discovered Opportunities
              </h2>
              <p className="text-xs text-[#8C3F64] mt-0.5">
                Latest verified listings fetched directly from official hackathon platforms.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('discover')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-pink-700 hover:text-[#4A0526] whitespace-nowrap shrink-0"
            >
              Browse All
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {summary.newly_discovered.slice(0, 4).map((h) => (
              <HackathonCard
                key={h.id}
                hackathon={h}
                onSelect={onSelectHackathon}
                onToggleSave={onToggleSave}
                compact
              />
            ))}
          </div>
        </section>

        <aside className="space-y-6">
          {/* Upcoming Deadlines List */}
          <div className="surface-3d rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#4A0526]">Upcoming Deadlines</h3>
              <button
                type="button"
                onClick={() => onNavigate('deadlines')}
                className="text-xs font-semibold text-pink-700 hover:text-[#4A0526]"
              >
                Tracker
              </button>
            </div>

            {summary.closing_soon.length === 0 ? (
              <p className="text-xs text-[#8C3F64]">
                No deadlines closing within the next 7 days.
              </p>
            ) : (
              <ul className="divide-y divide-pink-100">
                {summary.closing_soon.map((h) => {
                  const dl = getDeadlineText(h);
                  return (
                    <li key={h.id} className="py-2.5 first:pt-0 last:pb-0">
                      <button
                        type="button"
                        onClick={() => onSelectHackathon(h)}
                        className="w-full text-left flex items-start justify-between gap-3 group"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#4A0526] group-hover:text-pink-700 truncate">
                            {h.title}
                          </p>
                          <p className="text-xs text-[#9D4E72] mt-0.5">
                            {h.source_platform} · {formatShortDate(h.registration_deadline)}
                          </p>
                        </div>
                        <span className="font-mono tabular-nums text-xs font-semibold text-amber-700 whitespace-nowrap shrink-0">
                          {dl.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Recently Viewed */}
          <div className="surface-3d rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#4A0526]">Recently Viewed</h3>
            {summary.recently_viewed.length === 0 ? (
              <p className="text-xs text-[#8C3F64]">
                Click "Inspect Match" on any hackathon to track it here.
              </p>
            ) : (
              <ul className="divide-y divide-pink-100">
                {summary.recently_viewed.map((h) => (
                  <li key={h.id} className="py-2.5 first:pt-0 last:pb-0">
                    <button
                      type="button"
                      onClick={() => onSelectHackathon(h)}
                      className="w-full text-left flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#4A0526] group-hover:text-pink-700 truncate">
                          {h.title}
                        </p>
                        <p className="text-xs text-[#9D4E72] mt-0.5 truncate">
                          {h.source_platform} · {h.location}
                        </p>
                      </div>
                      {h.compatibility_score != null && (
                        <span className="font-mono tabular-nums text-xs font-semibold text-[#831843] shrink-0">
                          {Math.round(h.compatibility_score)}%
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
