"""Cycle-1 scripted worker. Reads one released body, returns one WorkerReply.

This process stands in for the external worker (G3). It runs with a working
directory that holds only the released body, and it is given nothing else: no
source directory, no vault, no job store, no binding map. Its whole input is the
bytes on stdin.

It is scripted, not a model. It composes the facts it was given back into the
sections it was told about; it invents no value and fills no slot. That is the
point of running it first: everything downstream — restore, structural check,
render, custody — is exercised before any model or any external route is
involved.
"""
from __future__ import annotations

import hashlib
import sys


def _block_id(section_id: str, root_fact_id: str) -> str:
    return "o_" + hashlib.sha256(f"{section_id}|{root_fact_id}".encode("utf-8")).hexdigest()[:32]


def build_reply(body: bytes):
    from sf_sewe.codec import canonical, strict_loads
    from sf_sewe.models import Block, DocumentIR, MissingEvidence, SectionIR, WorkPacket, WorkerReply

    envelope = strict_loads(body)
    if not isinstance(envelope, dict) or "packet" not in envelope:
        raise ValueError("WORKER_INPUT_SHAPE")
    packet = WorkPacket.model_validate(envelope["packet"])
    facts = {fact.fact_id: fact for fact in packet.facts}

    sections: list[SectionIR] = []
    missing: list[MissingEvidence] = []
    for spec in packet.sections:
        ordered = [fid for fid in spec.required_fact_ids if fid in facts]
        if not ordered:
            if spec.required:
                missing.append(MissingEvidence(
                    code="CONTEXT_INSUFFICIENT", section_id=spec.section_id, related_fact_ids=[]))
            continue
        in_section = set(ordered)
        groups: list[list[str]] = []
        index: dict[str, int] = {}
        for fact_id in ordered:
            parents = [p for p in facts[fact_id].depends_on if p in in_section]
            if parents and parents[0] in index:
                groups[index[parents[0]]].append(fact_id)
                index[fact_id] = index[parents[0]]
            else:
                index[fact_id] = len(groups)
                groups.append([fact_id])
        blocks: list[Block] = []
        for group in groups:
            members = [facts[fid] for fid in group]
            statuses = {member.status for member in members}
            if statuses == {"FACT"}:
                status = "FACT"
            elif "UNKNOWN" in statuses:
                status = "UNKNOWN"
            elif "PROPOSAL" in statuses:
                status = "PROPOSAL"
            else:
                status = "ANALYSIS"
            segments = [segment for member in members for segment in member.segments]
            blocks.append(Block(
                block_id=_block_id(spec.section_id, group[0]),
                kind="paragraph",
                status=status,
                evidence_ids=[member.fact_id for member in members],
                segments=segments,
                columns=[],
                rows=[],
            ))
        sections.append(SectionIR(section_id=spec.section_id, blocks=blocks))

    present = {section.section_id for section in sections}
    required = {spec.section_id for spec in packet.sections if spec.required}
    complete = not missing and required <= present
    result = DocumentIR(
        protocol="sf.sewe.document/1.0",
        mission_id=packet.mission_id,
        round=packet.round,
        base_candidate_rev=packet.base_candidate_rev,
        work_type=packet.work_type,
        work_revision=packet.work_revision,
        completion="COMPLETE_CANDIDATE" if complete else "PARTIAL",
        sections=sections,
        missing_evidence=missing,
    )
    return canonical(WorkerReply(result=result, more_context=None))


def main() -> int:
    body = sys.stdin.buffer.read()
    sys.stdout.buffer.write(build_reply(body))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
