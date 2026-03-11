# Soulforge 개발 이력 — 3축 구조, 메타 계약, UI 상태판을 v1 closeout까지 닫은 변경 기록

## 이 문서를 어떻게 읽으면 되는가

이 문서는 단순 커밋 나열이 아니라, **이번 개발에서 Soulforge 전체 구조의 어느 부분을 왜 바꾸었는지**를 가장 먼저 이해하도록 만든 개발 이력 문서다.

이력의 핵심은 아래 한 문장으로 요약된다.

> Soulforge를 **`.agent / .agent_class / _workspaces` 3축 구조** 위에서,
> **메타 계약 → resolve/validate → derived state → read-only viewer → baseline 3종 → v1 closeout**까지 닫는 방향으로 확장했다.

- 기준 범위: `6b6ee87` 이후 `6b4de5d` 까지의 연속 작업
- 결과 상태: `v1 closeout completed`
- 성격: 기능 추가 이력 + 구조 개편 이력 + 검증 기준선 확립 이력

---

## 이번 개발에서 전체 구조의 어디를 바꿨는가

이번 대화에서 바뀐 축은 크게 5개다.

| 변경 축 | 바꾼 대상 | 왜 바꿨는가 | 최종 결과 |
| --- | --- | --- | --- |
| 1. 구조/owner 축 | root docs, body docs, class docs, project docs | 문서가 어디의 정본인지 헷갈리지 않게 하려고 | root / body / class / project owner 경계 고정 |
| 2. 메타/계약 축 | `body.yaml`, `body_state.yaml`, `module reference`, `.project_agent` 규칙 | UI와 도구가 임의 추측이 아니라 계약 기반으로 동작하게 하려고 | body/class/workspace 메타 계약 완성 |
| 3. 로컬 도구 축 | `ui_sync.py` | 정본을 스캔하고 resolve/validate/derive 할 엔진이 필요해서 | `sync-body-state`, `resolve-loadout`, `resolve-workspaces`, `validate`, `derive-ui-state` 완성 |
| 4. UI 축 | `ui_viewer.py` | derived state를 실제 화면으로 검증하려고 | 4탭 read-only viewer + diagnostics 패널 완성 |
| 5. 기준선/회귀 축 | happy-path / invalid / unbound sample | 상태판이 실제 입력에서도 맞는지 검증하려고 | baseline 3종으로 `bound / invalid / unbound` 실입력 검증 완료 |

---

## 이번 개발에서 무엇을 어떻게 바꿨는가

이번 변경은 아래 순서로 진행됐다.

1. **문서 정합화**
   - tools leaf 역할, owner 문서 경계, root 문서 세트를 먼저 정리했다.

2. **메타 계약 도입**
   - `.agent`에 `body.yaml`, `body_state.yaml`을 도입했다.
   - `.agent_class`는 `module.yaml` + `loadout.yaml` 체계를 강화했다.
   - `_workspaces/**/.project_agent/*.yaml` resolve 규칙을 문서화했다.

3. **local CLI 구현**
   - `ui_sync.py`로 `Scan -> Resolve -> Validate -> Derive` 흐름을 실제 구현했다.

4. **read-only UI 구현**
   - `ui_viewer.py`를 만들어 `derive-ui-state --json`만 소비하는 renderer를 붙였다.

5. **실제 baseline 입력 추가**
   - happy-path sample 1세트
   - invalid sample 1세트
   - unbound sample 1세트
   를 순차적으로 넣었다.

6. **v1 마감**
   - `V1_CLOSEOUT_CHECKLIST.md`
   - `KNOWN_LIMITATIONS.md`
   를 추가해 지금 상태를 운영 가능한 기준선으로 닫았다.

---

## 왜 이렇게 바꿨는가

이 개발의 목적은 “예쁜 UI 하나 만들기”가 아니었다.

핵심 목적은 아래였다.

- Soulforge 세계관 구조를 실제 파일 계약으로 고정
- UI가 정본을 직접 읽지 않고 파생 상태만 읽도록 분리
- 정상/오류/미연결 상태를 실입력으로 검증
- 나중에 다시 봐도 “무엇을 왜 이렇게 만들었는지” 추적 가능한 상태 만들기

그래서 이번 이력은 다음 질문에 답하도록 정리되어 있다.

- 어디를 바꿨는가?
- 왜 바꿨는가?
- 무엇이 새로 생겼는가?
- 현재 어디까지 닫혔는가?
- 다음에는 무엇을 선택적으로 할 수 있는가?

---

## 최종 결과를 한 줄로 요약하면

이번 대화에서 Soulforge는
**문서 정합화 → 메타 계약 → local CLI resolve/validate → derived state → read-only viewer → baseline 3종 → v1 closeout**
순서로 확장되었고, 현재는 **v1 최소 완결 상태**다.

