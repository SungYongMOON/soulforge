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
| First-release framing (the team performs tasks and reviews results; agent management is an execution feature inside) | **Yes** | This is the Team Pilot access model in plan 18: Buzz + bot-mediated MCP for the team, browser ERP as the Owner's loopback. |
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
- What is actually running today: 15-minute read-only collection lanes for
  Linear and Buzz (both observed `status: ok` on 2026-09-05); the 4192 watch
  surface; the first D: canonical backup generation staged and verified
  (promotion and isolated restore pending human acceptance). Evidence lives in
  private receipts; public documents cite digests only.
- Where it runs, which a repository index cannot show at all: the HPP server
  pack is 0.1.7 (current) with 0.1.6 as previous, but the scheduled tasks do not
  follow the `current` pointer - they pin a payload path down to the version
  (`0.1.6`, as read from the task definitions on 2026-09-04). The Board, the
  watch surface and the usage meter do not run from the pack at all; they run
  from `install/source-lanes/operations-lane-v2`. So `main` is not what runs,
  and a reviewer who reads the repository is reading a different artifact from
  the one in production. The source commit each lane carries is recorded in that
  lane's `LANE_MANIFEST.md`, and the lane can be re-verified against its own
  manifest at any time.
- The private/public storage boundary: `_workmeta` and `private-state` are
  separate private repositories, invisible to any public-repo connector by design.

## 3. External checklist mapped to Soulforge

| # | External step | Soulforge artifact | Status (2026-09-05) |
| --- | --- | --- | --- |
| 1 | Fix the current baseline (repo, branch, commit, running version) | `install/server-pack/<x.y.z>` digests, `install/source-lanes/<lane>/LANE_MANIFEST.md`, `CHANGELOG.md`, cutover receipts under `local-recovery/` (private) | 부분: pack digests and the HPP 0.1.7 cutover receipt exist, and each lane records its source commit - but no single public artifact yet answers "which commit is running where" for all five scheduled tasks at once |
| 2 | Fix the release scope (users, representative task, in and out) | Plan 18 §1–§7 (Team Pilot 1), `DEVELOPMENT_ROADMAP_V0.md` | 부분: access model and ladder fixed; pilot bot exposure and tool allowlists are open Owner decisions |
| 3 | Confirm structure and data ownership | `DOCUMENT_OWNERSHIP.md`, plan 17, `guild_hall/path_registry/`, `WORKSPACE_PROJECT_MODEL.md` | 구현 확인: owners and storage classes declared; the target `_workspaces` binding stays HOLD until the three Covenant rules are adopted |
| 4 | Verify the D: relocation (restart, no old-path dependence, no double writers) | Cutover receipts; `AGENTS.md` state-root precedence; `guild_hall/shared/soulforge_state_root.mjs` | 부분: relocation and cutover done; the host reboot test has not been performed (it needs the Owner's direct approval); `SOULFORGE_OWNER_ROOT` stays on the legacy checkout by design until Legacy Freeze |
| 5 | One representative task end to end (start → execute → review → record, with recovery) | Plan 18 pilot flow (Buzz → bot → MCP submit → human acceptance); `ui-workspace/apps/dev-erp` | 문서만 + 부분: the MCP gate and submission receipts exist; a full pilot round with a team member has not been run |
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
