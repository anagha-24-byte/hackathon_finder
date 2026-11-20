import Database from 'better-sqlite3';
import path from 'path';
import type {
  Hackathon,
  MatchingWeights,
  NotificationItem,
  Preferences,
  RecommendationDetails,
  UserProfile,
} from '../src/types.ts';

const DB_PATH = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'hackmate.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hackathons (
      id TEXT PRIMARY KEY,
      external_id TEXT,
      dedup_key TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      organizer TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      domains TEXT NOT NULL DEFAULT '[]',
      format TEXT NOT NULL,
      location TEXT NOT NULL,
      city TEXT,
      state TEXT,
      country TEXT,
      latitude REAL,
      longitude REAL,
      start_date TEXT,
      end_date TEXT,
      registration_deadline TEXT,
      registration_status TEXT NOT NULL DEFAULT 'open',
      prize_pool TEXT NOT NULL DEFAULT 'Not specified',
      prize_value_inr REAL,
      eligibility TEXT NOT NULL DEFAULT 'See official registration page',
      team_size_min INTEGER,
      team_size_max INTEGER,
      registration_url TEXT NOT NULL,
      source_platform TEXT NOT NULL,
      is_verified INTEGER NOT NULL DEFAULT 1,
      discovered_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_viewed_at TEXT,
      raw_payload TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_hackathons_status ON hackathons(registration_status);
    CREATE INDEX IF NOT EXISTS idx_hackathons_platform ON hackathons(source_platform);
    CREATE INDEX IF NOT EXISTS idx_hackathons_format ON hackathons(format);
    CREATE INDEX IF NOT EXISTS idx_hackathons_deadline ON hackathons(registration_deadline);

    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL DEFAULT 'Developer',
      skills TEXT NOT NULL DEFAULT '[]',
      languages TEXT NOT NULL DEFAULT '[]',
      interests TEXT NOT NULL DEFAULT '[]',
      preferred_domains TEXT NOT NULL DEFAULT '[]',
      experience_level TEXT NOT NULL DEFAULT 'intermediate',
      preferred_location TEXT NOT NULL DEFAULT '',
      preferred_city TEXT NOT NULL DEFAULT '',
      preferred_state TEXT NOT NULL DEFAULT '',
      preferred_lat REAL,
      preferred_lng REAL,
      team_size_preference TEXT NOT NULL DEFAULT 'any',
      format_preference TEXT NOT NULL DEFAULT 'any',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS matching_weights (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      skill_compatibility REAL NOT NULL DEFAULT 0.30,
      domain_interest REAL NOT NULL DEFAULT 0.20,
      location_preference REAL NOT NULL DEFAULT 0.15,
      eligibility REAL NOT NULL DEFAULT 0.10,
      experience_level REAL NOT NULL DEFAULT 0.10,
      event_format REAL NOT NULL DEFAULT 0.08,
      deadline_suitability REAL NOT NULL DEFAULT 0.07,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_hackathons (
      hackathon_id TEXT PRIMARY KEY REFERENCES hackathons(id) ON DELETE CASCADE,
      saved_at TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      reminder_7d INTEGER NOT NULL DEFAULT 1,
      reminder_3d INTEGER NOT NULL DEFAULT 1,
      reminder_24h INTEGER NOT NULL DEFAULT 1,
      custom_reminder_hours INTEGER
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      dedup_key TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      hackathon_id TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

    CREATE TABLE IF NOT EXISTS preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      auto_sync_enabled INTEGER NOT NULL DEFAULT 1,
      sync_interval_minutes INTEGER NOT NULL DEFAULT 60,
      default_reminder_7d INTEGER NOT NULL DEFAULT 1,
      default_reminder_3d INTEGER NOT NULL DEFAULT 1,
      default_reminder_24h INTEGER NOT NULL DEFAULT 1,
      notify_new_discoveries INTEGER NOT NULL DEFAULT 1,
      notify_deadline_approaching INTEGER NOT NULL DEFAULT 1,
      notify_saved_changes INTEGER NOT NULL DEFAULT 1,
      notify_new_recommendations INTEGER NOT NULL DEFAULT 1,
      min_match_threshold INTEGER NOT NULL DEFAULT 60,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS discovery_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      status TEXT NOT NULL,
      discovered_count INTEGER NOT NULL DEFAULT 0,
      new_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      duration_ms INTEGER,
      ran_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_recommendations (
      hackathon_id TEXT PRIMARY KEY REFERENCES hackathons(id) ON DELETE CASCADE,
      compatibility_score REAL NOT NULL,
      breakdown_json TEXT NOT NULL,
      why_matches TEXT NOT NULL,
      relevant_skills TEXT NOT NULL DEFAULT '[]',
      eligibility_assessment TEXT NOT NULL,
      important_deadlines TEXT NOT NULL,
      preparation_checklist TEXT NOT NULL DEFAULT '[]',
      ai_enhanced INTEGER NOT NULL DEFAULT 0,
      computed_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();

  // Seed default user profile if missing (explicitly empty preferred location until user inputs or grants geolocation!)
  const profileExists = db.prepare('SELECT id FROM user_profiles WHERE id = 1').get();
  if (!profileExists) {
    db.prepare(`
      INSERT INTO user_profiles (
        id, name, skills, languages, interests, preferred_domains,
        experience_level, preferred_location, preferred_city, preferred_state,
        team_size_preference, format_preference, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Hackathon Builder',
      JSON.stringify(['Machine Learning', 'Full-Stack Web', 'REST APIs', 'Generative AI']),
      JSON.stringify(['Python', 'TypeScript', 'JavaScript', 'SQL']),
      JSON.stringify(['AI Agents', 'Developer Tools', 'FinTech', 'Cloud Infrastructure']),
      JSON.stringify(['AI/ML', 'Web Development', 'Cybersecurity', 'Open Innovation']),
      'intermediate',
      '',
      '',
      '',
      '2-4',
      'any',
      now
    );
  }

  const weightsExists = db.prepare('SELECT id FROM matching_weights WHERE id = 1').get();
  if (!weightsExists) {
    db.prepare(`
      INSERT INTO matching_weights (
        id, skill_compatibility, domain_interest, location_preference,
        eligibility, experience_level, event_format, deadline_suitability, updated_at
      ) VALUES (1, 0.30, 0.20, 0.15, 0.10, 0.10, 0.08, 0.07, ?)
    `).run(now);
  }

  const prefsExists = db.prepare('SELECT id FROM preferences WHERE id = 1').get();
  if (!prefsExists) {
    db.prepare(`
      INSERT INTO preferences (
        id, auto_sync_enabled, sync_interval_minutes,
        default_reminder_7d, default_reminder_3d, default_reminder_24h,
        notify_new_discoveries, notify_deadline_approaching,
        notify_saved_changes, notify_new_recommendations, min_match_threshold, updated_at
      ) VALUES (1, 1, 60, 1, 1, 1, 1, 1, 1, 1, 55, ?)
    `).run(now);
  }
}

export function getUserProfile(): UserProfile {
  const row = db.prepare('SELECT * FROM user_profiles WHERE id = 1').get() as any;
  return {
    id: row.id,
    name: row.name,
    skills: safeJsonParse(row.skills, []),
    languages: safeJsonParse(row.languages, []),
    interests: safeJsonParse(row.interests, []),
    preferred_domains: safeJsonParse(row.preferred_domains, []),
    experience_level: row.experience_level,
    preferred_location: row.preferred_location || '',
    preferred_city: row.preferred_city || '',
    preferred_state: row.preferred_state || '',
    preferred_lat: row.preferred_lat ?? null,
    preferred_lng: row.preferred_lng ?? null,
    team_size_preference: row.team_size_preference,
    format_preference: row.format_preference,
    updated_at: row.updated_at,
  };
}

export function getMatchingWeights(): MatchingWeights {
  return db.prepare('SELECT * FROM matching_weights WHERE id = 1').get() as MatchingWeights;
}

export function getPreferences(): Preferences {
  const row = db.prepare('SELECT * FROM preferences WHERE id = 1').get() as any;
  return {
    id: row.id,
    auto_sync_enabled: Boolean(row.auto_sync_enabled),
    sync_interval_minutes: row.sync_interval_minutes,
    default_reminder_7d: Boolean(row.default_reminder_7d),
    default_reminder_3d: Boolean(row.default_reminder_3d),
    default_reminder_24h: Boolean(row.default_reminder_24h),
    notify_new_discoveries: Boolean(row.notify_new_discoveries),
    notify_deadline_approaching: Boolean(row.notify_deadline_approaching),
    notify_saved_changes: Boolean(row.notify_saved_changes),
    notify_new_recommendations: Boolean(row.notify_new_recommendations),
    min_match_threshold: row.min_match_threshold,
    updated_at: row.updated_at,
  };
}

export function mapHackathonRow(row: any): Hackathon {
  const rec: RecommendationDetails | null = row.rec_score != null ? {
    hackathon_id: row.id,
    compatibility_score: row.rec_score,
    breakdown: safeJsonParse(row.rec_breakdown, {
      skill_compatibility: 0,
      domain_interest: 0,
      location_preference: 0,
      eligibility: 0,
      experience_level: 0,
      event_format: 0,
      deadline_suitability: 0,
    }),
    why_matches: row.rec_why || '',
    relevant_skills: safeJsonParse(row.rec_skills, []),
    eligibility_assessment: row.rec_eligibility || '',
    important_deadlines: row.rec_deadlines || '',
    preparation_checklist: safeJsonParse(row.rec_checklist, []),
    ai_enhanced: Boolean(row.rec_ai_enhanced),
    computed_at: row.rec_computed_at || row.updated_at,
  } : null;

  return {
    id: row.id,
    external_id: row.external_id,
    dedup_key: row.dedup_key,
    title: row.title,
    organizer: row.organizer,
    description: row.description,
    category: row.category,
    domains: safeJsonParse(row.domains, []),
    format: row.format,
    location: row.location,
    city: row.city,
    state: row.state,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
    start_date: row.start_date,
    end_date: row.end_date,
    registration_deadline: row.registration_deadline,
    registration_status: row.registration_status,
    prize_pool: row.prize_pool,
    prize_value_inr: row.prize_value_inr,
    eligibility: row.eligibility,
    team_size_min: row.team_size_min,
    team_size_max: row.team_size_max,
    registration_url: row.registration_url,
    source_platform: row.source_platform,
    is_verified: Boolean(row.is_verified),
    discovered_at: row.discovered_at,
    updated_at: row.updated_at,
    last_viewed_at: row.last_viewed_at,
    is_saved: Boolean(row.saved_at),
    saved_notes: row.saved_notes || '',
    reminder_7d: row.reminder_7d != null ? Boolean(row.reminder_7d) : undefined,
    reminder_3d: row.reminder_3d != null ? Boolean(row.reminder_3d) : undefined,
    reminder_24h: row.reminder_24h != null ? Boolean(row.reminder_24h) : undefined,
    custom_reminder_hours: row.custom_reminder_hours ?? null,
    compatibility_score: rec ? rec.compatibility_score : undefined,
    recommendation: rec,
  };
}

export function createNotificationIfNew(input: {
  dedup_key: string;
  type: NotificationItem['type'];
  title: string;
  message: string;
  hackathon_id?: string | null;
}): boolean {
  const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const res = db.prepare(`
    INSERT OR IGNORE INTO notifications (id, dedup_key, type, title, message, hackathon_id, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(id, input.dedup_key, input.type, input.title, input.message, input.hackathon_id ?? null, now);
  return res.changes > 0;
}

export function safeJsonParse<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}
