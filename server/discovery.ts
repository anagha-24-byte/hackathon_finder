import crypto from 'crypto';
import {
  createNotificationIfNew,
  db,
  getPreferences,
} from './db.ts';
import { resolveCoordinates } from './geo.ts';
import { recomputeAllDeterministicScores } from './ai.ts';
import type {
  HackathonFormat,
  PlatformStatus,
  RegistrationStatus,
  SourcePlatform,
} from '../src/types.ts';

interface RawNormalizedHackathon {
  external_id: string | null;
  title: string;
  organizer: string;
  description: string;
  category: string;
  domains: string[];
  format: HackathonFormat;
  location: string;
  city: string | null;
  state: string | null;
  country: string | null;
  start_date: string | null;
  end_date: string | null;
  registration_deadline: string | null;
  registration_status: RegistrationStatus;
  prize_pool: string;
  prize_value_inr: number | null;
  eligibility: string;
  team_size_min: number | null;
  team_size_max: number | null;
  registration_url: string;
  source_platform: SourcePlatform;
}

const ALL_PLATFORMS: SourcePlatform[] = [
  'Devpost',
  'Unstop',
  'Devfolio',
  'HackerEarth',
  'MLH',
  'Hack2Skill',
];

function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&ndash;/g, '-')
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeDedupKey(title: string, organizer: string): string {
  const normTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
  const normOrg = organizer.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
  return `${normTitle}::${normOrg}`;
}

function makeId(dedupKey: string): string {
  return 'hk_' + crypto.createHash('sha1').update(dedupKey).digest('hex').slice(0, 16);
}

function parsePrizeValueInr(prizeText: string): number | null {
  if (!prizeText) return null;
  const clean = prizeText.replace(/,/g, '');
  const inrMatch = clean.match(/(?:₹|INR|Rs\.?)\s*([\d.]+)\s*(Lakh|Lac|K|Cr)?/i);
  if (inrMatch) {
    let val = parseFloat(inrMatch[1]);
    const unit = (inrMatch[2] || '').toLowerCase();
    if (unit === 'lakh' || unit === 'lac') val *= 100000;
    else if (unit === 'k') val *= 1000;
    else if (unit === 'cr') val *= 10000000;
    return isNaN(val) ? null : Math.round(val);
  }
  const usdMatch = clean.match(/\$\s*([\d.]+)\s*(K|M)?/i);
  if (usdMatch) {
    let val = parseFloat(usdMatch[1]);
    const unit = (usdMatch[2] || '').toLowerCase();
    if (unit === 'k') val *= 1000;
    else if (unit === 'm') val *= 1000000;
    return isNaN(val) ? null : Math.round(val * 84);
  }
  return null;
}

function classifyCategory(text: string, tags: string[] = []): string {
  const full = [text, ...tags].join(' ').toLowerCase();
  if (/(ai|machine learning|llm|gemini|genai|neural|nlp|computer vision)/.test(full)) return 'AI/ML';
  if (/(bug bounty|security|cyber|ctf|vulnerability|infosec)/.test(full)) return 'Cybersecurity';
  if (/(web3|blockchain|solidity|ethereum|crypto|defi|solana)/.test(full)) return 'Web3 / Blockchain';
  if (/(fintech|finance|banking|payment)/.test(full)) return 'FinTech';
  if (/(health|medical|biotech|clinical)/.test(full)) return 'HealthTech';
  if (/(hardware|iot|robotics|embedded|fpga)/.test(full)) return 'Hardware & IoT';
  if (/(climate|sustainab|green|energy)/.test(full)) return 'Sustainability';
  if (/(web|react|javascript|typescript|full-stack|software)/.test(full)) return 'Web Development';
  return 'Open Innovation';
}

