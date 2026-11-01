import { ask, buildIndex } from "./engine.js";

const $ = (selector) => document.querySelector(selector);
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const STEPS = [
  ["Ingestion", "F1, F6", "Les documents sont découpés en extraits de ~60 mots sans couper de phrase, avec 15 mots de chevauchement. Les phrases ressemblant à des ordres donnés au modèle sont mises en quarantaine."],
  ["Indexation", "F2", "Chaque extrait (précédé du titre de son document) alimente deux index : BM25 pour les mots exacts et un index vectoriel (n-grammes de caractères hors ligne, ou bge-m3 via Ollama)."],
  ["Contrôle d'accès", "F5", "Les extraits que le rôle de l'utilisateur n'a pas le droit de lire sont retirés avant toute recherche : le modèle ne peut pas divulguer ce qu'il ne voit pas."],
  ["Recherche hybride", "F2", "BM25 et la recherche vectorielle renvoient chacun 12 candidats, fusionnés par Reciprocal Rank Fusion (somme de 1/(60 + rang))."],
  ["Reranking MMR", "F3", "Maximal Marginal Relevance garde 4 extraits pertinents mais différents les uns des autres."],
  ["Seuil de pertinence", "F4", "Si le meilleur extrait couvre moins de 40 % de la question (pondéré par l'IDF), l'assistant s'abstient au lieu d'inventer."],
  ["Contexte et prompt", "F8, F9", "Les extraits utiles sont numérotés et insérés dans un prompt qui impose de citer [n] et d'ignorer toute consigne contenue dans les extraits, dans la limite d'un budget de tokens."],
  ["Génération", "F11", "Un LLM open source (Qwen2.5-3B-Instruct, Apache-2.0) servi par Ollama, llama.cpp ou vLLM rédige la réponse ; s'il tombe, un générateur extractif prend le relais."],
  ["Vérification d'ancrage", "F7", "Chaque phrase de la réponse doit se retrouver dans l'extrait qu'elle cite ; sinon la réponse est remplacée par une abstention."],
  ["Cache, traces, évaluation", "F10, F12", "Les réponses sont mises en cache par (rôle, question), chaque requête est tracée en JSONL et le golden set est rejoué à chaque changement."],
];

const EXAMPLES = [
  ["Combien coûte l'abonnement Helios Pass ?", "public"],
  ["Quelle est la fourchette de salaire d'un ingénieur senior ?", "employee"],
  ["Quelle est la fourchette de salaire d'un ingénieur senior ?", "hr"],
  ["Quel est le mot de passe administrateur ?", "employee"],
  ["Quelle est la recette de la tarte tatin ?", "public"],
];

function formatValue(kpi, value) {
  if (kpi.unit === "%") return `${Math.round(value * 100)} %`;
  if (kpi.unit === "ms") return `${value.toFixed(1)} ms`;
  if (kpi.unit === "tokens") return `${Math.round(value)}`;
  return value.toFixed(2);
}

const passes = (kpi, v) => (kpi.direction === "max" ? v >= kpi.target : v <= kpi.target);
const target = (kpi) => `${kpi.direction === "max" ? "≥" : "≤"} ${formatValue(kpi, kpi.target)}`;

function renderSteps() {
  $("#steps").innerHTML = STEPS.map(([title, features, body]) =>
    `<li><h3>${escape(title)} <span class="tag">${escape(features)}</span></h3><p>${escape(body)}</p></li>`).join("");
}

function renderKpis(kpis, baseline) {
  const rows = kpis.map((k) => {
    const value = baseline?.[k.id];
    const status = value === undefined ? "" : passes(k, value) ? '<span class="ok">✓ conforme</span>' : '<span class="ko">✗ hors cible</span>';
    return `<tr><td><strong>${escape(k.name)}</strong></td><td>${escape(k.category)}</td><td>${escape(k.definition)}</td>
      <td class="num">${target(k)}</td><td class="num">${value === undefined ? "–" : formatValue(k, value)}</td><td>${status}</td></tr>`;
  });
  $("#kpi-table").innerHTML = `<thead><tr><th>KPI</th><th>Catégorie</th><th>Définition</th><th>Cible</th><th>Mesure</th><th>Statut</th></tr></thead><tbody>${rows.join("")}</tbody>`;
}

function renderMatrix(kpis, features) {
  const head = `<tr><th>Fonctionnalité</th>${kpis.map((k) => `<th title="${escape(k.name)}">${escape(k.short)}</th>`).join("")}</tr>`;
  const rows = features.map((f) => {
    const cells = kpis.map((k) => {
      const up = f.improves.find((e) => e.kpi === k.id);
      const down = f.degrades.find((e) => e.kpi === k.id);
      if (!up && !down) return "<td></td>";
      const effect = up || down;
      const cls = up ? "up" : "down";
      return `<td><button class="cell ${cls}" data-feature="${f.id}" data-kpi="${k.id}" title="${escape(effect.why)}">${up ? "▲" : "▼"}</button></td>`;
    });
    return `<tr><th class="feature" title="${escape(f.how)}">${f.id} · ${escape(f.name)}</th>${cells.join("")}</tr>`;
  });
  $("#matrix-table").innerHTML = `<thead>${head}</thead><tbody>${rows.join("")}</tbody>`;
  $("#matrix-table").addEventListener("click", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell) return;
    const feature = features.find((f) => f.id === cell.dataset.feature);
    const kpi = kpis.find((k) => k.id === cell.dataset.kpi);
    const effect = [...feature.improves, ...feature.degrades].find((e) => e.kpi === kpi.id);
    const verb = feature.improves.includes(effect) ? '<span class="up">améliore ▲</span>' : '<span class="down">dégrade ▼</span>';
    $("#matrix-detail").innerHTML = `<h3>${feature.id} · ${escape(feature.name)} ${verb} ${escape(kpi.name)}</h3>
      <p>${escape(effect.why)}</p><p class="muted"><strong>Fonctionnement :</strong> ${escape(feature.how)}</p>
      <p class="muted"><strong>Paramètres :</strong> <code>${escape(feature.config)}</code></p>`;
  });
}

