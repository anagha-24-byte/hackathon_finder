import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  Bookmark,
  Clock,
  Compass,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Settings,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from './api';
import { HackathonDetailModal } from './components/HackathonDetailModal';
import { AnalyticsView } from './views/AnalyticsView';
import { DashboardView } from './views/DashboardView';
import { DeadlinesView } from './views/DeadlinesView';
import { DiscoverView } from './views/DiscoverView';
import { NotificationsView } from './views/NotificationsView';
import { PreferencesView } from './views/PreferencesView';
import { RecommendationsView } from './views/RecommendationsView';
import { SavedView } from './views/SavedView';
import { SettingsView } from './views/SettingsView';
import type { DashboardSummary, Hackathon } from './types';

type NavId =
  | 'dashboard'
  | 'discover'
  | 'recommendations'
  | 'saved'
  | 'deadlines'
  | 'notifications'
  | 'analytics'
  | 'preferences'
  | 'settings';

const NAV_ITEMS: Array<{ id: NavId; label: string; icon: React.ComponentType<any> }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'discover', label: 'Discover Hackathons', icon: Compass },
  { id: 'recommendations', label: 'AI Recommendations', icon: Sparkles },
  { id: 'saved', label: 'My Saved Hackathons', icon: Bookmark },
  { id: 'deadlines', label: 'Deadline Tracker', icon: Clock },
  { id: 'notifications', label: 'Notification Center', icon: Bell },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'preferences', label: 'User Preferences', icon: Sliders },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<NavId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [selectedHackathon, setSelectedHackathon] = useState<Hackathon | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);

  const showToast = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    setToast({ text, tone });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  }, []);

  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const res = await api.getDashboard();
      setDashboard(res);
      setUnreadCount(res.unread_notifications_count);
    } catch (err: any) {
      showToast(err?.message || 'Failed to load dashboard', 'error');
    } finally {
      setDashLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard, refreshTrigger]);

  const handleGlobalSync = async () => {
    setSyncing(true);
    try {
      const res = await api.discoverPlatforms();
      setRefreshTrigger((n) => n + 1);
      showToast(`Synced 6 platforms: ${res.total_new} new, ${res.total_updated} updated.`);
    } catch (err: any) {
      showToast(err?.message || 'Platform sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleSelectHackathon = async (h: Hackathon) => {
    setSelectedHackathon(h);
    try {
      await api.recordView(h.id);
      setRefreshTrigger((n) => n + 1);
    } catch {
      // non-blocking
    }
  };

  const handleInspectById = async (id: string) => {
    try {
      const res = await fetch(`/api/hackathons/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error('Hackathon record not found');
      const h = (await res.json()) as Hackathon;
      await handleSelectHackathon(h);
    } catch (err: any) {
      showToast(err?.message || 'Unable to open hackathon', 'error');
    }
  };

  const handleToggleSave = async (h: Hackathon) => {
    try {
      if (h.is_saved) {
        await api.unsaveHackathon(h.id);
        showToast(`Removed "${h.title}" from saved tracker.`);
      } else {
        await api.saveHackathon(h.id);
        showToast(`Saved "${h.title}" with automated deadline reminders.`);
      }
      if (selectedHackathon?.id === h.id) {
        const res = await fetch(`/api/hackathons/${encodeURIComponent(h.id)}`);
        if (res.ok) setSelectedHackathon(await res.json());
      }
      setRefreshTrigger((n) => n + 1);
    } catch (err: any) {
      showToast(err?.message || 'Unable to update saved state', 'error');
    }
  };

  const handleUpdateSaved = async (
    id: string,
    payload: {
      notes?: string;
      reminder_7d?: boolean;
      reminder_3d?: boolean;
      reminder_24h?: boolean;
      custom_reminder_hours?: number | null;
    }
  ) => {
    try {
      await api.updateSavedSettings(id, payload);
      if (selectedHackathon?.id === id) {
        const res = await fetch(`/api/hackathons/${encodeURIComponent(id)}`);
        if (res.ok) setSelectedHackathon(await res.json());
      }
      setRefreshTrigger((n) => n + 1);
      showToast('Tracker settings updated.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to save tracker settings', 'error');
    }
  };

  const handleAnalyzeSingle = async (id: string) => {
    try {
      await api.analyzeWithGemini([id]);
      const res = await fetch(`/api/hackathons/${encodeURIComponent(id)}`);
      if (res.ok) setSelectedHackathon(await res.json());
      setRefreshTrigger((n) => n + 1);
      showToast('Gemini AI analysis completed.');
    } catch (err: any) {
      showToast(err?.message || 'Gemini AI analysis failed', 'error');
    }
  };

  const activeNav = NAV_ITEMS.find((n) => n.id === activeTab)!;

  return (
    <div className="min-h-screen bg-[#FFF5F8] text-[#4A0526] flex">
      {/* Desktop Sidebar (Dark Pink with Crisp White Text) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-gradient-to-b from-[#6B0F3B] to-[#4A0526] border-r border-pink-900/40 shadow-xl">
        <div className="h-16 px-6 flex items-center border-b border-pink-300/15">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            HackMate <span className="text-pink-300">AI</span>
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-[#6B0F3B] shadow-md font-semibold'
                    : 'text-pink-100/85 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.id === 'notifications' && unreadCount > 0 && (
                  <span
                    className={`font-mono tabular-nums text-xs shrink-0 ${
                      isActive ? 'text-pink-700 font-bold' : 'text-pink-200'
                    }`}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-pink-300/15 text-xs text-pink-200/80">
          <span>Last Sync</span>
          <p className="font-mono text-white mt-0.5 truncate">
            {dashboard?.last_sync_at
              ? new Date(dashboard.last_sync_at).toLocaleTimeString()
              : 'Pending'}
          </p>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#4A0526]/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-gradient-to-b from-[#6B0F3B] to-[#4A0526] border-r border-pink-900/40 flex flex-col h-full z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-pink-300/15">
              <span className="text-lg font-bold text-white">
                HackMate <span className="text-pink-300">AI</span>
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-1.5 text-pink-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-white text-[#6B0F3B] font-semibold'
                        : 'text-pink-100/85 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </span>
                    {item.id === 'notifications' && unreadCount > 0 && (
                      <span className="font-mono text-xs">{unreadCount}</span>
                    )}
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Clean 3-Zone Top Bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-pink-200/80 px-4 sm:px-8 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 text-[#6B0F3B] hover:bg-pink-50 rounded-lg shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-[#4A0526] truncate">
              {activeNav.label}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleGlobalSync}
              disabled={syncing}
              className="btn-3d-pink inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-pink-600 hover:bg-pink-700 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Platforms'}
            </button>
          </div>
        </header>

        {/* Viewport Container with 3D perspective */}
        <main
          className="flex-1 px-4 sm:px-8 py-6 max-w-[1400px] w-full mx-auto"
          style={{ perspective: '1400px' }}
        >
          {activeTab === 'dashboard' && (
            <DashboardView
              data={dashboard}
              loading={dashLoading}
              syncing={syncing}
              onSyncNow={handleGlobalSync}
              onNavigate={(tab) => setActiveTab(tab as NavId)}
              onSelectHackathon={handleSelectHackathon}
              onToggleSave={handleToggleSave}
            />
          )}

          {activeTab === 'discover' && (
            <DiscoverView
              onSelectHackathon={handleSelectHackathon}
              onToggleSave={handleToggleSave}
              refreshTrigger={refreshTrigger}
            />
          )}

          {activeTab === 'recommendations' && (
            <RecommendationsView
              onSelectHackathon={handleSelectHackathon}
              onToggleSave={handleToggleSave}
              refreshTrigger={refreshTrigger}
            />
          )}

          {activeTab === 'saved' && (
            <SavedView
              onSelectHackathon={handleSelectHackathon}
              onToggleSave={handleToggleSave}
              onNavigateDiscover={() => setActiveTab('discover')}
              refreshTrigger={refreshTrigger}
            />
          )}

          {activeTab === 'deadlines' && (
            <DeadlinesView
              onSelectHackathon={handleSelectHackathon}
              onToggleSave={handleToggleSave}
              refreshTrigger={refreshTrigger}
            />
          )}

          {activeTab === 'notifications' && (
            <NotificationsView
              onUnreadCountChange={setUnreadCount}
              onInspectHackathonId={handleInspectById}
              refreshTrigger={refreshTrigger}
            />
          )}

          {activeTab === 'analytics' && <AnalyticsView refreshTrigger={refreshTrigger} />}

          {activeTab === 'preferences' && (
            <PreferencesView onSaved={() => setRefreshTrigger((n) => n + 1)} />
          )}

          {activeTab === 'settings' && (
            <SettingsView onSynced={() => setRefreshTrigger((n) => n + 1)} />
          )}
        </main>
      </div>

      {/* Hackathon Detail Drawer */}
      <HackathonDetailModal
        hackathon={selectedHackathon}
        onClose={() => setSelectedHackathon(null)}
        onToggleSave={handleToggleSave}
        onUpdateSaved={handleUpdateSaved}
        onAnalyzeSingle={handleAnalyzeSingle}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border text-xs font-medium shadow-xl ${
            toast.tone === 'error'
              ? 'bg-rose-700 border-rose-800 text-white'
              : 'bg-[#6B0F3B] border-pink-400/40 text-white'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
