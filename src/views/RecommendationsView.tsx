import React, { useCallback, useEffect, useState } from 'react';
import { Bookmark, Check, ExternalLink, Sparkles } from 'lucide-react';
import { api } from '../api';
import { formatShortDate, getDeadlineText } from '../components/HackathonCard';
import type { Hackathon, MatchingWeights, UserProfile } from '../types';

interface RecommendationsViewProps {
  onSelectHackathon: (h: Hackathon) => void;
  onToggleSave: (h: Hackathon) => void;
  refreshTrigger: number;
}

export const RecommendationsView: React.FC<RecommendationsViewProps> = ({
  onSelectHackathon,
  onToggleSave,
  refreshTrigger,
}) => {
  const [items, setItems] = useState<Hackathon[]>([]);
  const [weights, setWeights] = useState<MatchingWeights | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getRecommendations();
      setItems(res.recommendations);
      setWeights(res.weights);
      setProfile(res.profile);
    } catch (err: any) {
      setError(err?.message || 'Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

  const handleRunGemini = async () => {
    setAnalyzing(true);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await api.analyzeWithGemini();
      setItems(res.recommendations);
      setStatusMsg(
        `Gemini (${res.model}) generated tailored matching rationales and prep checklists for top ${res.analyzed_count} hackathons.`
      );
    } catch (err: any) {
      setError(err?.message || 'Gemini AI analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Gemini Analysis Trigger */}
      <section className="surface-3d-dark rounded-xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-white">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-white">
            Transparent Compatibility Engine + Gemini AI Advisor
          </h2>
          <p className="text-xs text-pink-100/85 max-w-3xl leading-relaxed">
            Every compatibility percentage is calculated transparently from your skills (
            {profile?.skills.slice(0, 4).join(', ') || 'configured in preferences'}), domains,
            format, eligibility, and active weights. Run Gemini AI to generate customized
            preparation plans for your top opportunities.
          </p>
          {weights && (
            <p className="text-[11px] font-mono text-pink-200 pt-1">
              Active Weights: Skill {Math.round(weights.skill_compatibility * 100)}% · Domain{' '}
              {Math.round(weights.domain_interest * 100)}% · Location{' '}
              {Math.round(weights.location_preference * 100)}% · Eligibility{' '}
              {Math.round(weights.eligibility * 100)}% · Experience{' '}
              {Math.round(weights.experience_level * 100)}% · Format{' '}
              {Math.round(weights.event_format * 100)}% · Deadline{' '}
              {Math.round(weights.deadline_suitability * 100)}%
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleRunGemini}
          disabled={analyzing || items.length === 0}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#6B0F3B] bg-white hover:bg-pink-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-md"
        >
          <Sparkles className="w-4 h-4 text-pink-600" />
          {analyzing ? 'Analyzing with Gemini...' : 'Analyze Top Matches with Gemini AI'}
        </button>
      </section>

      {statusMsg && (
        <div className="bg-pink-50 border border-pink-300 rounded-xl px-4 py-3 text-xs text-[#6B0F3B] font-medium">
          {statusMsg}
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl px-4 py-3 text-xs text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-52 rounded-xl bg-white border border-pink-200 animate-pulse"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="surface-3d rounded-xl p-10 text-center text-sm text-[#8C3F64]">
          Sync platforms in Discover Hackathons to generate personalized recommendations.
        </div>
      ) : (
        <div className="space-y-4">
          {items.slice(0, 15).map((h) => {
            const rec = h.recommendation;
            const dl = getDeadlineText(h);
            return (
              <article
                key={h.id}
                className="surface-3d surface-3d-hover rounded-xl p-5 sm:p-6 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#8C3F64] mb-1.5">
                      <span className="text-pink-700 font-semibold">{h.source_platform}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{h.format}</span>
                      <span aria-hidden="true">·</span>
                      <span>{h.location}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-amber-700 font-semibold">{dl.label}</span>
                      {rec?.ai_enhanced && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#831843] font-semibold">Gemini AI Analyzed</span>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectHackathon(h)}
                      className="text-left"
                    >
                      <h3 className="text-lg font-bold text-[#4A0526] hover:text-pink-700 transition-colors">
                        {h.title}
                      </h3>
                    </button>
                    <p className="text-xs text-[#7E3458] mt-0.5">
                      {h.organizer} · Prize: {h.prize_pool} · Deadline:{' '}
                      {formatShortDate(h.registration_deadline)}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <span className="font-mono tabular-nums text-2xl font-bold text-pink-700">
                        {Math.round(h.compatibility_score ?? 0)}%
                      </span>
                      <span className="block text-[11px] text-[#9D4E72]">
                        Compatibility
                      </span>
                    </div>
                  </div>
                </div>

                {rec && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pt-4 border-t border-pink-100 text-sm">
                    <div className="lg:col-span-2 space-y-3">
                      <div>
                        <span className="text-xs font-medium text-[#9D4E72] block mb-1">
                          Why This Matches Your Profile
                        </span>
                        <p className="text-[#5E2440] leading-relaxed">{rec.why_matches}</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                        <div>
                          <span className="text-[#9D4E72] block mb-0.5">Relevant Skills</span>
                          <span className="text-[#4A0526] font-medium">
                            {rec.relevant_skills.length > 0
                              ? rec.relevant_skills.join(' · ')
                              : 'General software skills'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#9D4E72] block mb-0.5">Eligibility Fit</span>
                          <span className="text-[#4A0526]">{rec.eligibility_assessment}</span>
                        </div>
                      </div>

                      <div className="text-xs">
                        <span className="text-[#9D4E72] block mb-0.5">Important Deadlines</span>
                        <span className="text-[#5E2440]">{rec.important_deadlines}</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <span className="font-medium text-[#8C3F64] block">
                        Recommended Preparation
                      </span>
                      <ul className="space-y-1.5 text-[#5E2440]">
                        {rec.preparation_checklist.map((step, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <Check className="w-3.5 h-3.5 text-pink-600 shrink-0 mt-0.5" />
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-pink-100">
                  <button
                    type="button"
                    onClick={() => onSelectHackathon(h)}
                    className="text-xs font-semibold text-pink-700 hover:text-[#4A0526]"
                  >
                    Inspect Full Score Breakdown →
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleSave(h)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        h.is_saved
                          ? 'bg-[#6B0F3B] text-white'
                          : 'bg-pink-50 text-[#6B0F3B] border border-pink-200 hover:bg-pink-100'
                      }`}
                    >
                      <Bookmark
                        className="w-3.5 h-3.5"
                        fill={h.is_saved ? 'currentColor' : 'none'}
                      />
                      {h.is_saved ? 'Saved' : 'Save'}
                    </button>
                    <a
                      href={h.registration_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-3d-pink inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
                    >
                      Register
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
