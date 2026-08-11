import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parse as parseYaml } from "yaml";
import {
  BOOKSHELF_LEDGER_SCHEMA_VERSION,
  BOOKSHELF_PACKET_MAP_SCHEMA_VERSION,
  stableStringify,
  validateBookshelfBundle,
} from "./bookshelf_bundle_contract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODULE_REF = path.join(__dirname, "bookshelf_bundle_contract.mjs");
const EXAMPLE_ROOT = path.resolve(
  __dirname,
  "../../docs/architecture/workspace/examples/llm_wiki_bookshelf",
);
const LEDGER_TEMPLATE_REF = path.join(EXAMPLE_ROOT, "metadata_source_ledger.template.yaml");
const PACKET_TEMPLATE_REF = path.join(EXAMPLE_ROOT, "notebooklm_packet_map.template.yaml");

test("current v0 candidate template bytes are structurally valid but not ready", async () => {
  const bundle = currentV0Bundle({ readySource: false, readyPacket: false });
  bundle.source_ledger = parseYaml(await readFile(LEDGER_TEMPLATE_REF, "utf8"));
  bundle.notebooklm_packet_map = parseYaml(await readFile(PACKET_TEMPLATE_REF, "utf8"));
  const result = validateBookshelfBundle(bundle);

  assert.equal(result.structure_status, "pass", JSON.stringify(result.structure_blockers));
  assert.equal(result.readiness_status, "blocked");
  assert.equal(result.alignment_status, "unknown_alignment");
  assert.equal(result.ready_for_manual_notebooklm_use, false);
  assert.ok(result.readiness_blockers.includes("notebooklm_packet_map_packet_status_not_ready"));
  assert.ok(result.readiness_blockers.includes("packet_source_membership_not_allowed:source-YYYYMMDD-short-label"));
  assert.ok(result.readiness_blockers.includes("packet_source_not_owner_approved:source-YYYYMMDD-short-label"));
  assert.ok(result.readiness_blockers.includes("packet_source_claim_ceiling_not_aligned:source-YYYYMMDD-short-label"));
});

test("ready-looking current v0 metadata remains HOLD because exact alignments are unavailable", () => {
  const bundle = currentV0Bundle({ readySource: true, readyPacket: true });
  const before = structuredClone(bundle);
  const result = validateBookshelfBundle(bundle);

  assert.equal(result.structure_status, "pass", JSON.stringify(result.structure_blockers));
  assert.equal(result.readiness_status, "hold");
  assert.equal(result.alignment_status, "unknown_alignment");
  assert.equal(result.status, "hold");
  assert.equal(result.ready_for_manual_notebooklm_use, false);
  assert.deepEqual(result.unknown_alignments, [
    "approval_basis_ref_target_not_read_or_hash_verified_by_pure_validator",
    "binding_identity_not_referenced_by_packet_map_v0",
    "immutable_hash_bound_source_revision_identity_not_declared_by_bookshelf_v0",
    "ledger_document_identity_not_self_declared_in_v0",
    "project_scope_not_declared_by_ledger_or_packet_map_v0",
  ]);
  assert.equal(result.boundary.physical_source_root_read, false);
  assert.equal(result.boundary.projection_is_not_persisted_schema, true);
  assert.equal(result.boundary.binding_projection_is_persisted_schema, false);
  assert.equal(result.boundary.binding_projection_is_in_memory_only, true);
  assert.equal(result.boundary.physical_binding_not_loaded, true);
  assert.equal(result.boundary.redacted_binding_projection_only, true);
  assert.equal(result.boundary.filesystem_accessed, false);
  assert.equal(result.boundary.network_accessed, false);
  assert.deepEqual(bundle, before);
});