---

## 1. 단계별 개발 이력

### 1-1. 출발점 정리 — tools leaf 역할 문서 정합화
- 커밋: `6b6ee87`
- 목적: `.agent_class/tools/*` 하위 leaf 폴더의 책임 공백을 메우고 root/class 문서 정합성을 맞춤
- 핵심 변경:
  - `.agent_class/docs/architecture/AGENT_CLASS_MODEL.md`에 `tools/ 하위 역할` 섹션 추가
  - `adapters / connectors / local_cli / mcp` 책임 정의 보강
  - `docs/architecture/TARGET_TREE.md`에 leaf 수준 책임 요약 추가
- 의미:
  - tools 하위 4폴더가 더 이상 “트리에만 있고 의미는 비어 있는 상태”가 아니게 됨
  - 이후 local CLI, viewer, sample tool이 들어올 구조적 근거를 마련함

### 1-2. body 메타와 UI 동기화 계약 도입
- 커밋: `a56d3c3`
- 목적: `.agent`에도 class와 유사한 메타 체계를 도입하고, UI가 어떤 정본에서 파생되는지 고정
- 핵심 변경:
  - `.agent/body.yaml` 신설
  - `.agent/body_state.yaml` 신설
  - `.agent/docs/architecture/BODY_METADATA_CONTRACT.md` 신설
  - `docs/architecture/UI_SOURCE_MAP.md`, `UI_SYNC_CONTRACT.md` 신설
  - root/owner 문서와 README 대량 최신화
- 의미:
  - body도 `정적 정의(body.yaml)`와 `파생 상태(body_state.yaml)`로 분리
  - UI는 정본이 아니라 파생물이라는 원칙을 문서 계약으로 고정

### 1-3. body 상태 동기화 도구와 기본 validate 기반 추가
- 커밋: `2496e0a`
- 목적: body 상태를 재생성하고 최소 구조 검증을 수행하는 local CLI 기반 마련
- 핵심 변경:
  - `.agent_class/tools/local_cli/ui_sync/ui_sync.py` 추가
  - `sync-body-state`, `validate` 명령 구현
  - tools/local_cli/ui_sync README 체계 구축
- 의미:
  - `body.yaml`과 실제 `.agent/` 구조를 스캔해 `body_state.yaml`을 재생성 가능하게 만듦
  - 이후 class/workspace 검증 확장의 기반 CLI를 확보

### 1-4. 모듈 참조 계약과 loadout resolve 도입
- 커밋: `3099b82`
- 목적: `.agent_class/loadout.yaml`의 `equipped.*` 의미를 `module id` 기준으로 고정하고 installed module resolve를 구현
- 핵심 변경:
  - `.agent_class/docs/architecture/MODULE_REFERENCE_CONTRACT.md` 신설
  - `CLASS_METADATA_CONTRACT.md`, `INSTALLATION_AND_LOADOUT_CONCEPT.md` 갱신
  - `ui_sync.py`에 `resolve-loadout` 추가
  - installed `module.yaml` catalog 기반 resolve/validate 구현
- 의미:
  - path 기반이 아니라 `module id` 기반으로 class 장착 개념을 잠금
  - skills/tools/workflows/knowledge를 “설치된 manifest catalog + active loadout” 구조로 닫음

### 1-5. workspace resolve 계약과 project 상태 분류 도입
- 커밋: `3766b26`
- 목적: `_workspaces/**/.project_agent/*.yaml` resolve 규칙과 `bound / unbound / invalid` 상태 분류를 실제 구현
- 핵심 변경:
  - `docs/architecture/PROJECT_AGENT_RESOLVE_CONTRACT.md` 신설
  - `PROJECT_AGENT_MINIMUM_SCHEMA.md`, `WORKSPACE_PROJECT_MODEL.md` 갱신
  - `ui_sync.py`에 `resolve-workspaces` 추가
  - `.project_agent` 4파일(`contract`, `capsule_bindings`, `workflow_bindings`, `local_state_map`) 검증 도입
- 의미:
  - 워크스페이스 탭이 파일 목록이 아니라 “프로젝트 상태판”으로 전환될 수 있는 근거 형성
  - `unbound`는 허용 상태, `invalid`는 FAIL이라는 기준 확립

### 1-6. UI derived state 계약과 generator 도입
- 커밋: `a34761b`
- 목적: renderer가 정본을 직접 읽지 않고, 안정된 파생 상태 JSON만 소비하도록 중간 상태를 고정
- 핵심 변경:
  - `docs/architecture/UI_DERIVED_STATE_CONTRACT.md` 신설
  - `ui_sync.py`에 `derive-ui-state` 추가
  - top-level 6키 구조 고정
    - `ui`
    - `overview`
    - `body`
    - `class`
    - `workspaces`
    - `diagnostics`
