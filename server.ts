import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  db,
  getMatchingWeights,
  getPreferences,
  getUserProfile,
  initDatabase,
  mapHackathonRow,
} from './server/db.ts';
import {
  enhanceRecommendationsWithGemini,
  parseNaturalLanguageQuery,
  recomputeAllDeterministicScores,
} from './server/ai.ts';
import { getPlatformStatuses, runDiscoverySync } from './server/discovery.ts';
import { haversineKm, resolveCoordinates } from './server/geo.ts';
import { checkDeadlineReminders, startBackgroundScheduler } from './server/scheduler.ts';
import type { AnalyticsData, Hackathon, SourcePlatform } from './src/types.ts';

const PORT = Number(process.env.PORT || 3000);

function baseHackathonSelect(): string {
  return `
    SELECT h.*,
           s.saved_at, s.notes AS saved_notes, s.reminder_7d, s.reminder_3d, s.reminder_24h, s.custom_reminder_hours,
           r.compatibility_score AS rec_score, r.breakdown_json AS rec_breakdown,
           r.why_matches AS rec_why, r.relevant_skills AS rec_skills,
           r.eligibility_assessment AS rec_eligibility, r.important_deadlines AS rec_deadlines,
           r.preparation_checklist AS rec_checklist, r.ai_enhanced AS rec_ai_enhanced,
           r.computed_at AS rec_computed_at
    FROM hackathons h
    LEFT JOIN saved_hackathons s ON s.hackathon_id = h.id
    LEFT JOIN ai_recommendations r ON r.hackathon_id = h.id
  `;
}