test("packet source handles must resolve exactly and duplicates are rejected", () => {
  const bundle = currentV0Bundle({ readySource: true, readyPacket: true });
  bundle.notebooklm_packet_map.packet.source_selection.include_source_handles.push(
    "source-foreign-handle",
    "source-foreign-handle",
  );
  bundle.notebooklm_packet_map.packet.source_selection.exclude_source_handles.push(
    "source-concrete-missing-exclusion",
  );

  const result = validateBookshelfBundle(bundle);

  assert.ok(result.structure_blockers.includes(
    "notebooklm_packet_map.packet.source_selection.include_source_handles_contains_duplicate:source-foreign-handle",
  ));
  assert.ok(result.alignment_conflicts.includes("packet_source_dangling_or_foreign:source-foreign-handle"));
  assert.ok(result.alignment_conflicts.includes(
    "packet_excluded_source_dangling_or_foreign:source-concrete-missing-exclusion",
  ));
});

test("duplicate ledger handles and include/exclude overlap are rejected", () => {
  const bundle = currentV0Bundle({ readySource: true, readyPacket: true });
  bundle.source_ledger.source_entries.push(structuredClone(bundle.source_ledger.source_entries[0]));
  bundle.notebooklm_packet_map.packet.source_selection.exclude_source_handles = [
    "source-YYYYMMDD-short-label",
  ];

  const result = validateBookshelfBundle(bundle);

  assert.ok(result.structure_blockers.includes(
    "source_ledger_source_handle_duplicate:source-YYYYMMDD-short-label",
  ));
  assert.ok(result.structure_blockers.includes(
    "packet_source_included_and_excluded:source-YYYYMMDD-short-label",
  ));
});

test("allowed and excluded warehouse-state sets must be disjoint", () => {
  const bundle = currentV0Bundle({ readySource: true, readyPacket: true });
  bundle.notebooklm_packet_map.packet.excluded_warehouse_states.push("10_CANON_source");

  const result = validateBookshelfBundle(bundle);

  assert.ok(result.structure_blockers.includes(
    "notebooklm_packet_map_warehouse_state_allowed_and_excluded:10_CANON_source",
  ));
});

test("approval, warehouse state, packet permission, and claim ceiling are readiness gates", () => {
  const bundle = currentV0Bundle({ readySource: true, readyPacket: true });
  const source = bundle.source_ledger.source_entries[0];
  source.warehouse_state = "00_INBOX_candidate";
  source.owner_approval.approval_status = "candidate";
  source.owner_approval.approved_by_role = "reviewer";
  source.owner_approval.approval_basis_ref = "_workmeta/<project_code>/reports/source_intake/<packet_ref>.yaml";
  source.notebooklm_use.allowed_for_packet = false;
  source.review_state.claim_ceiling = "observed";
  source.legacy_bookshelf_state_alias = "80_SUPERSEDED";

  const result = validateBookshelfBundle(bundle);

  assert.ok(result.readiness_blockers.includes(
    "packet_source_warehouse_state_not_allowed:source-YYYYMMDD-short-label",
  ));
  assert.ok(result.readiness_blockers.includes(
    "packet_source_warehouse_state_not_canon:source-YYYYMMDD-short-label",
  ));
  assert.ok(result.readiness_blockers.includes(
    "packet_source_not_owner_approved:source-YYYYMMDD-short-label",
  ));
  assert.ok(result.readiness_blockers.includes(
    "packet_source_approved_role_not_ready:source-YYYYMMDD-short-label",
  ));
  assert.ok(result.readiness_blockers.includes(
    "packet_source_approval_basis_ref_not_concrete_owner_surface:source-YYYYMMDD-short-label",
  ));
  assert.ok(result.readiness_blockers.includes(
    "packet_source_membership_not_allowed:source-YYYYMMDD-short-label",
  ));
  assert.ok(result.readiness_blockers.includes(
    "packet_source_claim_ceiling_not_aligned:source-YYYYMMDD-short-label",
  ));
  assert.ok(result.readiness_blockers.includes(
    "packet_source_legacy_state_alias_mismatch:source-YYYYMMDD-short-label",
  ));
});

