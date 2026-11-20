import React, { useCallback, useEffect, useState } from 'react';
import { Bookmark, Clock, ExternalLink } from 'lucide-react';
import { api } from '../api';
import { formatShortDate } from '../components/HackathonCard';
import type { Hackathon } from '../types';

interface DeadlinesViewProps {
  onSelectHackathon: (h: Hackathon) => void;
  onToggleSave: (h: Hackathon) => void;
  refreshTrigger: number;
}

function formatCountdown(deadlineIso: string | null, nowMs: number): string {
  if (!deadlineIso) return 'TBA';
  const diff = new Date(deadlineIso).getTime() - nowMs;
  if (isNaN(diff)) return 'TBA';
  if (diff <= 0) return 'Closed';

  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hrs = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (days > 0) return `${days}d ${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
  return `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

export const DeadlinesView: React.FC<DeadlinesViewProps> = ({
  onSelectHackathon,
  onToggleSave,
  refreshTrigger,
}) => {
  const [savedOnly, setSavedOnly] = useState(false);
  const [buckets, setBuckets] = useState<{
    closing_today: Hackathon[];
    closing_soon: Hackathon[];
    upcoming: Hackathon[];
    expired: Hackathon[];
  }>({ closing_today: [], closing_soon: [], upcoming: [], expired: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadDeadlines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDeadlines(savedOnly);
      setBuckets(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load deadline tracker');
    } finally {
      setLoading(false);
    }
  }, [savedOnly]);

  useEffect(() => {
    loadDeadlines();
  }, [loadDeadlines, refreshTrigger]);

  const sections: Array<{
    key: keyof typeof buckets;
    title: string;
    subtitle: string;
    toneClass: string;
  }> = [
    {
      key: 'closing_today',
      title: 'Closing Today (Under 24 Hours)',
      subtitle: 'Immediate submission or registration action needed',
      toneClass: 'text-rose-700',
    },
    {
      key: 'closing_soon',
      title: 'Closing Soon (1–7 Days)',
      subtitle: 'Final week to register and submit team details',
      toneClass: 'text-amber-700',
    },
    {
      key: 'upcoming',
      title: 'Upcoming Deadlines (7+ Days)',
      subtitle: 'Healthy preparation window available',
      toneClass: 'text-emerald-700',
    },
    {
      key: 'expired',
      title: 'Expired / Closed',
      subtitle: 'Archived listings whose registration window has passed',
      toneClass: 'text-[#9D4E72]',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="surface-3d rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-[#5E2440]">
          <Clock className="w-4 h-4 text-pink-600" />
          <span>
            Live server-monitored countdowns. Automated reminders trigger at 7d, 3d, and 24h for
            saved hackathons.
          </span>
        </div>

        <div className="flex items-center gap-1 p-1 bg-pink-50 border border-pink-200 rounded-lg">
          <button
            type="button"
            onClick={() => setSavedOnly(false)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              !savedOnly ? 'bg-pink-600 text-white' : 'text-[#6B0F3B] hover:bg-pink-100'
            }`}
          >
            All Tracked
          </button>
          <button
            type="button"
            onClick={() => setSavedOnly(true)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              savedOnly ? 'bg-pink-600 text-white' : 'text-[#6B0F3B] hover:bg-pink-100'
            }`}
          >
            Saved Only
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 text-xs text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-44 rounded-xl bg-white border border-pink-200 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((sec) => {
            const list = buckets[sec.key];
            return (
              <section
                key={sec.key}
                className="surface-3d rounded-xl overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-pink-100 flex items-center justify-between bg-pink-50/50">
                  <div>
                    <h3 className={`text-sm font-bold ${sec.toneClass}`}>{sec.title}</h3>
                    <p className="text-xs text-[#8C3F64] mt-0.5">{sec.subtitle}</p>
                  </div>
                  <span className="font-mono tabular-nums text-xs text-[#8C3F64] font-semibold">
                    {list.length} events
                  </span>
                </div>

                {list.length === 0 ? (
                  <p className="px-5 py-6 text-xs text-[#9D4E72]">
                    No hackathons in this deadline window.
                  </p>
                ) : (
                  <div className="divide-y divide-pink-100">
                    {list.map((h) => (
                      <div
                        key={h.id}
                        className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-pink-50/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onSelectHackathon(h)}
                            className="text-left text-sm font-semibold text-[#4A0526] hover:text-pink-700 truncate block max-w-full"
                          >
                            {h.title}
                          </button>
                          <p className="text-xs text-[#8C3F64] mt-0.5">
                            {h.source_platform} · {h.format} · Deadline:{' '}
                            <span className="font-mono">
                              {formatShortDate(h.registration_deadline)}
                            </span>
                          </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={`font-mono tabular-nums text-xs font-semibold ${sec.toneClass}`}
                          >
                            {formatCountdown(h.registration_deadline, nowMs)}
                          </span>

                          <button
                            type="button"
                            onClick={() => onToggleSave(h)}
                            aria-label="Toggle save"
                            className={`p-1.5 rounded-lg transition-colors ${
                              h.is_saved
                                ? 'text-white bg-[#6B0F3B]'
                                : 'text-[#8C3F64] hover:text-[#4A0526] hover:bg-pink-100'
                            }`}
                          >
                            <Bookmark
                              className="w-3.5 h-3.5"
                              fill={h.is_saved ? 'currentColor' : 'none'}
                            />
                          </button>

                          <a
                            href={h.registration_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-3d-pink inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
                          >
                            Apply
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
