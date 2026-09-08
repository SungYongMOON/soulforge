# 회사 과제 업무 발견 실행 연결

이 기능은 공개 승인을 거친 최근 사건과 현재 Linear 관찰을 대조하여 신규·후속·자료 보강·무조치·보류 후보를 만든다. 공학적으로 필요한 작업인지 판단할 때는 현재 수락 맥락과 Rune를 함께 사용한다. 결과는 영속 기록과 읽기 전용 검토 화면으로 이어진다. 공식 업무 등록·담당 배정·사람 수락·완료·승격을 실행하지 않는다.

기존 P0–P3 합성 계약은 `WORK_INTAKE_SHADOW_ADAPTER.md`에 있다. 이 실행 연결은 그 문서의 reader·judge·영속 조립 미결속을 보강한다. 합성 시험을 실제 기업 규정의 유효성이나 실제 모델의 업무 발견 성능으로 보고하지 않는다. 실제 규정이 아직 없어도 구조·기능 검증은 합성 규칙으로 수행할 수 있다.

## 두 가지 판단 경로

```text
G2가 준비하고 별도 권한으로 공개한 WorkPacket + 최근 사건 메타데이터
                         + 기존 reader가 검증한 현재 Linear 관찰
  → 과제·원본판본·capture·release·현재권한 확인 → P0 입력 생산
       ├─ 새 요청·후속 발견: 현재 의미 판단 프로그램 → Shadow 후보
       └─ 공학 필요성: 수락 맥락/typed 규칙 → 실제 Rune → 의미 판단
                                              → 근거가 있는 Forge 미리보기
  → P2 판단·정정·cursor 저장 → 결과 근거 저장 → 현재 권한의 읽기 화면
```

가벼운 발견에는 전체 Rune 준비를 선행하지 않는다. 공학 경로에 필요한 수락 자료나 typed 근거가 없으면 해당 사건만 보류한다. `gap_unknown`을 `gap_missing`으로 만들지 않는다. 근거를 확인한 누락에만 Forge 미리보기를 만든다.

## 실행·설치 진입점

- `tools/work_intake_cli.mjs run --deployment <absolute-json> --sha256 <sha>`: 한 회차.
- 같은 CLI의 `inspect`: 모델을 시작하지 않는 상태 조회.
- `poll --interval-ms <1000..3600000>`: 직렬 반복. 예약작업을 등록하지 않는다.
- `tools/work_intake_stage.mjs <source-root> <empty-external-target> <dependency-root>`: 명시된 실행 코드와 JSON 자산을 복사하고 바이트 해시를 남긴다. 실제로 runtime이 해시 검증하는 ACP CLI/workspace 파일도 포함한다.
- `src/work_intake_http.mjs`: 기존 서버의 currentAccount/sessionKey/canAccessProject를 받는 독립 controller. `/workbench/work-intake`, `/api/workbench/work-intake`, `/api/workbench/work-intake/result`만 GET으로 제공한다.

공통 서버는 `DEV_ERP_WORK_INTAKE_READ=1`, 설치자가 고정한
`DEV_ERP_WORK_INTAKE_DEPLOYMENT`와 `DEV_ERP_WORK_INTAKE_DEPLOYMENT_SHA256`으로
읽기 전용 실행면을 연다. 미설정·잘못된 pin·DB 부재는 503이며 서버가 새 DB를 만들거나
judge를 시작하지 않는다. 일반 서버 로그인·과제 권한을 사용하고 Buzz 원본 인증 예외를
이 화면에 적용하지 않는다. 종료 시 reader를 닫는다.

E14 원본 kit은 복사하거나 다시 구현하지 않는다. 설치 manifest가 요구하는 외부 E14 원본과 호환 Python을 명시적으로 연결한다. 기존 sanitized Python runner와 호환 환경을 재사용하며 운영 설정을 찾아 읽거나 새 환경·키를 설치하지 않는다.

## 입력과 권한을 공급하는 쪽

배치 JSON은 installer가 exact SHA로 고정한다. 필수 항목은 다음과 같다.

| 항목 | 의미 |
|---|---|
| `version:1`, `project_ref`, `scope_ref` | 이 실행기의 고정 과제 |
| `mode` | `synthetic_rehearsal` 또는 `source_bound` 실행 경로 |
| `data_provenance` | `synthetic` 또는 `released`; 실제 경로의 합성 검증을 실자료로 오인하지 않음 |
| `repository_root`, `control_root`, `evidence_root` | source와 겹치지 않는 별도 비정본 상태/근거 위치 |
| `authority.grant/claim/pin/current` | 독립 pin과 기존 workforce verifier가 확인하는 현재 권한 |
| `source_index` | 현재 G2 최근 입력 generation descriptor (`sha256:null`) |
| `release_profile` | 입력이 바꿀 수 없는 독립 배치 승인 프로필의 exact pin |
| `release_binding_roots` | 공개된 packet binding을 선택할 수 있는 명시 root |
| `documents` | 기존 P0 문서 역할·판본·필수 절에 대한 pinned 검증 입력 |
| `linear` | 기존 Linear read-evidence reader의 root/expectedBinding/범위 |
| `packet_reader` | Python 실행파일 및 read-only E14 consumer script의 exact pins |
| `judge` | 기존 G1 ACP binding pin·model·roleRef·timeoutMs |
| `accepted_project_ref` | 공학 경로에서 확인할 정확한 과제 ref; 없으면 공학 판단 보류 |

