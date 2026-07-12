# Project File Activity & Revision Contract V0

- 상태: public-safe MVP 계약, live collector activation 보류
- 작성: 2026-07-12, owner의 네 PC + ERP 동시 작업 조건 반영
- 구현 owner: `guild_hall/file_activity/`
- UI consumer: dev-ERP `ENGINE-12-CONTEXT-LIFE-TREE`
- downstream consumer: `.workflow/project_folder_indexing_v0/`

## 1. 목적

같은 프로젝트를 `work_pc`, `tool_pc`, `portable_dev_pc`, `always_on_node`와
ERP 사용자가 동시에 바꿀 때 파일의 이름이나 timestamp를 source truth로 오인하지
않고 다음 질문에 답한다.

- 어떤 node가 언제 무엇을 관측했는가?
- 같은 논리 파일이 이름/경로를 바꾸었는가, 복사되었는가, 내용이 바뀌었는가?
- A 버전으로 되돌아온 것이 과거 A와 같은 내용일 뿐 새 변경 사건인가?
- 동시에 갈라진 두 수정본이 있는가?
- 관측 공백 때문에 모르는 것과 실제 삭제를 구분할 수 있는가?

이 계약은 metadata lineage다. 실제 파일 byte의 version backup이나 복구 보장은
소유하지 않는다.

## 2. 역할과 writer

| producer | 역할 | 쓰기 범위 |
| --- | --- | --- |
| `work_pc` | 일반 프로젝트 작업·기본 삭제 authority | 자기 node observation partition |
| `tool_pc` | 고성능 도구 실행·export 관측 | 자기 node observation partition |
| `portable_dev_pc` | 이동 개발·간헐 관측 | 자기 node observation partition, non-authoritative |
| `always_on_node` | packet ingress와 reconciliation | exactly one primary만 canonical state/projection |
| ERP | 인증된 upload commit | ERP event/input owner |

한 물리 PC가 `tool_pc`와 24시간 운영을 함께 하더라도 clone/identity를 분리한다.
Mac mini와 다른 always-on 후보 가운데 `reconciler_primary=true`는 정확히 하나다.
여러 node가 같은 JSONL, `latest.json`, logical-file record를 함께 수정하지 않는다.

## 3. 정체성 계층

```text
workspace_binding_id
  └─ logical_file_id
       ├─ revision_id A (content_id sha256:A)
       └─ revision_id B (content_id sha256:B, parent A)

node observation
  └─ observation_id -> logical/revision candidate + path/stat/clock evidence
```

| ID | 의미 | 금지 대체물 |
| --- | --- | --- |
| `workspace_binding_id` | 공유 논리 worksite의 portable identity | 절대경로, PC 이름 |
| `logical_file_id` | 이름·경로와 독립적인 파일 계보 | 파일명, inode, hash 단독 |
| `content_id` | `sha256:<full digest>` byte identity | mtime, sample hash |
| `revision_id` | 한 logical file의 parent를 가진 내용 변경 사건 | content hash 단독 |
| `observation_id` | 한 node가 한 scan에서 남긴 불변 관측 | mutable latest row |
| `erp_upload_event_id` | ERP commit occurrence | 일반 filesystem 관측 |

권장 결정식:

```text
logical_file_id = H(workspace_binding_id + first_accepted_create_evidence_id)
content_id      = "sha256:" + full_sha256
revision_id     = H(logical_file_id + sorted(parent_revision_ids) + content_id + size)
observation_id  = H(packet_id + normalized_relative_path + stat/hash evidence)
```

`A -> B -> A`에서 세 번째 A는 parent가 B이므로 첫 A와 다른 revision이다.

## 4. 경로와 이름

- 상대경로만 보존하며 `/` separator와 NFC로 정규화한다. exact collision key를
  다음 state load에서도 재검산할 수 있도록 node binding에는 bounded relative raw
  spelling도 함께 보존하되 absolute/traversal/secret-like 값은 fail closed한다.
- display path와 exact/NFC/casefold/trailing-dot-space portable collision key를 분리한다.
- path/filename/mtime/birthtime/inode/file-id는 identity가 아니라 evidence/hint다.
- NFC, casefold, Windows trailing dot/space 충돌은 overwrite하지 않고 conflict다.
- nested symlink/reparse/junction을 따라가지 않는다. 승인된 root binding 자체의
  junction만 realpath containment를 전후 재검사한 뒤 허용할 수 있다.
- `.git`, `_workmeta`, collector output, cache/temp/partial, Office lock, secret/env/token/
  credential/session 정책 일치 항목은 제외한다.
- repo root가 과대 binding되어도 `_workmeta`, `private-state`,
  `guild_hall/state/local/file_activity`는 policy-excluded count로만 집계하고 순회하지
  않는다. 이 경로 자체를 root로 지정하면 `collector_owned_root_withheld` gap으로
  실패하며 self-observation packet을 만들지 않는다.
