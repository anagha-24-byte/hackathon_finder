import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Search, Sparkles, X } from 'lucide-react';
import { api } from '../api';
import type { Hackathon, NLSearchFilters } from '../types';

interface NaturalLanguageSearchProps {
  userCoords: { lat: number; lng: number } | null;
  onResults: (
    hackathons: Hackathon[],
    filters: NLSearchFilters,
    rawQuery: string
  ) => void;
  onClear: () => void;
}

const EXAMPLE_QUERIES = [
  'Find AI hackathons in Bengaluru',
  'Show hackathons with prizes above ₹50,000',
  'Find online hackathons for beginners',
  'Show hackathons closing registration this week',
  'Find hackathons where I can participate individually',
];

export const NaturalLanguageSearch: React.FC<NaturalLanguageSearchProps> = ({
  userCoords,
  onResults,
  onClear,
}) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechUnavailableMsg, setSpeechUnavailableMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interpreted, setInterpreted] = useState<NLSearchFilters | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const executeSearch = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchNL(
        trimmed,
        userCoords?.lat ?? null,
        userCoords?.lng ?? null
      );
      setInterpreted(res.filters);
      onResults(res.hackathons, res.filters, res.raw_query);
    } catch (err: any) {
      setError(err?.message || 'Unable to parse search query');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query);
  };

  const handleVoiceToggle = () => {
    setSpeechUnavailableMsg(null);
    setError(null);

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechUnavailableMsg(
        'Voice input is not supported in this browser. Please type or edit your search query directly.'
      );
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setListening(true);
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((r: any) => r[0]?.transcript || '')
          .join('');
        setQuery(transcript);
        if (event.results[0]?.isFinal) {
          setListening(false);
          executeSearch(transcript);
        }
      };
      recognition.onerror = (event: any) => {
        setListening(false);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setSpeechUnavailableMsg(
            'Microphone access was denied. Type your query directly in the search box.'
          );
        } else {
          setSpeechUnavailableMsg(
            `Voice capture unavailable (${event.error}). You can type or edit your query directly.`
          );
        }
      };
      recognition.onend = () => setListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setListening(false);
      setSpeechUnavailableMsg(
        'Could not initialize microphone. Please type your query directly.'
      );
    }
  };

  const handleClear = () => {
    setQuery('');
    setInterpreted(null);
    setError(null);
    onClear();
  };

  return (
    <section className="surface-3d rounded-xl p-4 sm:p-5 space-y-3">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#9D4E72] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Ask in natural language, e.g. "Find AI hackathons in Bengaluru"'
            aria-label="Natural language hackathon search"
            className="w-full pl-10 pr-9 py-2.5 text-sm bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] placeholder:text-[#B56D8D] focus:outline-none focus:border-pink-600"
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#9D4E72] hover:text-[#4A0526]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleVoiceToggle}
            aria-label={listening ? 'Stop voice search' : 'Start voice search'}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              listening
                ? 'bg-rose-600 text-white border-rose-700'
                : 'bg-pink-50 text-[#6B0F3B] hover:bg-pink-100 border-pink-200'
            }`}
          >
            {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            {listening ? 'Listening...' : 'Voice'}
          </button>

          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="btn-3d-pink inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-white bg-pink-600 hover:bg-pink-700 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {loading ? 'Interpreting...' : 'AI Search'}
          </button>
        </div>
      </form>

      {/* Quick Example Query Buttons */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-[#9D4E72] mr-1">Try:</span>
        {EXAMPLE_QUERIES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setQuery(ex);
              executeSearch(ex);
            }}
            className="px-2.5 py-1 text-[#6B0F3B] bg-pink-50 hover:bg-pink-100 border border-pink-200/70 rounded-md transition-colors whitespace-nowrap"
          >
            {ex}
          </button>
        ))}
      </div>

      {speechUnavailableMsg && (
        <p className="text-xs text-amber-700">{speechUnavailableMsg}</p>
      )}
      {error && <p className="text-xs text-rose-700">{error}</p>}

      {interpreted && (
        <div className="pt-2.5 border-t border-pink-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="text-[#5E2440]">
            <span className="text-[#831843] font-semibold mr-2">Interpreted Query:</span>
            {interpreted.interpretation_summary}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[#8C3F64] font-mono">
            {interpreted.domain && <span>Domain: {interpreted.domain}</span>}
            {interpreted.city && <span>City: {interpreted.city}</span>}
            {interpreted.format && <span>Format: {interpreted.format}</span>}
            {interpreted.min_prize_inr ? (
              <span>Min Prize: ₹{interpreted.min_prize_inr.toLocaleString('en-IN')}</span>
            ) : null}
            {interpreted.closing_within_days ? (
              <span>Closing ≤ {interpreted.closing_within_days}d</span>
            ) : null}
            {interpreted.solo_only && <span>Solo eligible</span>}
            {interpreted.beginner_friendly && <span>Beginner friendly</span>}
          </div>
        </div>
      )}
    </section>
  );
};
