import React, { useCallback, useEffect, useState } from 'react';
import { LocateFixed, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { api } from '../api';
import { HackathonCard } from '../components/HackathonCard';
import { NaturalLanguageSearch } from '../components/NaturalLanguageSearch';
import type { Hackathon, NLSearchFilters, PlatformStatus, SourcePlatform } from '../types';

interface DiscoverViewProps {
  onSelectHackathon: (h: Hackathon) => void;
  onToggleSave: (h: Hackathon) => void;
  refreshTrigger: number;
}

const PLATFORMS: Array<SourcePlatform | ''> = [
  '',
  'Devpost',
  'Unstop',
  'Devfolio',
  'HackerEarth',
  'MLH',
  'Hack2Skill',
];

const DOMAINS = [
  '',
  'AI/ML',
  'Web Development',
  'Cybersecurity',
  'Web3 / Blockchain',
  'FinTech',
  'HealthTech',
  'Hardware & IoT',
  'Sustainability',
  'Open Innovation',
];

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  onSelectHackathon,
  onToggleSave,
  refreshTrigger,
}) => {
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [keyword, setKeyword] = useState('');
  const [format, setFormat] = useState<'' | 'online' | 'offline' | 'hybrid'>('');
  const [platform, setPlatform] = useState<string>('');
  const [domain, setDomain] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [city, setCity] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [sort, setSort] = useState<'match' | 'deadline' | 'newest' | 'distance'>('match');
  const [radiusKm, setRadiusKm] = useState<number>(0);

  // Explicit Geolocation State
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoLabel, setGeoLabel] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  // NL Search override state
  const [nlActive, setNlActive] = useState(false);
  const [nlSummary, setNlSummary] = useState<string | null>(null);

  const loadHackathons = useCallback(async () => {
    if (nlActive) return;
    setLoading(true);
    setError(null);
    try {
      const [hackRes, platRes] = await Promise.all([
        api.getHackathons({
          q: keyword,
          format,
          platform,
          domain,
          status,
          city,
          state: stateFilter,
          sort,
          lat: userCoords?.lat,
          lng: userCoords?.lng,
          radius_km: userCoords && radiusKm > 0 ? radiusKm : undefined,
        }),
        api.getPlatformStatuses(),
      ]);
      setHackathons(hackRes.hackathons);
      setPlatforms(platRes.platforms);
      setLastSyncAt(platRes.last_successful_sync);
    } catch (err: any) {
      setError(err?.message || 'Failed to load hackathons');
    } finally {
      setLoading(false);
    }
  }, [
    nlActive,
    keyword,
    format,
    platform,
    domain,
    status,
    city,
    stateFilter,
    sort,
    userCoords,
    radiusKm,
  ]);

  useEffect(() => {
    loadHackathons();
  }, [loadHackathons, refreshTrigger]);

  const handleSyncAll = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await api.discoverPlatforms();
      setPlatforms(res.platforms);
      setLastSyncAt(res.synced_at);
      setNlActive(false);
      await loadHackathons();
    } catch (err: any) {
      setError(err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleRequestLocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('Browser geolocation is unavailable. Enter a city or state manually.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoLabel(
          `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`
        );
        setSort('distance');
      },
      (err) => {
        setGeoError(
          err.code === 1
            ? 'Location permission denied. Use City or State filters instead.'
            : 'Unable to determine coordinates. Use City or State filters.'
        );
      },
      { timeout: 8000 }
    );
  };

  const handleNLResults = (
    results: Hackathon[],
    filters: NLSearchFilters,
    rawQuery: string
  ) => {
    setNlActive(true);
    setNlSummary(`AI Search for "${rawQuery}" — ${results.length} matches found`);
    setHackathons(results);
    if (filters.city) setCity(filters.city);
    if (filters.format) setFormat(filters.format);
  };

  const handleClearNL = () => {
    setNlActive(false);
    setNlSummary(null);
    setCity('');
    setFormat('');
  };

  return (
    <div className="space-y-6">
      {/* NL & Voice Search */}
      <NaturalLanguageSearch
        userCoords={userCoords}
        onResults={handleNLResults}
        onClear={handleClearNL}
      />

      {/* Platform Sync Health Strip */}
      <section className="surface-3d-dark rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-white">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="text-pink-100 font-medium">
              Last Sync:{' '}
              <span className="font-mono text-white">
                {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : 'Not yet synced'}
              </span>
            </span>
            {platforms.map((p) => (
              <span key={p.platform} className="text-pink-200 whitespace-nowrap">
                {p.platform}:{' '}
                <span
                  className={`font-mono tabular-nums font-semibold ${
                    p.status === 'error'
                      ? 'text-rose-200'
                      : p.status === 'success'
                      ? 'text-white'
                      : 'text-pink-300'
                  }`}
                >
                  {p.total_listings}
                </span>
              </span>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSyncAll}
          disabled={syncing}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-[#6B0F3B] bg-white hover:bg-pink-50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-md"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing 6 Platforms...' : 'Sync Platforms Now'}
        </button>
      </section>

      {/* Filter Toolbar */}
      <section className="surface-3d rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#4A0526]">
            <SlidersHorizontal className="w-3.5 h-3.5 text-pink-600" />
            Discovery & Location Filters
          </div>

          {/* Segmented Format Filter */}
          <div className="flex items-center gap-1 p-1 bg-pink-50 border border-pink-200 rounded-lg">
            {(['', 'online', 'offline', 'hybrid'] as const).map((fmt) => (
              <button
                key={fmt || 'all'}
                type="button"
                onClick={() => {
                  setNlActive(false);
                  setFormat(fmt);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  format === fmt
                    ? 'bg-pink-600 text-white shadow-xs'
                    : 'text-[#6B0F3B] hover:bg-pink-100'
                }`}
              >
                {fmt === '' ? 'All Formats' : fmt.charAt(0).toUpperCase() + fmt.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <input
            type="text"
            value={keyword}
            onChange={(e) => {
              setNlActive(false);
              setKeyword(e.target.value);
            }}
            placeholder="Keyword (title, skill, org)..."
            aria-label="Filter by keyword"
            className="px-3 py-2 text-xs bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] placeholder:text-[#B56D8D] focus:outline-none focus:border-pink-600"
          />

          <input
            type="text"
            value={city}
            onChange={(e) => {
              setNlActive(false);
              setCity(e.target.value);
            }}
            placeholder="City (e.g. Bengaluru, London)"
            aria-label="Filter by city"
            className="px-3 py-2 text-xs bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] placeholder:text-[#B56D8D] focus:outline-none focus:border-pink-600"
          />

          <input
            type="text"
            value={stateFilter}
            onChange={(e) => {
              setNlActive(false);
              setStateFilter(e.target.value);
            }}
            placeholder="State / Country (e.g. Karnataka)"
            aria-label="Filter by state or country"
            className="px-3 py-2 text-xs bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] placeholder:text-[#B56D8D] focus:outline-none focus:border-pink-600"
          />

          <select
            value={domain}
            onChange={(e) => {
              setNlActive(false);
              setDomain(e.target.value);
            }}
            aria-label="Filter by domain"
            className="px-3 py-2 text-xs bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] focus:outline-none focus:border-pink-600"
          >
            {DOMAINS.map((d) => (
              <option key={d || 'all'} value={d}>
                {d || 'All Domains'}
              </option>
            ))}
          </select>

          <select
            value={platform}
            onChange={(e) => {
              setNlActive(false);
              setPlatform(e.target.value);
            }}
            aria-label="Filter by source platform"
            className="px-3 py-2 text-xs bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] focus:outline-none focus:border-pink-600"
          >
            {PLATFORMS.map((p) => (
              <option key={p || 'all'} value={p}>
                {p || 'All Platforms'}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => {
              setNlActive(false);
              setStatus(e.target.value);
            }}
            aria-label="Filter by registration status"
            className="px-3 py-2 text-xs bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] focus:outline-none focus:border-pink-600"
          >
            <option value="">All Statuses</option>
            <option value="open">Open Registration</option>
            <option value="upcoming">Upcoming</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        {/* Geolocation & Sort Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-pink-100 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleRequestLocation}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-pink-50 hover:bg-pink-100 text-[#6B0F3B] border border-pink-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <LocateFixed className="w-3.5 h-3.5 text-pink-600" />
              {userCoords ? `Near (${geoLabel})` : 'Use My Location'}
            </button>

            {userCoords && (
              <>
                <select
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  aria-label="Distance radius filter"
                  className="px-2.5 py-1.5 bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526]"
                >
                  <option value={0}>Any distance</option>
                  <option value={50}>Within 50 km</option>
                  <option value={150}>Within 150 km</option>
                  <option value={500}>Within 500 km</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setUserCoords(null);
                    setGeoLabel(null);
                    setRadiusKm(0);
                    if (sort === 'distance') setSort('match');
                  }}
                  className="text-[#8C3F64] hover:text-[#4A0526]"
                >
                  Clear location
                </button>
              </>
            )}

            {geoError && <span className="text-amber-700">{geoError}</span>}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#9D4E72]">Sort by:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              aria-label="Sort hackathons"
              className="px-2.5 py-1.5 bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526]"
            >
              <option value="match">Compatibility Score</option>
              <option value="deadline">Soonest Deadline</option>
              <option value="newest">Newly Discovered</option>
              {userCoords && <option value="distance">Nearest Distance</option>}
            </select>
          </div>
        </div>
      </section>

      {nlSummary && (
        <div className="flex items-center justify-between bg-[#6B0F3B] text-white rounded-lg px-4 py-2.5 text-xs shadow-md">
          <span>{nlSummary}</span>
          <button
            type="button"
            onClick={handleClearNL}
            className="text-pink-200 hover:text-white underline"
          >
            Reset to standard filters
          </button>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Results Count */}
      <div className="flex items-center justify-between text-xs text-[#8C3F64]">
        <span>
          Showing <strong className="font-mono text-[#4A0526]">{hackathons.length}</strong>{' '}
          verified hackathon listings
        </span>
      </div>

      {/* Results Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-64 rounded-xl bg-white border border-pink-200 animate-pulse"
            />
          ))}
        </div>
      ) : hackathons.length === 0 ? (
        <div className="surface-3d rounded-xl p-10 text-center space-y-3">
          <p className="text-sm text-[#5E2440]">
            No hackathons matched your current filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setKeyword('');
              setFormat('');
              setPlatform('');
              setDomain('');
              setStatus('');
              setCity('');
              setStateFilter('');
              setRadiusKm(0);
              setNlActive(false);
              setNlSummary(null);
            }}
            className="btn-3d-pink px-4 py-2 text-xs font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {hackathons.map((h) => (
            <HackathonCard
              key={h.id}
              hackathon={h}
              onSelect={onSelectHackathon}
              onToggleSave={onToggleSave}
            />
          ))}
        </div>
      )}
    </div>
  );
};