function renderAblation(kpis, rows) {
  const baseline = rows[0].kpis;
  const head = `<tr><th>F</th><th>Variante</th>${kpis.map((k) => `<th title="${escape(k.name)}">${escape(k.short)}</th>`).join("")}</tr>`;
  const body = rows.map((row) => {
    const cells = kpis.map((k) => {
      const v = row.kpis[k.id];
      const b = baseline[k.id];
      const noise = k.unit === "ms" && Math.abs(v - b) < 0.5 * Math.max(b, 1);
      let cls = "";
      if (Math.abs(v - b) > 1e-9 && !noise) cls = (k.direction === "max" ? v > b : v < b) ? "better" : "worse";
      return `<td class="num ${cls}">${formatValue(k, v)}</td>`;
    });
    return `<tr><td>${row.feature || "–"}</td><td>${escape(row.label)}</td>${cells.join("")}</tr>`;
  });
  $("#ablation-table").innerHTML = `<thead>${head}</thead><tbody>${body.join("")}</tbody>`;
}

function renderAnswer(result, quarantined) {
  const kind = result.abstained ? "abstain" : "answer";
  const title = result.abstained ? `Abstention (${result.reason})` : "Réponse";
  const used = new Set(result.contexts.map((c) => c.chunk.id));
  const cited = new Set([...result.text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const sources = result.contexts.filter(({ n }) => cited.has(n)).map(({ n, chunk }) => `<li><strong>[${n}]</strong> ${chunk.docId} — ${escape(chunk.title)}</li>`).join("");
  const rows = result.retrieved.map((r, i) => `<tr><td>${i + 1}</td><td class="nowrap">${r.chunk.id}</td><td>${r.chunk.access}</td>
    <td class="num">${r.score.toFixed(2)}</td><td class="num">${r.coverage.toFixed(2)}</td><td>${used.has(r.chunk.id) ? "oui" : "non"}</td>
    <td class="snippet">${escape(r.chunk.text)}</td></tr>`).join("");
  const trace = [
    `Contrôle d'accès : ${result.visible}/${result.total} extraits visibles`,
    `Couverture max : ${result.best.toFixed(2)}`,
    `Extraits envoyés au générateur : ${result.contexts.length}`,
    `Phrases en quarantaine dans l'index : ${quarantined}`,
  ].map((t) => `<li>${escape(t)}</li>`).join("");
  $("#result").innerHTML = `
    <div class="card ${kind}"><h3>${escape(title)}</h3><p>${escape(result.text)}</p>
      ${sources && !result.abstained ? `<ul class="sources">${sources}</ul>` : ""}</div>
    <div class="card"><h3>Ce qui s'est passé</h3><ul class="trace">${trace}</ul>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Extrait</th><th>Accès</th><th>BM25</th><th>Couverture</th><th>Prompt</th><th>Texte</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7">Aucun extrait ne contient les termes de la question.</td></tr>'}</tbody></table></div></div>`;
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function main() {
  renderSteps();
  const [corpus, matrix, ablation] = await Promise.all([
    loadJson("./data/corpus.json"), loadJson("./data/kpi_matrix.json"), loadJson("./data/ablation_results.json"),
  ]);
  renderKpis(matrix.kpis, ablation[0].kpis);
  renderMatrix(matrix.kpis, matrix.features);
  renderAblation(matrix.kpis, ablation);

  const indexes = { true: buildIndex(corpus.documents, { sanitize: true }), false: buildIndex(corpus.documents, { sanitize: false }) };
  const run = () => {
    const index = indexes[$("#sanitize").checked];
    const result = ask(index, $("#question").value, $("#role").value,
      { acl: $("#acl").checked, threshold: Number($("#threshold").value) });
    renderAnswer(result, index.quarantined.length);
  };
  $("#ask-form").addEventListener("submit", (event) => { event.preventDefault(); run(); });
  for (const id of ["#role", "#acl", "#sanitize"]) $(id).addEventListener("change", run);
  $("#threshold").addEventListener("input", () => {
    $("#threshold-value").textContent = Number($("#threshold").value).toFixed(2);
    run();
  });
  $("#examples").innerHTML = "Exemples : " + EXAMPLES.map(([q, role], i) =>
    `<button type="button" class="chip" data-i="${i}">${escape(q)} <em>(${role})</em></button>`).join("");
  $("#examples").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    const [q, role] = EXAMPLES[chip.dataset.i];
    $("#question").value = q;
    $("#role").value = role;
    run();
  });
  run();
}

main().catch((error) => {
  $("#result").innerHTML = `<div class="card abstain"><h3>Erreur de chargement</h3><p>${escape(error.message)}</p>
    <p>Servez le dossier via HTTP (ex. <code>python -m http.server</code>) : les navigateurs bloquent fetch() en file://.</p></div>`;
});
