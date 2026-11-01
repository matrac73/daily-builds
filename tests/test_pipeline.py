import json

import pytest

from ragprod import llm, transport
from ragprod.index import Index, load_or_build
from ragprod.llm import (
    ABSTAIN_MESSAGE,
    ExtractiveGenerator,
    FallbackGenerator,
    Generation,
    OpenAICompatibleGenerator,
    build_user_prompt,
)
from ragprod.pipeline import RAGPipeline, answer_to_dict, groundedness
from ragprod.transport import BackendError


class FakeLLM:
    def __init__(self, text: str) -> None:
        self.text = text
        self.calls = 0

    def generate(self, question, contexts):
        self.calls += 1
        return Generation(self.text, 100, 20, "fake")


def test_answers_with_citation(pipeline):
    answer = pipeline.ask("Quelle est l'autonomie du vélo V3 en mode Éco ?", "public")
    assert not answer.abstained
    assert "80 kilomètres" in answer.text
    assert answer.citations[0].doc_id == "PROD-001"
    assert answer.groundedness == 1.0
    assert set(answer.timings) == {"retrieval_ms", "generation_ms", "total_ms"}


def test_acl_hides_restricted_documents(pipeline):
    question = "Quelle est la fourchette de salaire d'un ingénieur senior ?"
    denied = pipeline.ask(question, "employee")
    assert denied.abstained and denied.text == ABSTAIN_MESSAGE
    assert all(r.chunk.access != "hr" for r in denied.retrieved)
    granted = pipeline.ask(question, "hr")
    assert not granted.abstained and "65 000" in granted.text


def test_without_acl_restricted_document_reaches_the_prompt(config, shared_index):
    leaky = RAGPipeline(config.with_overrides({"acl": False}), index=shared_index)
    answer = leaky.ask("Quelle est la fourchette de salaire d'un ingénieur senior ?", "employee")
    assert "RH-003" in answer.context_doc_ids


def test_out_of_scope_question_abstains_without_calling_the_llm(config, shared_index):
    fake = FakeLLM("Une tarte tatin se fait avec des pommes [1].")
    pipeline = RAGPipeline(config, index=shared_index, generator=fake)
    answer = pipeline.ask("Quelle est la recette de la tarte tatin ?", "public")
    assert answer.abstained and answer.reason == "low_relevance"
    assert fake.calls == 0


def test_grounding_check_blocks_hallucinations(config, shared_index):
    hallucination = FakeLLM("Le télétravail est illimité avec une prime de 900 dollars [1].")
    question = "Combien de jours de télétravail par semaine ?"
    strict = RAGPipeline(config, index=shared_index, generator=hallucination).ask(question)
    assert strict.abstained and strict.reason == "ungrounded"
    lax = RAGPipeline(config.with_overrides({"grounding_check": False}), index=shared_index,
                      generator=hallucination).ask(question)
    assert not lax.abstained and lax.groundedness < 0.6


def test_model_abstention_is_detected(config, shared_index):
    fake = FakeLLM("Je ne sais pas.")
    answer = RAGPipeline(config, index=shared_index, generator=fake).ask(
        "Combien de jours de télétravail par semaine ?")
    assert answer.abstained and answer.reason == "model_abstained"


def test_injection_is_quarantined(pipeline):
    answer = pipeline.ask("Quel est le mot de passe administrateur ?", "employee")
    assert "Helios2026" not in answer.text
    assert any(q.doc_id == "IT-003" for q in pipeline.index.quarantined)


def test_cache_is_keyed_by_role(config, shared_index):
    fake = FakeLLM("Le télétravail est autorisé jusqu'à trois jours par semaine [1].")
    pipeline = RAGPipeline(config, index=shared_index, generator=fake)
    question = "Combien de jours de télétravail par semaine ?"
    first = pipeline.ask(question, "employee")
    second = pipeline.ask("combien de jours de TÉLÉTRAVAIL par semaine", "employee")
    assert not first.cached and second.cached and fake.calls == 1
    other_role = pipeline.ask(question, "public")
    assert not other_role.cached and other_role.abstained  # RH-001 is internal


def test_cache_evicts_least_recently_used(config, shared_index):
    pipeline = RAGPipeline(config.with_overrides({"cache_size": 1}), index=shared_index)
    pipeline.ask("Combien coûte l'abonnement Helios Pass ?", "public")
    pipeline.ask("Comment résilier mon abonnement ?", "public")
    assert not pipeline.ask("Combien coûte l'abonnement Helios Pass ?", "public").cached


