"""Corpus reuse rights · the ingestion gate.

Mirrors `packages/shared/src/rights.ts`. The manifest's `rights` field decides
whether a full text may be stored; unknown or missing values fail closed to
`to-confirm` so a new ingestion path cannot silently store a restricted payload.
See `docs/LICENSING.md`.
"""

from typing import Optional

CORPUS_RIGHTS = ("official-text", "open-licence", "quotation-only", "to-confirm")
PUBLISHABLE_RIGHTS = ("official-text", "open-licence")

RIGHTS_BLOCKED_MESSAGE = (
    "Document rights do not allow full-text ingestion. "
    "Only official-text and open-licence documents may enter the knowledge base; "
    "quotation-only and to-confirm documents must stay out (see docs/LICENSING.md)."
)


def normalize_rights(value: Optional[str]) -> str:
    return value if value in CORPUS_RIGHTS else "to-confirm"


def is_publishable_rights(value: Optional[str]) -> bool:
    return normalize_rights(value) in PUBLISHABLE_RIGHTS


def refusal_detail(value: Optional[str], filename: Optional[str] = None) -> str:
    suffix = f" (filename={filename})" if filename else ""
    return f"{RIGHTS_BLOCKED_MESSAGE} rights={normalize_rights(value)}{suffix}"
