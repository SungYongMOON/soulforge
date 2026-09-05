# External review map — 2026-09-05 (GPT product-planning draft vs. Soulforge canon)

Status: `reference_only`. Nothing in this file is canon. An external model (ChatGPT
with the GitHub connector) reviewed the public repository on 2026-09-05 without
being able to read most of it, and produced a product-planning draft plus an
infographic. This map records what that draft got right, what it could not see,
and where each of its checklist items already lives in Soulforge, so the next
external pass can start from the reviewer packet instead of from a partial index.

Owner of this folder: `docs/reviews/README.md` (non-canon review records). Canon
owners are unchanged: `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`.

## 1. Verdict on the external outputs

| Output | Verdict | Reason |
| --- | --- | --- |
| Infographic ("AI 창작 플랫폼": 아이디어 허브, 마켓플레이스, 모바일 앱) | **Discard** | Describes a different product. None of those features exist in, or are planned for, Soulforge. |
| One-line definition ("사람과 AI가 함께 업무를 수행하고 출처·판단·결과·검증·책임을 연결해서 남기는 엔지니어링 업무 시스템") | **Accept** | Matches the canon. Adopted as the public one-liner in `README.md`. |
| Three-part split (업무 기반 / 엔진 / 에이전트 플랫폼) | **Accept with names** | These are World Tree (ERP), Rune (Engineering Engine), Guild (Agent Platform). See the Master Map. |
| "실행 성공 ≠ 업무 완료" | **Accept** | Already canon: registration is a submission receipt; `done` is review → human acceptance → sole writer (`AGENTS.md`, plan 18). |
| First-release framing (the team performs tasks and reviews results; agent management is an execution feature inside) | **Yes** | This is the Team Pilot access model in plan 18: Buzz + bot-mediated MCP for the team, browser World Tree as the Owner's loopback. |
| Google Drive "제품기획실" folder tree | **Do not create** | It would become a second canon. External drafts are reference material kept in a worksite, never promoted. |
| App menu proposal and option B (keep the core, redesign the UI) | **Hold as input** | Reasonable, but the reviewer never saw the running app. Re-evaluate after a packet-based pass. |

## 2. What the external reviewer could not see

All of the following exist in the repository and were not indexed by the
connector. The reviewer packet (`npm run export:reviewer-packet`) bundles them.

- The world model and names: World Tree, Rune, Guild; the forge naming set (Ore,
  Tributary, Ingot, Heartwood, Hearth, Bellows, Anvil, Hammer, Quench, Covenant,
  Tongs, Vigil, Sigil, Reliquary); the era model (Canto I · The Kindling, Gram
  0.1.x). Owner: `docs/architecture/foundation/SHARED_GLOSSARY_V0.md`, Master Map M0.
- The seven canon roots and what is not canon (`README.md`,
  `docs/architecture/foundation/TARGET_TREE.md`, `DOCUMENT_OWNERSHIP.md`).
- Collection versus backup as two axes (Tributary custody is not a Reliquary
  generation): plan 10, `guild_hall/backup_controller/README.md`.
- The Team Pilot access model, bot roster rules and release ladder: plan 18.
- The physical spine and path registry: plan 17, `guild_hall/path_registry/`.
- What is actually running today: 15-minute read-only Tributary lanes for
  Linear and Buzz (both observed `status: ok` on 2026-09-05); the Vigil watch
  surface; the first D: canonical backup generation staged and verified
  (promotion and isolated restore pending human acceptance). Evidence lives in
  private receipts; public documents cite digests only.
- Where it runs, which a repository index cannot show at all: the HPP server
  pack is 0.1.7 (current) with 0.1.6 as previous, but the scheduled tasks do not
  follow the `current` pointer - they pin a payload path down to the version,
  and as read from the task definitions on 2026-09-05 the versions are split:
  the World Tree server task runs `0.1.7`, while the continuous ingress, PC activity
  and voice ASR tasks still pin `0.1.6`. The two Vigil tasks(`상황판`·`감시면` 예약작업), the usage
  meter, the Hiworks forwarder and the Codex retention task do not run from the
  pack at all; they run from `install/source-lanes/operations-lane-v2`, and the
  Linear, Buzz and Slack collectors from their own `source-lanes/<lane>-v1`.
  One task (the NAS DR backup runner) still executes from the legacy checkout,
  against the work-location rule in `AGENTS.md`; it is listed for cleanup, not
  hidden. So `main` is not what runs,
  and a reviewer who reads the repository is reading a different artifact from
  the one in production. The source commit each lane carries is recorded in that
  lane's `LANE_MANIFEST.md`, and the lane can be re-verified against its own
  manifest at any time.
- The private/public storage boundary: `_workmeta` and `private-state` are
  separate private repositories, invisible to any public-repo connector by design.

## 3. External checklist mapped to Soulforge