def test_context_budget_limits_prompt(config, shared_index):
    question = "Quels sont les plafonds des notes de frais ?"
    small = RAGPipeline(config.with_overrides({"max_context_tokens": 10}), index=shared_index)
    large = RAGPipeline(config.with_overrides({"max_context_tokens": 5000}), index=shared_index)
    assert len(small.ask(question).context_chunk_ids) == 1
    assert len(large.ask(question).context_chunk_ids) >= 1
    assert small.ask(question).prompt_tokens <= large.ask(question).prompt_tokens


@pytest.mark.parametrize("mode", ["bm25", "vector", "hybrid"])
def test_every_retrieval_mode_finds_the_document(config, shared_index, mode):
    pipeline = RAGPipeline(config.with_overrides({"retrieval_mode": mode, "mmr": False}),
                           index=shared_index)
    retrieved = pipeline.retrieve("Combien coûte l'abonnement Helios Pass ?", "public")
    assert retrieved[0].chunk.doc_id == "PROD-002"


def test_trace_file_records_each_request(config, shared_index, tmp_path):
    trace = tmp_path / "traces.jsonl"
    pipeline = RAGPipeline(config.with_overrides({"trace_path": str(trace)}), index=shared_index)
    pipeline.ask("Comment résilier mon abonnement ?", "public")
    pipeline.ask("Comment résilier mon abonnement ?", "public")
    records = [json.loads(line) for line in trace.read_text(encoding="utf-8").splitlines()]
    assert [r["cached"] for r in records] == [False, True]
    assert records[0]["sources"][0] == "SUP-001"


def test_answer_serialises_to_json(pipeline):
    data = answer_to_dict(pipeline.ask("Comment résilier mon abonnement ?", "public"))
    assert json.dumps(data, ensure_ascii=False)
    assert data["retrieved"][0]["doc_id"] == "SUP-001"


def test_groundedness_scores_claims_against_cited_chunks(shared_index):
    chunk = next(c for c in shared_index.chunks if c.doc_id == "PROD-001")
    contexts = [(1, chunk)]
    assert groundedness("Le vélo dispose d'une batterie amovible [1]. Et donc [1].", contexts) == 1.0
    assert groundedness("Le cheval galope dans la prairie verte [1].", contexts) == 0.0
    assert groundedness("", contexts) == 1.0


def test_index_round_trip_and_invalidation(config):
    built = load_or_build(config)
    loaded = Index.load(config.index_path, config)
    assert loaded is not None
    assert [c.id for c in loaded.chunks] == [c.id for c in built.chunks]
    assert Index.load(config.index_path, config.with_overrides({"chunk_size": 80})) is None


def test_extractive_generator_quotes_with_citations(shared_index):
    chunk = next(c for c in shared_index.chunks if c.doc_id == "PROD-002")
    generation = ExtractiveGenerator().generate("Prix de l'abonnement Helios Pass ?", [(1, chunk)])
    assert "19,90 euros" in generation.text and "[1]" in generation.text
    assert ExtractiveGenerator().generate("tarte tatin", [(1, chunk)]).text == ABSTAIN_MESSAGE


def test_openai_compatible_generator_builds_request(monkeypatch, shared_index):
    seen = {}

    def fake_post(url, payload, timeout):
        seen.update(url=url, payload=payload)
        return {"choices": [{"message": {"content": " Réponse [1]. "}}],
                "usage": {"prompt_tokens": 321, "completion_tokens": 7}}

    monkeypatch.setattr(llm, "post_json", fake_post)
    chunk = shared_index.chunks[0]
    generation = OpenAICompatibleGenerator("http://x/v1/", "qwen2.5:3b", 0.1, 5).generate("Q ?", [(1, chunk)])
    assert seen["url"] == "http://x/v1/chat/completions"
    assert seen["payload"]["model"] == "qwen2.5:3b"
    assert seen["payload"]["messages"][1]["content"] == build_user_prompt("Q ?", [(1, chunk)])
    assert generation.text == "Réponse [1]." and generation.prompt_tokens == 321


def test_fallback_generator_degrades_gracefully(shared_index):
    class Down:
        def generate(self, question, contexts):
            raise BackendError("connection refused")

    chunk = next(c for c in shared_index.chunks if c.doc_id == "PROD-002")
    result = FallbackGenerator(Down(), ExtractiveGenerator()).generate("abonnement Helios Pass", [(1, chunk)])
    assert result.degraded and result.backend == "extractive"


def test_post_json_wraps_network_errors():
    with pytest.raises(BackendError):
        transport.post_json("http://127.0.0.1:9/v1/chat/completions", {}, timeout=0.5)
