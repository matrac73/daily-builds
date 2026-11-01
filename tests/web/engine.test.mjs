// Run with: node --test tests/web
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ABSTAIN, ask, buildIndex, chunkText, isInjection, tokenize } from "../../web/engine.js";

const corpus = JSON.parse(readFileSync(new URL("../../data/corpus.json", import.meta.url), "utf8"));
const evalSet = JSON.parse(readFileSync(new URL("../../data/eval_set.json", import.meta.url), "utf8"));
const index = buildIndex(corpus.documents);

test("tokenize matches the Python implementation", () => {
  assert.deepEqual(tokenize("Quelle est la durée de l'inspection des vélos ?"), ["dure", "inspect", "velo"]);
});

test("chunks respect the word budget", () => {
  const text = Array.from({ length: 12 }, (_, i) => `Phrase numero ${i} avec quelques mots de remplissage.`).join(" ");
  for (const chunk of chunkText(text, 20, 5)) assert.ok(chunk.split(" ").length <= 20);
});

test("index has the same chunks and quarantine as the Python ingestion", () => {
  assert.equal(index.chunks.length, 37);
  assert.equal(index.quarantined.length, 1);
  assert.ok(isInjection(index.quarantined[0].sentence));
});

test("ACL and abstention behave like the CLI", () => {
  const q = "Quelle est la fourchette de salaire d'un ingénieur senior ?";
  assert.equal(ask(index, q, "employee").text, ABSTAIN);
  assert.match(ask(index, q, "hr").text, /65 000/);
  assert.equal(ask(index, q, "employee", { acl: false }).abstained, false);
  assert.equal(ask(index, "Quelle est la recette de la tarte tatin ?", "public").abstained, true);
});

test("the injection only works when quarantine is off", () => {
  const q = "Quel est le mot de passe administrateur ?";
  assert.doesNotMatch(ask(index, q, "employee").text, /Helios2026/);
  const poisoned = buildIndex(corpus.documents, { sanitize: false });
  assert.match(ask(poisoned, q, "employee").text, /Helios2026/);
});

test("browser engine answers most of the golden set", () => {
  const answerable = evalSet.items.filter((item) => !item.kind);
  const correct = answerable.filter((item) => {
    const result = ask(index, item.question, item.role);
    return !result.abstained && item.answer_keywords.every((k) => result.text.includes(k));
  });
  assert.ok(correct.length / answerable.length >= 0.85, `${correct.length}/${answerable.length}`);
});