- secret 제외 항목은 경로·hash를 쓰지 않고 aggregate count만 남긴다.

## 5. 시각 계약

| 필드 | 의미 |
| --- | --- |
| `observed_at` | collector가 파일 상태를 본 UTC 시각 |
| `ingested_at` | producer가 관측 packet을 포장한 UTC 시각 |
| `received_at` | operational-primary가 packet을 받은 UTC 시각 |
| `fs_modified_at` | filesystem이 보고한 낮은 신뢰의 수정 hint |
| `fs_birthtime_at` | OS-reported hint, 생성 시각으로 해석 금지 |
| `change_interval` | 이전 complete scan과 이번 관측 사이의 가능한 변경 구간 |

- clock skew `<=5m`: 정상.
- `>5m` and `<=15m`: `clock_suspect`, scan sequence와 primary `received_at` 우선.
- `>15m`: exact temporal ordering 차단, recorded/receipt fallback.
- filename timestamp나 filesystem birthtime으로 creation event를 만들지 않는다.
- 삭제의 첫 부재·마지막 부재·grace·`deleted_at`은 producer 시계가 아니라
  operational-primary `received_at`만 사용한다.

## 6. scan과 hash

scan은 stat-first다. 이전 stable stat tuple이 같을 때만 verified hash를 재사용한다.

이전 cache는 schema/field exact allowlist, raw+NFC relative path, collision keys,
path fingerprint, stat tuple, SHA-256 형식, verified UTC 시각, producer chain, entry
상한을 모두 통과해야 한다. unknown/raw/불일치 entry가 하나라도 있으면 cache 전체를
재사용하지 않는다. 다만 node-local cache를 수정할 수 있는 주체가 형식상 유효한 digest와
stat tuple을 함께 위조한 경우 byte를 다시 읽지 않고는 진실성을 증명할 수 없다. 따라서
daily full은 반드시 `--full`로 cache를 우회하며, verified-hash TTL과 cache provenance
통제는 live activation blocker다.

- 새 파일/변경 후보 `<=64 MiB`: 즉시 streaming SHA-256.
- 현재 MVP는 scan당 기본 512 MiB byte budget에서 큰 파일을 `hash_pending`으로
  남긴다. 2 GiB/10분 concurrency 1 queue는 live activation 전 후속 목표다.
- cloud placeholder를 강제로 hydrate하지 않는다.
- hash 전후 descriptor stat이 달라지면 결과를 폐기한다.
- budget/size/lock/permission 때문에 full hash가 없으면 `hash_pending|unreadable|
  not_allowed`; canonical revision을 만들지 않는다.
- weak/sample hash는 후보 정렬에만 쓸 수 있고 identity가 될 수 없다.

모든 scan packet은 `complete|partial|failed`, limits/errors, prior scan ID와 node
sequence를 기록한다. missed/partial/failed는 coverage gap이지 “변경 없음”이 아니다.

## 7. reconciliation 사건

| 사건 | 최소 근거 |
| --- | --- |
| `create` | 논리 match가 없는 verified first revision |
| `seen` | 같은 logical/revision/path 재관측 |
| `modify` | 같은 logical file, 다른 verified SHA-256 |
| `rename` | old absent + new present + 같은 revision, unique 1:1 movement |
| `copy` | old present + new present + 같은 content, 새 logical file |
| `touch` | 같은 logical/path/hash, metadata timestamp/stat만 변경 |
| `missing_candidate` | authority complete scan의 첫 부재 |
| `delete` | 반복 complete absence + grace + fresh 반증 없음 |
| `conflict` | divergent heads, expected-parent mismatch, path collision, ambiguous movement |

삭제 기본값은 `work_pc` authority의 두 번째 complete scan이 operational-primary가
첫 부재 packet을 받은 시각보다 최소 24시간 뒤인 경우다. partial/failed/
scan-limited/locked packet은 삭제 counter를 올리지 않는다. 다른 node 역할은
positive observation만 제공하고 부재·삭제를 진행하지 않는다.

동시 수정은 last-write-wins가 아니다. 두 node가 같은 parent A에서 B와 C를 만들면
두 revision head를 모두 보존한다. 둘을 명시적으로 supersede하는 merge revision만
conflict를 닫는다. 아직 A를 보는 fresh node는 sync lag evidence로 남기되 새 head로
자동 확정하지 않는다.

duplicate packet은 no-op이다. 같은 scan ID에 다른 packet digest가 오면 quarantine한다.

## 8. 주기

아래 값은 scheduler에 연결되지 않은 candidate cadence다. live activation 시 동일
시각 집중을 피하도록 ±20% jitter를 추가하는 것이 목표다.

