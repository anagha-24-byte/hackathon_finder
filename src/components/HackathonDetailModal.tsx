import React, { useState } from 'react';
import { Bell, Bookmark, Check, ExternalLink, Sparkles, X } from 'lucide-react';
import type { Hackathon } from '../types';
import { formatShortDate, getDeadlineText } from './HackathonCard';

interface HackathonDetailModalProps {
  hackathon: Hackathon | null;
  onClose: () => void;
  onToggleSave: (hackathon: Hackathon) => void;
  onUpdateSaved: (
    id: string,
    payload: {
      notes?: string;
      reminder_7d?: boolean;
      reminder_3d?: boolean;
      reminder_24h?: boolean;
      custom_reminder_hours?: number | null;
    }
  ) => Promise<void>;
  onAnalyzeSingle: (id: string) => Promise<void>;
}

export const HackathonDetailModal: React.FC<HackathonDetailModalProps> = ({
  hackathon,
  onClose,
  onToggleSave,
  onUpdateSaved,
  onAnalyzeSingle,
}) => {
  const [notes, setNotes] = useState(hackathon?.saved_notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  if (!hackathon) return null;

  const dl = getDeadlineText(hackathon);
  const rec = hackathon.recommendation;

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await onUpdateSaved(hackathon.id, { notes });
    } finally {
      setSavingNotes(false);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      await onAnalyzeSingle(hackathon.id);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end bg-[#4A0526]/45 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={hackathon.title}
    >
      <div className="relative w-full max-w-2xl h-full bg-white border-l border-pink-200 overflow-y-auto p-6 sm:p-8 flex flex-col gap-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-5 border-b border-pink-100">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-[#8C3F64] mb-2">
              <span className="text-pink-700 font-semibold">{hackathon.source_platform}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{hackathon.format}</span>
              <span aria-hidden="true">·</span>
              <span>{hackathon.category}</span>
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
            <h2 className="text-xl sm:text-2xl font-bold text-[#4A0526] leading-tight">
              {hackathon.title}
            </h2>
            <p className="text-sm text-[#7E3458] mt-1">
              {hackathon.organizer} · {hackathon.location}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail view"
            className="p-2 text-[#831843] hover:text-[#4A0526] hover:bg-pink-50 rounded-lg transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Row */}
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={hackathon.registration_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-3d-pink inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg whitespace-nowrap shrink-0"
          >
            Open Official Registration
            <ExternalLink className="w-4 h-4" />
          </a>

          <button
            type="button"
            onClick={() => onToggleSave(hackathon)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              hackathon.is_saved
                ? 'bg-[#6B0F3B] text-white'
                : 'bg-pink-50 text-[#6B0F3B] border border-pink-200 hover:bg-pink-100'
            }`}
          >
            <Bookmark className="w-4 h-4" fill={hackathon.is_saved ? 'currentColor' : 'none'} />
            {hackathon.is_saved ? 'Saved to Tracker' : 'Save & Track Deadline'}
          </button>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#6B0F3B] bg-white hover:bg-pink-50 border border-pink-300 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-4 h-4 text-pink-600" />
            {analyzing ? 'Analyzing with Gemini...' : 'Run Gemini AI Deep Analysis'}
          </button>
        </div>

        {/* Key Metadata Grid */}
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-4 border-y border-pink-100 text-sm">
          <div>
            <dt className="text-xs text-[#9D4E72]">Registration Deadline</dt>
            <dd className="text-[#4A0526] font-mono tabular-nums font-medium mt-1">
              {formatShortDate(hackathon.registration_deadline)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#9D4E72]">Event Dates</dt>
            <dd className="text-[#4A0526] font-mono tabular-nums font-medium mt-1">
              {formatShortDate(hackathon.start_date)} – {formatShortDate(hackathon.end_date)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#9D4E72]">Prize Pool</dt>
            <dd className="text-[#4A0526] font-mono tabular-nums font-medium mt-1">
              {hackathon.prize_pool}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#9D4E72]">Team Size</dt>
            <dd className="text-[#5E2440] mt-1">
              {hackathon.team_size_min ?? 1}
              {hackathon.team_size_max ? `–${hackathon.team_size_max} members` : '+ members'}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-[#9D4E72]">Eligibility</dt>
            <dd className="text-[#5E2440] mt-1">{hackathon.eligibility}</dd>
          </div>
        </dl>

        {/* Description */}
        <div>
          <h3 className="text-sm font-semibold text-[#4A0526] mb-2">Overview</h3>
          <p className="text-sm text-[#5E2440] leading-relaxed whitespace-pre-line">
            {hackathon.description}
          </p>
          {hackathon.domains.length > 0 && (
            <p className="text-xs text-[#8C3F64] mt-3">
              Domains: {hackathon.domains.join(' · ')}
            </p>
          )}
        </div>

        {/* Transparent Compatibility Breakdown */}
        {rec && (
          <div className="pt-5 border-t border-pink-100 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[#4A0526]">
                  Compatibility Assessment {rec.ai_enhanced ? '(Gemini AI Enhanced)' : '(Weighted Profile Match)'}
                </h3>
                <p className="text-xs text-[#8C3F64] mt-0.5">
                  Computed transparently from your active profile and matching weights.
                </p>
              </div>
              <span className="font-mono tabular-nums text-2xl font-bold text-pink-700">
                {Math.round(rec.compatibility_score)}%
              </span>
            </div>

            <p className="text-sm text-[#5E2440] leading-relaxed">{rec.why_matches}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[#9D4E72] block mb-1">Relevant Skills</span>
                <span className="text-[#4A0526] font-medium">
                  {rec.relevant_skills.length > 0 ? rec.relevant_skills.join(' · ') : 'General / Open stack'}
                </span>
              </div>
              <div>
                <span className="text-[#9D4E72] block mb-1">Eligibility Check</span>
                <span className="text-[#4A0526]">{rec.eligibility_assessment}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-[#9D4E72] block mb-1">Deadline Guidance</span>
                <span className="text-[#4A0526]">{rec.important_deadlines}</span>
              </div>
            </div>

            {/* Factor Bars */}
            <div className="space-y-2 pt-2">
              <span className="text-xs font-medium text-[#8C3F64] block">
                Transparent Factor Breakdown
              </span>
              {Object.entries(rec.breakdown).map(([key, val]) => (
                <div key={key} className="grid grid-cols-[140px_1fr_42px] items-center gap-3 text-xs">
                  <span className="text-[#6B2145] capitalize truncate">
                    {key.replace(/_/g, ' ')}
                  </span>
                  <div className="h-2 bg-pink-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-pink-500 to-[#831843] rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, Number(val)))}%` }}
                    />
                  </div>
                  <span className="font-mono tabular-nums text-right text-[#4A0526] font-medium">
                    {Math.round(Number(val))}%
                  </span>
                </div>
              ))}
            </div>

            {/* Preparation Checklist */}
            {rec.preparation_checklist.length > 0 && (
              <div className="pt-2">
                <span className="text-xs font-medium text-[#8C3F64] block mb-2">
                  What to Prepare
                </span>
                <ul className="space-y-1.5 text-sm text-[#5E2440]">
                  {rec.preparation_checklist.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-pink-600 shrink-0 mt-0.5" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Saved Reminders & Notes */}
        {hackathon.is_saved && (
          <div className="pt-5 border-t border-pink-100 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#4A0526]">
              <Bell className="w-4 h-4 text-pink-600" />
              Deadline Reminders & Personal Notes
            </div>

            <div className="flex flex-wrap gap-3 text-xs">
              {[
                { key: 'reminder_7d' as const, label: '7 days before', val: hackathon.reminder_7d },
                { key: 'reminder_3d' as const, label: '3 days before', val: hackathon.reminder_3d },
                { key: 'reminder_24h' as const, label: '24 hours before', val: hackathon.reminder_24h },
              ].map((item) => (
                <label
                  key={item.key}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-pink-50 border border-pink-200 rounded-lg cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(item.val)}
                    onChange={(e) =>
                      onUpdateSaved(hackathon.id, { [item.key]: e.target.checked })
                    }
                    className="rounded border-pink-300 text-pink-600 focus:ring-pink-500"
                  />
                  <span className="text-[#4A0526]">{item.label}</span>
                </label>
              ))}
            </div>

            <div>
              <label className="block text-xs text-[#8C3F64] mb-1.5">Team / Submission Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Track team members, project idea, or submission checklist..."
                className="w-full px-3 py-2 text-sm bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] placeholder:text-[#B56D8D] focus:outline-none focus:border-pink-600"
              />
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="btn-3d-pink mt-2 px-3.5 py-1.5 text-xs font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg disabled:opacity-50"
              >
                {savingNotes ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