function inferStatus(
  deadlineIso: string | null,
  startIso: string | null,
  endIso: string | null,
  explicitStatus?: string
): RegistrationStatus {
  const now = Date.now();
  if (deadlineIso) {
    const dl = new Date(deadlineIso).getTime();
    if (!isNaN(dl)) {
      if (dl < now) return 'expired';
      return 'open';
    }
  }
  if (endIso) {
    const end = new Date(endIso).getTime();
    if (!isNaN(end) && end < now) return 'expired';
  }
  if (startIso) {
    const start = new Date(startIso).getTime();
    if (!isNaN(start) && start > now + 14 * 24 * 3600 * 1000 && explicitStatus === 'upcoming') {
      return 'upcoming';
    }
  }
  if (explicitStatus === 'upcoming') return 'upcoming';
  if (explicitStatus === 'ended' || explicitStatus === 'closed') return 'expired';
  return 'open';
}

async function fetchWithRetry(url: string, init: RequestInit = {}, retries = 2): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'User-Agent': 'HackMateAI-DiscoveryAgent/1.0',
          ...(init.headers || {}),
        },
      });
      clearTimeout(timer);
      if (!res.ok && res.status >= 500 && i < retries) {
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

function parseDevpostPeriod(period?: string): { start: string | null; end: string | null } {
  if (!period) return { start: null, end: null };
  // Example: "Oct 30 - Dec 04, 2026" or "Nov 15 - 17, 2026"
  const yearMatch = period.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());
  const parts = period.replace(/,\s*20\d{2}/, '').split('-').map((s) => s.trim());
  if (parts.length !== 2) return { start: null, end: null };

  const startCandidate = new Date(`${parts[0]}, ${year}`);
  let endStr = parts[1];
  if (/^\d+$/.test(endStr)) {
    const monthWord = parts[0].split(' ')[0];
    endStr = `${monthWord} ${endStr}`;
  }
  const endCandidate = new Date(`${endStr}, ${year} 23:59:00`);
  return {
    start: isNaN(startCandidate.getTime()) ? null : startCandidate.toISOString(),
    end: isNaN(endCandidate.getTime()) ? null : endCandidate.toISOString(),
  };
}

async function discoverDevpost(): Promise<RawNormalizedHackathon[]> {
  const res = await fetchWithRetry(
    'https://devpost.com/api/hackathons?open_to[]=public&status[]=open&per_page=20'
  );
  if (!res.ok) throw new Error(`Devpost returned HTTP ${res.status}`);
  const data = (await res.json()) as any;
  const list = Array.isArray(data?.hackathons) ? data.hackathons : [];
  return list
    .filter((item: any) => item?.title && item?.url)
    .map((item: any): RawNormalizedHackathon => {
      const loc = item.displayed_location?.location || 'Online';
      const isOnline = loc.toLowerCase().includes('online');
      const themes = Array.isArray(item.themes) ? item.themes.map((t: any) => t.name).filter(Boolean) : [];
      const prizeText = stripHtml(item.prize_amount) || 'Not specified';
      const dates = parseDevpostPeriod(item.submission_period_dates);
      const organizer = item.organization_name || 'Devpost Community';
      const desc = `${item.title} hosted by ${organizer}. Themes: ${themes.join(', ') || 'General'}. Submission period: ${item.submission_period_dates || 'See listing'}.`;

      return {
        external_id: String(item.id || ''),
        title: String(item.title).trim(),
        organizer,
        description: desc,
        category: classifyCategory(desc, themes),
        domains: themes.length > 0 ? themes : ['Software'],
        format: isOnline ? 'online' : 'offline',
        location: loc,
        city: isOnline ? null : loc.split(',')[0]?.trim() || null,
        state: null,
        country: null,
        start_date: dates.start,
        end_date: dates.end,
        registration_deadline: dates.end,
        registration_status: inferStatus(dates.end, dates.start, dates.end, item.open_state),
        prize_pool: prizeText,
        prize_value_inr: parsePrizeValueInr(prizeText),
        eligibility: item.invite_only ? 'Invite Only' : 'Open to public participants (check official rules)',
        team_size_min: 1,
        team_size_max: null,
        registration_url: item.url,
        source_platform: 'Devpost',
      };
    });
}