| 역할 | quick | full/trigger | freshness |
| --- | --- | --- | --- |
| `work_pc` | mounted/active 5m | startup, resume, remount, daily full | fresh <=10m, stale >30m |
| `tool_pc` | active tool work 10m | export, run close, daily full | fresh <=20m, stale >60m |
| `portable_dev_pc` | project active 15m, battery-aware | startup, resume, remount, daily full | fresh <=30m, stale >90m |
| `always_on_node` | valid binding+primary 5m | startup, daily full | fresh <=10m, stale >30m |
| primary inbox | 1m | packet receipt | receipt SLA, scan과 별개 |
| ERP | polling 없음 | upload commit 직후 | exact commit event |

모든 node에서 `<=2x cadence`는 fresh, `>2x and <=6x`는 late, `>6x`는 stale다.

## 9. 저장 경계

실제 파일:

```text
_workspaces/<project_code>/**
owner-approved shared worksite
```

현재 MVP collector-local cache/lock:

```text
guild_hall/state/local/file_activity/<project>/<binding>/<node>/
  scan_cache.json
  scan.lock
  reconcile.lock
```

현재 MVP durable node outbox와 derived state(recent receipt/event window만 bounded,
logical/revision graph는 아직 선형 증가):

```text
_workmeta/<project_code>/reports/file_activity/
  observations/<node>/<YYYY>/<MM>/<packet>.json
  revision_state.json
```

아래 장기 partition은 live activation 전 목표이며 아직 writer가 없다.

```text
_workmeta/<project_code>/reports/file_activity/
  upload_events/<YYYY-MM>/<event_id>.json
  events/<YYYY-MM>/<reconcile_id>.json
  logical_files/<logical_file_id>.json
  revisions/<logical_file_id>/<revision_id>.json
  conflicts/<conflict_id>.json
  receipts/<packet_id>.json
  projections/life_tree_events.json
```

packet/state에는 content, 절대경로, hostname, username, secret value를 넣지 않는다.
물리 PC 명칭과 root mapping은 local identity/binding owner에만 둔다.

CLI는 parse 전 파일 크기와 publish 전 직렬화 크기를 모두 제한한다. cache/packet은
각 64 MiB, revision state는 256 MiB를 넘으면 fail closed한다. previous state는
top-level과 모든 nested entry를 allowlist로 재구성하고 unknown payload를 승계하지
않는다. summary/receipt/gap/collision 상한 외에 방어적 load ceiling으로 node cursor
10,000, logical file 100,000, revision 500,000, node binding 500,000, cache entry
100,000을 적용하며 current reduce 뒤에도 다시 검사한다. lineage graph를 잘라내지는
않으므로 ceiling 도달은 partition/checkpoint가 필요한 activation blocker다.

## 10. ERP와 생명수

현재 dev-ERP projection에서 ERP upload commit은 일반 scanner를 기다리지 않는다.
`event_log.kind=input_upload`의
`to_val`을 `deliverable_input.id`에 exact join하면 actor/project/commit time/SHA-256/
별도 create가 아니라 `seen` evidence로 합류해야 하지만, scanner packet→생명수
adapter와 ERP/scanner dedupe는 아직 구현하지 않았다.

다만 ERP upload만으로 direct Office save, tool export, rename, copy, delete를 볼 수 없으므로
dev-ERP `file_activity` lane은 일반 collector 활성 전과 coverage gap이 있을 때 항상
`partial`이다. 생명수 API request가 직접 filesystem을 scan해서는 안 된다. reconciler가
미리 쓴 metadata-only projection만 읽는다.

## 11. project folder indexing 경계

`.workflow/project_folder_indexing_v0`는 search readiness, extraction, catalog,
incremental/full re-index gate를 계속 소유한다. 다음은 이 계약의 소유다.

- logical file/revision DAG
- multi-node observation, clock, coverage
- rename/copy/touch/delete/conflict
- scanner와 sole reconciler authority

향후 indexing workflow는 current snapshot와 changed-event refs만 소비해 affected file을
재색인한다. file activity가 search index나 extraction status의 source truth가 되지는 않는다.

## 12. 활성화 gate

합성 fixture 기반 helper는 owner 결정 없이 구현할 수 있다. live activation에는 다음이
모두 필요하다.

1. exact reconciler-primary identity
2. per-project workspace binding과 hash/path display permission
3. 인증된 private packet transport
4. 삭제 authority subtree 결정
5. metadata lineage만 필요한지 byte recovery/version backup도 필요한지 owner 결정
6. monthly receipt/event partition, logical/revision graph compaction/checkpoint,
   verified hash cache TTL/provenance와 위 방어적 byte/entry ceiling의 운영 sizing
7. scanner packet→생명수 projection adapter와 ERP upload dedupe validator

이 gate 전에는 scheduler, watcher, network transfer, canonical private writer를 켜지 않는다.