- 의미:
  - Render 전 단계의 공식 산출물이 생김
  - UI와 계약/검증 로직이 느슨하게 분리됨

### 1-7. read-only UI prototype 도입
- 커밋: `ae7b130`
- 목적: `derive-ui-state --json`을 읽는 4탭 read-only viewer를 도입
- 핵심 변경:
  - `.agent_class/tools/local_cli/ui_viewer/ui_viewer.py` 신설
  - 로컬 HTTP viewer + `--once` HTML snapshot 생성 지원
  - 4탭(`Overview / Body / Class / Workspaces`) + diagnostics 렌더
- 의미:
  - 구조/계약/파생 상태를 실제 화면으로 확인 가능
  - viewer는 derived state 소비자 역할에만 머무름

### 1-8. 첫 happy-path reference sample baseline 도입
- 커밋: `3066ad4`
- 목적: empty-state 중심이던 시스템에 첫 실제 정상 입력 baseline 추가
- 핵심 변경:
  - sample module 4종 추가
    - `sample.skill.echo`
    - `sample.tool.local_cli.status`
    - `sample.knowledge.reference`
    - `sample.workflow.briefing`
  - `_workspaces/company/sample_reference_project/` 추가
  - `.agent_class/loadout.yaml`에 sample equipped 4종 반영
  - sample project 검증 중 드러난 `ui_sync.py` project state 판정 버그 최소 수정
- 의미:
  - `installed / equipped / workflow_cards / bound workspace`가 실제 non-empty 입력으로 처음 검증됨

### 1-9. 첫 invalid reference sample baseline 도입
- 커밋: `0620d6a`
- 목적: 오류 입력과 partial render 경로를 실제 데이터로 검증
- 핵심 변경:
  - `_workspaces/company/sample_invalid_project/` 추가
  - invalid 원인은 하나만 사용
    - `workflow_bindings.yaml.entrypoint mismatch`
  - happy-path sample은 유지
  - partial/error derive + viewer 렌더 경로 검증
- 의미:
  - `invalid`가 실제 diagnostics error와 partial render로 이어지는지 기준선 확립

### 1-10. 첫 unbound reference sample baseline 도입
- 커밋: `20528bf`
- 목적: `.project_agent`가 없는 허용 상태 `unbound`를 실제 입력으로 닫음
- 핵심 변경:
  - `_workspaces/personal/sample_unbound_project/` 추가
  - `.project_agent/`를 의도적으로 만들지 않음
  - company는 `bound/invalid`, personal은 `unbound` baseline 역할로 정리
- 의미:
  - workspace 상태축 `bound / invalid / unbound`가 모두 실데이터로 닫힘
  - 상태판 v1 최소 완결 조건 충족

### 1-11. read-only renderer 표현 개선과 게임풍 UI 다듬기
- 커밋: `9c03165`
- 목적: 구조 계약을 바꾸지 않고 viewer 표현을 개선
- 핵심 변경:
  - parchment / brass / slate / teal 기반 절제된 fantasy-game 톤 반영
  - 긴 path/manifest/diagnostics/workflow dependency overflow-safe 처리
  - 카드 위계, 뱃지 톤, glyph/icon, workflow card, workspace card 개선
  - README에 “표현 계층만 조정”했다는 점 반영
- 의미:
  - 세계관 감성을 살리되 과하게 화려하지 않은 viewer 확보
  - Render 품질 개선, 계약 변화 없음

### 1-12. v1 종료 기준과 known limitations 정리
- 커밋: `6b4de5d`
- 목적: 현재 상태를 “v1 closeout completed”로 마감하고, 종료 기준과 남은 제한을 문서화
- 핵심 변경:
  - `docs/architecture/V1_CLOSEOUT_CHECKLIST.md` 신설
  - `docs/architecture/KNOWN_LIMITATIONS.md` 신설
  - root/README/owner 문서에 v1 closeout 상태 반영
  - `baseline 3종(bound / invalid / unbound)`을 공식 기준선으로 고정
- 의미:
  - 더 이상 “구축 중인 임시 구조”가 아니라 “운영 가능한 v1 기준선”으로 정리됨

---

## 2. 이번 대화에서 실제로 개발한 핵심 축

### A. 문서/소유권 축
- root / body / class / project owner 경계 명확화
- root 문서 세트 정리
- 계획 문서와 실행 이력 문서 체계화

### B. 메타/계약 축
- body 메타 2파일
- class module reference contract
- workspace project resolve contract
- UI source/sync/derived state contract
- v1 closeout / known limitations 문서

### C. 로컬 도구 축
- `ui_sync.py`
  - `sync-body-state`
  - `resolve-loadout`
  - `resolve-workspaces`
  - `validate`
  - `derive-ui-state`
- `ui_viewer.py`
  - 로컬 read-only renderer
  - `--once` snapshot 생성