async function discoverUnstop(): Promise<RawNormalizedHackathon[]> {
  const res = await fetchWithRetry(
    'https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&per_page=20',
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  if (!res.ok) throw new Error(`Unstop returned HTTP ${res.status}`);
  const data = (await res.json()) as any;
  const list = Array.isArray(data?.data?.data) ? data.data.data : [];

  return list
    .filter((item: any) => item?.title && item?.public_url)
    .map((item: any): RawNormalizedHackathon => {
      const org = item.organisation?.name || 'Unstop Organizer';
      const cleanDesc = stripHtml(item.details).slice(0, 650) || item.title;
      const region = String(item.region || '').toLowerCase();
      const locs = Array.isArray(item.locations) ? item.locations : [];
      const firstLoc = locs[0];
      const city = firstLoc?.city || null;
      const state = firstLoc?.state || null;
      const country = firstLoc?.country || (region === 'online' ? null : 'India');
      const locDisplay =
        region === 'online'
          ? 'Online'
          : [city, state, country].filter(Boolean).join(', ') || 'India';
      const format: HackathonFormat =
        region === 'online' ? 'online' : region === 'hybrid' ? 'hybrid' : 'offline';

      const prizeArr = Array.isArray(item.prizes) ? item.prizes : [];
      const totalCash = prizeArr.reduce((acc: number, p: any) => acc + (Number(p.cash) || 0), 0);
      let prizePool = 'Not specified';
      let prizeInr: number | null = null;
      if (totalCash > 0) {
        prizeInr = totalCash;
        prizePool = `₹${totalCash.toLocaleString('en-IN')}`;
      } else {
        const prizeMatch = cleanDesc.match(/(?:Prize|Bounty|Pool)[^₹$]{0,25}([₹$][\d,]+(?:\s*(?:Lakh|K))?)/i);
        if (prizeMatch) {
          prizePool = prizeMatch[1];
          prizeInr = parsePrizeValueInr(prizePool);
        }
      }

      const eligibleTags = Array.isArray(item.filters)
        ? item.filters.filter((f: any) => f.type === 'eligible').map((f: any) => f.name)
        : [];
      const eligibility =
        eligibleTags.length > 0
          ? eligibleTags.join(', ')
          : 'See official Unstop eligibility rules';

      const regMin = item.regnRequirements?.min_team_size ?? null;
      const regMax = item.regnRequirements?.max_team_size ?? null;
      const regDeadline =
        item.regnRequirements?.end_regn_dt ||
        (item.regnRequirements?.remaining_time
          ? new Date(Date.now() + Number(item.regnRequirements.remaining_time) * 1000).toISOString()
          : null);

      const url = item.public_url.startsWith('http')
        ? item.public_url
        : `https://unstop.com/${item.public_url.replace(/^\//, '')}`;

      const domains = Array.isArray(item.filters)
        ? item.filters.filter((f: any) => f.type !== 'eligible').map((f: any) => f.name).slice(0, 4)
        : [];

      return {
        external_id: String(item.id || ''),
        title: String(item.title).trim(),
        organizer: org,
        description: cleanDesc,
        category: classifyCategory(`${item.title} ${cleanDesc}`, domains),
        domains: domains.length > 0 ? domains : [classifyCategory(cleanDesc)],
        format,
        location: locDisplay,
        city,
        state,
        country,
        start_date: item.start_date || null,
        end_date: item.end_date || null,
        registration_deadline: regDeadline,
        registration_status: inferStatus(
          regDeadline,
          item.start_date,
          item.end_date,
          item.reg_status === 'CLOSED' ? 'closed' : 'open'
        ),
        prize_pool: prizePool,
        prize_value_inr: prizeInr,
        eligibility,
        team_size_min: regMin ? Number(regMin) : 1,
        team_size_max: regMax ? Number(regMax) : null,
        registration_url: url,
        source_platform: 'Unstop',
      };
    });
}

async function discoverDevfolio(): Promise<RawNormalizedHackathon[]> {
  const res = await fetchWithRetry('https://api.devfolio.co/api/search/hackathons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'application_open', from: 0, size: 20 }),
  });
  if (!res.ok) throw new Error(`Devfolio returned HTTP ${res.status}`);
  const data = (await res.json()) as any;
  const hits = Array.isArray(data?.hits?.hits) ? data.hits.hits : [];

  return hits
    .map((h: any) => h?._source)
    .filter((s: any) => s?.name && s?.slug)
    .map((s: any): RawNormalizedHackathon => {
      const desc = stripHtml(s.desc || s.tagline || s.name).slice(0, 650);
      const isOnline = Boolean(s.is_online);
      const locParts = [s.city, s.state, s.country].filter(Boolean);
      const location = isOnline
        ? 'Online'
        : locParts.length > 0
        ? locParts.join(', ')
        : s.location || 'See official page';
      const format: HackathonFormat = isOnline ? 'online' : s.apply_mode === 'both' ? 'hybrid' : 'offline';

      const prizeTextMatch = desc.match(/([₹$][\d,]+(?:\s*(?:INR|USD|Lakh|K))?)/i);
      let prizePool = 'Not specified';
      if (prizeTextMatch) {
        prizePool = prizeTextMatch[1];
      } else if (Array.isArray(s.prizes) && s.prizes.length > 0) {
        prizePool = s.prizes.map((p: any) => p.name).slice(0, 2).join(' · ');
      }

      const faqs = Array.isArray(s.hackathon_faqs) ? s.hackathon_faqs : [];
      const eligFaq = faqs.find((f: any) => /eligib|who can/i.test(f.question || ''));
      const eligibility = s.hackathon_setting?.women_only
        ? 'Women-only hackathon'
        : eligFaq?.answer
        ? stripHtml(eligFaq.answer).slice(0, 180)
        : 'Open to eligible builders (see Devfolio page)';

      const themes = Array.isArray(s.themes)
        ? s.themes.map((t: any) => t?.theme?.name || t?.name).filter(Boolean)
        : [];

      const regDeadline = s.hackathon_setting?.reg_ends_at || s.ends_at || null;
      const url = `https://${s.slug}.devfolio.co/`;

      return {
        external_id: s.uuid || s.slug,
        title: String(s.name).trim(),
        organizer: s.hosted_by || s.tagline || 'Devfolio Organizer',
        description: desc,
        category: classifyCategory(`${s.name} ${desc}`, themes),
        domains: themes.length > 0 ? themes : [classifyCategory(desc)],
        format,
        location,
        city: s.city || null,
        state: s.state || null,
        country: s.country || null,
        start_date: s.starts_at || null,
        end_date: s.ends_at || null,
        registration_deadline: regDeadline,
        registration_status: inferStatus(regDeadline, s.starts_at, s.ends_at),
        prize_pool: prizePool,
        prize_value_inr: parsePrizeValueInr(prizePool),
        eligibility,
        team_size_min: s.team_min ?? 1,
        team_size_max: s.team_size ?? null,
        registration_url: url,
        source_platform: 'Devfolio',
      };
    });
}