test("redacted source-root projection requires identity and deny-by-default permissions", () => {
  const bundle = currentV0Bundle({ readySource: true, readyPacket: true });
  delete bundle.source_root_binding_projection.binding_ref;
  delete bundle.source_root_binding_projection.project_code;
  delete bundle.source_root_binding_projection.binding_id;
  delete bundle.source_root_binding_projection.storage_surface;
  delete bundle.source_root_binding_projection.source_payload_owner;
  delete bundle.source_root_binding_projection.source_root_path_is_private;
  delete bundle.source_root_binding_projection.agent_mutation_allowed;
  delete bundle.source_root_binding_projection.notebooklm_upload_allowed;

  const result = validateBookshelfBundle(bundle);

  for (const blocker of [
    "source_root_binding_projection_binding_ref_required",
    "source_root_binding_projection_project_code_required",
    "source_root_binding_projection_binding_id_required",
    "source_root_binding_projection_storage_surface_required",
    "source_root_binding_projection_source_payload_owner_required",
    "source_root_binding_projection_source_root_path_is_private_must_be_true",
    "source_root_binding_projection_agent_mutation_allowed_must_be_false",
    "source_root_binding_projection_notebooklm_upload_allowed_must_be_false",
  ]) {
    assert.ok(result.structure_blockers.includes(blocker));
  }
});

test("foreign storage-surface projection conflicts without reading a physical binding", () => {
  const bundle = currentV0Bundle({ readySource: true, readyPacket: true });
  bundle.source_root_binding_projection.storage_surface = "foreign_storage_surface";

  const result = validateBookshelfBundle(bundle);

  assert.equal(result.alignment_status, "conflict");
  assert.ok(result.alignment_conflicts.includes("source_root_binding_storage_surface_foreign"));
});

test("binding storage surface is compared only with selected sources", () => {
  const bundle = currentV0Bundle({ readySource: true, readyPacket: true });
  bundle.source_ledger.source_entries[0].storage_locator.storage_surface = "selected_source_surface";
  const unselected = structuredClone(bundle.source_ledger.source_entries[0]);
  unselected.source_handle = "source-YYYYMMDD-unselected";
  unselected.storage_locator.storage_surface = bundle.source_root_binding_projection.storage_surface;
  bundle.source_ledger.source_entries.push(unselected);

  const result = validateBookshelfBundle(bundle);

  assert.ok(result.alignment_conflicts.includes("source_root_binding_storage_surface_foreign"));
});

test("every selected source must match the single projected storage surface", () => {
  const bundle = currentV0Bundle({ readySource: true, readyPacket: true });
  const secondSelected = structuredClone(bundle.source_ledger.source_entries[0]);
  secondSelected.source_handle = "source-YYYYMMDD-second-selected";
  secondSelected.storage_locator.storage_surface = "second_selected_surface";
  bundle.source_ledger.source_entries.push(secondSelected);
  bundle.notebooklm_packet_map.packet.source_selection.include_source_handles.push(
    secondSelected.source_handle,
  );

  const result = validateBookshelfBundle(bundle);

  assert.ok(result.alignment_conflicts.includes("source_root_binding_storage_surface_foreign"));
});

test("additional keys are rejected without echoing attacker-controlled key names", () => {
  const bundle = currentV0Bundle({ readySource: true, readyPacket: true });
  const unknownKeys = [
    "bundle_private_marker",
    "boundary_private_marker",
    "version_private_marker",
    "selection_private_marker",
    "binding_private_marker",
  ];
  bundle[unknownKeys[0]] = true;
  bundle.source_ledger.metadata_boundary[unknownKeys[1]] = false;
  bundle.source_ledger.source_entries[0].version[unknownKeys[2]] = "synthetic";
  bundle.notebooklm_packet_map.packet.source_selection[unknownKeys[3]] = [];
  bundle.source_root_binding_projection[unknownKeys[4]] = false;

  const result = validateBookshelfBundle(bundle);
  const serialized = JSON.stringify(result);

  assert.equal(result.structure_blockers.filter((entry) => entry.startsWith("additional_key:")).length, 5);
  for (const key of unknownKeys) assert.equal(serialized.includes(key), false);
});

