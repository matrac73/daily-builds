// Browser port of the lexical half of the ragprod pipeline (see ragprod/*.py).
// It mirrors tokenisation, chunking, injection quarantine, ACL, BM25, the
// coverage gate and the extractive generator so the demo behaves like the CLI
// in `--set retrieval_mode=bm25 --set mmr=false` mode (without the token budget
// and the grounding check, which never trigger with extractive answers here).

const STOPWORDS = new Set(`a ai as au aux avec avez avons apres avant c ca car ce ces cet cette chaque
combien comme comment d dans de des depuis doit dois donc du elle elles en entre est et etre faire
fait faut il ils j je l la le les leur leurs lors m ma mais me mes moi mon n ne nos notre nous on
ont ou par pas peut peuvent plus pour pourquoi qu quand que quel quelle quelles quels qui quoi s sa
sans se ses si son sont sur t ta te tes ton tous tout toute toutes tu un une vos votre vous y the of
to and is what how`.split(/\s+/));
const SUFFIXES = ["ements", "ations", "ement", "ation", "euses", "ions", "euse", "eurs",
  "ees", "ion", "eur", "ee", "es", "er", "ez", "e", "s", "x"];
const INJECTION = new RegExp([
  String.raw`\bignore[rz]?\b.{0,40}\binstructions?\b`,
  String.raw`\boublie[rz]?\b.{0,40}\b(instructions?|consignes?|regles?)\b`,
  String.raw`\bdisregard\b.{0,40}\b(instructions?|rules?)\b`,
  String.raw`\b(tu es|you are) (maintenant|desormais|now)\b`,
  String.raw`\b(system prompt|prompt systeme)\b`,
  String.raw`\breponds? (toujours |uniquement )?que\b`,
].join("|"));

export const ROLES = {
  public: ["public"],
  employee: ["public", "internal"],
  hr: ["public", "internal", "hr"],
  finance: ["public", "internal", "finance"],
};
export const ABSTAIN = "Je ne trouve pas cette information dans les documents auxquels vous avez accès.";

export function normalize(text) {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function stem(word) {
  if (/^\d+$/.test(word)) return word;
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) return word.slice(0, -suffix.length);
  }
  return word;
}

export function tokenize(text) {
  return (normalize(text).match(/[a-z0-9]+/g) || [])
    .filter((w) => !STOPWORDS.has(w) && (w.length >= 2 || /^\d+$/.test(w)))
    .map(stem);
}

export function splitSentences(text) {
  return text.split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

export const isInjection = (sentence) => INJECTION.test(normalize(sentence));

const wordCount = (sentences) => sentences.reduce((n, s) => n + s.split(/\s+/).length, 0);

export function chunkText(text, size, overlap) {
  const chunks = [];
  let current = [];
  for (const sentence of splitSentences(text)) {
    const length = sentence.split(/\s+/).length;
    if (current.length && wordCount(current) + length > size) {
      chunks.push(current.join(" "));
      let carried = [];
      for (let i = current.length - 1; i >= 0 && wordCount(carried) < overlap; i--) carried.unshift(current[i]);
      while (carried.length && wordCount(carried) + length > size) carried.shift();
      current = carried;
    }
    current.push(sentence);
  }
  if (current.length) chunks.push(current.join(" "));
  return chunks;
}

export function buildIndex(documents, { size = 60, overlap = 15, sanitize = true } = {}) {
  const chunks = [];
  const quarantined = [];
  for (const doc of documents) {
    let sentences = splitSentences(doc.content);
    if (sanitize) {
      quarantined.push(...sentences.filter(isInjection).map((sentence) => ({ docId: doc.id, sentence })));
      sentences = sentences.filter((s) => !isInjection(s));
    }
    chunkText(sentences.join("\n"), size, overlap).forEach((text, n) => {
      const terms = tokenize(`${doc.title}. ${text}`);
      chunks.push({ id: `${doc.id}#${n}`, docId: doc.id, title: doc.title, access: doc.access, text, terms });
    });
  }
  const df = new Map();
  for (const c of chunks) for (const t of new Set(c.terms)) df.set(t, (df.get(t) || 0) + 1);
  const avgLen = chunks.reduce((n, c) => n + c.terms.length, 0) / chunks.length;
  return { chunks, quarantined, df, avgLen };
}

export function idf(index, term) {
  const df = index.df.get(term) || 0;
  return Math.log(1 + (index.chunks.length - df + 0.5) / (df + 0.5));
}

function bm25(index, query, chunk, k1 = 1.5, b = 0.75) {
  const tf = new Map();
  for (const t of chunk.terms) tf.set(t, (tf.get(t) || 0) + 1);
  let score = 0;
  for (const term of new Set(query)) {
    const f = tf.get(term) || 0;
    if (f) score += idf(index, term) * (f * (k1 + 1)) / (f + k1 * (1 - b + (b * chunk.terms.length) / index.avgLen));
  }
  return score;
}

export function coverage(index, query, chunk) {
  const terms = [...new Set(query)];
  const present = new Set(chunk.terms);
  const total = terms.reduce((n, t) => n + idf(index, t), 0);
  return total ? terms.filter((t) => present.has(t)).reduce((n, t) => n + idf(index, t), 0) / total : 0;
}

function extractive(question, contexts, maxSentences = 2) {
  const query = new Set(tokenize(question));
  const candidates = [];
  contexts.forEach(({ n, chunk }, rank) => {
    splitSentences(chunk.text).forEach((sentence, pos) => {
      const score = new Set(tokenize(sentence).filter((t) => query.has(t))).size;
      if (score) candidates.push({ score, rank, pos, n, sentence });
    });
  });
  candidates.sort((a, b) => b.score - a.score || a.rank - b.rank || a.pos - b.pos);
  if (!candidates.length) return null;
  const picked = [];
  for (const c of candidates) {
    if (picked.length === maxSentences || c.score * 2 < candidates[0].score) break;
    if (!picked.some((p) => p.sentence === c.sentence)) picked.push(c);
  }
  return picked.map((p) => `${p.sentence} [${p.n}]`).join(" ");
}

export function ask(index, question, role, { acl = true, threshold = 0.4, topK = 4 } = {}) {
  const levels = new Set(ROLES[role]);
  const visible = index.chunks.filter((c) => !acl || levels.has(c.access));
  const query = tokenize(question);
  const retrieved = visible
    .map((chunk) => ({ chunk, score: bm25(index, query, chunk), coverage: coverage(index, query, chunk) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  const best = Math.max(0, ...retrieved.map((r) => r.coverage));
  const base = { retrieved, visible: visible.length, total: index.chunks.length, best, contexts: [] };
  if (!retrieved.length) return { ...base, abstained: true, reason: "no_accessible_chunk", text: ABSTAIN };
  if (best < threshold) return { ...base, abstained: true, reason: "low_relevance", text: ABSTAIN };
  const relevant = retrieved.filter((r) => r.coverage > 0);
  const contexts = relevant.map((r, i) => ({ n: i + 1, chunk: r.chunk }));
  const text = extractive(question, contexts);
  if (!text) return { ...base, contexts, abstained: true, reason: "model_abstained", text: ABSTAIN };
  return { ...base, contexts, abstained: false, reason: "", text };
}