async function discoverHackerEarth(): Promise<RawNormalizedHackathon[]> {
  const res = await fetchWithRetry('https://www.hackerearth.com/chrome-extension/events/');
  if (!res.ok) throw new Error(`HackerEarth returned HTTP ${res.status}`);
  const data = (await res.json()) as any;
  const list = Array.isArray(data?.response) ? data.response : [];

  return list
    .filter((item: any) => item?.title && item?.url)
    .filter((item: any) =>
      String(item.url).includes('hackathon') ||
      String(item.challenge_type || '').toLowerCase().includes('hackathon') ||
      String(item.challenge_type || '').toLowerCase().includes('challenge')
    )
    .map((item: any): RawNormalizedHackathon => {
      const desc = stripHtml(item.description) || item.title;
      const startIso = item.start_utc_tz ? new Date(item.start_utc_tz).toISOString() : null;
      const endIso = item.end_utc_tz ? new Date(item.end_utc_tz).toISOString() : null;
      const statusRaw = String(item.status || '').toLowerCase();

      return {
        external_id: item.url,
        title: String(item.title).trim(),
        organizer: item.is_hackerearth ? 'HackerEarth' : 'HackerEarth Partner',
        description: desc,
        category: classifyCategory(`${item.title} ${desc}`),
        domains: [classifyCategory(desc), item.challenge_type || 'Coding'].filter(Boolean),
        format: 'online',
        location: 'Online',
        city: null,
        state: null,
        country: null,
        start_date: startIso,
        end_date: endIso,
        registration_deadline: endIso,
        registration_status: inferStatus(
          endIso,
          startIso,
          endIso,
          statusRaw === 'upcoming' ? 'upcoming' : 'open'
        ),
        prize_pool: 'See HackerEarth challenge page',
        prize_value_inr: null,
        eligibility: item.college ? 'College students' : 'Open to developers worldwide',
        team_size_min: 1,
        team_size_max: null,
        registration_url: item.url,
        source_platform: 'HackerEarth',
      };
    });
}