test("payload, account, conversation, secret, and physical-path fields are rejected and never echoed", () => {
  const cases = [
    ["source_text", "synthetic body"],
    ["notebooklm_answer", "synthetic answer"],
    ["account_id", "owner@example.invalid"],
    ["conversation_id", "conversation-synthetic-1"],
    ["access_token", "sk-abcdefghijklmnopqrstuvwxyz1234567890"],
    ["source_root_path", "D" + ":\\" + "private-source-root"],
  ];

  for (const [key, value] of cases) {
    const bundle = currentV0Bundle({ readySource: true, readyPacket: true });
    bundle.source_root_binding_projection[key] = value;
    const result = validateBookshelfBundle(bundle);
    assert.ok(result.structure_blockers.includes(
      `forbidden_field:bundle.source_root_binding_projection.${key}`,
    ));
    assert.equal(result.boundary.redacted_binding_projection_only, false);
    assert.equal(JSON.stringify(result).includes(value), false);
  }
});

test("absolute paths and live URLs are rejected in otherwise allowed metadata fields", () => {
  for (const unsafeValue of [
    "C" + ":\\" + "private\\binding.yaml",
    "See C" + ":\\" + "private\\binding.yaml",
    "/" + "Users/private/binding.yaml",
    "See " + "\\" + "\\" + "server\\share\\binding.yaml",
    "See " + "\\" + "\\" + "?\\" + "C" + ":\\private\\binding.yaml",
    "See /" + "etc/private/binding.yaml",
    "See /" + "mnt/private/binding.yaml",
    "See /" + "opt/private/binding.yaml",
    "See /" + "workspace/private/binding.yaml",
    "See /" + "data/private/binding.yaml",
    "See /" + "app/private/binding.yaml",
    "See /" + "boot/private/binding.yaml",
    "See /" + "bin/private/binding.yaml",
    "See /" + "media/private/binding.yaml",
    "/",
    "/" + "자료/private/binding.yaml",
    "/" + "Program Files/private/binding.yaml",
    "/" + "/" + "server/share/binding.yaml",
    "See /" + "자료/private/binding.yaml",
    "See /" + "Program Files/private/binding.yaml",
    "See /" + "/" + "server/share/binding.yaml",
    "https://drive.google.com/live-id",
  ]) {
    const bundle = currentV0Bundle({ readySource: true, readyPacket: true });
    bundle.source_root_binding_projection.source_root_label = unsafeValue;
    const result = validateBookshelfBundle(bundle);
    assert.ok(result.structure_blockers.includes("source_root_binding_projection_source_root_label_unsafe"));
    assert.equal(result.boundary.redacted_binding_projection_only, false);
    assert.equal(JSON.stringify(result).includes(unsafeValue), false);
  }
});

test("aggregate metadata-only boundary fails closed for every sensitive inclusion flag", () => {
  const cases = [
    ["source_ledger", "notebooklm_answers_included"],
    ["source_ledger", "live_drive_ids_included"],
    ["source_ledger", "runtime_absolute_paths_included"],
    ["source_ledger", "secrets_or_account_state_included"],
    ["notebooklm_packet_map", "notebooklm_answers_included"],
    ["notebooklm_packet_map", "live_notebook_ids_included"],
    ["notebooklm_packet_map", "live_drive_ids_included"],
    ["notebooklm_packet_map", "runtime_absolute_paths_included"],
  ];

  for (const [surface, key] of cases) {
    const bundle = currentV0Bundle({ readySource: true, readyPacket: true });
    const boundary = surface === "source_ledger"
      ? bundle.source_ledger.metadata_boundary
      : bundle.notebooklm_packet_map.packet_boundary;
    boundary[key] = true;
    const result = validateBookshelfBundle(bundle);
    assert.equal(result.structure_status, "blocked", `${surface}.${key}`);
    assert.equal(result.boundary.metadata_only, false, `${surface}.${key}`);
  }
});

