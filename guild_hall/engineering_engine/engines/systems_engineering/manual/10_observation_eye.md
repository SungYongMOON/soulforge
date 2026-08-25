# 10. 관측 공급자 — 엔진의 "눈"

`guild_hall/engineering_engine/observation/` 세 모듈과 CLI 하나가 하는 일을 처음 보는 사람이
읽고 고칠 수 있게 적는다. 코드가 정본이고 이 장은 그 지도다.

## 10.1 목적 — 엔진 앞에 문서를 놓아주는 손

엔진은 "이 단계에 무엇이 있어야 하는가"(기대)와 "실제로 무엇이 있는가"(관측)를 비교한다(01장).
기대는 규칙에서 컴파일된다. **관측은 누가 주는가** — 그 답이 이 부품이다.

관측이 엔진에 들어오는 길은 둘이다.

| 길 | 누가 | 언제 | 성격 |
| --- | --- | --- | --- |
| **정식 통로** | 작업자가 산출물을 업무폴더 `03_Out`에 넣는다 | 일상 | 사람이 스스로 등록. 이것이 원래 모양이다 |
| **훑기(이 부품)** | 과제 폴더를 걸어 파일 목록을 만들고 후보를 제안 | 첫 적재 + 상시 감시 | 기계가 후보만 만들고 확정은 사람 |

훑기는 정식 통로를 대체하지 않는다. 과제를 엔진에 처음 태울 때 이미 쌓인 수천 개 파일을
한 번에 올려주고, 그 뒤에는 "제대로 넣고 있나"를 계속 비춰 보는 역할이다.
Owner 방침(2026-08-18): 팀이 제대로 등록하기 시작한 뒤에도 이 점검은 **상시 가드로 남긴다**.

## 10.2 입력 — 무엇을 읽고 무엇을 읽지 않나

읽는 것은 **파일의 겉모습**뿐이다.

- 경로(어느 게이트 폴더 / 어느 업무폴더 / `03_Out`인가), 파일 이름, 확장자, 크기, 수정시각, sha256
- 규칙 쪽: 사업유형 compiled 스펙(`gates[].tasks[]`), 과제 overlay의 별칭·prime 항목,
  산출물 표준어(`artifact_vocabulary.mjs`), 과제가 등록한 이름 패턴
- 선택: 문서 제목 한 줄(`title_hint`) — 지금 CLI는 채우지 않는다

**읽지 않는 것: 파일 내용.** 문서를 열지 않으므로 "안에 무엇이 쓰여 있나"는 이 층의 답이 아니다.
그것은 문서 내용 검사기(D1, 아직 없음)의 몫이다(10.9).

## 10.3 규칙 3+1 — 어떤 파일이 어떤 산출물인가

`artifact_observation_candidates.mjs`의 `buildArtifactObservationCandidates(request)`가
파일 하나마다 아래 순서로 판단한다. 순수 함수이며 파일·시계·난수·네트워크를 쓰지 않는다.

### 규칙 1. 업무폴더 번호 → 규칙표 (가장 강함)

경로가 `120_CDR/125_HW설계기술서(HDD)_F/...`이면 앞 숫자 `125`가 스펙의 task id다.
그 task가 산출물 종류 하나에만 대응하면 그 파일은 그 산출물 후보다(신뢰도 `high`).
게이트 번호 → 엔진 단계 코드 대응표는 컴파일러의 것을 그대로 복제해 두고 시험이 두 쪽을 맞춘다.

번호가 규칙표에 없으면(예: 발주처 전용 업무) 규칙 2로 넘어간다.

### 규칙 2. 이름 단서 — 파일 이름·제목이 산출물을 말하는가

아래 다섯 가지가 단서다. 모두 **토큰 경계**로 찾으므로 `bom`이 `bomb`을 찾지 않는다.

| 단서 | 어디서 | 예 |
| --- | --- | --- |
| `filename_term` | 스펙 행의 `term`과 업무 이름 | `HDD`, `Q-BOM`, `상세설계도면` |
| `type_token` | 산출물 표준어 토큰 그 자체 | 파일명 `K-VDS_BOM_260818.xlsx` → `bom` |
| `label_ko` / `label_en` | 표준어 표시명 | `부품목록`, `Interface Control Document` |
| `alias` | 과제 overlay의 별칭·발주처 항목 이름 | `cdr_hdd_final`, `계약자료검토결과(Q1)` |
| `alias_pattern` | 과제가 등록한 이름 **모양**(정규식) | `^F245-` → 도면번호로만 된 파일명 |