async function discoverMLH(): Promise<RawNormalizedHackathon[]> {
  const res = await fetchWithRetry('https://mlh.io/seasons/2027/events');
  if (!res.ok) throw new Error(`MLH returned HTTP ${res.status}`);
  const html = await res.text();
  const match = html.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('MLH Inertia event payload not found');

  const parsed = JSON.parse(match[1]) as any;
  const upcoming = Array.isArray(parsed?.props?.upcomingEvents)
    ? parsed.props.upcomingEvents
    : [];

  return upcoming
    .filter((ev: any) => ev?.name && (ev?.websiteUrl || ev?.url))
    .map((ev: any): RawNormalizedHackathon => {
      const format: HackathonFormat =
        ev.formatType === 'digital'
          ? 'online'
          : ev.formatType === 'hybrid'
          ? 'hybrid'
          : 'offline';
      const city = ev.venueAddress?.city || null;
      const state = ev.venueAddress?.state || null;
      const country = ev.venueAddress?.country || null;
      const location =
        format === 'online'
          ? 'Online'
          : ev.location || [city, state, country].filter(Boolean).join(', ') || 'See MLH page';
      const focus: string[] = Array.isArray(ev.customFields?.hackathon_focus)
        ? ev.customFields.hackathon_focus
        : ['Software'];
      const regUrl = ev.websiteUrl || `https://mlh.io${ev.url}`;
      const organizer = ev.organizationName || 'MLH Member Event';
      const desc = `${ev.name} (${ev.dateRange || 'MLH 2027 Season'}) — ${ev.formatLabel || format} hackathon in ${location}. Focus: ${focus.join(', ')}.`;

      return {
        external_id: String(ev.id || ev.slug),
        title: String(ev.name).trim(),
        organizer,
        description: desc,
        category: classifyCategory(desc, focus),
        domains: focus,
        format,
        location,
        city,
        state,
        country,
        start_date: ev.startsAt || null,
        end_date: ev.endsAt || null,
        registration_deadline: ev.startsAt || null,
        registration_status: inferStatus(ev.startsAt, ev.startsAt, ev.endsAt, 'upcoming'),
        prize_pool: 'See official event page',
        prize_value_inr: null,
        eligibility: 'Students & MLH community participants',
        team_size_min: 1,
        team_size_max: 4,
        registration_url: regUrl,
        source_platform: 'MLH',
      };
    });
}

