import { createNotificationIfNew, db, getPreferences } from './db.ts';
import { runDiscoverySync } from './discovery.ts';

let schedulerInterval: NodeJS.Timeout | null = null;
let lastAutoSyncMs = 0;

export function checkDeadlineReminders(): number {
  const prefs = getPreferences();
  if (!prefs.notify_deadline_approaching) return 0;

  // Refresh statuses of hackathons whose deadlines have passed
  const nowIso = new Date().toISOString();
  db.prepare(
    `UPDATE hackathons
     SET registration_status = 'expired', updated_at = ?
     WHERE registration_deadline IS NOT NULL
       AND registration_deadline < ?
       AND registration_status != 'expired'`
  ).run(nowIso, nowIso);

  const savedRows = db
    .prepare(
      `SELECT h.id, h.title, h.registration_deadline, h.source_platform,
              s.reminder_7d, s.reminder_3d, s.reminder_24h, s.custom_reminder_hours
       FROM saved_hackathons s
       JOIN hackathons h ON h.id = s.hackathon_id
       WHERE h.registration_deadline IS NOT NULL
         AND h.registration_status != 'expired'`
    )
    .all() as any[];

  let created = 0;
  const now = Date.now();

  for (const row of savedRows) {
    const dlMs = new Date(row.registration_deadline).getTime();
    if (isNaN(dlMs) || dlMs <= now) continue;
    const hoursLeft = (dlMs - now) / (1000 * 60 * 60);

    if (row.reminder_24h && hoursLeft <= 24) {
      if (
        createNotificationIfNew({
          dedup_key: `dl:24h:${row.id}:${row.registration_deadline}`,
          type: 'deadline',
          title: `Closing Today (<24h): ${row.title}`,
          message: `Registration closes in ${Math.max(1, Math.round(hoursLeft))} hours on ${row.source_platform}.`,
          hackathon_id: row.id,
        })
      ) {
        created++;
      }
    } else if (row.reminder_3d && hoursLeft <= 72) {
      if (
        createNotificationIfNew({
          dedup_key: `dl:3d:${row.id}:${row.registration_deadline}`,
          type: 'deadline',
          title: `Closing in 3 Days: ${row.title}`,
          message: `Registration deadline is ${new Date(row.registration_deadline).toLocaleString()}.`,
          hackathon_id: row.id,
        })
      ) {
        created++;
      }
    } else if (row.reminder_7d && hoursLeft <= 168) {
      if (
        createNotificationIfNew({
          dedup_key: `dl:7d:${row.id}:${row.registration_deadline}`,
          type: 'deadline',
          title: `7-Day Deadline Reminder: ${row.title}`,
          message: `Registration closes on ${new Date(row.registration_deadline).toLocaleDateString()}.`,
          hackathon_id: row.id,
        })
      ) {
        created++;
      }
    }

    if (row.custom_reminder_hours && hoursLeft <= Number(row.custom_reminder_hours)) {
      if (
        createNotificationIfNew({
          dedup_key: `dl:custom:${row.custom_reminder_hours}:${row.id}:${row.registration_deadline}`,
          type: 'deadline',
          title: `Custom Reminder (${row.custom_reminder_hours}h): ${row.title}`,
          message: `Registration closes in ~${Math.max(1, Math.round(hoursLeft))} hours.`,
          hackathon_id: row.id,
        })
      ) {
        created++;
      }
    }
  }

  return created;
}

export function startBackgroundScheduler(): void {
  if (schedulerInterval) return;

  // Initial sync if database has zero hackathons
  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM hackathons').get() as { cnt: number };
  if (countRow.cnt === 0) {
    lastAutoSyncMs = Date.now();
    runDiscoverySync().catch((err) => {
      console.error('[Scheduler] Initial discovery sync error:', err);
    });
  } else {
    checkDeadlineReminders();
  }

  schedulerInterval = setInterval(async () => {
    try {
      checkDeadlineReminders();
      const prefs = getPreferences();
      if (prefs.auto_sync_enabled) {
        const intervalMs = Math.max(5, prefs.sync_interval_minutes) * 60 * 1000;
        if (Date.now() - lastAutoSyncMs >= intervalMs) {
          lastAutoSyncMs = Date.now();
          await runDiscoverySync();
        }
      }
    } catch (err) {
      console.error('[Scheduler] Background tick error:', err);
    }
  }, 60 * 1000);
}
