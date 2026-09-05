"""M01 source adapter and the deterministic field split that feeds M03.

Warning, carried over from the kit's own wording: this is an explicit-token
split, NOT an automatic secrecy detector. It finds only the token shapes listed
below. Anything it does not recognise stays a plain text field and therefore
still needs a human field review before it can appear literally in a packet.

Every field is pinned to one exact source revision (sha256 of the file bytes)
and to a byte span inside it. Nothing here re-reads a source by name later.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

# A statement is one sentence of one source line. It is split into ordered
# parts: recognised tokens, and the plain text between them.
# A Korean particle may follow a unit directly ("5.8 V로"), so only a Latin
# letter is treated as the unit continuing into a different word ("20 msec").
QUANTITY_RE = re.compile(
    r"\d+(?:\.\d+)?\s?(?:mV|V|ms|s|%|원|일|개월|건|회)(?![A-Za-z])"
)
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
LABELLED_ENTITY_RE = re.compile(r"(?<=고객: )[^.]+|(?<=과제: )[^.]+")
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")

UNKNOWN_MARKERS = ("없다", "없음", "미확정", "미상", "NOT_RUN", "UNKNOWN", "별도 합의")
PROPOSAL_MARKERS = ("제안", "요청이 있다", "바꾸자", "정하자", "후보")
ACTION_MARKERS = ("필요하다", "결정이 필요", "수행한다", "제출한다")
IMPACT_MARKERS = ("동시 충족 불가능", "충족 불가", "상한보다 크다", "영향")
CHANGE_FILE_PREFIXES = ("06_change_request",)

# One statement lands in exactly one section. Higher priority wins, so a change
# request never also inflates the facts section.
SECTION_PRIORITY = ("changes", "actions", "impacts", "unknowns", "facts")


@dataclass(frozen=True)
class Part:
    field_id: str
    source_ref: str
    source_revision: str
    span_start: int
    span_end: int
    value: str
    role: str
    status: str
    dependencies: tuple[str, ...]
    section_ids: tuple[str, ...]
    required: bool
    statement_id: str


def digest_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def status_for(text: str) -> str:
    if any(marker in text for marker in PROPOSAL_MARKERS):
        return "PROPOSAL"
    if any(marker in text for marker in UNKNOWN_MARKERS):
        return "UNKNOWN"
    return "FACT"


def section_for(stem: str, text: str) -> str:
    candidates: set[str] = set()
    if stem.startswith(CHANGE_FILE_PREFIXES):
        candidates.add("changes")
    if any(marker in text for marker in ACTION_MARKERS):
        candidates.add("actions")
    if any(marker in text for marker in IMPACT_MARKERS):
        candidates.add("impacts")
    if any(marker in text for marker in UNKNOWN_MARKERS):
        candidates.add("unknowns")
    for section in SECTION_PRIORITY:
        if section in candidates:
            return section
    return "facts"


def token_spans(text: str) -> list[tuple[int, int, str]]:
    spans: list[tuple[int, int, str]] = []
    for match in EMAIL_RE.finditer(text):
        spans.append((match.start(), match.end(), "entity"))
    for match in LABELLED_ENTITY_RE.finditer(text):
        spans.append((match.start(), match.end(), "entity"))
    for match in QUANTITY_RE.finditer(text):
        spans.append((match.start(), match.end(), "quantity"))
    spans.sort()
    merged: list[tuple[int, int, str]] = []
    for start, end, role in spans:
        if merged and start < merged[-1][1]:
            continue  # Overlapping token shapes: keep the first, never both.
        merged.append((start, end, role))
    return merged


def split_statement(statement_id: str, text: str, base_byte_offset: int, source_ref: str,
                    revision: str, section: str, status: str) -> list[Part]:
    """Split one statement into ordered, individually classified parts."""
    spans: list[tuple[str, int, int]] = []
    cursor = 0
    for start, end, role in token_spans(text):
        if start > cursor:
            spans.append(("text", cursor, start))
        spans.append((role, start, end))
        cursor = end
    if cursor < len(text):
        spans.append(("text", cursor, len(text)))
    if not spans:
        spans.append(("text", 0, len(text)))

    built: list[Part] = []
    ordinal = 0
    for role, start, end in spans:
        value = text[start:end]
        if not value.strip():
            continue  # Whitespace-only fragments carry no reviewable content.
        field_id = f"{statement_id}.p{ordinal:03d}"
        ordinal += 1
        built.append(
            Part(
                field_id=field_id,
                source_ref=source_ref,
                source_revision=revision,
                span_start=base_byte_offset + len(text[:start].encode("utf-8")),
                span_end=base_byte_offset + len(text[:end].encode("utf-8")),
                value=value,
                role=role,
                status=status,
                dependencies=(),
                section_ids=(section,),
                required=True,
                statement_id=statement_id,
            )
        )
    if not built:
        return []
    root_id = built[0].field_id
    return [built[0]] + [
        Part(**{**part.__dict__, "dependencies": (root_id,)}) for part in built[1:]
    ]


def read_exact(source_dir: Path) -> tuple[list[dict], list[Part]]:
    """Read every `*.md` under `source_dir` at its exact current revision."""
    files = sorted(p for p in Path(source_dir).glob("*.md") if p.is_file())
    if not files:
        raise RuntimeError("SOURCE_EXTRACTION_INCOMPLETE")
    pins: list[dict] = []
    parts: list[Part] = []
    for path in files:
        raw = path.read_bytes()
        stem = path.stem
        source_ref = f"src.{stem}"
        revision = "r1"
        pins.append({"source_ref": source_ref, "revision": revision,
                     "sha256": digest_bytes(raw)})
        offset = 0
        for index, line in enumerate(raw.decode("utf-8").split("\n"), start=1):
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                sentence_offset = 0
                for ordinal, sentence in enumerate(SENTENCE_SPLIT_RE.split(line), start=1):
                    start = line.index(sentence, sentence_offset)
                    sentence_offset = start + len(sentence)
                    if len(sentence.strip()) < 2:
                        continue
                    statement_id = f"{stem}.L{index:03d}s{ordinal:02d}"
                    parts.extend(split_statement(
                        statement_id,
                        sentence,
                        offset + len(line[:start].encode("utf-8")),
                        source_ref,
                        revision,
                        section_for(stem, sentence),
                        status_for(sentence),
                    ))
            offset += len(line.encode("utf-8")) + 1
    return pins, parts
