import React from 'react';
import { Bookmark, ExternalLink } from 'lucide-react';
import type { Hackathon } from '../types';

interface HackathonCardProps {
  hackathon: Hackathon;
  onSelect: (hackathon: Hackathon) => void;
  onToggleSave: (hackathon: Hackathon) => void;
  compact?: boolean;
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return 'TBA';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'TBA';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getDeadlineText(hackathon: Hackathon): {
  label: string;
  tone: 'open' | 'soon' | 'expired';
} {
  if (hackathon.registration_status === 'expired') {
    return { label: 'Expired', tone: 'expired' };
  }
  if (!hackathon.registration_deadline) {
    return {
      label: hackathon.registration_status === 'upcoming' ? 'Upcoming' : 'Open',
      tone: 'open',
    };
  }
  const ms = new Date(hackathon.registration_deadline).getTime() - Date.now();
  if (isNaN(ms)) return { label: 'Open', tone: 'open' };
  if (ms <= 0) return { label: 'Expired', tone: 'expired' };

  const hours = ms / (1000 * 60 * 60);
  if (hours <= 24) {
    return { label: `Closes in ${Math.max(1, Math.round(hours))}h`, tone: 'soon' };
  }
  const days = Math.ceil(hours / 24);
  if (days <= 7) {
    return { label: `${days}d left`, tone: 'soon' };
  }
  return { label: `${days}d left`, tone: 'open' };
}

export const HackathonCard: React.FC<HackathonCardProps> = ({
  hackathon,
  onSelect,
  onToggleSave,
  compact = false,
}) => {
  const dl = getDeadlineText(hackathon);
  const statusColor =
    dl.tone === 'expired'
      ? 'text-rose-700'
      : dl.tone === 'soon'
      ? 'text-amber-700'
      : 'text-emerald-700';

  const teamLabel =
    hackathon.team_size_min && hackathon.team_size_max
      ? hackathon.team_size_min === hackathon.team_size_max
        ? `${hackathon.team_size_min} member`
        : `${hackathon.team_size_min}–${hackathon.team_size_max} members`
      : hackathon.team_size_min
      ? `${hackathon.team_size_min}+ members`
      : 'Flexible team';

  const dateWindow =
    hackathon.start_date || hackathon.end_date
      ? `${formatShortDate(hackathon.start_date)} – ${formatShortDate(hackathon.end_date)}`
      : 'Dates on official page';

  return (
    <article className="group surface-3d surface-3d-hover rounded-xl p-5 flex flex-col justify-between">
      <div>
        {/* Unboxed 1-line metadata kicker (Zero-pill discipline) */}
        <div className="flex items-center justify-between gap-3 text-xs text-[#8C3F64] mb-2.5">
          <div className="flex items-center gap-2 min-w-0 truncate">
            <span className="font-semibold text-pink-700 whitespace-nowrap shrink-0">
              {hackathon.source_platform}
            </span>
            <span aria-hidden="true">·</span>
            <span className="capitalize whitespace-nowrap shrink-0">{hackathon.format}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{hackathon.category}</span>
          </div>
          <span className={`font-mono tabular-nums font-semibold whitespace-nowrap shrink-0 ${statusColor}`}>
            {dl.label}
          </span>
        </div>

        {/* Title & Organizer */}
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => onSelect(hackathon)}
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-600 rounded"
          >
            <h3 className="text-base font-semibold text-[#4A0526] group-hover:text-pink-700 transition-colors leading-snug line-clamp-2">
              {hackathon.title}
            </h3>
          </button>
          {hackathon.compatibility_score != null && (
            <div className="text-right shrink-0">
              <span className="font-mono tabular-nums text-sm font-bold text-[#831843]">
                {Math.round(hackathon.compatibility_score)}%
              </span>
              <span className="block text-[11px] text-[#9D4E72]">Match</span>
            </div>
          )}
        </div>

        <p className="text-xs text-[#7E3458] mt-1 truncate">
          {hackathon.organizer}
          <span className="mx-1.5 text-pink-300" aria-hidden="true">
            ·
          </span>
          {hackathon.location}
          {hackathon.distance_km != null && hackathon.format !== 'online' && (
            <span className="font-mono tabular-nums text-[#831843]">
              {' '}
              ({hackathon.distance_km} km)
            </span>
          )}
        </p>

        {!compact && (
          <p className="text-sm text-[#5E2440] mt-3 line-clamp-2 leading-relaxed">
            {hackathon.description}
          </p>
        )}

        {/* Structured Details Grid */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 pt-3.5 border-t border-pink-100 text-xs">
          <div>
            <dt className="text-[#9D4E72]">Deadline</dt>
            <dd className="text-[#4A0526] font-mono tabular-nums font-medium mt-0.5 truncate">
              {formatShortDate(hackathon.registration_deadline)}
            </dd>
          </div>
          <div>
            <dt className="text-[#9D4E72]">Prize Pool</dt>
            <dd className="text-[#4A0526] font-mono tabular-nums font-medium mt-0.5 truncate">
              {hackathon.prize_pool}
            </dd>
          </div>
          {!compact && (
            <>
              <div>
                <dt className="text-[#9D4E72]">Event Window</dt>
                <dd className="text-[#5E2440] font-mono tabular-nums mt-0.5 truncate">
                  {dateWindow}
                </dd>
              </div>
              <div>
                <dt className="text-[#9D4E72]">Team Size</dt>
                <dd className="text-[#5E2440] mt-0.5 truncate">{teamLabel}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[#9D4E72]">Eligibility</dt>
                <dd className="text-[#5E2440] mt-0.5 truncate">{hackathon.eligibility}</dd>
              </div>
            </>
          )}
        </dl>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 mt-4 pt-3.5 border-t border-pink-100">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelect(hackathon)}
            className="px-3 py-1.5 text-xs font-medium text-[#6B0F3B] bg-pink-50 hover:bg-pink-100 border border-pink-200 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-600"
          >
            Inspect Match
          </button>
          <button
            type="button"
            onClick={() => onToggleSave(hackathon)}
            aria-label={hackathon.is_saved ? 'Remove from saved' : 'Save hackathon'}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-600 ${
              hackathon.is_saved
                ? 'bg-[#6B0F3B] text-white border border-[#6B0F3B]'
                : 'text-[#6B0F3B] bg-white hover:bg-pink-50 border border-pink-200'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" fill={hackathon.is_saved ? 'currentColor' : 'none'} />
            {hackathon.is_saved ? 'Saved' : 'Save'}
          </button>
        </div>

        <a
          href={hackathon.registration_url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-3d-pink inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          Apply
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </article>
  );
};