### D. reference sample 축
- happy-path baseline: `sample_reference_project`
- invalid baseline: `sample_invalid_project`
- unbound baseline: `sample_unbound_project`
- sample module 4종

### E. UI 축
- 4탭 구조
  - `종합(Overview)`
  - `본체(.agent)`
  - `직업(.agent_class)`
  - `워크스페이스(_workspaces)`
- diagnostics panel
- partial render 유지
- fantasy/game flavored professional viewer 톤

---

## 3. 최종 상태 요약

현재 Soulforge는 아래 범위까지 완료된 상태다.

- 3축 구조: `.agent / .agent_class / _workspaces`
- body/class/workspace resolve/validate
- derived state generator
- read-only viewer
- baseline 3종 실입력 검증
- v1 종료 기준 및 known limitations 문서화

즉 현재 상태는 아래 문장으로 요약할 수 있다.

> Soulforge는 **구조 + 상태판 + read-only viewer + baseline 3종** 기준으로 v1 최소 완결 상태에 도달했다.

---

## 4. 현재 기준선(baseline) 상태 세트

| project | workspace | 기대 상태 | 역할 |
| --- | --- | --- | --- |
| `sample_reference_project` | `company` | `bound` | happy-path baseline |
| `sample_invalid_project` | `company` | `invalid` | diagnostics / partial render baseline |
| `sample_unbound_project` | `personal` | `unbound` | 허용 상태 분류 baseline |

---

## 5. 현재 known behavior / known limitations 핵심 메모

### known behavior
- 현재 저장소에는 intentional invalid baseline 이 포함되어 있으므로
  - `resolve-workspaces`
  - `validate`
  - `derive-ui-state --json`
  는 non-zero 를 반환할 수 있다.
- 이건 현재 구조상 버그가 아니라 baseline 설계에 따른 정상 동작일 수 있다.
- viewer 는 non-zero 여도 JSON payload 가 남아 있으면 partial render 를 유지한다.

### known limitations
- `workspace_default_loadout_scope` 경고는 multi-profile 정식 설계 전까지 남는다.
- viewer 는 still read-only prototype 이다.
- diagnostics filtering / deep-link / richer detail panel 이 없다.
- invalid project count(`workflow_binding_count`)는 raw count vs resolved count 해석 여지가 있다.
- very large catalog/workspaces 에 대한 collapse/expand/filtering 이 아직 없다.

---

## 6. 커밋 타임라인 요약

| 순서 | 커밋 | 메시지 | 의미 |
| --- | --- | --- | --- |
| 0 | `6b6ee87` | tools leaf 역할 문서 정합화 | tools leaf 역할 정리 |
| 1 | `a56d3c3` | body 메타 파일과 UI 동기화 계약 도입 | body 메타 + UI source/sync 계약 |
| 2 | `2496e0a` | body 상태 동기화 도구와 검증 기반 추가 | `sync-body-state`, 기본 validate |
| 3 | `3099b82` | 모듈 참조 계약과 loadout resolve 기반 도입 | module manifest/id resolve |
| 4 | `3766b26` | workspace resolve 계약과 project 상태 분류 기반 도입 | `.project_agent` resolve + 상태 분류 |
| 5 | `a34761b` | UI 파생 상태 계약과 derive generator 도입 | `derive-ui-state` |
| 6 | `ae7b130` | read-only UI 프로토타입 도입 | `ui_viewer.py` |
| 7 | `3066ad4` | 첫 reference sample 세트와 happy-path 회귀 입력 도입 | happy-path baseline |
| 8 | `0620d6a` | 첫 invalid reference sample 세트와 diagnostics 회귀 입력 도입 | invalid baseline |
| 9 | `20528bf` | 첫 unbound reference sample 세트와 상태판 회귀 입력 도입 | unbound baseline |
| 10 | `9c03165` | read-only renderer 표현 개선과 게임풍 UI 다듬기 | viewer polish |
| 11 | `6b4de5d` | v1 종료 기준과 known limitations 정리 | v1 closeout |

---

## 7. 후속 선택 과제 (v2 또는 optional)

필수는 아니지만, 다음 선택 과제로 자연스러운 항목은 아래다.

1. `contract.default_loadout` 와 multi-profile 관계 정식 설계
2. viewer diagnostics filtering / deep-link / richer detail panel 추가
3. invalid project count 와 diagnostics 표현의 의미 분리
4. very large catalog/workspace 목록용 collapse / expand / filtering 전략
5. CI / snapshot / pre-commit 같은 운영 자동화 보강

---

## 8. 한 줄 결론

이번 대화에서 Soulforge는
**문서 정합화 → 메타 계약 → resolve/validate → derived state → read-only viewer → baseline 3종 → v1 closeout**
순서로 확장되었고, 현재는 **v1 최소 완결 상태**다.