function filterHackathons(params: {
  query?: string;
  domain?: string;
  city?: string;
  state?: string;
  format?: string;
  platform?: string;
  status?: string;
  min_prize_inr?: number | null;
  closing_within_days?: number | null;
  solo_only?: boolean;
  beginner_friendly?: boolean;
  lat?: number | null;
  lng?: number | null;
  radius_km?: number | null;
  sort?: string;
}): Hackathon[] {
  const rows = db.prepare(baseHackathonSelect()).all() as any[];
  let items = rows.map(mapHackathonRow);

  // Attach distance if coordinates supplied
  if (params.lat != null && params.lng != null) {
    items = items.map((item) => ({
      ...item,
      distance_km:
        item.latitude != null && item.longitude != null
          ? haversineKm(params.lat!, params.lng!, item.latitude, item.longitude)
          : null,
    }));
  }

  if (params.query) {
    const q = params.query.toLowerCase().trim();
    const terms = q.split(/\s+/).filter(Boolean);
    items = items.filter((h) => {
      const hay = `${h.title} ${h.organizer} ${h.description} ${h.category} ${h.domains.join(' ')} ${h.location}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }

  if (params.domain) {
    const d = params.domain.toLowerCase();
    items = items.filter(
      (h) =>
        h.category.toLowerCase().includes(d) ||
        h.domains.some((dom) => dom.toLowerCase().includes(d)) ||
        h.description.toLowerCase().includes(d)
    );
  }

  if (params.city) {
    const c = params.city.toLowerCase().trim();
    const normalized = c === 'bangalore' ? 'bengaluru' : c;
    items = items.filter((h) => {
      const locText = `${h.city || ''} ${h.location}`.toLowerCase();
      return locText.includes(c) || locText.includes(normalized);
    });
  }

  if (params.state) {
    const st = params.state.toLowerCase().trim();
    items = items.filter((h) => `${h.state || ''} ${h.location}`.toLowerCase().includes(st));
  }

  if (params.format) {
    items = items.filter((h) => h.format === params.format);
  }

  if (params.platform) {
    items = items.filter((h) => h.source_platform === params.platform);
  }

  if (params.status) {
    items = items.filter((h) => h.registration_status === params.status);
  }

  if (params.min_prize_inr != null && params.min_prize_inr > 0) {
    items = items.filter(
      (h) => h.prize_value_inr != null && h.prize_value_inr >= params.min_prize_inr!
    );
  }

  if (params.closing_within_days != null && params.closing_within_days > 0) {
    const cutoff = Date.now() + params.closing_within_days * 24 * 3600 * 1000;
    items = items.filter((h) => {
      if (!h.registration_deadline || h.registration_status === 'expired') return false;
      const t = new Date(h.registration_deadline).getTime();
      return t >= Date.now() && t <= cutoff;
    });
  }

  if (params.solo_only) {
    items = items.filter(
      (h) => h.team_size_min == null || h.team_size_min <= 1
    );
  }

  if (params.beginner_friendly) {
    items = items.filter((h) =>
      /(beginner|all skill|student|no prior|open to all)/i.test(
        `${h.description} ${h.domains.join(' ')} ${h.eligibility}`
      )
    );
  }

  if (params.radius_km != null && params.radius_km > 0 && params.lat != null && params.lng != null) {
    items = items.filter(
      (h) =>
        h.format === 'online' ||
        (h.distance_km != null && h.distance_km <= params.radius_km!)
    );
  }

  // Sorting
  if (params.sort === 'deadline') {
    items.sort((a, b) => {
      const ta = a.registration_deadline ? new Date(a.registration_deadline).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.registration_deadline ? new Date(b.registration_deadline).getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });
  } else if (params.sort === 'distance' && params.lat != null) {
    items.sort((a, b) => {
      const da = a.distance_km ?? (a.format === 'online' ? 99999 : 100000);
      const dbDist = b.distance_km ?? (b.format === 'online' ? 99999 : 100000);
      return da - dbDist;
    });
  } else if (params.sort === 'newest') {
    items.sort((a, b) => new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime());
  } else {
    items.sort((a, b) => (b.compatibility_score ?? 0) - (a.compatibility_score ?? 0));
  }

  return items;
}

async function startServer() {
  initDatabase();
  startBackgroundScheduler();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Health Check
  app.get('/api/health', (_req: Request, res: Response) => {
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM hackathons').get() as { cnt: number };
    res.json({
      status: 'ok',
      database: 'sqlite',
      hackathons_count: countRow.cnt,
      gemini_configured: Boolean(process.env.GEMINI_API_KEY),
      timestamp: new Date().toISOString(),
    });
  });

  // Dashboard Summary
  app.get('/api/dashboard', (_req: Request, res: Response) => {
    try {
      const prefs = getPreferences();
      const all = filterHackathons({ sort: 'match' });
      const matching = all.filter(
        (h) =>
          h.registration_status !== 'expired' &&
          (h.compatibility_score ?? 0) >= prefs.min_match_threshold
      );
      const now = Date.now();
      const next7Days = now + 7 * 24 * 3600 * 1000;
      const upcomingDeadlines = all.filter((h) => {
        if (!h.registration_deadline || h.registration_status === 'expired') return false;
        const t = new Date(h.registration_deadline).getTime();
        return t >= now && t <= next7Days;
      });
      const saved = all.filter((h) => h.is_saved);
      const unreadRow = db
        .prepare('SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0')
        .get() as { cnt: number };
      const lastSyncRow = db
        .prepare("SELECT ran_at FROM discovery_runs WHERE status = 'success' ORDER BY id DESC LIMIT 1")
        .get() as { ran_at: string } | undefined;

      const newlyDiscovered = [...all]
        .sort((a, b) => new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime())
        .slice(0, 6);

      const recommended = all
        .filter((h) => h.registration_status !== 'expired')
        .slice(0, 6);

      const recentlyViewed = all
        .filter((h) => Boolean(h.last_viewed_at))
        .sort(
          (a, b) =>
            new Date(b.last_viewed_at!).getTime() - new Date(a.last_viewed_at!).getTime()
        )
        .slice(0, 5);

      const closingSoon = [...upcomingDeadlines]
        .sort(
          (a, b) =>
            new Date(a.registration_deadline!).getTime() -
            new Date(b.registration_deadline!).getTime()
        )
        .slice(0, 5);

      res.json({
        total_discovered: all.length,
        matching_profile_count: matching.length,
        upcoming_deadlines_count: upcomingDeadlines.length,
        saved_count: saved.length,
        unread_notifications_count: unreadRow.cnt,
        last_sync_at: lastSyncRow?.ran_at || null,
        newly_discovered: newlyDiscovered,
        recommended,
        recently_viewed: recentlyViewed,
        closing_soon: closingSoon,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to load dashboard' });
    }
  });

  // Hackathons List & Filtering
  app.get('/api/hackathons', (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const domain = typeof req.query.domain === 'string' ? req.query.domain : undefined;
      const city = typeof req.query.city === 'string' ? req.query.city : undefined;
      const state = typeof req.query.state === 'string' ? req.query.state : undefined;
      const format = typeof req.query.format === 'string' ? req.query.format : undefined;
      const platform = typeof req.query.platform === 'string' ? req.query.platform : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const sort = typeof req.query.sort === 'string' ? req.query.sort : 'match';
      const minPrize = req.query.min_prize_inr ? Number(req.query.min_prize_inr) : null;
      const closingDays = req.query.closing_within_days ? Number(req.query.closing_within_days) : null;
      const soloOnly = req.query.solo_only === 'true';
      const beginner = req.query.beginner_friendly === 'true';
      const lat = req.query.lat ? Number(req.query.lat) : null;
      const lng = req.query.lng ? Number(req.query.lng) : null;
      const radiusKm = req.query.radius_km ? Number(req.query.radius_km) : null;

      const items = filterHackathons({
        query: q,
        domain,
        city,
        state,
        format,
        platform,
        status,
        min_prize_inr: minPrize,
        closing_within_days: closingDays,
        solo_only: soloOnly,
        beginner_friendly: beginner,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        radius_km: Number.isFinite(radiusKm) ? radiusKm : null,
        sort,
      });

      res.json({ hackathons: items, total: items.length });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to query hackathons' });
    }
  });

  // Single Hackathon Detail & Track Recently Viewed
  app.get('/api/hackathons/:id', (req: Request, res: Response) => {
    const row = db.prepare(`${baseHackathonSelect()} WHERE h.id = ?`).get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'Hackathon not found' });
    res.json(mapHackathonRow(row));
  });

  app.post('/api/hackathons/:id/view', (req: Request, res: Response) => {
    const now = new Date().toISOString();
    const result = db
      .prepare('UPDATE hackathons SET last_viewed_at = ? WHERE id = ?')
      .run(now, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Hackathon not found' });
    res.json({ ok: true, last_viewed_at: now });
  });

  // Discovery Sync & Platform Status
  app.get('/api/discovery/platforms', (_req: Request, res: Response) => {
    try {
      const platforms = getPlatformStatuses();
      const lastSync = db
        .prepare("SELECT ran_at FROM discovery_runs WHERE status = 'success' ORDER BY id DESC LIMIT 1")
        .get() as { ran_at: string } | undefined;
      res.json({
        platforms,
        last_successful_sync: lastSync?.ran_at || null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to load platform statuses' });
    }
  });

  app.post('/api/hackathons/discover', async (req: Request, res: Response) => {
    try {
      const requestedPlatforms = Array.isArray(req.body?.platforms)
        ? (req.body.platforms as SourcePlatform[])
        : undefined;
      const result = await runDiscoverySync(requestedPlatforms);
      checkDeadlineReminders();
      res.json({
        ...result,
        platforms: getPlatformStatuses(),
        synced_at: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Discovery sync failed' });
    }
  });

  // Natural Language & Voice Search via Gemini
  app.post('/api/search/nl', async (req: Request, res: Response) => {
    try {
      const queryText = String(req.body?.query || '').trim();
      if (!queryText) {
        return res.status(400).json({ error: 'Search query cannot be empty' });
      }
      const { filters, model } = await parseNaturalLanguageQuery(queryText);
      const lat = req.body?.lat != null ? Number(req.body.lat) : null;
      const lng = req.body?.lng != null ? Number(req.body.lng) : null;

      const results = filterHackathons({
        query: filters.query || undefined,
        domain: filters.domain || undefined,
        city: filters.city || undefined,
        state: filters.state || undefined,
        format: filters.format || undefined,
        status: filters.status || undefined,
        min_prize_inr: filters.min_prize_inr ?? null,
        closing_within_days: filters.closing_within_days ?? null,
        solo_only: Boolean(filters.solo_only),
        beginner_friendly: Boolean(filters.beginner_friendly),
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        sort: 'match',
      });

      res.json({
        raw_query: queryText,
        filters,
        model,
        hackathons: results,
        total: results.length,
      });
    } catch (err: any) {
      const msg = err?.message || 'Natural language search failed';
      res.status(500).json({ error: msg });
    }
  });

  // AI Recommendations
  app.get('/api/recommendations', (_req: Request, res: Response) => {
    try {
      const items = filterHackathons({ sort: 'match' }).filter(
        (h) => h.registration_status !== 'expired'
      );
      res.json({
        recommendations: items,
        weights: getMatchingWeights(),
        profile: getUserProfile(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch recommendations' });
    }
  });

  app.post('/api/recommendations/analyze', async (req: Request, res: Response) => {
    try {
      const ids = Array.isArray(req.body?.hackathon_ids)
        ? (req.body.hackathon_ids as string[])
        : undefined;
      const result = await enhanceRecommendationsWithGemini(ids);
      const items = filterHackathons({ sort: 'match' }).filter(
        (h) => h.registration_status !== 'expired'
      );
      res.json({
        ...result,
        recommendations: items,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Gemini recommendation analysis failed' });
    }
  });

  // Saved Hackathons & Deadline Tracker
  app.get('/api/saved', (_req: Request, res: Response) => {
    try {
      const items = filterHackathons({ sort: 'deadline' }).filter((h) => h.is_saved);
      res.json({ saved: items, total: items.length });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch saved hackathons' });
    }
  });

  app.post('/api/saved/:id', (req: Request, res: Response) => {
    try {
      const exists = db.prepare('SELECT id FROM hackathons WHERE id = ?').get(req.params.id);
      if (!exists) return res.status(404).json({ error: 'Hackathon not found' });

      const prefs = getPreferences();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO saved_hackathons (
          hackathon_id, saved_at, notes, reminder_7d, reminder_3d, reminder_24h, custom_reminder_hours
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(hackathon_id) DO NOTHING
      `).run(
        req.params.id,
        now,
        String(req.body?.notes || ''),
        prefs.default_reminder_7d ? 1 : 0,
        prefs.default_reminder_3d ? 1 : 0,
        prefs.default_reminder_24h ? 1 : 0,
        req.body?.custom_reminder_hours ?? null
      );

      checkDeadlineReminders();
      res.json({ ok: true, saved_at: now });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to save hackathon' });
    }
  });

  app.patch('/api/saved/:id', (req: Request, res: Response) => {
    try {
      const current = db
        .prepare('SELECT * FROM saved_hackathons WHERE hackathon_id = ?')
        .get(req.params.id) as any;
      if (!current) return res.status(404).json({ error: 'Saved hackathon not found' });

      const notes = req.body?.notes !== undefined ? String(req.body.notes) : current.notes;
      const r7 = req.body?.reminder_7d !== undefined ? (req.body.reminder_7d ? 1 : 0) : current.reminder_7d;
      const r3 = req.body?.reminder_3d !== undefined ? (req.body.reminder_3d ? 1 : 0) : current.reminder_3d;
      const r24 = req.body?.reminder_24h !== undefined ? (req.body.reminder_24h ? 1 : 0) : current.reminder_24h;
      const custom =
        req.body?.custom_reminder_hours !== undefined
          ? req.body.custom_reminder_hours
          : current.custom_reminder_hours;

      db.prepare(`
        UPDATE saved_hackathons
        SET notes = ?, reminder_7d = ?, reminder_3d = ?, reminder_24h = ?, custom_reminder_hours = ?
        WHERE hackathon_id = ?
      `).run(notes, r7, r3, r24, custom, req.params.id);

      checkDeadlineReminders();
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to update reminder settings' });
    }
  });

  app.delete('/api/saved/:id', (req: Request, res: Response) => {
    db.prepare('DELETE FROM saved_hackathons WHERE hackathon_id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // Smart Deadline Tracker
  app.get('/api/deadlines', (req: Request, res: Response) => {
    try {
      const savedOnly = req.query.saved_only === 'true';
      let items = filterHackathons({ sort: 'deadline' });
      if (savedOnly) items = items.filter((h) => h.is_saved);

      const now = Date.now();
      const closing_today: Hackathon[] = [];
      const closing_soon: Hackathon[] = [];
      const upcoming: Hackathon[] = [];
      const expired: Hackathon[] = [];

      for (const h of items) {
        if (h.registration_status === 'expired') {
          expired.push(h);
          continue;
        }
        if (!h.registration_deadline) {
          upcoming.push(h);
          continue;
        }
        const dl = new Date(h.registration_deadline).getTime();
        const hoursLeft = (dl - now) / (1000 * 60 * 60);
        if (hoursLeft <= 0) {
          expired.push(h);
        } else if (hoursLeft <= 24) {
          closing_today.push(h);
        } else if (hoursLeft <= 24 * 7) {
          closing_soon.push(h);
        } else {
          upcoming.push(h);
        }
      }

      res.json({
        closing_today,
        closing_soon,
        upcoming,
        expired,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to load deadlines' });
    }
  });

  // Notification Center (supports both /api/notifications/history and /api/notifications)
  const getNotificationsHandler = (_req: Request, res: Response) => {
    const rows = db
      .prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100')
      .all() as any[];
    const notifications = rows.map((r) => ({
      ...r,
      is_read: Boolean(r.is_read),
    }));
    const unread_count = notifications.filter((n) => !n.is_read).length;
    res.json({ notifications, unread_count });
  };

  app.get('/api/notifications/history', getNotificationsHandler);
  app.get('/api/notifications', getNotificationsHandler);

  app.patch('/api/notifications/:id/read', (req: Request, res: Response) => {
    const isRead = req.body?.is_read !== undefined ? (req.body.is_read ? 1 : 0) : 1;
    db.prepare('UPDATE notifications SET is_read = ? WHERE id = ?').run(isRead, req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/notifications/mark-all-read', (_req: Request, res: Response) => {
    db.prepare('UPDATE notifications SET is_read = 1').run();
    res.json({ ok: true });
  });

  app.delete('/api/notifications/:id', (req: Request, res: Response) => {
    db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // Analytics (100% real database metrics)
  app.get('/api/analytics', (_req: Request, res: Response) => {
    try {
      const all = filterHackathons({ sort: 'match' });
      const open_count = all.filter((h) => h.registration_status === 'open').length;
      const upcoming_count = all.filter((h) => h.registration_status === 'upcoming').length;
      const expired_count = all.filter((h) => h.registration_status === 'expired').length;
      const saved = all.filter((h) => h.is_saved);

      // Discovered over time (grouped by YYYY-MM-DD)
      const dateMap = new Map<string, number>();
      for (const h of all) {
        const day = (h.discovered_at || '').slice(0, 10);
        if (day) dateMap.set(day, (dateMap.get(day) || 0) + 1);
      }
      const discovered_over_time = Array.from(dateMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));

      // By domain / category
      const domainMap = new Map<string, number>();
      for (const h of all) {
        domainMap.set(h.category, (domainMap.get(h.category) || 0) + 1);
      }
      const by_domain = Array.from(domainMap.entries())
        .map(([domain, count]) => ({ domain, count }))
        .sort((a, b) => b.count - a.count);

      // By location
      const locMap = new Map<string, number>();
      for (const h of all) {
        const label =
          h.format === 'online'
            ? 'Online / Remote'
            : h.city || h.country || h.location || 'Other';
        locMap.set(label, (locMap.get(label) || 0) + 1);
      }
      const by_location = Array.from(locMap.entries())
        .map(([location, count]) => ({ location, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      // By format
      const fmtMap = new Map<string, number>();
      for (const h of all) {
        fmtMap.set(h.format, (fmtMap.get(h.format) || 0) + 1);
      }
      const by_format = Array.from(fmtMap.entries()).map(([format, count]) => ({
        format,
        count,
      }));

      // By platform
      const platMap = new Map<string, number>();
      for (const h of all) {
        platMap.set(h.source_platform, (platMap.get(h.source_platform) || 0) + 1);
      }
      const by_platform = Array.from(platMap.entries())
        .map(([platform, count]) => ({ platform, count }))
        .sort((a, b) => b.count - a.count);

      // Upcoming deadlines buckets
      const now = Date.now();
      let bucket24h = 0;
      let bucket7d = 0;
      let bucket30d = 0;
      let bucketLater = 0;
      for (const h of all) {
        if (h.registration_status === 'expired' || !h.registration_deadline) continue;
        const hrs = (new Date(h.registration_deadline).getTime() - now) / (1000 * 60 * 60);
        if (hrs <= 0) continue;
        if (hrs <= 24) bucket24h++;
        else if (hrs <= 24 * 7) bucket7d++;
        else if (hrs <= 24 * 30) bucket30d++;
        else bucketLater++;
      }

      const avgAll =
        all.length > 0
          ? Math.round(
              (all.reduce((s, h) => s + (h.compatibility_score ?? 0), 0) / all.length) * 10
            ) / 10
          : 0;
      const avgSaved =
        saved.length > 0
          ? Math.round(
              (saved.reduce((s, h) => s + (h.compatibility_score ?? 0), 0) / saved.length) * 10
            ) / 10
          : 0;

      const analytics: AnalyticsData = {
        total_hackathons: all.length,
        open_count,
        upcoming_count,
        expired_count,
        saved_count: saved.length,
        discovered_over_time,
        by_domain,
        by_location,
        by_format,
        by_platform,
        upcoming_deadlines_buckets: [
          { bucket: '< 24 Hours', count: bucket24h },
          { bucket: '1–7 Days', count: bucket7d },
          { bucket: '8–30 Days', count: bucket30d },
          { bucket: '30+ Days', count: bucketLater },
        ],
        saved_engagement: {
          total_saved: saved.length,
          open_saved: saved.filter((h) => h.registration_status === 'open').length,
          closing_within_7d: saved.filter((h) => {
            if (!h.registration_deadline || h.registration_status === 'expired') return false;
            const hrs = (new Date(h.registration_deadline).getTime() - now) / (1000 * 60 * 60);
            return hrs > 0 && hrs <= 24 * 7;
          }).length,
          avg_match_score_saved: avgSaved,
          avg_match_score_all: avgAll,
          with_notes: saved.filter((h) => Boolean(h.saved_notes?.trim())).length,
        },
      };

      res.json(analytics);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to generate analytics' });
    }
  });

  // User Profile
  app.get('/api/profile', (_req: Request, res: Response) => {
    res.json(getUserProfile());
  });

  app.put('/api/profile', (req: Request, res: Response) => {
    try {
      const current = getUserProfile();
      const body = req.body || {};
      const city = body.preferred_city !== undefined ? String(body.preferred_city) : current.preferred_city;
      const state = body.preferred_state !== undefined ? String(body.preferred_state) : current.preferred_state;
      const loc = body.preferred_location !== undefined ? String(body.preferred_location) : current.preferred_location;

      let lat = body.preferred_lat !== undefined ? body.preferred_lat : current.preferred_lat;
      let lng = body.preferred_lng !== undefined ? body.preferred_lng : current.preferred_lng;
      if ((city || loc) && (lat == null || body.preferred_city !== undefined)) {
        const resolved = resolveCoordinates(loc, city, state, null);
        if (resolved.lat != null) {
          lat = resolved.lat;
          lng = resolved.lng;
        }
      }

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE user_profiles
        SET name = ?, skills = ?, languages = ?, interests = ?, preferred_domains = ?,
            experience_level = ?, preferred_location = ?, preferred_city = ?, preferred_state = ?,
            preferred_lat = ?, preferred_lng = ?, team_size_preference = ?, format_preference = ?, updated_at = ?
        WHERE id = 1
      `).run(
        body.name ?? current.name,
        JSON.stringify(Array.isArray(body.skills) ? body.skills : current.skills),
        JSON.stringify(Array.isArray(body.languages) ? body.languages : current.languages),
        JSON.stringify(Array.isArray(body.interests) ? body.interests : current.interests),
        JSON.stringify(Array.isArray(body.preferred_domains) ? body.preferred_domains : current.preferred_domains),
        body.experience_level ?? current.experience_level,
        loc,
        city,
        state,
        lat,
        lng,
        body.team_size_preference ?? current.team_size_preference,
        body.format_preference ?? current.format_preference,
        now
      );

      recomputeAllDeterministicScores();
      res.json(getUserProfile());
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to update profile' });
    }
  });

  // Matching Weights (Existing compatibility route)
  app.get('/api/matching-weights', (_req: Request, res: Response) => {
    res.json(getMatchingWeights());
  });

  app.put('/api/matching-weights', (req: Request, res: Response) => {
    try {
      const current = getMatchingWeights();
      const b = req.body || {};
      const clamp = (v: unknown, fallback: number) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
      };
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE matching_weights
        SET skill_compatibility = ?, domain_interest = ?, location_preference = ?,
            eligibility = ?, experience_level = ?, event_format = ?, deadline_suitability = ?, updated_at = ?
        WHERE id = 1
      `).run(
        clamp(b.skill_compatibility, current.skill_compatibility),
        clamp(b.domain_interest, current.domain_interest),
        clamp(b.location_preference, current.location_preference),
        clamp(b.eligibility, current.eligibility),
        clamp(b.experience_level, current.experience_level),
        clamp(b.event_format, current.event_format),
        clamp(b.deadline_suitability, current.deadline_suitability),
        now
      );
      recomputeAllDeterministicScores();
      res.json(getMatchingWeights());
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to update matching weights' });
    }
  });

  // Preferences & Settings (Existing compatibility route)
  app.get('/api/preferences', (_req: Request, res: Response) => {
    res.json(getPreferences());
  });

  app.put('/api/preferences', (req: Request, res: Response) => {
    try {
      const current = getPreferences();
      const b = req.body || {};
      const boolInt = (v: unknown, fb: boolean) => (v !== undefined ? (v ? 1 : 0) : fb ? 1 : 0);
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE preferences
        SET auto_sync_enabled = ?, sync_interval_minutes = ?,
            default_reminder_7d = ?, default_reminder_3d = ?, default_reminder_24h = ?,
            notify_new_discoveries = ?, notify_deadline_approaching = ?,
            notify_saved_changes = ?, notify_new_recommendations = ?,
            min_match_threshold = ?, updated_at = ?
        WHERE id = 1
      `).run(
        boolInt(b.auto_sync_enabled, current.auto_sync_enabled),
        Math.max(5, Number(b.sync_interval_minutes ?? current.sync_interval_minutes)),
        boolInt(b.default_reminder_7d, current.default_reminder_7d),
        boolInt(b.default_reminder_3d, current.default_reminder_3d),
        boolInt(b.default_reminder_24h, current.default_reminder_24h),
        boolInt(b.notify_new_discoveries, current.notify_new_discoveries),
        boolInt(b.notify_deadline_approaching, current.notify_deadline_approaching),
        boolInt(b.notify_saved_changes, current.notify_saved_changes),
        boolInt(b.notify_new_recommendations, current.notify_new_recommendations),
        Math.min(100, Math.max(0, Number(b.min_match_threshold ?? current.min_match_threshold))),
        now
      );
      res.json(getPreferences());
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to update preferences' });
    }
  });

  // Vite / Static Frontend Serving
  const distPath = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distPath);

  if (isProd) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HackMate AI server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
