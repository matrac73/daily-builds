import json

import pytest

from ragprod.cli import main
from ragprod.evaluation import (
    compute_kpis,
    evaluate,
    load_eval_set,
    load_kpis,
    load_matrix,
    percentile,
    run_ablation,
)

from .conftest import CORPUS, EVAL_SET, MATRIX


@pytest.fixture(scope="module")
def matrix():
    return load_matrix(MATRIX)


def test_matrix_references_only_known_kpis_and_config_keys(matrix):
    kpi_ids = {k.id for k in load_kpis(matrix)}
    from ragprod.config import RAGConfig
    fields = set(RAGConfig.__dataclass_fields__)
    for feature in matrix["features"]:
        assert feature["improves"], feature["id"]
        for effect in feature["improves"] + feature["degrades"]:
            assert effect["kpi"] in kpi_ids
        for ablation in feature["ablations"]:
            assert set(ablation["overrides"]) <= fields


def test_baseline_meets_every_cdc_target(pipeline, matrix):
    values = compute_kpis(evaluate(pipeline, load_eval_set(EVAL_SET)))
    failing = {k.id: values[k.id] for k in load_kpis(matrix) if not k.passes(values[k.id])}
    assert not failing


def test_ablation_shows_each_safety_feature_matters(config, matrix):
    rows = {r.label: r.kpis for r in run_ablation(config, load_eval_set(EVAL_SET), matrix)}
    baseline = rows["Configuration de référence"]
    assert rows["Sans ACL"]["acl_leak"] > baseline["acl_leak"] == 0
    assert rows["Sans quarantaine"]["injection_resistance"] < baseline["injection_resistance"]
    assert rows["Sans seuil d'abstention"]["correct_abstention"] < baseline["correct_abstention"]
    assert rows["Sans seuil d'abstention"]["false_abstention"] <= baseline["false_abstention"]
    assert rows["Budget contexte x4"]["prompt_tokens_avg"] >= baseline["prompt_tokens_avg"]


def test_percentile_nearest_rank():
    assert percentile([5, 1, 3, 2, 4], 0.95) == 5
    assert percentile([1, 2, 3, 4], 0.5) == 2
    assert percentile([], 0.95) == 0.0


def cli(*args):
    return main(["--config", "", "--set", f"corpus_path={CORPUS}", *args])


def test_cli_ask_json(tmp_path, capsys):
    code = cli("--set", f"index_path={tmp_path / 'i.json'}",
               "ask", "Comment résilier mon abonnement ?", "--role", "public", "--json")
    assert code == 0
    data = json.loads(capsys.readouterr().out)
    assert data["citations"][0]["doc_id"] == "SUP-001"


def test_cli_eval_passes_and_exports(tmp_path):
    out = tmp_path / "kpis.json"
    code = cli("--set", f"index_path={tmp_path / 'i.json'}", "eval", "--eval-set", EVAL_SET,
               "--matrix", MATRIX, "--json", str(out))
    assert code == 0
    assert json.loads(out.read_text())["acl_leak"] == 0


def test_cli_eval_fails_when_a_target_is_missed(tmp_path):
    code = cli("--set", f"index_path={tmp_path / 'i.json'}", "--set", "acl=false",
               "eval", "--eval-set", EVAL_SET, "--matrix", MATRIX)
    assert code == 1


def test_cli_reports_bad_input(tmp_path):
    assert cli("--set", f"index_path={tmp_path / 'i.json'}", "ask", "x", "--role", "boss") == 2
    assert cli("--set", "chunk_size=5", "ingest") == 2


def test_cli_ingest_and_cdc(tmp_path, capsys):
    assert cli("--set", f"index_path={tmp_path / 'i.json'}", "ingest") == 0
    assert (tmp_path / "i.json").exists()
    assert cli("cdc", "--matrix", MATRIX) == 0
    assert "Fuite de données" in capsys.readouterr().out