async function discoverHack2Skill(): Promise<RawNormalizedHackathon[]> {
  const res = await fetchWithRetry(
    'https://vision.hack2skill.com/api/v1/innovator/public/event/list?page=1&limit=20'
  );
  if (!res.ok) throw new Error(`Hack2Skill returned HTTP ${res.status}`);
  const json = (await res.json()) as any;
  const flagship = Array.isArray(json?.data?.flagshipEvents) ? json.data.flagshipEvents : [];
  const community = Array.isArray(json?.data?.communityEvents) ? json.data.communityEvents : [];
  const all = [...flagship, ...community];

  return all
    .filter((ev: any) => ev?.title && ev?.eventUrl)
    .map((ev: any): RawNormalizedHackathon => {
      const mode = String(ev.tags?.mode?.value || 'VIRTUAL').toUpperCase();
      const format: HackathonFormat =
        mode === 'VIRTUAL' || mode === 'ONLINE'
          ? 'online'
          : mode === 'HYBRID'
          ? 'hybrid'
          : 'offline';
      const regions: string[] = Array.isArray(ev.tags?.region?.value) ? ev.tags.region.value : [];
      const techs: string[] = Array.isArray(ev.tags?.technology?.value) ? ev.tags.technology.value : [];
      const location =
        format === 'online'
          ? regions.length > 0
            ? `Online (${regions.join(', ')})`
            : 'Online'
          : regions.join(', ') || 'India';

      const minTeam = ev.tags?.teamSize?.min ?? 1;
      const maxTeam = ev.tags?.teamSize?.max ?? null;
      const url = ev.customEventUrl
        ? ev.customEventUrl
        : `https://vision.hack2skill.com/event/${ev.eventUrl}`;
      const desc = `${ev.title} (${ev.flag || 'Hackathon'}) on Hack2Skill. Mode: ${mode}. Team size: ${minTeam}${maxTeam ? `–${maxTeam}` : '+'}.`;

      return {
        external_id: String(ev._id || ev.eventUrl),
        title: String(ev.title).trim(),
        organizer: 'Hack2Skill',
        description: desc,
        category: classifyCategory(`${ev.title} ${techs.join(' ')}`, techs),
        domains: techs.length > 0 ? techs : [classifyCategory(ev.title)],
        format,
        location,
        city: null,
        state: null,
        country: regions.includes('India') ? 'India' : null,
        start_date: ev.registrationStart || null,
        end_date: ev.registrationEnd || null,
        registration_deadline: ev.registrationEnd || null,
        registration_status: inferStatus(ev.registrationEnd, ev.registrationStart, ev.registrationEnd),
        prize_pool: 'See Hack2Skill event page',
        prize_value_inr: null,
        eligibility: ev.tags?.age
          ? `Age ${ev.tags.age.min}–${ev.tags.age.max}; see Hack2Skill event rules`
          : 'Open to innovators (see event page)',
        team_size_min: minTeam,
        team_size_max: maxTeam,
        registration_url: url,
        source_platform: 'Hack2Skill',
      };
    });
}

const PLATFORM_FETCHERS: Record<SourcePlatform, () => Promise<RawNormalizedHackathon[]>> = {
  Devpost: discoverDevpost,
  Unstop: discoverUnstop,
  Devfolio: discoverDevfolio,
  HackerEarth: discoverHackerEarth,
  MLH: discoverMLH,
  Hack2Skill: discoverHack2Skill,
};