`alias_pattern`은 단어로는 절대 잡히지 않는 이름을 위해 있다. 도면이 `F245-013001001002(...).pdf`로
파일링되면 그 이름에는 "도면"도 `drawings`도 없다. Owner가 그 모양을 한 번 등록하면 그때부터
그 파일은 스스로 산출물을 말하는 파일이 된다. 패턴은 과제 자료면에 두고 public 코드에는 넣지 않는다.

단서가 **하나도 없으면** `unmatched`, 서로 다른 산출물을 가리키는 단서가 **둘 이상이면** `ambiguous`다.
둘 다 추정으로 메우지 않는다. 게이트 폴더가 없으면 단서가 가리키는 산출물이 규칙상 한 단계에만
있을 때에만 단계를 정하고, 아니면 `stage_not_resolvable_from_path_or_rules`로 남긴다.

D46 **활동·결정 노드는 후보가 되지 않는다.** 활동 폴더에 파일이 있다는 것은 폴더가 비지 않았다는
뜻이지 그 일이 수행됐다는 증거가 아니다.

### 규칙 3. 성숙도 단어 — 초안인가 최종인가

파일 이름을 먼저 보고, 없으면 업무폴더 접미사를 본다(파일이 폴더보다 우선).

| 읽음 | 단어 |
| --- | --- |
| `final` | `최종`, `final`, 접미사 `_F`, `승인본`·`확정본`·`배포본` |
| `baseline` | `승인`, `기준선`, `baseline`, `approved` |
| `updated` | `개정`, `업데이트`, `update`, `rev`, `rev3`, 접미사 `_U` |
| `preliminary` | `초안`, `draft`, `중간수정본`·`수정본`·`검토본`·`중간본`·`임시`·`wip`, `v0.x`, 접미사 `_D` |

`승인본`이 `final`이고 `승인`이 `baseline`인 이유: `-본`은 발행된 사본을 가리키고 `승인`만으로는
승인 행위를 가리킨다. 아무 말도 없으면 `null`이며 **최종으로 가정하지 않는다**.

### +1. 자동 확정 3조건 (셋을 모두 만족할 때만)

1. 파일이 업무폴더의 `03_Out` 아래에 있고,
2. 그 업무가 산출물 종류 하나에만 대응하고,
3. **파일 이름이나 제목이 그 산출물을 가리키는 단서를 가진다**(규칙 2의 다섯 중 하나).

3번은 실제 과제에서 나왔다. 회의록 업무폴더의 `03_Out`에 그 회의에서 제출한 도면·자재명세서가
들어 있었고, 폴더만 보면 전부 "회의록"으로 확정된다. 폴더는 무엇이 들어가야 하는지에 대해서는
맞고 무엇이 실제로 들어갔는지에 대해서는 틀릴 수 있다. 보류된 건수는 영수증의
`auto_confirm_withheld_no_own_cue`에 남는다.

## 10.4 확인표와 폴더 확정 — 확정은 사람이 한다(D37)

`observation_confirmation_sheet.mjs`가 후보를 사람이 읽는 표로 바꾸고, 사람의 답을 다시 받는다.

- `buildObservationConfirmationSheet({candidates, inventory?, known_at?})`
  → 한글 마크다운 + 같은 줄의 JSON 시트(`decision: null`)
- 표는 **두 부분**이다.
  1. **업무폴더 단위 확인** — 업무폴더가 산출물 하나에 대응하고 후보가 있으면 한 줄
     (단계 / 업무폴더 / 산출물 / 후보 수 / `03_Out` 파일 수 / 확인). 도면 90여 개가 든 폴더를
     한 번에 넘기라고 먼저 놓는다.
  2. **파일 단위 확인** — 단계별로 묶은 후보 표(확인 / 파일 / 산출물 종류 / 단계 / 성숙도 / 근거 단서 / 신뢰도)
- `applyConfirmationSheet(candidates, decisions)`가 답을 적용한다.

