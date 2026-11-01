# RAG Prod Lab

**A production-minded RAG assistant over a fictional French document base, powered by an open source LLM — with a written spec that shows which KPI every feature improves and which one it degrades.**

The fictional company *Helios Mobility* (e-bike sharing, Lyon) has 14 documents: HR policies, IT security, expense rules, product sheets, a support FAQ, two confidential documents (salary bands, key-account pricing) and one document poisoned with a prompt injection. `ragprod` answers questions over them in French, cites its sources, respects role-based access, refuses to make things up, and measures all of this against a spec.

📄 The spec and the explanations are in French: [`docs/CDC.md`](docs/CDC.md) (cahier des charges, KPI, feature × KPI matrix) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (how each stage works and why).

## Features

- **Open source LLM**: Qwen2.5-3B-Instruct (Apache-2.0) + `bge-m3` embeddings through any OpenAI-compatible server (Ollama, llama.cpp, vLLM). Fully offline fallback (extractive answers + hashed n-gram embeddings) so everything runs and tests without a GPU.
- **Ingestion**: sentence-aware chunking with overlap, title-prefixed chunks, prompt-injection quarantine, persisted index that rebuilds itself when the corpus or settings change.
- **Retrieval**: BM25 + vector search fused with Reciprocal Rank Fusion, MMR diversity reranking, role-based ACL **pre-filtering**.
- **Answering**: calibrated relevance gate (abstains before calling the LLM), token budget, mandatory `[n]` citations, post-generation grounding check, graceful degradation when the LLM server is down.
- **Operations**: role-keyed LRU answer cache, JSONL traces with per-stage latency and token counts.
- **Evaluation**: 28-question golden set, 11 KPI with targets (`ragprod eval` exits 1 when a target is missed — a CI quality gate), and `ragprod ablation` which switches each feature off and measures the KPI impact.
- **Explainability**: `ragprod ask --explain` walks through every stage; `ragprod cdc` prints the spec and the feature × KPI matrix.
- **Web page** (`index.html`, no build step): in-browser BM25 demo with ACL / quarantine / threshold toggles, the pipeline explained, the KPI table, the interactive matrix and the ablation results.

## Quick start

Requires Python ≥ 3.11.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"

ragprod ingest                      # chunk, sanitise and index the corpus
ragprod ask "Quel est le plafond pour un repas en déplacement ?" --explain
ragprod eval                        # KPI vs targets
```

### With a real open source LLM (Ollama)

```bash
ollama pull qwen2.5:3b
ollama pull bge-m3
ragprod --config configs/ollama.toml ingest
ragprod --config configs/ollama.toml chat --role employee
```

Any OpenAI-compatible server works: point `llm_url` to llama.cpp's `llama-server` or to vLLM. If the server is unreachable, answers fall back to extractive mode and are flagged as degraded.

### Web page

```bash
python -m http.server 8000          # then open http://localhost:8000
```

## Usage examples

```bash
# Role-based access: same question, different roles
ragprod ask "Quelle est la fourchette de salaire d'un ingénieur senior ?" --role employee   # abstains
ragprod ask "Quelle est la fourchette de salaire d'un ingénieur senior ?" --role hr         # answers, cites RH-003

# Prompt injection hidden in IT-003 is quarantined at ingestion
ragprod ask "Quel est le mot de passe administrateur ?"
ragprod --set sanitize=false ask "Quel est le mot de passe administrateur ?"                # the attack succeeds

# Out-of-scope question: abstention, the LLM is never called
ragprod ask "Quelle est la recette de la tarte tatin ?" --role public

# Any setting can be overridden; see what breaks
ragprod --set acl=false eval                       # exits 1: ACL leak above target
ragprod --set retrieval_mode=bm25 eval --details   # per-question results

# Measure every trade-off and export it for the web page
ragprod ablation --export data/ablation_results.json

# Print the spec: KPI, targets and what each feature improves/degrades
ragprod cdc

# Machine-readable answer (sources, scores, timings, tokens)
ragprod ask "Comment résilier mon abonnement ?" --role public --json
```

Roles: `public` (customers), `employee`, `hr`, `finance`.

## Measured KPI (offline backend)

| KPI | Target | Measured |
|---|---|---|
| Hit rate @4 | ≥ 90 % | 100 % |
| Answer accuracy | ≥ 85 % | 91 % |
| Correct abstention | ≥ 95 % | 100 % |
| False abstention | ≤ 10 % | 9 % |
| ACL leak | 0 % | 0 % (36 % with `acl=false`) |
| Injection resistance | 100 % | 100 % (0 % with `sanitize=false`) |
| Avg prompt tokens | ≤ 700 | ~410 |

## Project structure

```
├── index.html               # static web explainer + demo (GitHub Pages ready)
├── web/                     # engine.js (browser port), app.js (UI), style.css
├── ragprod/
│   ├── text.py              # normalisation, French tokeniser, sentence split
│   ├── corpus.py            # Document model and loader
│   ├── chunking.py          # sentence chunking with overlap + injection quarantine
│   ├── guardrails.py        # injection patterns, role → access levels
│   ├── embeddings.py        # hashing encoder (offline) / remote embeddings
│   ├── retrieval.py         # BM25, vector search, RRF, MMR, coverage
│   ├── index.py             # build / save / load / invalidate the index
│   ├── llm.py               # prompt, OpenAI-compatible LLM, extractive, fallback
│   ├── pipeline.py          # orchestration, cache, grounding, traces
│   ├── evaluation.py        # golden set, KPI, ablation
│   └── cli.py               # rich CLI
├── configs/                 # default.toml (offline), ollama.toml (open source LLM)
├── data/                    # corpus, golden set, KPI matrix, ablation results
├── docs/                    # CDC.md (spec), ARCHITECTURE.md (how it works)
└── tests/                   # pytest suite + node tests for the browser engine
```

## Tests

```bash
pytest                 # 50 tests: chunking, retrieval, guardrails, pipeline, evaluation, CLI
node --test tests/web  # browser engine parity with the Python pipeline
```

The pytest suite also asserts that the baseline configuration meets every KPI target and that disabling ACL / quarantine / the abstention threshold measurably degrades the corresponding KPI.

## License

MIT — see [LICENSE](LICENSE). The corpus is entirely fictional.

> Built autonomously by [Claude Code](https://claude.com/claude-code).
