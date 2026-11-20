import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { AnalyticsData } from '../types';

interface AnalyticsViewProps {
  refreshTrigger: number;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ refreshTrigger }) => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getAnalytics()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err: any) => {
        if (active) setError(err?.message || 'Failed to load analytics');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshTrigger]);

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-64 rounded-xl bg-white border border-pink-200 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 text-xs text-rose-800">
        {error}
      </div>
    );
  }

  if (!data || data.total_hackathons === 0) {
    return (
      <div className="surface-3d rounded-xl p-12 text-center text-sm text-[#8C3F64]">
        No hackathon records stored yet. Run platform discovery to populate real-time analytics.
      </div>
    );
  }

  const maxDomain = Math.max(1, ...data.by_domain.map((d) => d.count));
  const maxLoc = Math.max(1, ...data.by_location.map((d) => d.count));
  const maxDeadline = Math.max(1, ...data.upcoming_deadlines_buckets.map((d) => d.count));
  const maxDay = Math.max(1, ...data.discovered_over_time.map((d) => d.count));

  return (
    <div className="space-y-6">
      {/* Real Database Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: 'Total Stored', val: data.total_hackathons, color: 'text-[#4A0526]' },
          { label: 'Open Now', val: data.open_count, color: 'text-emerald-700' },
          { label: 'Upcoming', val: data.upcoming_count, color: 'text-pink-700' },
          { label: 'Expired', val: data.expired_count, color: 'text-[#9D4E72]' },
          { label: 'Saved Engagement', val: data.saved_count, color: 'text-[#831843]' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="surface-3d rounded-xl p-4"
          >
            <span className="text-xs text-[#8C3F64]">{kpi.label}</span>
            <p className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${kpi.color}`}>
              {kpi.val}
            </p>
          </div>
        ))}
      </div>

      {/* Row 1: Discovered Over Time + Format Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 surface-3d rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#4A0526]">
              Hackathons Discovered Over Time
            </h3>
            <p className="text-xs text-[#8C3F64] mt-0.5">
              Daily verified opportunities ingested into SQLite
            </p>
          </div>

          <div className="h-44 flex items-end gap-3 pt-4 border-b border-pink-100 pb-2">
            {data.discovered_over_time.map((pt) => {
              const pct = Math.max(8, Math.round((pt.count / maxDay) * 100));
              return (
                <div key={pt.date} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                  <span className="font-mono tabular-nums text-xs font-semibold text-[#4A0526]">
                    {pt.count}
                  </span>
                  <div className="w-full max-w-[48px] h-28 flex items-end justify-center">
                    <div
                      className="w-full bg-gradient-to-t from-[#831843] to-pink-500 rounded-t-md shadow-sm transition-all"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-[#9D4E72] truncate max-w-full">
                    {pt.date}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="surface-3d rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#4A0526]">
              Online vs Offline vs Hybrid
            </h3>
            <p className="text-xs text-[#8C3F64] mt-0.5">
              Event format breakdown across live records
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {data.by_format.map((fmt) => {
              const pct = Math.round((fmt.count / data.total_hackathons) * 100);
              const barColor =
                fmt.format === 'online'
                  ? 'bg-pink-600'
                  : fmt.format === 'hybrid'
                  ? 'bg-[#831843]'
                  : 'bg-pink-400';
              return (
                <div key={fmt.format} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="capitalize font-medium text-[#4A0526]">{fmt.format}</span>
                    <span className="font-mono tabular-nums text-[#8C3F64]">
                      {fmt.count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-pink-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-pink-100 space-y-2">
            <h4 className="text-xs font-bold text-[#4A0526]">Source Platforms</h4>
            {data.by_platform.map((p) => (
              <div key={p.platform} className="flex justify-between text-xs">
                <span className="text-[#6B2145]">{p.platform}</span>
                <span className="font-mono tabular-nums font-semibold text-[#4A0526]">{p.count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Row 2: Domain Popularity + Location Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="surface-3d rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#4A0526]">
              Distribution by Domain & Popular Categories
            </h3>
            <p className="text-xs text-[#8C3F64] mt-0.5">
              Ranked by verified listing volume
            </p>
          </div>

          <div className="space-y-3">
            {data.by_domain.map((item) => (
              <div key={item.domain} className="grid grid-cols-[140px_1fr_44px] items-center gap-3 text-xs">
                <span className="text-[#5E2440] font-medium truncate">{item.domain}</span>
                <div className="h-2 bg-pink-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-pink-500 to-[#831843] rounded-full"
                    style={{ width: `${Math.round((item.count / maxDomain) * 100)}%` }}
                  />
                </div>
                <span className="font-mono tabular-nums text-right text-[#4A0526] font-semibold">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-3d rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#4A0526]">
              Distribution by Location
            </h3>
            <p className="text-xs text-[#8C3F64] mt-0.5">
              Top cities, regions, and remote listings
            </p>
          </div>

          <div className="space-y-3">
            {data.by_location.map((item) => (
              <div key={item.location} className="grid grid-cols-[150px_1fr_44px] items-center gap-3 text-xs">
                <span className="text-[#5E2440] font-medium truncate">{item.location}</span>
                <div className="h-2 bg-pink-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-pink-600 rounded-full"
                    style={{ width: `${Math.round((item.count / maxLoc) * 100)}%` }}
                  />
                </div>
                <span className="font-mono tabular-nums text-right text-[#4A0526] font-semibold">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Row 3: Upcoming Deadlines + User Saved Engagement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="surface-3d rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#4A0526]">
              Upcoming Deadlines Distribution
            </h3>
            <p className="text-xs text-[#8C3F64] mt-0.5">
              Active opportunities segmented by time remaining
            </p>
          </div>

          <div className="space-y-3">
            {data.upcoming_deadlines_buckets.map((b) => (
              <div key={b.bucket} className="grid grid-cols-[120px_1fr_44px] items-center gap-3 text-xs">
                <span className="text-[#5E2440] font-medium">{b.bucket}</span>
                <div className="h-2 bg-pink-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#831843] rounded-full"
                    style={{ width: `${Math.round((b.count / maxDeadline) * 100)}%` }}
                  />
                </div>
                <span className="font-mono tabular-nums text-right text-[#4A0526] font-semibold">
                  {b.count}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-3d-dark rounded-xl p-5 space-y-4 text-white">
          <div>
            <h3 className="text-sm font-bold text-white">
              User Saved Opportunity Engagement
            </h3>
            <p className="text-xs text-pink-200 mt-0.5">
              Comparison of saved tracker items against catalog baseline
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-4 text-xs pt-1">
            <div>
              <dt className="text-pink-200/80">Saved Open Hackathons</dt>
              <dd className="text-lg font-mono tabular-nums font-semibold text-white mt-0.5">
                {data.saved_engagement.open_saved} / {data.saved_engagement.total_saved}
              </dd>
            </div>
            <div>
              <dt className="text-pink-200/80">Saved Closing ≤ 7 Days</dt>
              <dd className="text-lg font-mono tabular-nums font-semibold text-pink-200 mt-0.5">
                {data.saved_engagement.closing_within_7d}
              </dd>
            </div>
            <div>
              <dt className="text-pink-200/80">Avg Match Score (Saved)</dt>
              <dd className="text-lg font-mono tabular-nums font-semibold text-white mt-0.5">
                {data.saved_engagement.avg_match_score_saved}%
              </dd>
            </div>
            <div>
              <dt className="text-pink-200/80">Avg Match Score (All)</dt>
              <dd className="text-lg font-mono tabular-nums font-semibold text-pink-100 mt-0.5">
                {data.saved_engagement.avg_match_score_all}%
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-pink-200/80">Saved With Custom Notes</dt>
              <dd className="text-sm font-mono tabular-nums font-semibold text-white mt-0.5">
                {data.saved_engagement.with_notes}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
};