export async function runDiscoverySync(
  platforms: SourcePlatform[] = ALL_PLATFORMS
): Promise<{
  runs: Array<{
    platform: SourcePlatform;
    status: 'success' | 'error';
    discovered_count: number;
    new_count: number;
    updated_count: number;
    error_message: string | null;
    duration_ms: number;
  }>;
  total_new: number;
  total_updated: number;
}> {
  const prefs = getPreferences();
  const runs: Array<{
    platform: SourcePlatform;
    status: 'success' | 'error';
    discovered_count: number;
    new_count: number;
    updated_count: number;
    error_message: string | null;
    duration_ms: number;
  }> = [];

  const selectExisting = db.prepare(
    'SELECT id, registration_deadline, prize_pool, registration_status FROM hackathons WHERE dedup_key = ?'
  );
  const isSavedStmt = db.prepare('SELECT hackathon_id FROM saved_hackathons WHERE hackathon_id = ?');

  const upsertHackathon = db.prepare(`
    INSERT INTO hackathons (
      id, external_id, dedup_key, title, organizer, description, category, domains,
      format, location, city, state, country, latitude, longitude,
      start_date, end_date, registration_deadline, registration_status,
      prize_pool, prize_value_inr, eligibility, team_size_min, team_size_max,
      registration_url, source_platform, is_verified, discovered_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, 1, ?, ?
    )
    ON CONFLICT(dedup_key) DO UPDATE SET
      description = excluded.description,
      category = excluded.category,
      domains = excluded.domains,
      format = excluded.format,
      location = excluded.location,
      city = COALESCE(excluded.city, hackathons.city),
      state = COALESCE(excluded.state, hackathons.state),
      country = COALESCE(excluded.country, hackathons.country),
      latitude = COALESCE(excluded.latitude, hackathons.latitude),
      longitude = COALESCE(excluded.longitude, hackathons.longitude),
      start_date = COALESCE(excluded.start_date, hackathons.start_date),
      end_date = COALESCE(excluded.end_date, hackathons.end_date),
      registration_deadline = COALESCE(excluded.registration_deadline, hackathons.registration_deadline),
      registration_status = excluded.registration_status,
      prize_pool = excluded.prize_pool,
      prize_value_inr = COALESCE(excluded.prize_value_inr, hackathons.prize_value_inr),
      eligibility = excluded.eligibility,
      team_size_min = COALESCE(excluded.team_size_min, hackathons.team_size_min),
      team_size_max = COALESCE(excluded.team_size_max, hackathons.team_size_max),
      registration_url = excluded.registration_url,
      updated_at = excluded.updated_at
  `);

  const insertRun = db.prepare(`
    INSERT INTO discovery_runs (
      platform, status, discovered_count, new_count, updated_count, error_message, duration_ms, ran_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const results = await Promise.all(
    platforms.map(async (platform) => {
      const t0 = Date.now();
      try {
        const fetcher = PLATFORM_FETCHERS[platform];
        const items = await fetcher();
        const now = new Date().toISOString();
        let newCount = 0;
        let updatedCount = 0;

        const tx = db.transaction(() => {
          for (const item of items) {
            const dedupKey = makeDedupKey(item.title, item.organizer);
            const existing = selectExisting.get(dedupKey) as any;
            const id = existing?.id || makeId(dedupKey);
            const geo = resolveCoordinates(item.location, item.city, item.state, item.country);

            upsertHackathon.run(
              id,
              item.external_id,
              dedupKey,
              item.title,
              item.organizer,
              item.description,
              item.category,
              JSON.stringify(item.domains),
              item.format,
              item.location,
              geo.city,
              geo.state,
              geo.country,
              geo.lat,
              geo.lng,
              item.start_date,
              item.end_date,
              item.registration_deadline,
              item.registration_status,
              item.prize_pool,
              item.prize_value_inr,
              item.eligibility,
              item.team_size_min,
              item.team_size_max,
              item.registration_url,
              item.source_platform,
              now,
              now
            );

            if (!existing) {
              newCount++;
            } else {
              updatedCount++;
              // Detect changes to saved hackathons
              const saved = isSavedStmt.get(id);
              if (saved && prefs.notify_saved_changes) {
                const deadlineChanged =
                  item.registration_deadline &&
                  existing.registration_deadline &&
                  item.registration_deadline !== existing.registration_deadline;
                const statusChanged = item.registration_status !== existing.registration_status;
                if (deadlineChanged || statusChanged) {
                  createNotificationIfNew({
                    dedup_key: `change:${id}:${item.registration_deadline || item.registration_status}`,
                    type: 'change',
                    title: `Saved Hackathon Updated: ${item.title}`,
                    message: statusChanged
                      ? `Registration status changed to "${item.registration_status}".`
                      : `Registration deadline updated to ${new Date(item.registration_deadline!).toLocaleDateString()}.`,
                    hackathon_id: id,
                  });
                }
              }
            }
          }
        });
        tx();

        const duration = Date.now() - t0;
        insertRun.run(platform, 'success', items.length, newCount, updatedCount, null, duration, now);

        if (newCount > 0 && prefs.notify_new_discoveries) {
          createNotificationIfNew({
            dedup_key: `discovery:${platform}:${now.slice(0, 13)}:${newCount}`,
            type: 'discovery',
            title: `${newCount} new hackathons discovered on ${platform}`,
            message: `Synced ${items.length} verified listings from ${platform} in ${duration}ms.`,
          });
        }

        return {
          platform,
          status: 'success' as const,
          discovered_count: items.length,
          new_count: newCount,
          updated_count: updatedCount,
          error_message: null,
          duration_ms: duration,
        };
      } catch (err: any) {
        const duration = Date.now() - t0;
        const msg = err?.message || 'Unknown discovery error';
        insertRun.run(platform, 'error', 0, 0, 0, msg, duration, new Date().toISOString());
        return {
          platform,
          status: 'error' as const,
          discovered_count: 0,
          new_count: 0,
          updated_count: 0,
          error_message: msg,
          duration_ms: duration,
        };
      }
    })
  );

  runs.push(...results);
  recomputeAllDeterministicScores();

  // Notify high-compatibility discoveries
  if (prefs.notify_new_recommendations) {
    const highMatches = db
      .prepare(
        `SELECT h.id, h.title, h.source_platform, r.compatibility_score
         FROM hackathons h
         JOIN ai_recommendations r ON r.hackathon_id = h.id
         WHERE h.registration_status != 'expired'
           AND r.compatibility_score >= ?
         ORDER BY r.compatibility_score DESC
         LIMIT 3`
      )
      .all(prefs.min_match_threshold) as any[];

    for (const m of highMatches) {
      createNotificationIfNew({
        dedup_key: `rec:${m.id}:${Math.floor(m.compatibility_score)}`,
        type: 'recommendation',
        title: `High-Match Opportunity (${Math.round(m.compatibility_score)}%): ${m.title}`,
        message: `Discovered on ${m.source_platform}. Matches your skill and domain profile.`,
        hackathon_id: m.id,
      });
    }
  }

  return {
    runs,
    total_new: runs.reduce((acc, r) => acc + r.new_count, 0),
    total_updated: runs.reduce((acc, r) => acc + r.updated_count, 0),
  };
}

export function getPlatformStatuses(): PlatformStatus[] {
  return ALL_PLATFORMS.map((platform) => {
    const countRow = db
      .prepare('SELECT COUNT(*) as cnt FROM hackathons WHERE source_platform = ?')
      .get(platform) as { cnt: number };
    const lastRun = db
      .prepare(
        'SELECT * FROM discovery_runs WHERE platform = ? ORDER BY id DESC LIMIT 1'
      )
      .get(platform) as any;

    return {
      platform,
      status: lastRun ? lastRun.status : 'never',
      last_sync_at: lastRun ? lastRun.ran_at : null,
      total_listings: countRow?.cnt ?? 0,
      last_discovered_count: lastRun ? lastRun.discovered_count : 0,
      last_new_count: lastRun ? lastRun.new_count : 0,
      error_message: lastRun ? lastRun.error_message : null,
      duration_ms: lastRun ? lastRun.duration_ms : null,
    };
  });
}