`authority.grant`는 `grant_ref`, `authority_ref`, `project_ref`, `scope_ref`, 승인된 `producer_ref`/`receiver_ref`, `agent_group:G1`, `input_class:g2_released_workpacket`, `actions`, `valid_from/valid_until`, `maximum_events`를 가진다. actions는 read/judge/record/view를 구분한다. claim/current는 기존 workforce 검증 형식이며 current observation은 5분 이내여야 한다. 이 코드가 grant나 승인 claim을 발급하지 않는다.

source_index는 `version`, `project_ref`, `scope_ref`, `producer_ref`, `generation`, `observed_at`, `window`, `source_reads`, `captures`, `events`, `linear_projections`를 담는다. 본문을 index에 복제하지 않는다. events는 P0의 사건 metadata에 `release_binding`, `fact_ids`, 선택적 `engineering:{config,request}`를 추가한다. 선택된 FACT의 `source_refs`에 사건의 정확한 `revision_ref`가 있어야 한다.

기본 채널은 gmail/slack이다. 명시된 `grant.allowed_sources`로 buzz/file_change/voice를 추가할 수 있다. 기존 capture의 source ref가 다르면 고정 `grant.source_lanes` mapping으로 연결한다(예: file_change → source.team_files). source 종류를 메일로 바꿔 기록하지 않는다. Gmail+Linear 필수 읽기와 각 추가 채널의 실제 coverage를 유지한다. 비어 있는 필수 출처도 실제 empty 관찰이 있어야 한다.

Linear task 의미 자료는 `linear_projections`의 issue_id·실제 issue_content_sha256·별도 task_semantic_sha256·공개 FACT IDs로 공급한다. 상태/판본/세대는 기존 Linear reader가 독립적으로 검사한다. 메타데이터 hash를 의미 hash로 만들지 않는다. 전체라는 표현은 `complete_committed_index` 범위이며 polling의 hard-delete 불확실성은 결과의 coverage_gaps에 남긴다.

`workIntakeScopeDigest(index)`가 release binding descriptor를 제외한 정확한 사건/Linear 대응과 window/capture를 canonical hash로 묶는다. 이 값과 기존 reviewer가 고정한 PolicyReview.scope_digest가 맞아야 한다. 검토자가 승인하지 않은 mapping을 소비자가 스스로 승인하지 않는다.

## 공개 자료 수신 경계

`tools/work_intake_packet_reader.py`는 실제 E14 WorkPacket·PolicyReview·PreparedRequest·RouteProfile·SignedPermit 및 strict codec·verify_permit를 import한다. 현재 좁은 wire mapping은 기존 `{packet,released_history:[]}`이다. 비어 있는 history를 누적 공개 원장이 완성됐다는 근거로 삼지 않는다.

독립 release_profile에는 approved_bindings의 exact path/hash와 승인된 kit_root/code pins, public key pin, reviewer, route/profile/model, work type/revision/digest, header digest, epoch, grant, wire profile이 고정된다. current index는 이 신뢰 기준을 선택하거나 갱신할 수 없다. 프로필과 일치한 binding만 Python으로 넘긴다. G2_PREPARED·JSON shape·서명 하나가 독립 PolicyReview ALLOW를 대신하지 않는다.

Python은 수신자·과제·scope·work·packet·준비된 body·route/header·review·epoch·만료와 현재 철회를 확인한다. 실제 body SHA와 서명에 결속된 body SHA가 같아야 한다. 운영 signing key·SourceBundle 원문·vault·field review ledger payload는 읽지 않는다. FACT literal과 복원 불가능한 slot 표시만 후속 판단에 사용한다. released 실자료 모드는 route의 live_enabled도 요구하며, 합성 route를 켠 것으로 가정하지 않는다.

G2 원문 준비와 release/current authority writer는 기존 G2·권한 owner의 역할이다. 이 소비자는 일반 WorkPacket을 코드개선 13필드로 바꾸거나 그 publisher를 회사 자료 공급 완료로 대체하지 않는다. 실제 producer 미배치는 입력 공급 상태로 구분하며 독립 구현 가능한 기능 검증은 계속한다.

## 수락 맥락과 규칙의 층

수락 맥락은 이 과제의 현재 기준으로 확정된 자료·판본·근거 연결이다. `work_intake_context`의 file-backed providers가 기존 accepted-context reader를 실제 호출한다. generation·current pointer·source revisions·현재 ACL은 읽기 전후에 재검사된다. typed 요구사항·관측값의 refs는 현재 허용된 accepted hits와 일치해야 한다.

