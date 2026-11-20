import React, { useEffect, useState } from 'react';
import { LocateFixed, Save } from 'lucide-react';
import { api } from '../api';
import type { MatchingWeights, UserProfile } from '../types';

interface PreferencesViewProps {
  onSaved: () => void;
}

export const PreferencesView: React.FC<PreferencesViewProps> = ({ onSaved }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [weights, setWeights] = useState<MatchingWeights | null>(null);

  const [skillsText, setSkillsText] = useState('');
  const [languagesText, setLanguagesText] = useState('');
  const [interestsText, setInterestsText] = useState('');
  const [domainsText, setDomainsText] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getProfile(), api.getMatchingWeights()])
      .then(([p, w]) => {
        setProfile(p);
        setWeights(w);
        setSkillsText(p.skills.join(', '));
        setLanguagesText(p.languages.join(', '));
        setInterestsText(p.interests.join(', '));
        setDomainsText(p.preferred_domains.join(', '));
      })
      .catch((err: any) => setError(err?.message || 'Failed to load preferences'))
      .finally(() => setLoading(false));
  }, []);

  const splitList = (txt: string) =>
    txt
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !weights) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updatedProfile = await api.updateProfile({
        ...profile,
        skills: splitList(skillsText),
        languages: splitList(languagesText),
        interests: splitList(interestsText),
        preferred_domains: splitList(domainsText),
      });
      const updatedWeights = await api.updateMatchingWeights(weights);
      setProfile(updatedProfile);
      setWeights(updatedWeights);
      setMessage('Profile and matching weights saved. Compatibility scores recomputed.');
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation || !profile) {
      setError('Browser geolocation is unavailable.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setProfile({
          ...profile,
          preferred_lat: pos.coords.latitude,
          preferred_lng: pos.coords.longitude,
          preferred_location: `${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`,
        });
      },
      () => setError('Location permission denied. Enter your city and state manually.')
    );
  };

  if (loading || !profile || !weights) {
    return (
      <div className="h-96 rounded-xl bg-white border border-pink-200 animate-pulse" />
    );
  }

  const weightEntries: Array<{ key: keyof MatchingWeights; label: string }> = [
    { key: 'skill_compatibility', label: 'Skill Compatibility' },
    { key: 'domain_interest', label: 'Domain Interest' },
    { key: 'location_preference', label: 'Location Preference' },
    { key: 'eligibility', label: 'Eligibility' },
    { key: 'experience_level', label: 'Experience Level' },
    { key: 'event_format', label: 'Event Format' },
    { key: 'deadline_suitability', label: 'Deadline Suitability' },
  ];

  const totalWeight = weightEntries.reduce((sum, item) => sum + Number(weights[item.key]), 0);

  return (
    <form onSubmit={handleSaveAll} className="space-y-6">
      {message && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl px-4 py-3 text-xs text-emerald-800">
          {message}
        </div>
      )}
      {error && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl px-4 py-3 text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* User Technical Profile */}
      <section className="surface-3d rounded-xl p-5 sm:p-6 space-y-5">
        <div>
          <h2 className="text-base font-bold text-[#4A0526]">
            Developer & Innovation Profile
          </h2>
          <p className="text-xs text-[#8C3F64] mt-0.5">
            Used by Gemini AI and the weighted scoring engine to match hackathons.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <label className="block text-xs text-[#8C3F64] mb-1.5">Display Name</label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="w-full px-3 py-2 bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] focus:outline-none focus:border-pink-600"
            />
          </div>

          <div>
            <label className="block text-xs text-[#8C3F64] mb-1.5">Experience Level</label>
            <select
              value={profile.experience_level}
              onChange={(e) =>
                setProfile({ ...profile, experience_level: e.target.value as any })
              }
              className="w-full px-3 py-2 bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] focus:outline-none focus:border-pink-600"
            >
              <option value="beginner">Beginner (Student / First Hackathons)</option>
              <option value="intermediate">Intermediate (Builder / Regular Competitor)</option>
              <option value="advanced">Advanced (Senior / Production Specialist)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#8C3F64] mb-1.5">
              Technical Skills (comma-separated)
            </label>
            <input
              type="text"
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              placeholder="Machine Learning, Full-Stack Web, REST APIs, Generative AI"
              className="w-full px-3 py-2 bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] focus:outline-none focus:border-pink-600"
            />
          </div>

          <div>
            <label className="block text-xs text-[#8C3F64] mb-1.5">
              Programming Languages (comma-separated)
            </label>
            <input
              type="text"
              value={languagesText}
              onChange={(e) => setLanguagesText(e.target.value)}
              placeholder="Python, TypeScript, JavaScript, SQL"
              className="w-full px-3 py-2 bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] focus:outline-none focus:border-pink-600"
            />
          </div>

          <div>
            <label className="block text-xs text-[#8C3F64] mb-1.5">
              Preferred Domains (comma-separated)
            </label>
            <input
              type="text"
              value={domainsText}
              onChange={(e) => setDomainsText(e.target.value)}
              placeholder="AI/ML, Web Development, Cybersecurity"
              className="w-full px-3 py-2 bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] focus:outline-none focus:border-pink-600"
            />
          </div>

          <div>
            <label className="block text-xs text-[#8C3F64] mb-1.5">
              Interests (comma-separated)
            </label>
            <input
              type="text"
              value={interestsText}
              onChange={(e) => setInterestsText(e.target.value)}
              placeholder="AI Agents, FinTech, Developer Tools"
              className="w-full px-3 py-2 bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] focus:outline-none focus:border-pink-600"
            />
          </div>

          <div>
            <label className="block text-xs text-[#8C3F64] mb-1.5">
              Preferred City (optional)
            </label>
            <input
              type="text"
              value={profile.preferred_city}
              onChange={(e) => setProfile({ ...profile, preferred_city: e.target.value })}
              placeholder="e.g. Bengaluru"
              className="w-full px-3 py-2 bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] focus:outline-none focus:border-pink-600"
            />
          </div>

          <div>
            <label className="block text-xs text-[#8C3F64] mb-1.5">
              Preferred State / Region (optional)
            </label>
            <input
              type="text"
              value={profile.preferred_state}
              onChange={(e) => setProfile({ ...profile, preferred_state: e.target.value })}
              placeholder="e.g. Karnataka"
              className="w-full px-3 py-2 bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] focus:outline-none focus:border-pink-600"
            />
          </div>

          <div>
            <label className="block text-xs text-[#8C3F64] mb-1.5">Team Size Preference</label>
            <select
              value={profile.team_size_preference}
              onChange={(e) =>
                setProfile({ ...profile, team_size_preference: e.target.value as any })
              }
              className="w-full px-3 py-2 bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] focus:outline-none focus:border-pink-600"
            >
              <option value="any">Any Team Size</option>
              <option value="solo">Solo / Individual</option>
              <option value="2-4">Team (2–4 Members)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#8C3F64] mb-1.5">Event Format Preference</label>
            <select
              value={profile.format_preference}
              onChange={(e) =>
                setProfile({ ...profile, format_preference: e.target.value as any })
              }
              className="w-full px-3 py-2 bg-[#FFF7FA] border border-pink-200 rounded-lg text-[#4A0526] focus:outline-none focus:border-pink-600"
            >
              <option value="any">Any Format (Online / Offline / Hybrid)</option>
              <option value="online">Online Only</option>
              <option value="offline">In-Person / Offline</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-pink-50 hover:bg-pink-100 text-[#6B0F3B] border border-pink-200 rounded-lg"
          >
            <LocateFixed className="w-3.5 h-3.5 text-pink-600" />
            Set Coordinates via Browser Geolocation
          </button>
          {profile.preferred_lat != null && (
            <span className="font-mono text-[#8C3F64]">
              Saved coordinates: {profile.preferred_lat.toFixed(3)},{' '}
              {profile.preferred_lng?.toFixed(3)}
            </span>
          )}
        </div>
      </section>

      {/* Configurable Matching Weights */}
      <section className="surface-3d rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#4A0526]">
              Matching Engine Weights
            </h2>
            <p className="text-xs text-[#8C3F64] mt-0.5">
              Customize how strongly each criterion influences compatibility scores.
            </p>
          </div>
          <span className="font-mono tabular-nums text-xs text-[#6B0F3B] font-semibold">
            Sum: {(totalWeight * 100).toFixed(0)}% (normalized automatically)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {weightEntries.map((item) => {
            const val = Number(weights[item.key]);
            return (
              <div key={item.key} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <label htmlFor={`w-${item.key}`} className="text-[#4A0526] font-medium">
                    {item.label}
                  </label>
                  <span className="font-mono tabular-nums text-pink-700 font-semibold">
                    {Math.round(val * 100)}%
                  </span>
                </div>
                <input
                  id={`w-${item.key}`}
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={val}
                  onChange={(e) =>
                    setWeights({ ...weights, [item.key]: parseFloat(e.target.value) })
                  }
                  className="w-full accent-pink-600"
                />
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="btn-3d-pink inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-pink-600 hover:bg-pink-700 disabled:opacity-50 rounded-lg"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving & Recomputing Scores...' : 'Save Preferences & Recompute'}
        </button>
      </div>
    </form>
  );
};
