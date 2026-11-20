import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { NotificationItem } from '../types';

interface NotificationsViewProps {
  onUnreadCountChange: (count: number) => void;
  onInspectHackathonId: (hackathonId: string) => void;
  refreshTrigger: number;
}

const TYPE_LABEL: Record<NotificationItem['type'], { text: string; tone: string }> = {
  discovery: { text: 'New Discovery', tone: 'text-pink-700' },
  deadline: { text: 'Deadline Alert', tone: 'text-amber-700' },
  change: { text: 'Listing Change', tone: 'text-[#831843]' },
  recommendation: { text: 'High Match', tone: 'text-emerald-700' },
  system: { text: 'System', tone: 'text-[#8C3F64]' },
};

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  onUnreadCountChange,
  onInspectHackathonId,
  refreshTrigger,
}) => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getNotifications();
      setItems(res.notifications);
      onUnreadCountChange(res.unread_count);
    } catch (err: any) {
      setError(err?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [onUnreadCountChange]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications, refreshTrigger]);

  const handleMarkRead = async (item: NotificationItem) => {
    try {
      await api.markNotificationRead(item.id, !item.is_read);
      const updated = items.map((n) =>
        n.id === item.id ? { ...n, is_read: !n.is_read } : n
      );
      setItems(updated);
      onUnreadCountChange(updated.filter((n) => !n.is_read).length);
    } catch (err: any) {
      setError(err?.message || 'Failed to update notification');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      onUnreadCountChange(0);
    } catch (err: any) {
      setError(err?.message || 'Failed to mark all as read');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteNotification(id);
      const remaining = items.filter((n) => n.id !== id);
      setItems(remaining);
      onUnreadCountChange(remaining.filter((n) => !n.is_read).length);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete notification');
    }
  };

  const filtered =
    filterType === 'all'
      ? items
      : filterType === 'unread'
      ? items.filter((n) => !n.is_read)
      : items.filter((n) => n.type === filterType);

  return (
    <div className="space-y-5">
      <div className="surface-3d rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-pink-50 border border-pink-200 rounded-lg">
          {[
            ['all', 'All'],
            ['unread', 'Unread'],
            ['deadline', 'Deadlines'],
            ['discovery', 'Discoveries'],
            ['recommendation', 'Matches'],
            ['change', 'Updates'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterType(key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filterType === key
                  ? 'bg-pink-600 text-white'
                  : 'text-[#6B0F3B] hover:bg-pink-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleMarkAllRead}
          disabled={items.every((i) => i.is_read)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-[#6B0F3B] bg-pink-50 hover:bg-pink-100 border border-pink-200 disabled:opacity-40 rounded-lg transition-colors"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          Mark All Read
        </button>
      </div>

      <p className="text-xs text-[#8C3F64]">
        Notifications are delivered in-app via the background scheduler and persisted in SQLite.
        External email/push delivery is disabled unless configured.
      </p>

      {error && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 text-xs text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-white border border-pink-200 animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface-3d rounded-xl p-12 text-center space-y-2">
          <Bell className="w-7 h-7 text-pink-400 mx-auto" />
          <p className="text-sm text-[#4A0526] font-medium">No notifications in this view.</p>
          <p className="text-xs text-[#8C3F64]">
            Alerts appear automatically when new hackathons are discovered or deadlines approach.
          </p>
        </div>
      ) : (
        <div className="surface-3d rounded-xl divide-y divide-pink-100 overflow-hidden">
          {filtered.map((n) => {
            const meta = TYPE_LABEL[n.type] || TYPE_LABEL.system;
            return (
              <div
                key={n.id}
                className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  !n.is_read ? 'bg-pink-50/70' : 'bg-white'
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`font-semibold ${meta.tone}`}>{meta.text}</span>
                    <span className="text-pink-300" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono text-[#9D4E72]">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                    {!n.is_read && (
                      <>
                        <span className="text-pink-300" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-pink-700 font-semibold">Unread</span>
                      </>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-[#4A0526]">{n.title}</h4>
                  <p className="text-xs text-[#5E2440]">{n.message}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {n.hackathon_id && (
                    <button
                      type="button"
                      onClick={() => onInspectHackathonId(n.hackathon_id!)}
                      className="btn-3d-pink px-3 py-1.5 text-xs font-medium text-white bg-pink-600 hover:bg-pink-700 rounded-lg"
                    >
                      View Event
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleMarkRead(n)}
                    className="px-3 py-1.5 text-xs font-medium text-[#6B0F3B] bg-pink-50 hover:bg-pink-100 border border-pink-200 rounded-lg"
                  >
                    {n.is_read ? 'Mark Unread' : 'Mark Read'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(n.id)}
                    aria-label="Delete notification"
                    className="p-1.5 text-[#9D4E72] hover:text-rose-700 hover:bg-pink-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