| 결정 | 뜻 |
| --- | --- |
| `confirm` / `reject` / `reassign`(+`artifact_type_id`) | 파일 하나 |
| `confirm_folder` / `reject_folder`(+선택 `artifact_type_id`) | 그 업무폴더 **`03_Out` 아래 후보 전부**. `01_Work`·`02_Input`은 산출물 주장이 아니므로 건드리지 않는다 |

우선순위: **파일 결정 > 폴더 결정 > 자동 확정**. 사람이 폴더를 판단한 것은 규칙이 파일 하나를
판단한 것보다 강한 진술이므로 그 줄을 가져간다. 아무 결정도 없는 줄은 확정도 반려도 아닌
**보류**로 남는다 — "안 봤다"와 "보고 아니라고 했다"는 다른 사실이다.

## 10.5 관측 생성 — 생성기가 받는 모양으로

`artifact_observations_from_confirmed.mjs`가 확정된 줄 + sha256을 `pilot_packet_generator`가
그대로 받는 `artifact_observations[]`로 바꾼다(05장 §5.2의 계약).

- **(단계, 산출물 종류) 쌍마다 관측 하나.** 생성기는 한 requirement에 관측 둘을 거부한다.
- 여러 파일이 한 쌍에 걸리면 **성숙도 → 수정시각 → digest → 경로** 순으로 이긴 파일을 쓰고,
  나머지는 영수증 `superseded`에 남긴다(버리지 않는다).
- 식별자는 난수가 아니라 digest에서 발행한다. 같은 확정 집합은 같은 관측 바이트를 낸다.
- `presence_state`는 언제나 `present`뿐이다. 걷지 못한 파일은 없는 것이 아니므로 이 층은
  `absence_confirmed`를 만들지 않는다.
- 관측에는 **파일 경로·이름이 들어가지 않는다**(해시와 발행된 id만).

## 10.6 청소 알림 6종 — 판단과 분리

`observation_housekeeping.mjs`는 걷기가 발견한 **폴더 정리거리**만 따로 모은다.
관측이 아니고 판단도 아니다. 파일 내용을 열지 않는다.

| 종류 | 뜻 |
| --- | --- |
| `duplicate_output` | 한 `03_Out`에 같은 산출물 파일이 여럿(이긴 파일과 밀려난 파일을 적는다) |
| `wrong_material` | `03_Out`에 그 업무의 산출물 이름을 갖지 않은 파일(엉뚱한 자료 가능성) |
| `transport_package` | `03_Out`에 남은 전송용 압축·분할본(`.zip`·`.7z`·`01of03`) |
| `draft_wording` | `03_Out`에 남은 중간본·검토본 표현 |
| `duplicate_task_folder` | 한 단계에서 업무폴더 둘이 한 산출물을 담음 |
| `out_folder_empty` | 업무폴더는 쓰이는데 `03_Out` 아래에 파일이 없음 |

`out_folder_empty`는 **결손 판정이 아니다.** 산출물이 메일·공유폴더에 있거나 아직 만들 때가
아닐 수 있다. 그리고 "무엇을 위한 폴더인가"는 업무폴더 번호로 해석된 후보만으로 정한다 —
INBOX에 놓인 설계기술서 한 부가 INBOX를 설계기술서 폴더로 만들지 않는다.

## 10.7 출력 7종과 저장 위치

호출자는 `tools/artifact_observation_inventory_runner.mjs` 하나뿐이고, 파일과 시계를 쓰는
자리도 여기뿐이다. `--out` 아래에만 쓰고 이미 있는 실행 산출물은 **덮어쓰지 않고 거부**한다.

```text
node guild_hall/engineering_engine/tools/artifact_observation_inventory_runner.mjs \
  --project-root <abs> --out <abs dir> --compiled-variant <abs json> \
  [--overlay <abs json>] [--alias-patterns <abs json>] \
  [--include-globs "<glob>"] [--exclude-globs "<glob>"] [--known-at <instant>] [--no-auto-confirm]
```

