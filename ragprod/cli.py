"""Command-line interface: ingest, ask, chat, eval, ablation, cdc."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from .config import RAGConfig, load_config
from .evaluation import (
    KPI,
    AblationRow,
    compute_kpis,
    evaluate,
    load_eval_set,
    load_kpis,
    load_matrix,
    run_ablation,
)
from .index import Index
from .pipeline import Answer, RAGPipeline, answer_to_dict

DEFAULT_CONFIG = "configs/default.toml"
EVAL_SET = "data/eval_set.json"
MATRIX = "data/kpi_matrix.json"

console = Console()


def fmt(kpi: KPI, value: float) -> str:
    if kpi.unit == "%":
        return f"{value * 100:.0f} %"
    if kpi.unit == "ms":
        return f"{value:.1f} ms"
    if kpi.unit == "tokens":
        return f"{value:.0f}"
    return f"{value:.2f}"


def fmt_target(kpi: KPI) -> str:
    return ("≥ " if kpi.direction == "max" else "≤ ") + fmt(kpi, kpi.target)


# -- ingest -----------------------------------------------------------------------
def cmd_ingest(config: RAGConfig, args: argparse.Namespace) -> int:
    index = Index.build(config)
    index.save(config.index_path)
    per_doc = Counter(c.doc_id for c in index.chunks)
    table = Table(title=f"Index construit : {len(index.chunks)} extraits -> {config.index_path}")
    for column in ("Document", "Titre", "Accès", "Extraits"):
        table.add_column(column)
    seen = set()
    for chunk in index.chunks:
        if chunk.doc_id not in seen:
            seen.add(chunk.doc_id)
            table.add_row(chunk.doc_id, chunk.title, chunk.access, str(per_doc[chunk.doc_id]))
    console.print(table)
    if index.quarantined:
        lines = "\n".join(f"[bold]{q.doc_id}[/] : {q.sentence}" for q in index.quarantined)
        console.print(Panel(lines, title="Phrases mises en quarantaine (injection suspectée)",
                            border_style="red"))
    return 0


# -- ask / chat -------------------------------------------------------------------
def render_answer(answer: Answer) -> None:
    style = "yellow" if answer.abstained else "green"
    title = "Abstention" + (f" ({answer.reason})" if answer.reason else "") if answer.abstained else "Réponse"
    console.print(Panel(answer.text, title=title, border_style=style))
    if answer.citations:
        table = Table(title="Sources citées", show_header=True)
        table.add_column("#")
        table.add_column("Document")
        table.add_column("Titre")
        table.add_column("Extrait")
        for c in answer.citations:
            table.add_row(f"[{c.n}]", c.doc_id, c.title, c.chunk_id)
        console.print(table)
    flags = [f"backend={answer.backend}", f"rôle={answer.role}",
             f"tokens prompt={answer.prompt_tokens}", f"latence={answer.timings.get('total_ms', 0):.1f} ms"]
    if not answer.abstained:
        flags.append(f"ancrage={answer.groundedness:.0%}")
    if answer.cached:
        flags.append("[cyan]cache[/]")
    if answer.degraded:
        flags.append("[red]mode dégradé (LLM indisponible)[/]")
    console.print("  ".join(flags), style="dim")


def render_explain(pipeline: RAGPipeline, answer: Answer) -> None:
    cfg = pipeline.config
    allowed = len(pipeline.allowed_chunks(answer.role))
    total = len(pipeline.index.chunks)
    best = max((r.coverage for r in answer.retrieved), default=0.0)
    steps = [
        f"1. Contrôle d'accès : {allowed}/{total} extraits visibles pour le rôle « {answer.role} »"
        + ("" if cfg.acl else " [red](ACL désactivé)[/]"),
        f"2. Recherche {cfg.retrieval_mode} : {cfg.candidates} candidats par moteur"
        + (" fusionnés par RRF" if cfg.retrieval_mode == "hybrid" else ""),
        f"3. Reranking : {'MMR λ=' + str(cfg.mmr_lambda) if cfg.mmr else 'aucun'} -> top {cfg.top_k}",
        f"4. Seuil de pertinence : couverture max {best:.2f} "
        + ("≥" if best >= cfg.abstain_threshold else "<") + f" {cfg.abstain_threshold}",
    ]
    if answer.context_chunk_ids:
        steps += [
            f"5. Contexte : {len(answer.context_chunk_ids)} extraits, {answer.prompt_tokens} tokens de prompt "
            f"(budget contexte {cfg.max_context_tokens})",
            f"6. Génération : {answer.backend} en {answer.timings.get('generation_ms', 0):.1f} ms",
            f"7. Vérification d'ancrage : {answer.groundedness:.0%} des phrases ancrées "
            f"(minimum {cfg.grounding_min:.0%}{'' if cfg.grounding_check else ', contrôle désactivé'})",
        ]
    console.print(Panel("\n".join(steps), title="Comment la réponse a été produite", border_style="blue"))
    table = Table(title="Extraits retenus après reranking")
    for column in ("Rang", "Extrait", "Accès", "Score", "Couverture", "Prompt"):
        table.add_column(column, min_width=len(column))
    table.add_column("Début du texte", no_wrap=True, overflow="ellipsis", max_width=36)
    in_context = set(answer.context_chunk_ids)
    for rank, r in enumerate(answer.retrieved, start=1):
        table.add_row(str(rank), r.chunk.id, r.chunk.access, f"{r.score:.4f}", f"{r.coverage:.2f}",
                      "oui" if r.chunk.id in in_context else "non", r.chunk.text)
    console.print(table)


def cmd_ask(config: RAGConfig, args: argparse.Namespace) -> int:
    pipeline = RAGPipeline(config)
    answer = pipeline.ask(args.question, args.role)
    if args.json:
        print(json.dumps(answer_to_dict(answer), ensure_ascii=False, indent=2))
        return 0
    if args.explain:
        render_explain(pipeline, answer)
    render_answer(answer)
    return 0


def cmd_chat(config: RAGConfig, args: argparse.Namespace) -> int:
    pipeline = RAGPipeline(config)
    role = args.role
    console.print(Panel(
        "Posez vos questions sur la base documentaire Helios Mobility.\n"
        ":role <public|employee|hr|finance> change de rôle, :explain bascule le mode détaillé, :quit pour sortir.",
        title="ragprod chat", border_style="blue"))
    explain = False
    while True:
        try:
            question = console.input(f"[bold cyan]{role}[/] > ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not question:
            continue
        if question in (":quit", ":q", "exit"):
            break
        if question == ":explain":
            explain = not explain
            console.print(f"Mode détaillé : {'activé' if explain else 'désactivé'}", style="dim")
            continue
        if question.startswith(":role"):
            candidate = question.split(maxsplit=1)[-1]
            if candidate in config.roles:
                role = candidate
            else:
                console.print(f"Rôle inconnu. Rôles : {', '.join(config.roles)}", style="red")
            continue
        answer = pipeline.ask(question, role)
        if explain:
            render_explain(pipeline, answer)
        render_answer(answer)
    return 0


# -- eval / ablation / cdc --------------------------------------------------------
def cmd_eval(config: RAGConfig, args: argparse.Namespace) -> int:
    kpis = load_kpis(load_matrix(args.matrix))
    pipeline = RAGPipeline(config)
    results = evaluate(pipeline, load_eval_set(args.eval_set))
    values = compute_kpis(results)
    if args.details:
        table = Table(title="Détail par question")
        for column in ("Id", "Rôle", "Type", "Rang doc attendu", "Résultat", "Réponse"):
            table.add_column(column)
        for r in results:
            table.add_row(r.item.id, r.item.role, r.item.kind, str(r.rank or "-"),
                          "[green]OK[/]" if r.correct else "[red]KO[/]", r.answer.text[:70])
        console.print(table)
    table = Table(title=f"KPI du cahier des charges ({len(results)} questions, backend {config.llm_backend})")
    for column in ("KPI", "Catégorie", "Mesure", "Cible", "Statut"):
        table.add_column(column)
    failed = 0
    for kpi in kpis:
        ok = kpi.passes(values[kpi.id])
        failed += not ok
        table.add_row(kpi.name, kpi.category, fmt(kpi, values[kpi.id]), fmt_target(kpi),
                      "[green]✓ conforme[/]" if ok else "[red]✗ hors cible[/]")
    console.print(table)
    if args.json:
        Path(args.json).write_text(json.dumps(values, indent=2), encoding="utf-8")
    return 1 if failed else 0


def _delta_style(kpi: KPI, value: float, baseline: float) -> str:
    if abs(value - baseline) < 1e-9 or (kpi.unit == "ms" and abs(value - baseline) < 0.5 * max(baseline, 1)):
        return "dim"  # latency jitter below 50 % is noise at this scale
    better = value > baseline if kpi.direction == "max" else value < baseline
    return "green" if better else "bold red"


def cmd_ablation(config: RAGConfig, args: argparse.Namespace) -> int:
    matrix = load_matrix(args.matrix)
    kpis = load_kpis(matrix)
    with console.status("Évaluation de chaque variante…"):
        rows = run_ablation(config, load_eval_set(args.eval_set), matrix)
    baseline = rows[0].kpis
    table = Table(title="Ablation : impact de la désactivation de chaque fonctionnalité "
                        "(vert = meilleur, rouge = pire que la référence)")
    table.add_column("Feature")
    table.add_column("Variante")
    for kpi in kpis:
        table.add_column(kpi.name, justify="right")
    for row in rows:
        cells = [Text(fmt(k, row.kpis[k.id]), style=_delta_style(k, row.kpis[k.id], baseline[k.id]))
                 for k in kpis]
        table.add_row(row.feature or "-", row.label, *cells)
    console.print(table)
    if args.export:
        export_ablation(rows, args.export)
        console.print(f"Résultats exportés dans {args.export}", style="dim")
    return 0


def export_ablation(rows: list[AblationRow], path: str) -> None:
    payload = [{"feature": r.feature, "label": r.label, "overrides": r.overrides,
                "kpis": {k: round(v, 4) for k, v in r.kpis.items()}} for r in rows]
    Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def cmd_cdc(config: RAGConfig, args: argparse.Namespace) -> int:
    matrix = load_matrix(args.matrix)
    kpis = {k.id: k for k in load_kpis(matrix)}
    table = Table(title="Cahier des charges : KPI et cibles")
    for column in ("KPI", "Catégorie", "Cible", "Définition"):
        table.add_column(column)
    for kpi in kpis.values():
        table.add_row(kpi.name, kpi.category, fmt_target(kpi), kpi.definition)
    console.print(table)
    for feature in matrix["features"]:
        body = [f"[italic]{feature['how']}[/]", ""]
        body += [f"[green]▲ {kpis[e['kpi']].name}[/] : {e['why']}" for e in feature["improves"]]
        body += [f"[red]▼ {kpis[e['kpi']].name}[/] : {e['why']}" for e in feature["degrades"]]
        console.print(Panel("\n".join(body), border_style="blue",
                            title=f"{feature['id']} · {feature['name']}  [dim]({feature['config']})[/]"))
    return 0


# -- entry point ------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ragprod", description="RAG de production sur une base documentaire fictive, avec un LLM open source.")
    parser.add_argument("--config", default=DEFAULT_CONFIG, help="fichier TOML (défaut : %(default)s)")
    parser.add_argument("--set", action="append", default=[], metavar="KEY=VALUE",
                        help="surcharge un paramètre, ex. --set retrieval_mode=bm25")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("ingest", help="découpe, assainit et indexe le corpus")

    ask = sub.add_parser("ask", help="pose une question")
    ask.add_argument("question")
    ask.add_argument("--role", default="employee")
    ask.add_argument("--explain", action="store_true", help="détaille chaque étape du pipeline")
    ask.add_argument("--json", action="store_true", help="sortie JSON brute")

    chat = sub.add_parser("chat", help="session interactive")
    chat.add_argument("--role", default="employee")

    for name, help_text in (("eval", "mesure les KPI sur le golden set (code retour 1 si hors cible)"),
                            ("ablation", "désactive chaque fonctionnalité et compare les KPI"),
                            ("cdc", "affiche le cahier des charges et la matrice fonctionnalités/KPI")):
        command = sub.add_parser(name, help=help_text)
        command.add_argument("--eval-set", default=EVAL_SET)
        command.add_argument("--matrix", default=MATRIX)
    sub.choices["eval"].add_argument("--details", action="store_true", help="résultat par question")
    sub.choices["eval"].add_argument("--json", metavar="PATH", help="exporte les KPI en JSON")
    sub.choices["ablation"].add_argument("--export", metavar="PATH", help="exporte le tableau en JSON")
    return parser


COMMANDS = {"ingest": cmd_ingest, "ask": cmd_ask, "chat": cmd_chat,
            "eval": cmd_eval, "ablation": cmd_ablation, "cdc": cmd_cdc}


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config_path = args.config if Path(args.config).exists() or args.config != DEFAULT_CONFIG else None
    try:
        config = load_config(config_path, args.set)
        return COMMANDS[args.command](config, args)
    except (ValueError, FileNotFoundError) as exc:
        console.print(f"[red]Erreur :[/] {exc}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