선택적 rule_profile은 공통·고객·품질등급·프로젝트의 합성 규칙을 선택한다. 고객/등급/프로젝트 선택과 profile revision은 신뢰된 설정에 묶이므로 입력이나 모델이 임의로 약한 규칙을 선택할 수 없다. 기존 Rune의 applicability·authority·profile normalization·source conflict·engine pass를 재사용한다. 층 이름 자체를 우선순위로 쓰지 않는다.

승인된 exact 예외만 해당 scope·rule revision·기간에 적용한다. 해결되지 않은 충돌은 양쪽 source claims를 보존하고 HOLD한다. 실제 LIG·한화 규정을 작성하거나 추정하지 않았다. 고객 A/B·등급 차이·공통 규칙·과제 규칙·예외·충돌·판본 변경 기능은 합성 자료로 검증한다. 실제 규정의 유효성 확인은 해당 자료를 도입할 때의 별도 내용 검증이다.

순수 context reader의 명시적 과거조회는 유지한다. 현재 회사 업무 runtime은 입력 as_of가 최근5분 이내이며 사건 window와 관찰시각에 맞는지 검사하고, 예외를 현재 wall-clock에도 대조한다. 자료의 기준시각을 임의로 지금으로 고쳐 쓰지 않는다. 초기 판단·모델 입력/결과·기록 전 재검사에서 만료가 확인되면 HOLD하므로, as_of가 아직 신선하더라도 이미 만료된 예외를 적용할 수 없다.

Rune의 exact tuple/UUID와 Forge의 named string 형식은 다르다. 미리보기는 실제 대상에서 결정적으로 만든 이름과 full ref_bindings를 함께 보존한다. 근거가 없을 때 alias를 만들어 채우지 않는다. 실제 Forge core의 메모리 후보 API만 사용하며 공식 writer port는 항상 금지된다.

## 판단·지속 기록·검토

기존 G1 ACP를 사용하는 work_intake_judge는 공개 FACT·현재 task FACT를 실제 모델 입력 형식으로 전달한다. 모델은 분류·의미 식별자·근거 refs만 제안한다. receipt는 모델이 작성하지 않고 wrapper가 관찰된 세션/입출력에 결속한다. 고정 script judge는 기존 합성 단위시험용이고 source_bound runtime의 대체가 아니다.

native prompt 전 UNKNOWN을 SQLite에 저장하고, 직접 자식 종료 확인 뒤만 CLOSED로 바꾼다. 종료 확인 또는 그 기록이 실패하면 재시작 후에도 자동 재호출하지 않는다. 키나 운영 profile은 이 runtime이 발급하지 않는다.

P0–P3의 입력 검증·브랜드·의미/원본 식별·정정·cursor CAS를 재사용한다. `store.commitResult`의 COMMITTED는 기록 성공이다. decision_status가 HOLD/ROLLED_BACK이면 실행 결과도 HOLD, 적용 후보0, Forge 미리보기 없음으로 기록한다. 성공과 보류·실패 분모를 섞지 않는다. 결과 원문 FACT는 metadata store/조회 응답에 복제하지 않는다.

현재 P2 저장 계약은 프로젝트별 10,000회 회차 한도를 유지한다. 한도 전 확인과 장기 보관 정책은 기존 저장 owner의 계약이며 이 코드가 기록 삭제·이관·원장 초기화로 우회하지 않는다. Runtime 조회는 최대100개씩 seek하고 모델 호출은 실제 입력/규칙 fingerprint 변경에만 실행한다. 최종 제품 운영 주기를 정할 때 이 저장 용량 계약도 함께 검토해야 한다.

검토 화면은 현재 로그인·과제 접근을 다시 확인한다. 기본 화면은 후보 종류와 보류 이유를 설명하고, 상세 refs/hash/판본은 접을 수 있는 검증 기록에 둔다. GUI 자동 조작 없이 실제 loopback HTTP와 script VM으로 검증한다. 공식 업무·수락·Done 버튼은 없다.

## 검증

Node의 work_intake_context/rule_profile/judge/linear/runtime/http tests 및 기존 adapter/store 회귀를 실행한다. Python packet reader tests에는 명시적인 기존 E14 kit와 호환 Python을 제공한다. 설치 검증은 별도 새 copy에서 CLI·실제 HTTP·native synthetic executable·기존 Rune/Forge를 관통한다. 공개 RFC 8032 시험 벡터는 테스트의 메모리에서만 사용하며 운영 키를 생성하거나 읽지 않는다.

`work_intake_server.test.mjs`는 실제 서버의 app/Buzz 인증 분리, 과제 권한과 철회,
읽기 전용 DB 및 미설정 상태를 확인한다. `work_intake_recovery.test.mjs`는 합성 closed
DB·근거 세대를 복원하고 누락·혼합·UNKNOWN 재실행 및 과거 권한 복원에 의한 철회 우회를
거부한다. 실제 운영 백업이나 모델 종료 증거의 복구는 이 검사에 포함하지 않는다.

시험의 source_bound 표시는 검증된 연결 방식을 뜻한다. 별도의 data_provenance:synthetic과 native test model 이름을 유지한다. 시험 결과를 실제 고객 규정의 정합성·실제 모델 성능·실사용 효과·제품 전체 출시·운영 전환으로 확대하지 않는다.