| 파일 | 내용 |
| --- | --- |
| `inventory.json` | 걸은 파일 목록(경로·크기·해시·수정시각) |
| `candidates.json` | 후보 + `unmatched` + `ambiguous` + 영수증 |
| `confirmation_sheet.md` | 사람이 보는 확인표(폴더 단위 → 파일 단위) |
| `confirmation_sheet.json` | 같은 줄 + `decision: null`(답을 적어 되돌려준다) |
| `artifact_observations_auto.json` | 자동 확정분으로 만든 생성기 입력 |
| `housekeeping_report.md` | 폴더 청소 알림 |
| `receipt.json` | 입력·수치·digest·effect 0 |

저장 위치: 실행 산출물은 `_workspaces/<project>/…/06_validation/<run>/`,
`_workmeta/<project>/runs/<run>/`에는 **수치·digest·포인터만**(문서 파일명·사람 이름 금지).
과제 이름 패턴도 과제 자료면(`…/06_validation/observation_alias_patterns_v0.json`)에 둔다.

건너뛰는 것: `.git`·`node_modules`·`00_Temp`·`__pycache__`·`_trash*`·심볼릭 링크·크기 상한 초과,
자기 `--out` 폴더, 그리고 `--exclude-globs`가 가리키는 것(이전 실행 산출 폴더를 빼는 데 쓴다).

## 10.8 KVDS 실측 (같은 과제, 규칙이 자라는 동안)

| 실행 | 규칙 상태 | 걸음 | 후보 | 자동 확정 | 보류(이름 단서 없음) | 관측 | 청소 항목 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| run 01 | 자동 확정 2조건 | 8,480 | 2,447 | 197 | — | 7 | — |
| run 04 | 3조건(이름 단서 필수) | 8,480 | 2,447 | 4 | 193 | 3 | 20 |
| run 05 | + 토큰 단서 · 이름 패턴 `^F245-` | 8,505 | 2,446 | 96 | 100 | 4 | 19 |

읽는 법: 폴더만으로 붙던 확정 197건 중 193건은 파일 이름이 아무 말도 하지 않는 것이었다(run 04).
도면번호 패턴 하나와 표준어 토큰을 단서로 인정하자 그중 92건이 정당한 확정으로 돌아왔다(run 05).
남은 보류 100건의 93건은 회의록 폴더에 제출 자료가 들어 있는 그 경우이며, **폴더 단위 확인**
(15개 업무폴더가 후보 2,355건을 덮는다)으로 사람이 한 번에 처리하도록 설계돼 있다.

## 10.9 한계 — 이 부품이 못 하는 것

- **이름만 맞으면 엉뚱한 파일을 못 가린다.** 이름이 `..._HDD_최종.pdf`인 빈 껍데기도 후보가 된다.
  안을 열어 필수 절·표·양식을 보는 것은 **문서 내용 검사기(D1, 없음)**의 일이다(README 합의 목록).
- **없는 것을 못 본다.** 걷지 못한 파일(메일함·공유폴더·다른 PC)은 없는 것이 아니다.
- **성숙도는 파일 이름이 말한 것뿐이다.** 승인 기록·판번호 대장을 읽지 않는다.
- 제목 단서(`title_hint`)는 계약에는 있으나 CLI가 아직 채우지 않는다.

## 10.10 이 부품을 고칠 때 순서

1. **시험 먼저.** `observation/*.test.mjs`에 바꾸려는 행동을 쓴다.
2. **fixture.** `docs/architecture/workspace/examples/se_stage_rules/observation_candidates_synthetic_v0.json`에
   합성 파일과 `expected`를 손으로 적는다(구현이 정답을 다시 정하지 못하게).
3. **순수 모듈** → 필요하면 **CLI** 순으로 고친다. 순수 모듈에 fs·시계·난수를 들이지 않는다
   (정적 effect pin 시험이 import graph 전체를 본다).
4. `npm run validate:se-observation` → `validate:se-stage-rules` → `validate:canon` →
   `validate:path-length` → 절대경로 정책 → 엔진 manifest 재생성·검증.
5. 실제 과제 1건을 **새 실행 폴더**에 돌려 수치를 비교하고(create-only), `_workmeta` 영수증은
   guard 통과 후 metadata-only로 남긴다.
6. 이 장(10)의 규칙 표와 §10.8 수치, 07장 §7.3, README 합의 목록, `CHANGELOG.md`를 같은 변경에서 고친다.
