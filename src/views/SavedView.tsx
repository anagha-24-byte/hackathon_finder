import React, { useCallback, useEffect, useState } from 'react';
import { Bookmark, ExternalLink, Trash2 } from 'lucide-react';
import { api } from '../api';
import { formatShortDate, getDeadlineText } from '../components/HackathonCard';
import type { Hackathon } from '../types';

interface SavedViewProps {
  onSelectHackathon: (h: Hackathon) => void;
  onToggleSave: (h: Hackathon) => void;
  onNavigateDiscover: () => void;
  refreshTrigger: number;
}

export const SavedView: React.FC<SavedViewProps> = ({
  onSelectHackathon,
  onToggleSave,
  onNavigateDiscover,
  refreshTrigger,
}) => {
  const [saved, setSaved] = useState<Hackathon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSaved = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getSaved();
      setSaved(res.saved);
    } catch (err: any) {
      setError(err?.message || 'Failed to load saved hackathons');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved, refreshTrigger]);

  const handleToggleReminder = async (
    h: Hackathon,
    key: 'reminder_7d' | 'reminder_3d' | 'reminder_24h',
    value: boolean
  ) => {
    try {
      await api.updateSavedSettings(h.id, { [key]: value });
      setSaved((prev) =>
        prev.map((item) => (item.id === h.id ? { ...item, [key]: value } : item))
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to update reminder preference');
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 rounded-xl bg-white border border-pink-200 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 text-xs text-rose-800">
          {error}
        </div>
      )}

      {saved.length === 0 ? (
        <div className="surface-3d rounded-xl p-12 text-center space-y-3">
          <Bookmark className="w-8 h-8 text-pink-400 mx-auto" />
          <h3 className="text-base font-bold text-[#4A0526]">
            No Saved Hackathons Yet
          </h3>
          <p className="text-xs text-[#8C3F64] max-w-md mx-auto">
            Save hackathons from Discover or AI Recommendations to track registration
            deadlines, configure automated reminders, and keep preparation notes.
          </p>
          <button
            type="button"
            onClick={onNavigateDiscover}
            className="btn-3d-pink mt-2 px-4 py-2 text-xs font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
          >
            Discover Hackathons
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {saved.map((h) => {
            const dl = getDeadlineText(h);
            return (
              <article
                key={h.id}
                className="surface-3d surface-3d-hover rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-[#8C3F64]">
                    <span className="text-pink-700 font-semibold">{h.source_platform}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{h.format}</span>
                    <span aria-hidden="true">·</span>
                    <span>{h.location}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-mono tabular-nums font-semibold ${
                        dl.tone === 'expired'
                          ? 'text-rose-700'
                          : dl.tone === 'soon'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {dl.label}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectHackathon(h)}
                    className="text-left"
                  >
                    <h3 className="text-base font-bold text-[#4A0526] hover:text-pink-700 transition-colors">
                      {h.title}
                    </h3>
                  </button>

                  <p className="text-xs text-[#7E3458]">
                    Deadline: <span className="font-mono">{formatShortDate(h.registration_deadline)}</span> ·
                    Prize: {h.prize_pool}
                    {h.saved_notes ? ` · Note: "${h.saved_notes.slice(0, 60)}"` : ''}
                  </p>

                  {/* Reminder toggles */}
                  <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
                    <span className="text-[#9D4E72]">Reminders:</span>
                    {(
                      [
                        ['reminder_7d', '7d before'],
                        ['reminder_3d', '3d before'],
                        ['reminder_24h', '24h before'],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="inline-flex items-center gap-1.5 text-[#4A0526] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(h[key])}
                          onChange={(e) => handleToggleReminder(h, key, e.target.checked)}
                          className="rounded border-pink-300 text-pink-600 focus:ring-pink-500"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectHackathon(h)}
                    className="px-3 py-1.5 text-xs font-medium text-[#6B0F3B] bg-pink-50 hover:bg-pink-100 border border-pink-200 rounded-lg"
                  >
                    Notes & Details
                  </button>
                  <a
                    href={h.registration_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-3d-pink inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
                  >
                    Apply
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => onToggleSave(h)}
                    aria-label="Remove saved hackathon"
                    className="p-2 text-[#9D4E72] hover:text-rose-700 hover:bg-pink-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
