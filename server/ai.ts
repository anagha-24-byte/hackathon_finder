import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  db,
  getMatchingWeights,
  getUserProfile,
  safeJsonParse,
} from './db.ts';
import { haversineKm } from './geo.ts';
import type {
  Hackathon,
  MatchingWeights,
  NLSearchFilters,
  RecommendationDetails,
  ScoreBreakdown,
  UserProfile,
} from '../src/types.ts';

const GEMINI_MODEL = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add it in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || err);
      // Do not retry auth/invalid key errors
      if (
        msg.includes('API_KEY_INVALID') ||
        msg.includes('PERMISSION_DENIED') ||
        msg.includes('400') ||
        msg.includes('403')
      ) {
        throw err;
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 600 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  'AI/ML': ['ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'gemini', 'genai', 'agent', 'nlp', 'deep learning', 'computer vision', 'rag', 'neural'],
  'Web Development': ['web', 'react', 'typescript', 'javascript', 'frontend', 'backend', 'full-stack', 'fullstack', 'node', 'next.js', 'api', 'saas', 'html', 'css'],
  'Web3 / Blockchain': ['web3', 'blockchain', 'crypto', 'solidity', 'ethereum', 'smart contract', 'defi', 'nft', 'solana', 'zk'],
  'Cybersecurity': ['security', 'cybersecurity', 'bug bounty', 'ctf', 'vulnerability', 'penetration', 'infosec', 'ethical hacker', 'privacy'],
  'FinTech': ['fintech', 'finance', 'payments', 'banking', 'trading', 'insurtech', 'credit'],
  'HealthTech': ['health', 'healthcare', 'medical', 'biotech', 'wellness', 'clinical', 'patient'],
  'Cloud & DevTools': ['cloud', 'devops', 'kubernetes', 'docker', 'developer tools', 'devtools', 'cli', 'infrastructure', 'aws', 'gcp'],
  'Hardware & IoT': ['hardware', 'iot', 'robotics', 'embedded', 'arduino', 'raspberry', 'sensor', 'drone', 'fpga'],
  'Sustainability': ['climate', 'sustainability', 'green', 'clean energy', 'environment', 'social good', 'impact'],
};

export function computeTransparentScore(
  hackathon: Hackathon,
  profile: UserProfile,
  weights: MatchingWeights
): RecommendationDetails {
  const haystack = [
    hackathon.title,
    hackathon.description,
    hackathon.category,
    ...hackathon.domains,
    hackathon.eligibility,
  ]
    .join(' ')
    .toLowerCase();

  // 1. Skill Compatibility (0..100)
  const userSkillsAndLangs = Array.from(
    new Set([...profile.skills, ...profile.languages].map((s) => s.trim()).filter(Boolean))
  );
  const matchedSkills: string[] = [];
  for (const skill of userSkillsAndLangs) {
    const lower = skill.toLowerCase();
    if (haystack.includes(lower)) {
      matchedSkills.push(skill);
    } else if (lower === 'generative ai' && (haystack.includes('ai') || haystack.includes('llm') || haystack.includes('gemini'))) {
      matchedSkills.push(skill);
    } else if (lower === 'machine learning' && (haystack.includes('ml') || haystack.includes('ai'))) {
      matchedSkills.push(skill);
    } else if ((lower === 'full-stack web' || lower === 'web development') && (haystack.includes('web') || haystack.includes('software') || haystack.includes('app'))) {
      matchedSkills.push(skill);
    }
  }
  const skillRatio =
    userSkillsAndLangs.length > 0
      ? Math.min(1, matchedSkills.length / Math.min(3, userSkillsAndLangs.length))
      : 0.5;
  const skillScore = Math.round(
    matchedSkills.length > 0 ? 45 + skillRatio * 55 : haystack.includes('open') || haystack.includes('software') ? 45 : 25
  );

  // 2. Domain Interest (0..100)
  const userInterests = Array.from(
    new Set([...profile.preferred_domains, ...profile.interests].map((s) => s.trim()).filter(Boolean))
  );
  let domainMatches = 0;
  const matchedDomains: string[] = [];
  for (const dom of userInterests) {
    const dLower = dom.toLowerCase();
    const keywords = DOMAIN_KEYWORDS[dom] || [dLower];
    if (haystack.includes(dLower) || keywords.some((kw) => haystack.includes(kw))) {
      domainMatches++;
      matchedDomains.push(dom);
    }
  }
  let domainScore = 30;
  if (domainMatches > 0) {
    domainScore = Math.min(100, 55 + domainMatches * 22);
  } else if (hackathon.category.toLowerCase().includes('open')) {
    domainScore = 60;
  }

  // 3. Location Preference (0..100)
  let locationScore = 70;
  if (hackathon.format === 'online') {
    locationScore = 95;
  } else if (profile.preferred_city || profile.preferred_state || (profile.preferred_lat != null && profile.preferred_lng != null)) {
    const cityMatch =
      profile.preferred_city &&
      (hackathon.city?.toLowerCase() === profile.preferred_city.toLowerCase() ||
        hackathon.location.toLowerCase().includes(profile.preferred_city.toLowerCase()));
    const stateMatch =
      profile.preferred_state &&
      (hackathon.state?.toLowerCase() === profile.preferred_state.toLowerCase() ||
        hackathon.location.toLowerCase().includes(profile.preferred_state.toLowerCase()));
    if (cityMatch) {
      locationScore = 100;
    } else if (
      profile.preferred_lat != null &&
      profile.preferred_lng != null &&
      hackathon.latitude != null &&
      hackathon.longitude != null
    ) {
      const dist = haversineKm(
        profile.preferred_lat,
        profile.preferred_lng,
        hackathon.latitude,
        hackathon.longitude
      );
      if (dist <= 50) locationScore = 100;
      else if (dist <= 150) locationScore = 85;
      else if (dist <= 500) locationScore = 65;
      else locationScore = 30;
    } else if (stateMatch) {
      locationScore = 82;
    } else {
      locationScore = 35;
    }
  }

  // 4. Eligibility (0..100)
  const eligLower = (hackathon.eligibility || '').toLowerCase();
  let eligibilityScore = 85;
  let eligibilityNote = 'Open registration; verify detailed track rules on the official page.';
  if (eligLower.includes('invite only')) {
    eligibilityScore = 25;
    eligibilityNote = 'Invite-only event — confirm invitation eligibility before applying.';
  } else if (eligLower.includes('women only') || eligLower.includes('women-only')) {
    eligibilityScore = 60;
    eligibilityNote = 'Women-focused eligibility criteria noted on the official listing.';
  } else if (eligLower.includes('student') || eligLower.includes('undergraduate') || eligLower.includes('open to')) {
    eligibilityScore = 95;
    eligibilityNote = `Matches broad developer/student eligibility (${hackathon.eligibility}).`;
  }

  // Team size check inside eligibility / format fit
  if (
    profile.team_size_preference === 'solo' &&
    hackathon.team_size_min != null &&
    hackathon.team_size_min > 1
  ) {
    eligibilityScore = Math.max(30, eligibilityScore - 35);
    eligibilityNote += ` Minimum team size is ${hackathon.team_size_min}, whereas your preference is solo.`;
  }

  // 5. Experience Level (0..100)
  let expScore = 75;
  const isBeginnerFriendly =
    haystack.includes('beginner') ||
    haystack.includes('no prior hackathon') ||
    haystack.includes('students') ||
    haystack.includes('all skill');
  if (profile.experience_level === 'beginner') {
    expScore = isBeginnerFriendly ? 100 : 62;
  } else if (profile.experience_level === 'intermediate') {
    expScore = isBeginnerFriendly ? 85 : 88;
  } else {
    expScore = haystack.includes('enterprise') || haystack.includes('bug bounty') || haystack.includes('production') ? 96 : 82;
  }

  // 6. Event Format (0..100)
  let formatScore = 85;
  if (profile.format_preference === 'any') {
    formatScore = 92;
  } else if (profile.format_preference === hackathon.format) {
    formatScore = 100;
  } else if (hackathon.format === 'hybrid') {
    formatScore = 80;
  } else {
    formatScore = 35;
  }

  // 7. Deadline Suitability (0..100)
  let deadlineScore = 70;
  let deadlineSummary = 'Check official page for exact submission schedule.';
  if (hackathon.registration_status === 'expired') {
    deadlineScore = 0;
    deadlineSummary = 'Registration / event window has closed.';
  } else if (hackathon.registration_deadline) {
    const msLeft = new Date(hackathon.registration_deadline).getTime() - Date.now();
    const hoursLeft = msLeft / (1000 * 60 * 60);
    if (hoursLeft <= 0) {
      deadlineScore = 0;
      deadlineSummary = 'Registration deadline has passed.';
    } else if (hoursLeft < 12) {
      deadlineScore = 50;
      deadlineSummary = `Closes in ${Math.max(1, Math.round(hoursLeft))} hours — immediate action required.`;
    } else if (hoursLeft <= 72) {
      deadlineScore = 78;
      deadlineSummary = `Closing soon (${Math.round(hoursLeft / 24)} days left) — register promptly.`;
    } else if (hoursLeft <= 24 * 30) {
      deadlineScore = 96;
      deadlineSummary = `Ideal prep window (${Math.round(hoursLeft / 24)} days remaining before deadline).`;
    } else {
      deadlineScore = 88;
      deadlineSummary = `Open registration with ${Math.round(hoursLeft / 24)} days remaining.`;
    }
  } else if (hackathon.registration_status === 'upcoming') {
    deadlineScore = 82;
    deadlineSummary = hackathon.start_date
      ? `Upcoming event starting ${new Date(hackathon.start_date).toLocaleDateString()}.`
      : 'Upcoming registration window.';
  }

  const breakdown: ScoreBreakdown = {
    skill_compatibility: skillScore,
    domain_interest: domainScore,
    location_preference: locationScore,
    eligibility: eligibilityScore,
    experience_level: expScore,
    event_format: formatScore,
    deadline_suitability: deadlineScore,
  };

  const totalWeight =
    weights.skill_compatibility +
    weights.domain_interest +
    weights.location_preference +
    weights.eligibility +
    weights.experience_level +
    weights.event_format +
    weights.deadline_suitability;

  const norm = totalWeight > 0 ? totalWeight : 1;
  const weighted =
    (breakdown.skill_compatibility * weights.skill_compatibility +
      breakdown.domain_interest * weights.domain_interest +
      breakdown.location_preference * weights.location_preference +
      breakdown.eligibility * weights.eligibility +
      breakdown.experience_level * weights.experience_level +
      breakdown.event_format * weights.event_format +
      breakdown.deadline_suitability * weights.deadline_suitability) /
    norm;

  const compatibility_score = Math.round(weighted * 10) / 10;

  const whyParts: string[] = [];
  if (matchedSkills.length > 0) {
    whyParts.push(`Aligns with your skills in ${matchedSkills.slice(0, 4).join(', ')}.`);
  }
  if (matchedDomains.length > 0) {
    whyParts.push(`Matches your interest in ${matchedDomains.slice(0, 3).join(', ')}.`);
  }
  if (hackathon.format === 'online') {
    whyParts.push('Accessible remotely via online participation.');
  } else if (locationScore >= 80) {
    whyParts.push(`Conveniently located in ${hackathon.location}.`);
  }
  if (whyParts.length === 0) {
    whyParts.push(
      `Listed under ${hackathon.category} on ${hackathon.source_platform} with ${hackathon.format} participation.`
    );
  }

  const checklist: string[] = [
    `Review official tracks, rules, and submission format on ${hackathon.source_platform}.`,
    matchedSkills.length > 0
      ? `Prepare starter templates or boilerplate using ${matchedSkills.slice(0, 2).join(' and ')}.`
      : `Select a core tech stack from your profile (${profile.languages.slice(0, 2).join(', ') || 'preferred tools'}).`,
    hackathon.team_size_max && hackathon.team_size_max > 1
      ? `Confirm team formation (allowed size: ${hackathon.team_size_min ?? 1}–${hackathon.team_size_max} members).`
      : 'Confirm solo registration requirements and submission checklist.',
  ];

  return {
    hackathon_id: hackathon.id,
    compatibility_score,
    breakdown,
    why_matches: whyParts.join(' '),
    relevant_skills: matchedSkills,
    eligibility_assessment: eligibilityNote,
    important_deadlines: deadlineSummary,
    preparation_checklist: checklist,
    ai_enhanced: false,
    computed_at: new Date().toISOString(),
  };
}

export function recomputeAllDeterministicScores(): number {
  const profile = getUserProfile();
  const weights = getMatchingWeights();
  const rows = db.prepare('SELECT * FROM hackathons').all() as any[];

  const upsert = db.prepare(`
    INSERT INTO ai_recommendations (
      hackathon_id, compatibility_score, breakdown_json, why_matches,
      relevant_skills, eligibility_assessment, important_deadlines,
      preparation_checklist, ai_enhanced, computed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT(hackathon_id) DO UPDATE SET
      compatibility_score = excluded.compatibility_score,
      breakdown_json = excluded.breakdown_json,
      why_matches = CASE WHEN ai_recommendations.ai_enhanced = 1 THEN ai_recommendations.why_matches ELSE excluded.why_matches END,
      relevant_skills = CASE WHEN ai_recommendations.ai_enhanced = 1 THEN ai_recommendations.relevant_skills ELSE excluded.relevant_skills END,
      eligibility_assessment = CASE WHEN ai_recommendations.ai_enhanced = 1 THEN ai_recommendations.eligibility_assessment ELSE excluded.eligibility_assessment END,
      important_deadlines = excluded.important_deadlines,
      preparation_checklist = CASE WHEN ai_recommendations.ai_enhanced = 1 THEN ai_recommendations.preparation_checklist ELSE excluded.preparation_checklist END,
      computed_at = excluded.computed_at
  `);

  const tx = db.transaction(() => {
    for (const row of rows) {
      const h: Hackathon = {
        ...row,
        domains: safeJsonParse(row.domains, []),
        is_verified: Boolean(row.is_verified),
      };
      const rec = computeTransparentScore(h, profile, weights);
      upsert.run(
        rec.hackathon_id,
        rec.compatibility_score,
        JSON.stringify(rec.breakdown),
        rec.why_matches,
        JSON.stringify(rec.relevant_skills),
        rec.eligibility_assessment,
        rec.important_deadlines,
        JSON.stringify(rec.preparation_checklist),
        rec.computed_at
      );
    }
  });
  tx();
  return rows.length;
}

export async function enhanceRecommendationsWithGemini(hackathonIds?: string[]): Promise<{
  analyzed_count: number;
  model: string;
}> {
  const ai = getGeminiClient();
  const profile = getUserProfile();
  const weights = getMatchingWeights();

  // First ensure deterministic scores are up to date
  recomputeAllDeterministicScores();

  let targetRows: any[];
  if (hackathonIds && hackathonIds.length > 0) {
    const placeholders = hackathonIds.map(() => '?').join(',');
    targetRows = db
      .prepare(
        `SELECT h.*, r.compatibility_score, r.breakdown_json
         FROM hackathons h
         JOIN ai_recommendations r ON r.hackathon_id = h.id
         WHERE h.id IN (${placeholders})`
      )
      .all(...hackathonIds);
  } else {
    targetRows = db
      .prepare(
        `SELECT h.*, r.compatibility_score, r.breakdown_json
         FROM hackathons h
         JOIN ai_recommendations r ON r.hackathon_id = h.id
         WHERE h.registration_status != 'expired'
         ORDER BY r.compatibility_score DESC
         LIMIT 4`
      )
      .all();
  }

  if (targetRows.length === 0) {
    return { analyzed_count: 0, model: GEMINI_MODEL };
  }

  const promptPayload = targetRows.map((row) => ({
    id: row.id,
    title: row.title,
    organizer: row.organizer,
    category: row.category,
    domains: safeJsonParse(row.domains, []),
    format: row.format,
    location: row.location,
    registration_deadline: row.registration_deadline,
    start_date: row.start_date,
    prize_pool: row.prize_pool,
    eligibility: row.eligibility,
    team_size_min: row.team_size_min,
    team_size_max: row.team_size_max,
    description_excerpt: String(row.description || '').slice(0, 400),
    weighted_score: row.compatibility_score,
    score_breakdown: safeJsonParse(row.breakdown_json, {}),
  }));

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Analyze these verified hackathons for the user profile below.
Be strictly factual: never invent prizes, URLs, or dates not present in the hackathon data. Reference the transparent score_breakdown honestly.

User Profile:
- Name: ${profile.name}
- Skills: ${profile.skills.join(', ')}
- Languages: ${profile.languages.join(', ')}
- Interests: ${profile.interests.join(', ')}
- Preferred Domains: ${profile.preferred_domains.join(', ')}
- Experience Level: ${profile.experience_level}
- Preferred Location: ${profile.preferred_city || profile.preferred_location || 'Not specified'}
- Team Size Preference: ${profile.team_size_preference}
- Format Preference: ${profile.format_preference}

Active Matching Weights:
${JSON.stringify({
  skill: weights.skill_compatibility,
  domain: weights.domain_interest,
  location: weights.location_preference,
  eligibility: weights.eligibility,
  experience: weights.experience_level,
  format: weights.event_format,
  deadline: weights.deadline_suitability,
})}

Hackathons:
${JSON.stringify(promptPayload, null, 2)}`,
      config: {
        systemInstruction:
          'You are HackMate AI, a precise technical hackathon advisor. Produce grounded, concise, actionable guidance for each hackathon ID.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              hackathon_id: { type: Type.STRING },
              why_matches: {
                type: Type.STRING,
                description: '2-3 sentence explanation citing concrete profile skills, domains, and weighted score factors.',
              },
              relevant_skills: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              eligibility_assessment: { type: Type.STRING },
              important_deadlines: { type: Type.STRING },
              preparation_checklist: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'hackathon_id',
              'why_matches',
              'relevant_skills',
              'eligibility_assessment',
              'important_deadlines',
              'preparation_checklist',
            ],
          },
        },
      },
    })
  );

  const parsed = JSON.parse((response.text ?? '[]').trim()) as Array<{
    hackathon_id: string;
    why_matches: string;
    relevant_skills: string[];
    eligibility_assessment: string;
    important_deadlines: string;
    preparation_checklist: string[];
  }>;

  const updateStmt = db.prepare(`
    UPDATE ai_recommendations
    SET why_matches = ?,
        relevant_skills = ?,
        eligibility_assessment = ?,
        important_deadlines = ?,
        preparation_checklist = ?,
        ai_enhanced = 1,
        computed_at = ?
    WHERE hackathon_id = ?
  `);

  const now = new Date().toISOString();
  let updated = 0;
  const tx = db.transaction(() => {
    for (const item of parsed) {
      const res = updateStmt.run(
        item.why_matches,
        JSON.stringify(item.relevant_skills || []),
        item.eligibility_assessment,
        item.important_deadlines,
        JSON.stringify(item.preparation_checklist || []),
        now,
        item.hackathon_id
      );
      if (res.changes > 0) updated++;
    }
  });
  tx();

  return { analyzed_count: updated, model: GEMINI_MODEL };
}

export async function parseNaturalLanguageQuery(naturalQuery: string): Promise<{
  filters: NLSearchFilters;
  model: string;
}> {
  const ai = getGeminiClient();
  const today = new Date().toISOString().slice(0, 10);

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Today's date is ${today}. Convert the following natural-language hackathon search query into structured search filters.
Query: "${naturalQuery}"

Currency note: If prize is mentioned in INR (e.g., ₹50,000), set min_prize_inr directly. If mentioned in USD (e.g., $1,000), convert approximately at 1 USD = 84 INR.`,
      config: {
        systemInstruction:
          'You parse natural language hackathon search queries into clean structured filter parameters. Leave fields empty/null when not mentioned.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: 'Core keyword search terms (e.g. AI, blockchain, security). Empty string if only location/format/prize filters apply.',
            },
            domain: {
              type: Type.STRING,
              description: 'Domain category such as AI/ML, Web Development, Cybersecurity, Web3 / Blockchain, FinTech, HealthTech, Hardware & IoT, or empty string.',
            },
            city: { type: Type.STRING },
            state: { type: Type.STRING },
            format: {
              type: Type.STRING,
              description: 'One of: online, offline, hybrid, or empty string.',
            },
            min_prize_inr: {
              type: Type.NUMBER,
              description: 'Minimum prize pool in INR, or 0 if not specified.',
            },
            closing_within_days: {
              type: Type.INTEGER,
              description: 'Number of days until registration closes (e.g. 7 for this week), or 0 if not specified.',
            },
            solo_only: { type: Type.BOOLEAN },
            beginner_friendly: { type: Type.BOOLEAN },
            status: {
              type: Type.STRING,
              description: 'One of: open, upcoming, or empty string.',
            },
            interpretation_summary: {
              type: Type.STRING,
              description: '1-sentence human-readable summary of how the query was interpreted.',
            },
          },
          required: ['interpretation_summary'],
        },
      },
    })
  );

  const raw = JSON.parse((response.text ?? '{}').trim()) as any;
  const formatVal =
    raw.format === 'online' || raw.format === 'offline' || raw.format === 'hybrid'
      ? raw.format
      : '';
  const statusVal =
    raw.status === 'open' || raw.status === 'upcoming' ? raw.status : '';

  const filters: NLSearchFilters = {
    query: raw.query || '',
    domain: raw.domain || '',
    city: raw.city || '',
    state: raw.state || '',
    format: formatVal,
    min_prize_inr: raw.min_prize_inr && raw.min_prize_inr > 0 ? raw.min_prize_inr : null,
    closing_within_days:
      raw.closing_within_days && raw.closing_within_days > 0 ? raw.closing_within_days : null,
    solo_only: Boolean(raw.solo_only),
    beginner_friendly: Boolean(raw.beginner_friendly),
    status: statusVal,
    interpretation_summary: raw.interpretation_summary || `Parsed query: "${naturalQuery}"`,
  };

  return { filters, model: GEMINI_MODEL };
}
