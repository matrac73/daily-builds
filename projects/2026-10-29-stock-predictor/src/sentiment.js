// Lightweight financial news sentiment: a domain lexicon (inspired by Loughran-McDonald)
// with negation and intensifier handling, plus point-in-time aggregation per trading session.

const POSITIVE = new Map(Object.entries({
  beat: 1.5, beats: 1.5, surpass: 1.5, surpasses: 1.5, exceed: 1.2, exceeds: 1.2, record: 1,
  growth: 1, grow: 0.8, grows: 0.8, gain: 1, gains: 1, rally: 1.3, rallies: 1.3, surge: 1.5, surges: 1.5,
  soar: 1.6, soars: 1.6, jump: 1.2, jumps: 1.2, rise: 0.8, rises: 0.8, climb: 0.9, climbs: 0.9,
  upgrade: 1.5, upgrades: 1.5, upgraded: 1.5, outperform: 1.3, bullish: 1.4, buy: 0.8, strong: 1,
  stronger: 1, profit: 1, profits: 1, profitable: 1.1, boost: 1, boosts: 1, raise: 0.8, raises: 0.8,
  raised: 0.8, upbeat: 1.2, optimistic: 1.1, optimism: 1.1, breakthrough: 1.3, approval: 1.1,
  approved: 1.1, win: 1, wins: 1, partnership: 0.7, expands: 0.7, expansion: 0.7, launch: 0.5,
  dividend: 0.6, buyback: 0.9, rebound: 1, rebounds: 1, recovery: 0.8, tops: 1.1, momentum: 0.6,
  positive: 0.9, high: 0.4, higher: 0.6, best: 0.8, innovative: 0.6, demand: 0.5, robust: 1,
}));

const NEGATIVE = new Map(Object.entries({
  miss: 1.5, misses: 1.5, missed: 1.5, falls: 0.9, fell: 0.9, drop: 1, drops: 1,
  plunge: 1.6, plunges: 1.6, plummet: 1.7, plummets: 1.7, slump: 1.4, slumps: 1.4, sink: 1.2,
  sinks: 1.2, tumble: 1.4, tumbles: 1.4, decline: 1, declines: 1, loss: 1.1, losses: 1.1, lose: 1,
  downgrade: 1.5, downgrades: 1.5, downgraded: 1.5, underperform: 1.3, bearish: 1.4, sell: 0.8,
  selloff: 1.4, weak: 1, weaker: 1, weakness: 1, cut: 0.9, cuts: 0.9, lawsuit: 1.2, sues: 1.2,
  sued: 1.2, probe: 1.1, investigation: 1.1, fine: 0.8, fined: 1.1, recall: 1.1, layoffs: 1,
  warning: 1.1, warns: 1.2, risk: 0.6, risks: 0.6, concern: 0.8, concerns: 0.8, fears: 1, fear: 1,
  crash: 1.7, crisis: 1.4, delay: 0.8, delays: 0.8, halt: 1, halts: 1, ban: 1.1, tariff: 0.8,
  tariffs: 0.8, volatile: 0.6, slowdown: 1.1, slows: 0.8, bankruptcy: 2, fraud: 2, negative: 0.9,
  lower: 0.6, low: 0.4, worst: 1.2, headwinds: 0.9, pressure: 0.6, antitrust: 0.9, short: 0.3,
}));

const NEGATIONS = new Set(['not', 'no', 'never', "n't", 'without', 'despite', 'fails', 'failed']);
const INTENSIFIERS = new Map(Object.entries({ sharply: 1.5, strongly: 1.4, significantly: 1.3, massive: 1.4, huge: 1.3, record: 1.2 }));

export function tokenize(text) {
  return text.toLowerCase().replace(/[’']/g, "'").replace(/n't\b/g, " n't").match(/[a-z]+|n't/g) ?? [];
}

/** Score a headline in [-1, 1]. 0 means neutral or no lexicon hit. */
export function scoreText(text) {
  const tokens = tokenize(text);
  let total = 0;
  let hits = 0;
  tokens.forEach((tok, i) => {
    const polarity = POSITIVE.has(tok) ? POSITIVE.get(tok) : NEGATIVE.has(tok) ? -NEGATIVE.get(tok) : 0;
    if (polarity === 0) return;
    let weight = polarity;
    if (tokens.slice(Math.max(0, i - 3), i).some((w) => NEGATIONS.has(w))) weight *= -0.8;
    // Intensifiers may sit just before ("sharply higher") or just after ("rises sharply").
    const boost = Math.max(1, ...tokens.slice(Math.max(0, i - 2), i + 2).map((w) => INTENSIFIERS.get(w) ?? 1));
    total += weight * boost;
    hits += 1;
  });
  if (hits === 0) return 0;
  return Math.tanh(total / Math.sqrt(hits));
}

const NY_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
});

/**
 * The calendar date of the first US market close at or after `publishedAt`.
 * News after 16:00 New York time can only influence the next session.
 * Weekends/holidays are resolved later by aligning to the next available bar.
 */
export function sessionDate(publishedAt) {
  const parts = Object.fromEntries(NY_PARTS.formatToParts(new Date(publishedAt)).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return Number(parts.hour) >= 16 ? addDays(date, 1) : date;
}

export function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Aggregate scored headlines onto trading days.
 * @param {{publishedAt: string, score: number}[]} headlines
 * @param {string[]} barDates sorted trading dates
 * @returns {Map<string, {score: number, count: number}>} mean score + count per bar date
 */
export function dailySentiment(headlines, barDates) {
  const acc = new Map();
  for (const h of headlines) {
    const session = sessionDate(h.publishedAt);
    const date = barDates.find((d) => d >= session);
    if (!date) continue; // published after the last known bar: belongs to a future session
    const slot = acc.get(date) ?? { sum: 0, count: 0 };
    slot.sum += h.score;
    slot.count += 1;
    acc.set(date, slot);
  }
  return new Map([...acc].map(([d, s]) => [d, { score: s.sum / s.count, count: s.count }]));
}
