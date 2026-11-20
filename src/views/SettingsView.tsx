import React, { useEffect, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { api } from '../api';
import type { PlatformStatus, Preferences, SourcePlatform } from '../types';

interface SettingsViewProps {
  onSynced: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onSynced }) => {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingPlatform, setSyncingPlatform] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [p, plat] = await Promise.all([api.getPreferences(), api.getPlatformStatuses()]);
      setPrefs(p);
      setPlatforms(plat.platforms);
    } catch (err: any) {
      setError(err?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSavePrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prefs) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.updatePreferences(prefs);
      setPrefs(updated);
      setMessage('Scheduler and notification settings saved.');
    } catch (err: any) {
      setError(err?.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncPlatform = async (platform?: SourcePlatform) => {
    setSyncingPlatform(platform || 'ALL');
    setError(null);
    try {
      const res = await api.discoverPlatforms(platform ? [platform] : undefined);
      setPlatforms(res.platforms);
      setMessage(
        `Sync completed: ${res.total_new} new, ${res.total_updated} updated listings.`
      );
      onSynced();
    } catch (err: any) {
      setError(err?.message || 'Sync error');
    } finally {
      setSyncingPlatform(null);
    }
  };

  if (loading || !prefs) {
    return (
      <div className="h-96 rounded-xl bg-white border border-pink-200 animate-pulse" />
    );
  }

  return (
    <div className="space-y-6">
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

      {/* Platform Discovery Sources & Status */}
      <section className="surface-3d rounded-xl overflow-hidden">
        <div className="p-5 border-b border-pink-100 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#4A0526]">
              Platform Connectors & Synchronization Health
            </h2>
            <p className="text-xs text-[#8C3F64] mt-0.5">
              Live public API and event feed connectors with retry and timeout handling.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleSyncPlatform()}
            disabled={syncingPlatform !== null}
            className="btn-3d-pink inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-pink-600 hover:bg-pink-700 disabled:opacity-50 rounded-lg"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingPlatform === 'ALL' ? 'animate-spin' : ''}`} />
            {syncingPlatform === 'ALL' ? 'Syncing All...' : 'Sync All Platforms'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-pink-50/70 text-[#8C3F64] border-b border-pink-100">
              <tr>
                <th className="py-3 px-5 font-semibold">Platform</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Stored</th>
                <th className="py-3 px-4 font-semibold text-right">Last Batch</th>
                <th className="py-3 px-4 font-semibold">Last Synced</th>
                <th className="py-3 px-5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pink-100">
              {platforms.map((p) => (
                <tr key={p.platform} className="hover:bg-pink-50/40">
                  <td className="py-3 px-5 font-semibold text-[#4A0526]">{p.platform}</td>
                  <td className="py-3 px-4">
                    <span
                      className={
                        p.status === 'success'
                          ? 'text-emerald-700 font-medium'
                          : p.status === 'error'
                          ? 'text-rose-700 font-medium'
                          : 'text-[#9D4E72]'
                      }
                    >
                      {p.status === 'success'
                        ? 'Healthy'
                        : p.status === 'error'
                        ? `Unavailable (${p.error_message || 'error'})`
                        : 'Pending'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#4A0526]">
                    {p.total_listings}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-[#8C3F64]">
                    {p.last_discovered_count} ({p.last_new_count} new)
                  </td>
                  <td className="py-3 px-4 font-mono text-[#8C3F64]">
                    {p.last_sync_at ? new Date(p.last_sync_at).toLocaleString() : 'Never'}
                  </td>
                  <td className="py-3 px-5 text-right">
                    <button
                      type="button"
                      onClick={() => handleSyncPlatform(p.platform)}
                      disabled={syncingPlatform !== null}
                      className="px-2.5 py-1 text-xs font-medium text-[#6B0F3B] bg-pink-50 hover:bg-pink-100 border border-pink-200 rounded-md disabled:opacity-50"
                    >
                      {syncingPlatform === p.platform ? 'Syncing...' : 'Sync'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Scheduler & Notification Preferences */}
      <form
        onSubmit={handleSavePrefs}
        className="surface-3d rounded-xl p-5 sm:p-6 space-y-5"
      >
        <div>
          <h2 className="text-base font-bold text-[#4A0526]">
            Scheduler & Notification Rules
          </h2>
          <p className="text-xs text-[#8C3F64] mt-0.5">
            Controls server-side periodic discovery and automated in-app deadline alerts.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <label className="flex items-center gap-2.5 p-3 bg-[#FFF7FA] border border-pink-200 rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.auto_sync_enabled}
              onChange={(e) => setPrefs({ ...prefs, auto_sync_enabled: e.target.checked })}
              className="rounded border-pink-300 text-pink-600"
            />
            <span className="text-[#4A0526] font-medium">Enable Automatic Periodic Sync</span>
          </label>

          <div className="p-3 bg-[#FFF7FA] border border-pink-200 rounded-lg">
            <label className="block text-[#8C3F64] mb-1">Sync Interval (minutes)</label>
            <input
              type="number"
              min={5}
              max={1440}
              value={prefs.sync_interval_minutes}
              onChange={(e) =>
                setPrefs({ ...prefs, sync_interval_minutes: Number(e.target.value) || 60 })
              }
              className="w-full px-2.5 py-1 bg-white border border-pink-200 rounded text-[#4A0526] font-mono"
            />
          </div>

          <div className="p-3 bg-[#FFF7FA] border border-pink-200 rounded-lg">
            <label className="block text-[#8C3F64] mb-1">
              Minimum Match Score Threshold (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={prefs.min_match_threshold}
              onChange={(e) =>
                setPrefs({ ...prefs, min_match_threshold: Number(e.target.value) || 55 })
              }
              className="w-full px-2.5 py-1 bg-white border border-pink-200 rounded text-[#4A0526] font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-2">
          {(
            [
              ['notify_new_discoveries', 'Alert on new platform discoveries'],
              ['notify_deadline_approaching', 'Alert on approaching deadlines'],
              ['notify_saved_changes', 'Alert on saved hackathon changes'],
              ['notify_new_recommendations', 'Alert on high-match opportunities'],
              ['default_reminder_7d', 'Default reminder: 7 days before'],
              ['default_reminder_3d', 'Default reminder: 3 days before'],
              ['default_reminder_24h', 'Default reminder: 24 hours before'],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 p-3 bg-[#FFF7FA] border border-pink-200 rounded-lg cursor-pointer"
            >
              <input
                type="checkbox"
                checked={Boolean(prefs[key])}
                onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })}
                className="rounded border-pink-300 text-pink-600"
              />
              <span className="text-[#4A0526]">{label}</span>
            </label>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-3d-pink inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-pink-600 hover:bg-pink-700 disabled:opacity-50 rounded-lg"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};
