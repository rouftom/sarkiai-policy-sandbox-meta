"""Structure-Aware Semantic Chunker.

Parses legal/administrative structural markers (TITRE, CHAPITRE, SECTION, ARTICLE,
TITLE, CHAPTER, ...) to produce chunk candidates carrying breadcrumb heading paths,
article numbers, and parent/child relationships. Adapted from the SarkiAI Enterprise
RAG ingestion engine for the SarkiAI Policy Sandbox.
"""

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


def normalize_whitespace(text: str) -> str:
    """Collapse redundant whitespace in a multiline string."""
    if not text:
        return ""
    return " ".join(text.split())


@dataclass
class ChunkCandidate:
    """A text chunk prior to embedding and vector storage."""

    text: str
    unit_type: str = "general"
    article_number: Optional[str] = None
    subdocument_title: Optional[str] = None
    heading_path: Optional[str] = None
    chunk_role: str = "parent"  # "parent" primary section, "child" sub-window fragment
    parent_text: Optional[str] = None
    child_ordinal: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self, chunk_index: int) -> Dict[str, Any]:
        """Convert into a storage-ready chunk dict."""
        return {
            "chunkIndex": chunk_index,
            "text": self.text,
            "unitType": self.unit_type,
            "articleNumber": self.article_number,
            "subdocumentTitle": self.subdocument_title or f"Chunk {chunk_index}",
            "headingPath": self.heading_path,
            "chunkRole": self.chunk_role,
            "parentText": self.parent_text,
            "childOrdinal": self.child_ordinal,
            "metadata": self.metadata,
        }


class StructureAwareChunker:
    """Splits structured text into semantic chunks while keeping hierarchical breadcrumbs."""

    HEADER_REGEX = re.compile(
        r"^(TITRE|TITLE|CHAPITRE|CHAPTER|SECTION|ARTICLE|PARAGRAPHE|PARAGRAPH|SOUS-SECTION)\s+"
        r"([IVXLCDM0-9]+(?:\.[0-9]+)*)",
        re.IGNORECASE,
    )
    ARTICLE_REGEX = re.compile(r"^(ARTICLE|ART\.)\s+([0-9]+[a-z]*)", re.IGNORECASE)

    def __init__(self, chunk_size: int = 900, chunk_overlap: int = 120):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def split(self, text: str) -> List[ChunkCandidate]:
        """Parse raw text into hierarchical ChunkCandidate instances."""
        if not text or not text.strip():
            return []

        lines = [line.strip() for line in text.splitlines() if line.strip()]
        chunks: List[ChunkCandidate] = []
        heading_stack: List[str] = []
        current_article: Optional[str] = None
        current_buffer: List[str] = []

        def flush_buffer() -> None:
            if not current_buffer:
                return
            full_text = " ".join(current_buffer)
            heading_path = " > ".join(heading_stack) if heading_stack else None
            unit = "article" if current_article else "section"

            if len(full_text) <= self.chunk_size:
                chunks.append(
                    ChunkCandidate(
                        text=full_text,
                        unit_type=unit,
                        article_number=current_article,
                        subdocument_title=heading_stack[-1] if heading_stack else "Document Content",
                        heading_path=heading_path,
                        chunk_role="parent",
                    )
                )
            else:
                for idx, sub_text in enumerate(self._split_text_sliding_window(full_text), start=1):
                    chunks.append(
                        ChunkCandidate(
                            text=sub_text,
                            unit_type=unit,
                            article_number=current_article,
                            subdocument_title=heading_stack[-1] if heading_stack else "Document Content",
                            heading_path=heading_path,
                            chunk_role="child",
                            parent_text=full_text[:300],
                            child_ordinal=idx,
                        )
                    )
            current_buffer.clear()

        for line in lines:
            header_match = self.HEADER_REGEX.match(line)
            article_match = self.ARTICLE_REGEX.match(line)

            if header_match or article_match:
                flush_buffer()

                if article_match:
                    current_article = article_match.group(2)
                    header_str = f"ARTICLE {current_article}"
                else:
                    current_article = None
                    header_str = line.upper()

                if "TITRE" in header_str or "TITLE" in header_str:
                    heading_stack = [header_str]
                elif "CHAPITRE" in header_str or "CHAPTER" in header_str:
                    heading_stack = [h for h in heading_stack if "TITRE" in h or "TITLE" in h] + [header_str]
                elif "SECTION" in header_str:
                    heading_stack = [
                        h for h in heading_stack if not h.startswith("SECTION") and not h.startswith("ARTICLE")
                    ] + [header_str]
                else:
                    heading_stack.append(header_str)

                current_buffer.append(line)
            else:
                current_buffer.append(line)

        flush_buffer()
        return chunks

    def _split_text_sliding_window(self, text: str) -> List[str]:
        """Split an oversized block into overlapping sub-chunks using a word sliding window."""
        words = text.split()
        if not words:
            return []

        chunks: List[str] = []
        start = 0
        step = max(1, self.chunk_size // 10)
        max_words = max(1, self.chunk_size // 6)

        while start < len(words):
            end = min(start + max_words, len(words))
            chunks.append(" ".join(words[start:end]))
            if end >= len(words):
                break
            start += step

        return chunks