| # | External step | Soulforge artifact | Status (2026-09-05) |
| --- | --- | --- | --- |
| 1 | Fix the current baseline (repo, branch, commit, running version) | `install/server-pack/<x.y.z>` digests, `install/source-lanes/<lane>/LANE_MANIFEST.md`, `CHANGELOG.md`, cutover receipts under `local-recovery/` (private) | 부분: pack digests and the HPP 0.1.7 cutover receipt exist, and each lane records its source commit - but the scheduled tasks are split across versions (World Tree on `0.1.7`; continuous ingress, PC activity and voice ASR still on `0.1.6`; one runner still on the legacy checkout) and no single public artifact yet answers "which commit is running where" for every task at once |
| 2 | Fix the release scope (users, representative task, in and out) | Plan 18 §1–§7 (Team Pilot 1), `DEVELOPMENT_ROADMAP_V0.md` | 부분: access model and ladder fixed; pilot bot exposure and tool allowlists are open Owner decisions |
| 3 | Confirm structure and data ownership | `DOCUMENT_OWNERSHIP.md`, plan 17, `guild_hall/path_registry/`, `WORKSPACE_PROJECT_MODEL.md` | 구현 확인: owners and storage classes declared; the target `_workspaces` binding stays HOLD until the three Covenant rules are adopted |
| 4 | Verify the D: relocation (restart, no old-path dependence, no double writers) | Cutover receipts; `AGENTS.md` state-root precedence; `guild_hall/shared/soulforge_state_root.mjs` | 부분: relocation and cutover done; the host reboot test has not been performed (it needs the Owner's direct approval); `SOULFORGE_OWNER_ROOT` stays on the legacy checkout by design until Legacy Freeze |
| 5 | One representative task end to end (start → execute → review → record, with recovery) | Plan 18 pilot flow (Buzz → bot → MCP submit → human acceptance); `ui-workspace/apps/dev-erp` | 문서만 + 부분: the Tongs(MCP gate) and submission receipts exist; a full pilot round with a team member has not been run |
| 6 | Permission and project isolation, including direct API calls | MCP allowlists, `AI_ORGANIZATION_MODEL_OPERATING_POLICY_V0.md`, project taxonomy, forbidden-root fences in every lane | 부분: fences and read allowlists exist; an adversarial API-level isolation test is not recorded |
| 7 | Install, update and restore rehearsal | Server-pack generations, `backup_controller` synthetic restore canary, NAS DR contract (default OFF), the Linear generation with human acceptance | 부분: the Linear generation was restored and accepted; the D: canonical generation is staged, restore test pending |
| 8 | A manual that matches the real screens | Team picture-book (planned after the pilot decisions); lane READMEs; `docs/architecture/workspace/` | 미구현: no end-user manual yet; operator READMEs exist |

Status vocabulary: 구현 확인 (verified by a receipt or test), 부분 (exists but not
closed), 문서만 (contract or plan only), 미구현.

## 4. Rules that stay in force for external reviews

- Give external models the reviewer packet, not repository access to private
  trees. The packet is public-safe and passes the local path policy.
- External drafts are inputs. They are recorded here as reference and never
  promoted to canon without an Owner decision recorded in the owning document.
- Do not create parallel document stores (cloud folders) for the same content.
- A reviewer that could not read the code cannot judge release readiness, and this
  map does not claim otherwise.

## 5. Two external document sets and one key

Status: `reference_only`, appended 2026-09-05. The keys below (`EXT-nn`, `CE-nn`) are
the only identifiers external reviewers should cite from now on; each row carries
"document version + original ID + claim" so no finding is closed by number alone.

The external reviewer produced two passes on 2026-09-05. Pass 1
(`ChatGPT_제품기획실_20260905`, ~11:00 KST) has findings F01–F12 and work items
SF-001–SF-034. Pass 2 (`ChatGPT_제품화·앱설계_2026-09-05/v0.1_main-b1aa2a9_구조검토·출시계획`,
~11:05 KST) has findings F01–F14 and work items REV-01–32 with different numbering.
Our first reply (afternoon) cited pass-2 numbers; the reviewer thread that answered
holds pass 1, so it flagged the mismatch and re-judged its 12 items as
`02_재판정_v0.2_회신반영_패킷대기.md` (pass-1 folder). The union is 18 distinct claims:

| Key | Claim | Pass 1 | Pass 2 | Status (2026-09-05 pm) |
| --- | --- | --- | --- | --- |
| EXT-01 | CI Validate fails at path policy | F01 | F01, REV-02 | 57/17 classified; lane A running; still red |
| EXT-02 | No branch protection / rulesets | F05 | F02, REV-03 | Owner sets after CI green |
| EXT-03 | Which commit runs where is unverified from GitHub | F10 (part) | F03, REV-01/05 | partial: README §어디서 도는가 + LANE_MANIFEST + build_source_lane --verify; one-page receipt for all tasks pending |
| EXT-04 | Universal Client is headless, no physical seat | F06 | F04, REV-13/14 | out of Team Pilot 1 by Owner decision 09-02 (Buzz + bot MCP); ring 3+ |
| EXT-05 | Authority contract vs live enforcement; RUNE-first vs Linear SoR | F03 | F05, REV-07 | HOLD by design; pilot = human acceptance + human Linear done |
| EXT-06 | Recovery not human-accepted | F09 | F06, REV-19/20 | Linear generation restored byte-identical + human-accepted 09-02; D: canonical gen staged, stamp pending |
| EXT-07 | Manuals never exercised / last-verified | F08 (part) | F07, REV-21 | open |
| EXT-08 | app.js unguarded localStorage JSON.parse ×10 | — | F08, REV-09 | lane C reproducing |
| EXT-09 | permOf default-allow in UI | — | F09 | lane C: separate "UI 표기" from "server bypass" |
| EXT-10 | chat text persisted in localStorage | — | F10, REV-10 | lane C reports facts + 3 options; Owner policy |
| EXT-11 | app.js / server.mjs size, feature boundaries | — | F11, REV-26 | held, not a defect |
| EXT-12 | Vigil(Board) is observation, not user app; new shell proposal (B안), 03 PRD | F07 | F12, §4 B, 03 | not adopted for pilot (구성 개편 B); hold as input |
| EXT-13 | Source composition ≠ release; no GitHub Release | F08 (part) | F13, REV-25/32 | by design: release unit = install/server-pack/<x.y.z> digest pack + cutover receipt; manual binding stays EXT-07 |
| EXT-14 | Dependency advisories untriaged | F11 | F14, REV-04 | open, low; counts not re-verified |
| EXT-15 | update_coordinator rollback receipt over-claims | F02 (reviewer reports 4 PASS/3 FAIL with injected adapter, patch attached) | REV-22 | lane C: reproduce in our tree first; attached patch not applied |
| EXT-16 | Master Map M8 `_workmeta` text vs 09-01 target correction | F04 | — | doc-sync candidate; Genesis stays rung 3 |
| EXT-17 | Launch identity / packaged-session AppData split | F10 | REV-06 | rule landed in AGENTS.md 09-03; drift detector owned by lane runbooks |
| EXT-18 | Work history → reusable Workflow promotion | F12 | REV-31 | long-term; excluded from rung 1 |

## 6. Counterexamples the reviewer proposed (test candidates, not incidents)

| Key | Failure mode | Where it lands |
| --- | --- | --- |
| CE-01 | Bot identity overrides requester authority; cross-project mixing in one bot session | rung 2 acceptance test; plan 18 §4 (no cross-project context) |
| CE-02 | Submission stored, response lost, user retries → duplicate review items | rung 1/2; ingress receipt idempotency (same request+digest → same result, different digest → HOLD) |
| CE-03 | Pending-review query failure rendered as "0 items" | **lane B acceptance criterion**: only a verified 0 is "none"; flag OFF / denied / timeout / stale are distinct states; filter never shows other projects; Vigil stays read+link |
| CE-04 | Reviewed revision ≠ revision marked done | rung 2; receipt task/submission/revision/digest must match the reviewed object; no inheritance of old acceptance |
| CE-05 | Reusing a stamp across versions or backup generations | rung 1 stamps: 0.1.7 cutover acceptance and synthetic-restore acceptance are separate objects; Linear acceptance is not D: acceptance |

## 7. External execution advisory (E07, E05 v0.2)

- Direction accepted as design candidate (three-axis separation; external authoring; local CODE enforcement; Qwen-off default loop). No new product/DB/root. Landing: P07 Tool Workshops (plan 11, one bot per tool, capacity-1 lease, candidate custody receipt) + P08 (plan 09); entry only via plan 05/09. Research lineage ("Master v0.11", Stage0) stays outside canon.
- Reviewer's zone map accepted as explanation: P = Heartwood/Anvil, W = export-approved surface inside a Tool Workshop, B = Tongs + Quench, M = Hearth's external-model role. X1–X3 are execution modes, not names.
- First qualification package registered as candidate (not scheduled): E05.G0 conditions; E05.G1 = OP01, OP04, LG01, LG03, LG05, LG06, PR02, AT01, AT12, RT01, RT04, AF01; E05.G2 = WA02 → HWPX bot, WA03 → PPT bot. AF01 reuses candidate custody receipt; PF01 and PF02 are reported separately. Runs only after rung 3 and only on synthetic data.
- Owner idea (2026-09-05, recorded as roadmap 다음 후보 28): shape-preserving external authoring. Give the external model per-slide dummy content that keeps the real shape (character counts, image counts, slots); it returns per-slide spacing and layout; the local model then swaps in the real text and images while keeping the style, so no real content leaves. Offered to the reviewer as an alternative to WA03/AF08 in E05 v0.2 and as a plan 11 PPT-bot qualification candidate. Idea only; nothing scheduled.