test("secret-shaped identities and unknown key names are rejected without echo", () => {
  const secretValues = [
    "github_" + "pat_" + "A".repeat(40),
    "AIza" + "A".repeat(35),
    "glpat-" + "A".repeat(32),
    "sk_" + "live_" + "A".repeat(32),
  ];

  for (const secretValue of secretValues) {
    const bundle = currentV0Bundle({ readySource: true, readyPacket: true });
    const secretKey = "private_" + secretValue;
    bundle.source_root_binding_projection.binding_id = secretValue;
    bundle.source_root_binding_projection[secretKey] = false;

    const result = validateBookshelfBundle(bundle);
    const serialized = JSON.stringify(result);

    assert.equal(result.identity.binding_id, null);
    assert.equal(result.boundary.redacted_binding_projection_only, false);
    assert.equal(serialized.includes(secretValue), false);
    assert.equal(serialized.includes(secretKey), false);
  }
});

test("redacted projection flag requires deny-by-default binding permissions", () => {
  const mutations = [
    ["source_root_path_is_private", false],
    ["agent_mutation_allowed", true],
    ["notebooklm_upload_allowed", true],
  ];

  for (const [key, value] of mutations) {
    const bundle = currentV0Bundle({ readySource: true, readyPacket: true });
    bundle.source_root_binding_projection[key] = value;
    const result = validateBookshelfBundle(bundle);
    assert.equal(result.structure_status, "blocked", key);
    assert.equal(result.boundary.redacted_binding_projection_only, false, key);
  }
});

test("readiness requires a reviewed source and a concrete owner-surface approval ref", () => {
  const pending = currentV0Bundle({ readySource: true, readyPacket: true });
  pending.source_ledger.source_entries[0].review_state.review_status = "pending_owner_review";
  const pendingResult = validateBookshelfBundle(pending);
  assert.ok(pendingResult.readiness_blockers.includes(
    "packet_source_review_status_not_ready:source-YYYYMMDD-short-label",
  ));

  const weakBasis = currentV0Bundle({ readySource: true, readyPacket: true });
  weakBasis.source_ledger.source_entries[0].owner_approval.approval_basis_ref = "approval.yaml";
  const weakBasisResult = validateBookshelfBundle(weakBasis);
  assert.ok(weakBasisResult.readiness_blockers.includes(
    "packet_source_approval_basis_ref_not_concrete_owner_surface:source-YYYYMMDD-short-label",
  ));
});

test("official public-source approval remains valid under the owner bookshelf rules", () => {
  const bundle = currentV0Bundle({ readySource: true, readyPacket: true });
  bundle.source_ledger.source_entries[0].owner_approval.approval_status =
    "owner_approved_official_public_source";

  const result = validateBookshelfBundle(bundle);

  assert.equal(result.readiness_blockers.some((entry) => entry.includes("not_owner_approved")), false);
});

test("canonical result is source-order independent and has a stable fingerprint", () => {
  const forward = currentV0Bundle({ readySource: true, readyPacket: true });
  const secondSource = structuredClone(forward.source_ledger.source_entries[0]);
  secondSource.source_handle = "source-YYYYMMDD-second-label";
  secondSource.title_label = "Second public-safe source label";
  forward.source_ledger.source_entries.push(secondSource);
  forward.notebooklm_packet_map.packet.source_selection.include_source_handles.push(
    secondSource.source_handle,
  );
  const reversed = structuredClone(forward);
  reversed.source_ledger.source_entries.reverse();
  reversed.notebooklm_packet_map.packet.source_selection.include_source_handles.reverse();

  const forwardResult = validateBookshelfBundle(forward);
  const reversedResult = validateBookshelfBundle(reversed);
  assert.deepEqual(reversedResult, forwardResult);
  assert.match(forwardResult.result_fingerprint_sha256, /^[a-f0-9]{64}$/);
});

