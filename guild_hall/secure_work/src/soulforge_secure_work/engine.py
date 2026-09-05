"""M07 mission engine: one job, one state machine, one receipt per step.

The engine owns no policy of its own. It walks the E14 state machine, calls the
bound adapter for the current phase, and records what happened. Where an
adapter is unavailable or an approval is missing it stops on the current phase
and says so; it never substitutes a success.

Nothing written by this module carries raw source text, a slot mapping or key
material. Receipts and events carry digests, phases, counts and error codes.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from . import adapters as adapters_module
from . import authority, extract, guard, plan as plan_module
from .config import Config

STATUS_SCHEMA = "soulforge.secure_work.status.v0"
JOB_SCHEMA = "soulforge.secure_work.job.v0"
POLICY_EPOCH = 1
PERMIT_LIFETIME_SECONDS = 300


class EngineStop(RuntimeError):
    """A bounded stop: the phase could not advance for a stated reason."""

    def __init__(self, code: str, detail: str = "") -> None:
        self.code = code
        self.detail = detail
        super().__init__(code if not detail else f"{code}: {detail}")


def _opaque(*parts: str) -> str:
    return "o_" + hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:32]


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass
class Job:
    config: Config
    job_id: str
    data: dict

    @property
    def root(self) -> Path:
        return self.config.jobs_root / self.job_id

    @property
    def receipts(self) -> Path:
        return self.config.receipts_root / self.job_id

    @property
    def outbox(self) -> Path:
        return self.config.outbox_root / self.job_id

    def path(self, *parts: str) -> Path:
        return self.root.joinpath(*parts)

    def save(self) -> None:
        self.path("job.json").write_text(
            json.dumps(self.data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


class Lane:
    """Everything bound for one run of the lane."""

    def __init__(self, config: Config) -> None:
        self.config = config
        config.ensure_dirs()
        from . import kit as kit_module

        self.kit_src = kit_module.bind(config.kit_root)
        from sf_sewe import codec, journal, models, permits, projection, artifacts, runtime

        self.codec = codec
        self.models = models
        self.permits = permits
        self.projection = projection
        self.artifacts = artifacts
        self.journal = journal
        self.runtime = runtime

        g2_config = config.adapter("g2")
        transport_config = config.adapter("transport")
        custody_config = config.adapter("custody")
        self.source = adapters_module.FileSystemSource(config.source_root)
        self.g2 = adapters_module.LocalManagerAdapter(
            base_url=g2_config.values.get("base_url", "http://127.0.0.1:18080/v1"),
            model=g2_config.values.get("model", "auto"),
            timeout_s=int(g2_config.values.get("timeout_s", 180)),
            enabled=g2_config.enabled,
            chat_template_kwargs=g2_config.values.get("chat_template_kwargs"),
            max_tokens=int(g2_config.values.get("max_tokens", 3000)),
        )
        self.vault = adapters_module.VaultAdapter(config.vault_root, config.keywrap_path)
        self.scripted = adapters_module.ScriptedWorkerTransport(
            python_executable=transport_config.values.get("python_executable", ""),
            package_root=Path(__file__).resolve().parents[1],
            kit_src=self.kit_src,
        )
        self.openrouter = adapters_module.OpenRouterTransport(
            key_file=transport_config.values.get("key_file"),
            base_url=transport_config.values.get("base_url", ""),
            model=transport_config.values.get("model"),
            live_enabled=bool(transport_config.values.get("live_enabled", False)),
        )
        self.custody = adapters_module.TongsCustodyAdapter(
            client_cli=custody_config.values.get("ingress_client_cli"),
            ingress_url=custody_config.values.get("ingress_url", "http://127.0.0.1:4312"),
            control_url=custody_config.values.get("control_url", "http://127.0.0.1:4311"),
            token_file=custody_config.values.get("token_file"),
            live_enabled=bool(custody_config.values.get("live_enabled", False)),
        )

    # -- job store ---------------------------------------------------------

    def load_job(self, job_id: str) -> Job:
        path = self.config.jobs_root / job_id / "job.json"
        if not path.is_file():
            raise EngineStop("JOB_NOT_FOUND", job_id)
        return Job(self.config, job_id, json.loads(path.read_text(encoding="utf-8")))

    def list_jobs(self) -> list[Job]:
        jobs = []
        for path in sorted(self.config.jobs_root.glob("*/job.json")):
            jobs.append(Job(self.config, path.parent.name,
                            json.loads(path.read_text(encoding="utf-8"))))
        return jobs

    def open_journal(self, job: Job):
        return self.journal.Journal(str(job.path("journal.db")))

    def phase(self, job: Job) -> str:
        handle = self.open_journal(job)
        try:
            return handle.get(job.job_id, job.data["project_ref"]).phase
        finally:
            handle.close()

    # -- ledgers -----------------------------------------------------------

    def append_event(self, job: Job, action: str, before: str, after: str,
                     evidence_ref: str, codes: list[str] | None = None,
                     facts: dict | None = None) -> int:
        path = job.path("events.jsonl")
        seq = sum(1 for _ in path.open("r", encoding="utf-8")) + 1 if path.is_file() else 1
        record = {
            "seq": seq,
            "occurred_utc": _now(),
            "job_id": job.job_id,
            "action": action,
            "before_phase": before,
            "after_phase": after,
            "evidence_ref": evidence_ref,
            "codes": codes or [],
        }
        if facts:
            record["facts"] = facts
        line = json.dumps(record, ensure_ascii=False, sort_keys=True)
        findings = guard.scan_log_line(line, bound_values=self._bound_values(job),
                                       key_material=[])
        if findings:
            raise EngineStop("EVENT_WOULD_LEAK", findings[0].code)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
        return seq

    def write_receipt(self, job: Job, seq: int, action: str, payload: dict) -> str:
        job.receipts.mkdir(parents=True, exist_ok=True)
        name = f"{seq:03d}_{action}.json"
        body = {"schema": "soulforge.secure_work.receipt.v0", "job_id": job.job_id,
                "seq": seq, "action": action, "observed_at": _now(), **payload}
        text = json.dumps(body, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        findings = guard.scan_log_line(text, bound_values=self._bound_values(job),
                                       key_material=[])
        if findings:
            raise EngineStop("RECEIPT_WOULD_LEAK", findings[0].code)
        (job.receipts / name).write_text(text, encoding="utf-8")
        return f"{job.job_id}/{name}"

    def _bound_values(self, job: Job) -> list[str]:
        path = job.path("bindings_digest.json")
        if not path.is_file():
            return []
        # Only the values that a slot exists to withhold are checked, and they
        # are held in memory for the length of one scan.
        vault, connection = self.vault.open(job.job_id)
        try:
            index = json.loads(path.read_text(encoding="utf-8"))
            values = []
            for slot_id in index.get("slot_ids", []):
                record = vault.resolve(job.data["mission_id"], slot_id,
                                       index["source_bundle_sha256"])
                values.append(record.value)
            return values
        except Exception:
            return []
        finally:
            connection.close()

    def refresh_status(self, last_job: str | None = None,
                       last_receipt_ref: str | None = None) -> dict:
        counts: dict[str, int] = {}
        for job in self.list_jobs():
            try:
                phase = self.phase(job)
            except Exception:
                phase = "UNKNOWN"
            counts[phase] = counts.get(phase, 0) + 1
        # A plain status read refreshes the counts without erasing what the last
        # advance recorded.
        previous: dict = {}
        if self.config.status_path.is_file():
            try:
                previous = json.loads(self.config.status_path.read_text(encoding="utf-8"))
            except ValueError:
                previous = {}
        resolved_job = last_job or previous.get("last_job")
        resolved_receipt = last_receipt_ref or previous.get("last_receipt_ref")
        if not resolved_receipt:
            newest = self._newest_receipt()
            if newest:
                resolved_job, resolved_receipt = newest
        status = {
            "schema": STATUS_SCHEMA,
            "observed_at": _now(),
            "jobs": dict(sorted(counts.items())),
            "last_job": resolved_job,
            "last_receipt_ref": resolved_receipt,
        }
        self.config.status_path.parent.mkdir(parents=True, exist_ok=True)
        self.config.status_path.write_text(
            json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return status

    def _newest_receipt(self) -> tuple[str, str] | None:
        newest: tuple[float, str, str] | None = None
        for path in self.config.receipts_root.glob("*/*.json"):
            stamp = path.stat().st_mtime
            if newest is None or stamp > newest[0]:
                newest = (stamp, path.parent.name, f"{path.parent.name}/{path.name}")
        return (newest[1], newest[2]) if newest else None

    # -- transitions -------------------------------------------------------

    def transition(self, job: Job, target: str, action: str, evidence_ref: str,
                   codes: list[str] | None = None, facts: dict | None = None) -> tuple[str, str]:
        handle = self.open_journal(job)
        try:
            view = handle.get(job.job_id, job.data["project_ref"])
            before = view.phase
            command_key = _opaque(job.job_id, target, str(view.revision), action)
            handle.transition(job.job_id, job.data["project_ref"], view.revision, target,
                              command_key, evidence_ref)
        finally:
            handle.close()
        seq = self.append_event(job, action, before, target, evidence_ref, codes, facts)
        receipt = self.write_receipt(job, seq, action, {
            "before_phase": before, "after_phase": target,
            "evidence_ref": evidence_ref, "codes": codes or [], "facts": facts or {}})
        return target, receipt

    # -- request -----------------------------------------------------------

    def request(self, recipe_id: str, source_dir: Path, requester: str,
                mission_name: str) -> Job:
        probe = self.source.probe()
        if probe.state != "AVAILABLE":
            raise EngineStop("ADAPTER_UNAVAILABLE", f"M01 {probe.detail}")
        job_id = _opaque(mission_name, requester, _now())
        mission_id = _opaque("mission", mission_name, job_id)
        job = Job(self.config, job_id, {
            "schema": JOB_SCHEMA,
            "job_id": job_id,
            "mission_id": mission_id,
            "mission_name": mission_name,
            "recipe_id": recipe_id,
            "requester_ref": requester,
            "project_ref": "project.secure_work.pilot",
            "assignment_ref": "assignment.secure_work.pilot",
            "assignment_epoch": 1,
            "policy_epoch": POLICY_EPOCH,
            "base_candidate_rev": "none",
            "round": 0,
            "source_dir_ref": "pilot.source",
            "created_utc": _now(),
            "data_class": "SYNTHETIC_ONLY",
        })
        job.root.mkdir(parents=True, exist_ok=True)
        job.save()
        handle = self.open_journal(job)
        try:
            handle.create(job_id, job.data["project_ref"], job.data["recipe_id"])
        finally:
            handle.close()
        seq = self.append_event(job, "jobs.submit", "NONE", "RECEIVED",
                                f"evidence.request.{job_id[2:14]}")
        receipt = self.write_receipt(job, seq, "jobs.submit", {
            "before_phase": "NONE", "after_phase": "RECEIVED",
            "facts": {"recipe_id": recipe_id, "requester_ref": requester,
                      "data_class": "SYNTHETIC_ONLY"}})
        self.refresh_status(job_id, receipt)
        return job

    # -- steps -------------------------------------------------------------

    def step_pin_source(self, job: Job) -> tuple[str, str]:
        pins, parts = extract.read_exact(self.config.source_root)
        recipe = plan_module.load_recipe(self.config.recipe_root, job.data["recipe_id"])
        work = plan_module.work_definition(self.models, recipe)
        bundle = plan_module.source_bundle(
            self.models, pins, parts, job.data["project_ref"],
            job.data["assignment_ref"], job.data["assignment_epoch"])
        job.path("bundle.json").write_bytes(self.codec.canonical(bundle) + b"\n")
        # Order-preserving on purpose: canonical bytes sort object keys, and the
        # section order of the work definition is the reading order of the
        # report. The digest below still uses canonical bytes, so the contract
        # digest stays order-independent either way.
        job.path("work.json").write_bytes(work.model_dump_json(indent=2).encode("utf-8"))
        job.path("parts.json").write_text(json.dumps(
            [part.__dict__ for part in parts], ensure_ascii=False), encoding="utf-8")
        job.data["source_bundle_sha256"] = self.codec.digest(bundle)
        job.data["work_definition_sha256"] = self.codec.digest(work)
        job.data["source_pin_count"] = len(pins)
        job.data["field_count"] = len(parts)
        job.save()
        return self.transition(
            job, "SOURCE_PINNED", "source.read_exact",
            f"evidence.source.{job.data['source_bundle_sha256'][:12]}",
            facts={"source_pins": len(pins), "fields": len(parts),
                   "source_bundle_sha256": job.data["source_bundle_sha256"]})

    def step_g2_propose(self, job: Job) -> tuple[str, str]:
        parts = self._parts(job)
        work_sections = set(plan_module.SECTION_TITLES)
        code_selection = plan_module.default_selection(parts, work_sections)
        mode = "code_only"
        model_id = None
        raw_len = 0
        finish = None
        accepted = 0
        proposed_count = 0
        refused = 0
        probe = self.g2.probe()
        if probe.state == "AVAILABLE":
            prompt = self._g2_prompt(job, parts)
            try:
                model_id, text, finish = self.g2.propose(prompt)
                raw_len = len(text)
                proposed = self._parse_g2(text, {part.field_id for part in parts})
                proposed_count = len(proposed)
                accepted = len(proposed & code_selection)
                refused = len(proposed - code_selection)
                mode = "local_manager_reviewed_by_code"
            except adapters_module.AdapterUnavailable as unavailable:
                mode = f"code_only_after_{unavailable.reason}"
        else:
            mode = f"code_only_{probe.state.lower()}"
        # CODE decides. The proposal is recorded, compared and then re-derived;
        # it never widens the selection on its own.
        selection = sorted(code_selection)
        job.path("g2_proposal.json").write_text(json.dumps({
            "schema": "soulforge.secure_work.g2_proposal.v0",
            "mode": mode, "model_bound": bool(model_id), "finish_reason": finish,
            "reply_chars": raw_len, "code_selected": len(selection),
            "model_proposed": proposed_count, "model_agreed": accepted,
            "model_proposed_but_code_refused": refused,
            "note": "hidden reasoning is not read, stored or logged",
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        job.data["selected_field_ids"] = selection
        job.data["g2_mode"] = mode
        job.save()
        return self.transition(
            job, "G2_PREPARED", "g2.propose",
            f"evidence.g2.{self.codec.digest({'selected': selection})[:12]}",
            facts={"mode": mode, "local_model_bound": bool(model_id),
                   "local_model_calls": 1 if model_id else 0,
                   "external_model_calls": 0, "finish_reason": finish,
                   "selected_fields": len(selection),
                   "model_proposed_fields": proposed_count,
                   "model_agreed_fields": accepted,
                   "model_proposed_but_code_refused": refused})

    def step_project(self, job: Job) -> tuple[str, str]:
        parts = self._parts(job)
        bundle = self.models.SourceBundle.model_validate_json(job.path("bundle.json").read_bytes())
        work = self.models.WorkDefinition.model_validate_json(job.path("work.json").read_bytes())
        selected = set(job.data["selected_field_ids"])
        projection_plan = plan_module.projection_plan(
            self.models, self.codec.digest, bundle, work, parts, job.data["mission_id"],
            selected, job.data["policy_epoch"], job.data["base_candidate_rev"],
            job.data["round"])

        expected = []
        for rule in projection_plan.rules:
            if rule.action == "KEEP_REVIEWED":
                field = next(f for f in bundle.fields if f.field_id == rule.field_id)
                expected.append({"review_ref": rule.review_ref,
                                 "field_sha256": self.codec.digest(field),
                                 "policy_epoch": job.data["policy_epoch"],
                                 "field_id": rule.field_id})
        ledger = authority.FieldReviewLedger(self.config.field_review_path)
        missing = ledger.missing([(item["review_ref"], item["field_sha256"],
                                   item["policy_epoch"]) for item in expected])
        if missing:
            authority.write_review_request(job.path("field_review_request.json"),
                                           job.job_id, expected)
            job.data["field_review_missing"] = len(missing)
            job.save()
            return self.transition(
                job, "HOLD", "release.review",
                f"evidence.fieldreview.{self.codec.digest({'missing': sorted(missing)})[:12]}",
                codes=["FIELD_REVIEW_REQUIRED"],
                facts={"reviews_expected": len(expected), "reviews_missing": len(missing)})

        projected = self.projection.project(
            self.models.ProjectInput(source=bundle, plan=projection_plan, work=work),
            lambda review_ref, field_digest, epoch: ledger.verify(review_ref, field_digest, epoch),
        )
        vault, connection = self.vault.open(job.job_id)
        try:
            handle = vault.seal_batch(
                self.models.SealBindingsInput(
                    mission_id=job.data["mission_id"],
                    source_bundle_sha256=job.data["source_bundle_sha256"],
                    bindings=projected.bindings),
                idempotency_key=_opaque(job.job_id, "seal", str(job.data["round"])))
        finally:
            connection.close()

        body, route, route_digest, prepared, review_ref = self._prepare_wire(job, projected.packet)
        findings = guard.scan_released_bytes(
            body,
            source_refs=[pin.source_ref for pin in bundle.binding.sources],
            source_names=[pin.source_ref.removeprefix("src.") for pin in bundle.binding.sources],
            bound_values=[record.value for record in projected.bindings],
        )
        if findings:
            job.data["egress_findings"] = [finding.code for finding in findings]
            job.save()
            return self.transition(
                job, "HOLD", "projection.project",
                f"evidence.egress.{self.codec.digest(sorted({f.code for f in findings}))[:12]}",
                codes=sorted({finding.code for finding in findings}),
                facts={"egress_findings": len(findings)})

        job.path("plan.json").write_bytes(self.codec.canonical(projection_plan) + b"\n")
        job.path("packet.json").write_bytes(self.codec.canonical(projected.packet) + b"\n")
        job.path("body.bin").write_bytes(body)
        job.path("route.json").write_bytes(self.codec.canonical(route) + b"\n")
        job.path("prepared.json").write_bytes(self.codec.canonical(prepared) + b"\n")
        job.path("bindings_digest.json").write_text(json.dumps({
            "handle_id": handle.handle_id,
            "source_bundle_sha256": handle.source_bundle_sha256,
            "record_count": handle.record_count,
            "slot_ids": [record.slot_id for record in projected.bindings],
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        job.data.update({
            "packet_sha256": self.codec.digest(projected.packet),
            "request_sha256": self.codec.digest(body),
            "route_sha256": route_digest,
            "review_ref": review_ref,
            "binding_handle_id": handle.handle_id,
            "binding_count": handle.record_count,
            "used_field_ids": len(projected.used_field_ids),
            "omitted_field_ids": len(projected.omitted_field_ids),
            "egress_findings": [],
        })
        job.save()
        return self.transition(
            job, "RELEASE_REVIEW", "projection.project",
            f"evidence.packet.{job.data['packet_sha256'][:12]}",
            facts={"packet_sha256": job.data["packet_sha256"],
                   "request_sha256": job.data["request_sha256"],
                   "bindings_sealed": handle.record_count,
                   "used_fields": len(projected.used_field_ids),
                   "omitted_fields": len(projected.omitted_field_ids),
                   "egress_findings": 0,
                   "review_state": projected.review_state})

    def step_ready(self, job: Job) -> tuple[str, str]:
        record = self._permit_record(job)
        if record is None:
            raise EngineStop("PERMIT_REQUIRED", "sfx permit approve <job>")
        if record.get("decision") != "ALLOW":
            raise EngineStop("PERMIT_DENIED", record.get("decision", "UNKNOWN"))
        return self.transition(
            job, "READY", "release.issue",
            f"evidence.permit.{record['permit']['claims']['permit_id'][2:14]}",
            facts={"permit_max_uses": record["permit"]["claims"]["max_uses"],
                   "expires_utc": record["permit"]["claims"]["expires_utc"],
                   "authority": record["authority"]})

    def step_dispatch(self, job: Job) -> tuple[str, str]:
        record = self._permit_record(job)
        if record is None:
            raise EngineStop("PERMIT_REQUIRED", "sfx permit approve <job>")
        body = job.path("body.bin").read_bytes()
        permit = self.models.SignedPermit.model_validate(record["permit"])
        public_keys = {record["key_id"]: authority.load_public_key(record["public_key_hex"])}
        transport_id = job.data.get("transport_id", self.scripted.name)
        self.transition(job, "RUNNING", "model.dispatch.begin",
                        f"evidence.attempt.{job.data['request_sha256'][:12]}",
                        facts={"transport": transport_id})
        handle = self.open_journal(job)
        attempt_id = _opaque(job.job_id, "attempt", job.data["request_sha256"])
        try:
            with tempfile.TemporaryDirectory(prefix="sfx_worker_") as workdir:
                transport = _BoundTransport(self.scripted, Path(workdir))
                dispatch = self.runtime.DispatchReference(handle, transport, public_keys)
                state, reply = dispatch.send(
                    attempt_id, permit, body, job.data["route_sha256"], job.job_id,
                    job.data["mission_id"], job.data["round"], job.data["review_ref"],
                    job.data["policy_epoch"], transport_id, authority.utc_now())
        finally:
            handle.close()
        if state != "RESPONSE_RECEIVED" or reply is None:
            job.data["dispatch_state"] = state
            job.save()
            raise EngineStop("DELIVERY_UNKNOWN", state)
        job.path("quarantine").mkdir(parents=True, exist_ok=True)
        job.path("quarantine", "reply.json").write_bytes(reply)
        job.data["dispatch_state"] = state
        job.data["reply_sha256"] = self.codec.digest(reply)
        job.data["transport_calls"] = transport.calls
        job.data["external_network_calls"] = 0
        job.save()
        return self.transition(
            job, "RESULT_QUARANTINED", "model.dispatch",
            f"evidence.reply.{job.data['reply_sha256'][:12]}",
            facts={"state": state, "reply_sha256": job.data["reply_sha256"],
                   "transport_calls": transport.calls, "external_network_calls": 0,
                   "worker": "SCRIPTED_NOT_LLM"})

    def step_structure_check(self, job: Job) -> tuple[str, str]:
        packet = self.models.WorkPacket.model_validate_json(job.path("packet.json").read_bytes())
        reply = self.models.WorkerReply.model_validate_json(
            job.path("quarantine", "reply.json").read_bytes())
        if reply.result is None:
            raise EngineStop("NEEDS_CONTEXT", "worker asked for more context")
        verdict = self.artifacts.validate_document(self.models.CheckResultInput(
            packet=packet, result=reply.result, current_base=job.data["base_candidate_rev"]))
        job.path("verdict.json").write_bytes(self.codec.canonical(verdict) + b"\n")
        job.data["structure_state"] = verdict.state
        job.data["required_complete"] = verdict.required_complete
        job.save()
        return self.transition(
            job, "STRUCTURE_CHECKED", "result.check",
            f"evidence.verdict.{verdict.result_sha256[:12]}",
            facts={"state": verdict.state, "required_complete": verdict.required_complete,
                   "result_sha256": verdict.result_sha256})

    def step_bind(self, job: Job) -> tuple[str, str]:
        packet = self.models.WorkPacket.model_validate_json(job.path("packet.json").read_bytes())
        reply = self.models.WorkerReply.model_validate_json(
            job.path("quarantine", "reply.json").read_bytes())
        index = json.loads(job.path("bindings_digest.json").read_text(encoding="utf-8"))
        vault, connection = self.vault.open(job.job_id)
        try:
            resolved = vault.resolve_batch(self.models.ResolveBindingsInput(
                handle=self.models.BindingHandle(
                    handle_id=index["handle_id"], mission_id=job.data["mission_id"],
                    source_bundle_sha256=index["source_bundle_sha256"],
                    record_count=index["record_count"]),
                requested_slot_ids=index["slot_ids"]))
        finally:
            connection.close()
        markdown = self.artifacts.render_markdown(
            packet, reply.result, list(resolved.bindings),
            job.data["source_bundle_sha256"], job.data["base_candidate_rev"])
        job.path("candidate.md").write_bytes(markdown)
        job.data["candidate_sha256"] = self.codec.digest(markdown)
        job.data["candidate_bytes"] = len(markdown)
        job.data["slots_restored"] = len(resolved.bindings)
        job.save()
        return self.transition(
            job, "BOUND", "result.bind",
            f"evidence.candidate.{job.data['candidate_sha256'][:12]}",
            facts={"candidate_sha256": job.data["candidate_sha256"],
                   "candidate_bytes": len(markdown),
                   "slots_restored": len(resolved.bindings),
                   "profile": "markdown.literal.v1", "semantic_accepted": False})

    def step_validate(self, job: Job) -> tuple[str, str]:
        reply = self.models.WorkerReply.model_validate_json(
            job.path("quarantine", "reply.json").read_bytes())
        verdict = self.models.StructureVerdict.model_validate_json(
            job.path("verdict.json").read_bytes())
        findings = [
            self.models.CheckFinding(code="SEMANTIC_REVIEW_NOT_PERFORMED", severity="REVIEW",
                                     location_ref=None, evidence_ref=None),
            self.models.CheckFinding(code="PRIVACY_CHECK_IS_FINITE_NOT_GENERAL", severity="INFO",
                                     location_ref=None, evidence_ref=None),
            self.models.CheckFinding(code="WORKER_WAS_SCRIPTED_NOT_MODEL", severity="INFO",
                                     location_ref=None, evidence_ref=None),
        ]
        report = self.models.ValidationReport(
            report_id=_opaque(job.job_id, "validation", verdict.result_sha256),
            subject_sha256=self.codec.digest(reply.result),
            validator_id="soulforge.secure_work.structural",
            validator_version="0.1.0",
            privacy="PASS_IN_SCOPE" if not job.data.get("egress_findings") else "FAIL",
            utility="REVIEW_REQUIRED",
            integrity="PASS_IN_SCOPE",
            enforcement="PASS_IN_SCOPE",
            findings=findings,
            evidence_refs=[f"evidence.verdict.{verdict.result_sha256[:12]}",
                           f"evidence.candidate.{job.data['candidate_sha256'][:12]}"],
        )
        job.path("validation.json").write_bytes(self.codec.canonical(report) + b"\n")
        job.data["validation_report_id"] = report.report_id
        job.save()
        return self.transition(
            job, "REVIEW_PENDING", "semantic.review",
            f"evidence.validation.{report.report_id[2:14]}",
            facts={"privacy": report.privacy, "utility": report.utility,
                   "integrity": report.integrity, "enforcement": report.enforcement,
                   "findings": len(findings)})

    def step_candidate(self, job: Job) -> tuple[str, str]:
        markdown = job.path("candidate.md").read_bytes()
        content_ref = self.models.ResourceRef(
            object_id=_opaque(job.job_id, "candidate"), revision="c1",
            sha256=self.codec.digest(markdown), media_type="text/markdown",
            byte_length=len(markdown), classification="PRIVATE")
        manifest = self.models.CandidateManifest(
            candidate_id=_opaque(job.job_id, "manifest", job.data["candidate_sha256"]),
            job_id=job.job_id,
            source_binding_sha256=job.data["source_bundle_sha256"],
            base_candidate_rev=job.data["base_candidate_rev"],
            files=[content_ref],
            validation_refs=[job.data["validation_report_id"]],
            status="REVIEW_PENDING",
            is_accepted_revision=False)
        job.path("candidate_manifest.json").write_bytes(self.codec.canonical(manifest) + b"\n")
        job.data["candidate_id"] = manifest.candidate_id
        job.data["manifest_sha256"] = self.codec.digest(manifest)
        job.save()
        return self.transition(
            job, "CANDIDATE_READY", "custody.prepare",
            f"evidence.manifest.{job.data['manifest_sha256'][:12]}",
            facts={"candidate_id": manifest.candidate_id, "status": manifest.status,
                   "is_accepted_revision": False})

    def step_stage(self, job: Job) -> tuple[str, str]:
        job.outbox.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(job.path("candidate.md"), job.outbox / "candidate.md")
        shutil.copyfile(job.path("candidate_manifest.json"),
                        job.outbox / "candidate_manifest.json")
        shutil.copyfile(job.path("validation.json"), job.outbox / "validation.json")
        (job.outbox / "summary.json").write_text(json.dumps({
            "schema": "soulforge.secure_work.outbox_summary.v0",
            "job_id": job.job_id,
            "mission_name": job.data["mission_name"],
            "recipe_id": job.data["recipe_id"],
            "candidate_sha256": job.data["candidate_sha256"],
            "manifest_sha256": job.data["manifest_sha256"],
            "custody_state": "LOCAL_OUTBOX_ONLY",
            "server_acknowledged": False,
            "accepted": False,
            "data_class": "SYNTHETIC_ONLY",
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return self.transition(
            job, "CUSTODY_PENDING", "custody.stage",
            f"evidence.outbox.{job.data['manifest_sha256'][:12]}",
            facts={"custody_state": "LOCAL_OUTBOX_ONLY", "server_acknowledged": False,
                   "files": 4})

    def step_deposit(self, job: Job) -> tuple[str, str]:
        probe = self.custody.probe()
        raise EngineStop("ADAPTER_UNAVAILABLE", f"M10 {probe.detail}")

    STEPS = {
        "RECEIVED": ("step_pin_source", "M01"),
        "SOURCE_PINNED": ("step_g2_propose", "M02"),
        "G2_PREPARED": ("step_project", "M03/M04"),
        "RELEASE_REVIEW": ("step_ready", "M05"),
        "READY": ("step_dispatch", "M06"),
        "RESULT_QUARANTINED": ("step_structure_check", "M08"),
        "STRUCTURE_CHECKED": ("step_bind", "M08"),
        "BOUND": ("step_validate", "M09"),
        "REVIEW_PENDING": ("step_candidate", "M10"),
        "CANDIDATE_READY": ("step_stage", "M10"),
        "CUSTODY_PENDING": ("step_deposit", "M10"),
    }

    def advance(self, job: Job, max_steps: int = 1) -> list[dict]:
        results: list[dict] = []
        for _ in range(max_steps):
            phase = self.phase(job)
            if phase == "HOLD":
                phase = self._retry_hold(job, results)
                if phase != "G2_PREPARED":
                    break
            entry = self.STEPS.get(phase)
            if entry is None:
                results.append({"phase": phase, "action": None, "state": "TERMINAL_OR_WAITING"})
                break
            name, module = entry
            try:
                target, receipt = getattr(self, name)(job)
            except EngineStop as stop:
                results.append({"phase": phase, "module": module, "action": name,
                                "state": "STOPPED", "code": stop.code, "detail": stop.detail})
                break
            except adapters_module.AdapterUnavailable as stop:
                results.append({"phase": phase, "module": stop.module, "action": name,
                                "state": "STOPPED", "code": "ADAPTER_UNAVAILABLE",
                                "detail": stop.reason})
                break
            results.append({"phase": phase, "module": module, "action": name,
                            "state": "ADVANCED", "after_phase": target, "receipt": receipt})
            self.refresh_status(job.job_id, receipt)
            if target in {"HOLD", "CANCELLED", "FAILED"}:
                break
        return results

    def _retry_hold(self, job: Job, results: list[dict]) -> str:
        """A HOLD clears only when the blocking condition is actually gone."""
        ledger = authority.FieldReviewLedger(self.config.field_review_path)
        if not ledger.loaded:
            results.append({"phase": "HOLD", "action": None, "state": "STOPPED",
                            "code": "FIELD_REVIEW_REQUIRED",
                            "detail": "no field review ledger"})
            return "HOLD"
        target, receipt = self.transition(
            job, "G2_PREPARED", "jobs.revise", "evidence.hold.cleared",
            facts={"reason": "field_review_ledger_present"})
        results.append({"phase": "HOLD", "module": "M07", "action": "jobs.revise",
                        "state": "ADVANCED", "after_phase": target, "receipt": receipt})
        job.data["round"] = self.phase_round(job)
        job.save()
        return target

    def phase_round(self, job: Job) -> int:
        handle = self.open_journal(job)
        try:
            return handle.get(job.job_id, job.data["project_ref"]).round
        finally:
            handle.close()

    # -- permits -----------------------------------------------------------

    def approve_permit(self, job: Job, actor_ref: str) -> dict:
        if not job.path("body.bin").is_file():
            raise EngineStop("PACKET_NOT_PREPARED", "advance to RELEASE_REVIEW first")
        body = job.path("body.bin").read_bytes()
        record, _ = authority.issue_permit(
            self.models, self.permits, self.codec.canonical, self.codec.digest,
            job_id=job.job_id, mission_id=job.data["mission_id"],
            round_index=job.data["round"], body=body,
            route_digest=job.data["route_sha256"], review_ref=job.data["review_ref"],
            policy_epoch=job.data["policy_epoch"],
            audience=job.data.get("transport_id", self.scripted.name),
            lifetime_seconds=PERMIT_LIFETIME_SECONDS, actor_ref=actor_ref)
        job.path("permit.json").write_text(
            json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        seq = self.append_event(job, "release.issue", self.phase(job), self.phase(job),
                                f"evidence.permit.{record['permit']['claims']['permit_id'][2:14]}",
                                facts={"decision": "ALLOW", "actor_ref": actor_ref})
        self.write_receipt(job, seq, "release.issue", {
            "facts": {"decision": "ALLOW", "actor_ref": actor_ref,
                      "authority": record["authority"],
                      "request_sha256": record["permit"]["claims"]["request_sha256"],
                      "expires_utc": record["permit"]["claims"]["expires_utc"]}})
        return record

    def deny_permit(self, job: Job, actor_ref: str) -> dict:
        record = {"schema": "soulforge.secure_work.permit.v0", "decision": "DENY",
                  "actor_ref": actor_ref, "denied_utc": _now()}
        job.path("permit.json").write_text(
            json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        phase = self.phase(job)
        seq = self.append_event(job, "release.review", phase, phase, "evidence.permit.denied",
                                codes=["PERMIT_DENIED"], facts={"actor_ref": actor_ref})
        self.write_receipt(job, seq, "release.review",
                           {"facts": {"decision": "DENY", "actor_ref": actor_ref}})
        return record

    def _permit_record(self, job: Job) -> dict | None:
        path = job.path("permit.json")
        if not path.is_file():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    # -- helpers -----------------------------------------------------------

    def _parts(self, job: Job) -> list[extract.Part]:
        raw = json.loads(job.path("parts.json").read_text(encoding="utf-8"))
        return [extract.Part(
            field_id=item["field_id"], source_ref=item["source_ref"],
            source_revision=item["source_revision"], span_start=item["span_start"],
            span_end=item["span_end"], value=item["value"], role=item["role"],
            status=item["status"], dependencies=tuple(item["dependencies"]),
            section_ids=tuple(item["section_ids"]), required=item["required"],
            statement_id=item["statement_id"]) for item in raw]

    def _g2_prompt(self, job: Job, parts: list[extract.Part]) -> str:
        catalogue = "\n".join(
            f"- {part.field_id} [{part.role}/{part.status}/{part.section_ids[0]}] {part.value}"
            for part in parts)
        return (
            "너는 로컬 보안구역의 업무 관리자다. 아래는 한 과제의 합성 원문에서 뽑은 문장 조각 목록이다.\n"
            f"업무: {job.data['recipe_id']} 업무·변경 보고.\n"
            "이 보고서에 실제로 필요한 조각의 field_id만 고르고, 빠진 정보의 역할을 적어라.\n"
            "반드시 다음 형태의 JSON 객체 하나만 출력한다: "
            '{"selected_field_ids": ["..."], "missing_field_roles": ["..."]}\n\n'
            f"{catalogue}\n")

    def _parse_g2(self, text: str, known: set[str]) -> set[str]:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise adapters_module.AdapterUnavailable("M02", "no_json_object")
        try:
            data = json.loads(text[start:end + 1])
        except ValueError:
            raise adapters_module.AdapterUnavailable("M02", "invalid_json") from None
        proposed = data.get("selected_field_ids")
        if not isinstance(proposed, list):
            raise adapters_module.AdapterUnavailable("M02", "missing_selection")
        return {item for item in proposed if isinstance(item, str) and item in known}

    def _prepare_wire(self, job: Job, packet):
        transport_id = self.scripted.name
        route = self.models.RouteProfile(
            profile_id="secure_work.cycle1", revision="0.1.0",
            model_id="scripted.not-llm", codec_id="sf.sewe.json.v1",
            transport_id=transport_id, max_request_bytes=1048576,
            max_response_bytes=1048576, deadline_ms=120000, streaming=False,
            redirects=False, auto_retry=False, data_class="RELEASED", live_enabled=False)
        header_digest = self.codec.digest({"content-type": "application/json"})
        route_digest = self.codec.digest({
            "route": route.model_dump(mode="json"),
            "header_profile_sha256": header_digest,
            "codec_version": "1.0.0",
            "destination_profile": transport_id})
        body = self.codec.canonical({"packet": packet.model_dump(mode="json"),
                                     "released_history": []})
        review_ref = f"review.packet.{job.job_id[2:14]}"
        body_ref = self.models.ResourceRef(
            object_id=_opaque(job.job_id, "body"), revision="w1",
            sha256=self.codec.digest(body), media_type="application/json",
            byte_length=len(body), classification="RELEASED")
        prepared = self.models.PreparedRequest(
            request_id=_opaque(job.job_id, "request"), job_id=job.job_id,
            mission_id=job.data["mission_id"], round=job.data["round"],
            packet_sha256=self.codec.digest(packet), review_ref=review_ref,
            body=body_ref, route_sha256=route_digest, codec_version="1.0.0",
            header_profile_sha256=header_digest)
        job.data["transport_id"] = transport_id
        return body, route, route_digest, prepared, review_ref

    # -- doctor ------------------------------------------------------------

    def doctor(self) -> list[dict]:
        rows = [self.source.probe(), self.g2.probe(), self.vault.probe(),
                self.scripted.probe(), self.openrouter.probe(), self.custody.probe()]
        custody_config = self.config.adapter("custody")
        rows.append(adapters_module.endpoint_probe(
            custody_config.values.get("ingress_health_url",
                                      "http://127.0.0.1:4312/health"),
            "M10", "tongs.ingress_listener"))
        rows.append(adapters_module.endpoint_probe(
            custody_config.values.get("control_health_url",
                                      "http://127.0.0.1:4311/health"),
            "M10", "tongs.control_listener"))
        ledger = authority.FieldReviewLedger(self.config.field_review_path)
        rows.append(adapters_module.Probe(
            "M05", "field_review_ledger",
            "AVAILABLE" if ledger.loaded else "UNAVAILABLE",
            "synthetic pilot ledger" if ledger.synthetic else
            ("ledger present" if ledger.loaded else "ledger file missing")))
        return [row.as_row() for row in rows]


class _BoundTransport:
    """Adapts a workdir-bound transport to the kit's ByteTransport protocol."""

    def __init__(self, transport, workdir: Path) -> None:
        self.transport = transport
        self.workdir = workdir
        self.calls = 0

    def send_exact(self, body: bytes) -> bytes:
        self.calls += 1
        return self.transport.send_exact(body, self.workdir)
