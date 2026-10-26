"""Unit tests for the structure-aware chunker (pure stdlib).

Runs with pytest, or directly:  PYTHONPATH=src python3 tests/test_chunker.py
"""

from rag_ingestion.services.chunker import StructureAwareChunker


def test_empty_input_returns_no_chunks():
    assert StructureAwareChunker().split("") == []
    assert StructureAwareChunker().split("   \n  ") == []


def test_article_heading_sets_number_and_type():
    text = "ARTICLE 12\nTout traitement de donnees doit etre licite et transparent."
    chunks = StructureAwareChunker().split(text)
    assert len(chunks) == 1
    assert chunks[0].article_number == "12"
    assert chunks[0].unit_type == "article"
    assert "ARTICLE 12" in (chunks[0].heading_path or "")


def test_hierarchical_breadcrumb_titre_chapitre_article():
    text = "\n".join(
        [
            "TITRE I",
            "DISPOSITIONS GENERALES",
            "CHAPITRE II",
            "OBLIGATIONS",
            "ARTICLE 5",
            "Le responsable du traitement doit etre identifiable.",
        ]
    )
    chunks = StructureAwareChunker().split(text)
    article_chunks = [c for c in chunks if c.article_number == "5"]
    assert article_chunks, "the article chunk should be produced"
    assert article_chunks[0].heading_path == "TITRE I > CHAPITRE II > ARTICLE 5"


def test_oversized_section_is_split_into_children():
    body = " ".join(["mot"] * 500)  # ~2500 chars > chunk_size 900
    text = f"ARTICLE 7\n{body}"
    chunks = StructureAwareChunker(chunk_size=900, chunk_overlap=120).split(text)
    assert len(chunks) > 1
    assert all(c.chunk_role == "child" for c in chunks)
    assert all(c.parent_text for c in chunks)
    assert [c.child_ordinal for c in chunks] == list(range(1, len(chunks) + 1))


if __name__ == "__main__":
    # Minimal stdlib runner (no pytest dependency).
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as exc:  # noqa: PERF203
                failures += 1
                print(f"FAIL {name}: {exc}")
    if failures:
        raise SystemExit(f"{failures} test(s) failed")
    print("all chunker tests passed")