test("stableStringify canonicalizes object keys and preserves array order", () => {
  assert.equal(
    stableStringify({ z: 1, a: { d: 2, c: 3 }, list: [{ b: 2, a: 1 }] }),
    '{"a":{"c":3,"d":2},"list":[{"a":1,"b":2}],"z":1}',
  );
});

test("malformed projections block safely instead of throwing", () => {
  for (const bundle of [
    null,
    {},
    { source_ledger: [], notebooklm_packet_map: "bad", source_root_binding_projection: 1 },
  ]) {
    assert.doesNotThrow(() => validateBookshelfBundle(bundle));
    assert.equal(validateBookshelfBundle(bundle).status, "blocked");
  }
});

test("pure module imports no filesystem, network, process, clock, random, or write surface", async () => {
  const source = await readFile(MODULE_REF, "utf8");
  assert.doesNotMatch(source, /node:(?:fs|path|http|https|net|tls|child_process|worker_threads)/);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|process\.env|Date\.now|Math\.random|writeFile|appendFile)\b/);
});

function currentV0Bundle({ readySource, readyPacket }) {
  const sourceHandle = "source-YYYYMMDD-short-label";
  return {
    source_ledger: {
      schema_version: BOOKSHELF_LEDGER_SCHEMA_VERSION,
      template_status: "public_safe_example_template",
      ledger_owner: "_workmeta/<project_code>/reports/source_research",
      warehouse_surface: {
        storage_owner: "owner_managed_google_drive_source_warehouse",
        storage_role: "source_warehouse_for_llm_wiki",
        active_work_file_owner: "onedrive_or_project_worksite",
        source_payloads_stored_in_public_repo: false,
      },
      notebooklm_bookshelf_surface: {
        role: "advisory_query_bookshelf",
        source_selection_owner: "_workmeta_notebooklm_binding",
      },
      metadata_boundary: {
        metadata_only: true,
        source_payloads_included: false,
        notebooklm_answers_included: false,
        live_drive_ids_included: false,
        runtime_absolute_paths_included: false,
        secrets_or_account_state_included: false,
      },
      claim_policy: {
        default_claim_ceiling: "observed",
        notebooklm_output_is_authority: false,
        owner_review_required_for_public_promotion: true,
      },
      folder_state_values: [
        "00_INBOX_candidate",
        "10_CANON_source",
        "20_Project_CANON",
        "30_Domain_CANON",
        "80_SUPERSEDED",
        "90_REJECTED_or_UNCLEAR",
      ],
      source_entries: [
        {
          source_handle: sourceHandle,
          title_label: "Public-safe source label",
          source_kind: "pdf | drive_native_doc | web_export | owner_approved_note | source_packet",
          source_class: "official_reference | owner_approved | public_reference | project_source_packet",
          warehouse_state: readySource ? "10_CANON_source" : "00_INBOX_candidate",
          legacy_bookshelf_state_alias: readySource ? "10_CANON_source" : "00_INBOX_candidate",
          storage_locator: {
            storage_surface: "google_drive_source_warehouse",
            locator_kind: "owner_held_label",
            locator_label: "Warehouse folder label or owner-held ref, not a live ID",
          },
          version: {
            version_label: "v0",
            effective_date: "YYYY-MM-DD",
            supersedes_handle: null,
            superseded_by_handle: null,
          },
          owner_approval: {
            approval_status: readySource ? "owner_approved" : "candidate | owner_approved | rejected | superseded",
            approved_by_role: readySource ? "owner" : "owner | steward | reviewer | not_approved",
            approval_basis_ref: readySource
              ? "_workmeta/SYNTH/reports/source_intake/synthetic-approval.yaml"
              : "_workmeta/<project_code>/reports/source_intake/<packet_ref>.yaml",
            approval_note: "Public-safe reason summary only.",
          },
          notebooklm_use: {
            allowed_for_packet: readySource,
            packet_scope: ["topic-or-project-scope"],
            excluded_reason: readySource ? "not_excluded" : "pending_owner_review",
          },
          review_state: {
            claim_ceiling: readySource ? "source_supported" : "observed",
            review_status: readySource ? "source_checked" : "pending_owner_review",
            next_owner_action: "Confirm source version and approval scope.",
          },
          tags: {
            domain: ["example_domain"],
            project: ["example_project"],
          },
          audit: {
            created_at_utc: "YYYY-MM-DDTHH:MM:SSZ",
            updated_at_utc: "YYYY-MM-DDTHH:MM:SSZ",
            created_by_role: "worker",
          },
        },
      ],
    },
    notebooklm_packet_map: {
      schema_version: BOOKSHELF_PACKET_MAP_SCHEMA_VERSION,
      template_status: "public_safe_example_template",
      packet_boundary: {
        metadata_only: true,
        source_payloads_included: false,
        notebooklm_answers_included: false,
        live_notebook_ids_included: false,
        live_drive_ids_included: false,
        runtime_absolute_paths_included: false,
        advisory_only: true,
      },
      packet: {
        packet_handle: "nlm-packet-YYYYMMDD-topic",
        topic_label: "Public-safe packet topic label",
        intended_use: "manual_question_answering | source_review | synthesis_draft | gap_scan",
        notebook_ref: {
          ref_kind: "owner_held_notebook_label",
          ref_label: "Notebook label only, not a live ID or account URL",
        },
        source_ledger_ref: "_workmeta/<project_code>/reports/source_research/metadata_source_ledger.yaml",
        source_selection: {
          include_source_handles: [sourceHandle],
          exclude_source_handles: ["superseded-or-rejected-source-handle"],
          selection_rule: "Use only owner-approved CANON source handles for the scoped NotebookLM bookshelf topic.",
        },
        allowed_warehouse_states: ["10_CANON_source", "20_Project_CANON", "30_Domain_CANON"],
        excluded_warehouse_states: ["00_INBOX_candidate", "80_SUPERSEDED", "90_REJECTED_or_UNCLEAR"],
        query_log_policy: {
          record_queries_as_metadata_only: true,
          copy_answers_into_public_repo: false,
          copy_source_excerpts_into_public_repo: false,
          suggested_private_log_ref: "_workmeta/<project_code>/reports/source_research/notebooklm_query_log.md",
        },
        claim_policy: {
          notebooklm_output_claim_ceiling: "observed",
          source_checked_claim_ceiling: "source_supported",
          canon_or_owner_approval_from_packet: false,
        },
        review: {
          packet_status: readyPacket
            ? "ready_for_manual_notebooklm_use"
            : "draft | ready_for_manual_notebooklm_use | retired",
          reviewer_role: "owner | steward | worker",
          next_owner_action: "Confirm source handles before manual NotebookLM use.",
        },
        downstream_routes: {
          knowledge_access_event_capture: "optional_metadata_rollup",
          sourcebound_knowledge_packet_operating_loop: "optional_source_review",
          post_development_review_gate: "required_before_public_promotion_claim",
        },
      },
    },
    source_root_binding_projection: {
      binding_ref: "_workmeta/SYNTH/bindings/source_roots.yaml",
      project_code: "SYNTH",
      binding_id: "synth_google_drive_warehouse",
      storage_surface: "google_drive_source_warehouse",
      source_root_label: "Synthetic owner-held warehouse",
      source_root_path_is_private: true,
      source_payload_owner: "owner_managed_source_warehouse",
      agent_mutation_allowed: false,
      notebooklm_upload_allowed: false,
    },
  };
}
