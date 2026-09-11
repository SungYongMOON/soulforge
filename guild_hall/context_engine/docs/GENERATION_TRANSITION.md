# 명시적 파생 세대 생성과 설치 전환

## 범위와 입출력

전체 승인 source snapshot(합성 PDF 4개)과 separately accepted-record snapshot을
명시적으로 받는다. 읽기 전용 parser와 기존 accepted reader가 각각 실제 문서와
수락 기록을 검증한 뒤 새 세대에 extraction/index/typed 참조/projection을 만든다.
입력의 9개 source revision refs는 metadata lane을 포함한다. 이를 9개 PDF를 파싱한
것으로 표현하지 않는다. 정상 관측은 4/4 parsed/complete, 8쪽, 23문단, 4표,
12 table cells, 15 records다. unsupported/failed/review_pending은 각각 집계하며
하나라도 있으면 complete manifest와 current를 발행하지 않는다.

```text
context_engine/
  src/app.mjs                          공개 update/select/query
  src/runtime/generation_update.mjs     원본 검증 → 새 파생 세대
  src/runtime/preparation_runtime_manifest.mjs  Python 실제 byte/membership
  src/runtime/pair_store.mjs            예상 prior + lock + atomic current
  src/runtime/accepted_context_*.mjs    공통 읽기/팩 조립
  src/guards/                          ACL·수락·시간·budget
  src/adapters/                        원본·파생 저장소 읽기
  algorithms/{preparation,representation,retrieval,memory,assembly}/
  profiles/                            고정 decision-v1 / relation-v2
  harness/                             설치 전환·거부 사례·동결 비교
  tests/                               직접 회귀
  docs/                                소유·계약·관측 범위
  release/                             exact closure + 기존 lane builder
```

## 저장과 수락 권한

| 위치/대상 | writer | 파생·재생성 여부 | 보존 계약 |
| --- | --- | --- | --- |
| 외부 source custody·SE·lineage·receipt | 기존 owner | APP 재작성 불가 | 원본 path/hash와 연결 유지 |
| 외부 `binding.accepted_snapshot` | 기존 수락 authority | APP 재작성 불가 | 실제 bundle과 records 읽기를 exact path/hash에 결속 |
| project `20_문서검색` | 명시 update | 본문·표·품질·검색 index 재생성 가능. 그래프 색인 조각(제안층, D41)은 모델 출력이라 결정론적 재생물이 아님 | 세대 create-only. 그래프 색인은 불변 문서의 이전 세대 파일을 (경로, 해시)로 참조 |
| project `30_프로젝트맥락` | 명시 update | accepted 원본/위치 참조·범위 요약 | 새로운 결정/약속을 수락하지 않음 |
| project `40_기억관리` | 명시 update | projection·선택 policy 재생성 가능 | source/accepted pin 유지 |
| project `50_업무맥락` | 명시 update | generation manifest·empty cache | query의 persistent write 0; 준비된 cache를 완료 팩으로 표시하지 않음 |
| project `60_업무경험` | 명시 update | 승인 receipt 연결 재생성 가능 | 결과·실패·재작업·검토 원문 복제/절차 승격 없음 |
| 별도 `common_derived_path` | 명시 common 권한 update | common 파생물 | 어떤 project namespace 안에도 공통 본문을 쓰지 않음 |
| project `00_프로젝트_안내/current.json` | 명시 select | 한 개 code/data tuple | lock·expected prior·current ACL 검사 후 atomic 교체 |
| project `00_프로젝트_안내/graph_index_current.json` | 명시 graph index update/select | 과제 그래프 색인 세대 하나(위 tuple 포인터와 별개) | 별도 lock·expected prior·ACL·전 파일 해시 확인 뒤 atomic 교체 |
| 버전별 APP 설치 | 기존 source-lane builder | clean commit에서 재구축 가능 | 실패본·이전본 포함 기존 설치 byte 보존 |

모든 `kind:accepted` 자산은 외부 `binding.accepted_snapshot`과 일치해야 한다.
typed 파생물은 그 원본의 record index와 위치를 참조한다. reader가 실제로 여는
records source 또한 외부 바인딩의 원본이어야 하며 파생물의 자기 선언을 신뢰하지 않는다.
준비 성공은 수락이나 선택이 아니다. selection tuple은 code/config/closure/composition과
generation ref, selection epoch를 함께 담는다. rollback도 동일한 현재 권한 검사를 거친다.
commit 전 실패와 commit 후 cleanup 실패는 다른 결과로 보고한다.

실제 정상 세대는 preserved refs 18개와 assets 33개를 갖는다. 자산은 원본 참조 5개
(accepted 1/source 4), extraction·quality 8개, index 2개, typed·locations 8개,
projection/policy/summary 각 2개, episode 1개, scope generation 2개, empty cache 1개다.
별도 최상위 generation manifest가 이 목록을 결속한다. `30_프로젝트맥락/사건·관계`와
`40_기억관리/회수·활용_평가`에 별도 파일을 생성했다고 주장하지 않는다.
관계 파생물은 relation-v2 projection의 member_links에 있고 평가 파일은 공개 합성 examples에 있다.
각 실제 파일은 해당 area의 `generations/<generation_id>/`에 있으며 이전 세대 파일을 덮어쓰지 않는다.

## Python 실행환경

현재 명시 profile은 Windows CPython 3.12다. Node가 실행 전에 exe, Python/VCRuntime
DLL, DLLs, stdlib(기존 bytecode 포함), 선언된 8개 parser distributions의 실제 package
tree와 metadata, root/site membership을 manifest로 계산하고 승인 binding과 비교한다.
각 PDF 실행 직전과 준비 후에도 비교한다. symlink, venv/path override 설정은 이 profile에서
거부한다. manifest는 host 경로 없이 상대경로·hash를 담으며 실제 runtime 경로는 private
binding에만 존재한다. OS와 Node는 별도 host prerequisite이며 OS 전체 pin을 주장하지 않는다.

APP만 shared ingest trusted 옵션 `disableSiteStartup:true`를 선택한다. 고정 worker를
`-I -B -S`로 실행하고 명시 interpreter의 `Lib/site-packages`만 추가한다.
`.pth`, sitecustomize, usercustomize 자동 실행을 하지 않는다. 기존 caller 기본 옵션과
request/result는 유지한다. 공유 Python 설치나 package를 수정/설치하지 않는다.
관측된 manifest는 1,904파일/92,828,569bytes이며 byte inventory는 private binding에 있다.

## 전략과 평가 분리

decision-v1은 paragraph/accepted-location/source-order/ranked-decision을 사용한다.
relation-v2는 실제 table chunk/member-link/bounded-related-record/related-evidence를 사용한다.
두 조합은 공통 ACL·수락·시간·충돌·budget 검사를 통과한 근거만 처리한다.
자동 의미 기록 생성, OCR/vector/multi-hop, 연속 daemon은 구현 범위가 아니다.

공개 합성 비교는 examples/context-memory의 `app-strategy-freeze.json`,
`app-strategy-responses.json`, `app-strategy-evaluation.json`에 결속된다.
소비 호출은 **수정 전 0.2.1과 0.3.0**의 실제 입력으로 각 1회뿐이다. gold를 주지 않았고
보이는 native final text를 보존했다. transport bytes·실제 model/effort/tier/tokens는
확인하지 못했다. 수정 버전의 새 모델 응답으로 재표시하지 않는다.

같은 두 응답을 app-strategy-eval/1과 /2 양쪽에서 재평가한다. 두 조합 모두 required
refs 2/3, 누락 F-RESULT, frozen status 불일치이며 whole-question pass=false다.
/2는 두 응답 모두의 omissions/limitations 존재와 누락 refs를 추가로 관측한다.
응답 순서를 바꿔도 같은 결과이며 원문/input/hash나 frozen gold를 바꾸면 거부한다.
이는 기계적 재평가이며 독립 의미 검토나 전략 우월성의 증명이 아니다.
두 응답 모두 전압 28/30V 충돌을 유지했지만 질문의 supply issue를 별도 정보 부족으로
해석했다. 시편 추적 F-RESULT가 입력에서 빠진 상태다. 전체 W7·품질 채택·real canary는 HOLD다.

수정 후 실제 0.2.2/0.3.1 입력은 `app-strategy-revised-inputs.json`에서 별도 비교했다.
question과 **pack.metrics를 제외한 모든 팩 필드**가 각 원래 입력과 exact 동일하다.
비교에서 제외한 필드는 metrics 하나뿐이며 facts/evidence/충돌/coverage/누락과 digest는
포함된다. 이는 기존 두 응답을 수정 버전의 새 모델 실행으로 바꾸는 근거가 아니다.

## 검증과 한계

설치 정상 전환과 별도 copy/owned synthetic state의 9개 기존 거부 검사는
`harness/installed_generation_flow.mjs`, `harness/installed_negative_checks.mjs`로 재현한다.
거부 항목은 code/dependency/profile byte 불일치, valid code/index 조합 불일치,
다른 project, character/source-read budget, partial index, accepted-generation revocation이다.
실제 host 경로·설치 manifest·current/원본 byte inventory는 private receipt가 소유한다.

독립 검토의 권한 변조 probe 요청은 자동 보안 검토가 차단했고 exact command가
반환되지 않았다. 해당 probe는 실행·변형·재시도하지 않았다. 수락 결속 보완은 정적 diff와
정상 외부 snapshot을 실제 읽는 ref/hash assertion으로 확인한다. 일반 기존 회귀와
허용된 정상 설치 증거를 그 차단 시험의 실행 증거로 바꾸어 말하지 않는다.

기존 default ingest 회귀는 이 checkout에 기본 source_extraction_venv가 없어 5개가
pdf_unreadable로 실패했다. APP의 명시 interpreter/no-site 실제 PDF·table 검사는 통과했다.
기본 환경을 우회 설치하거나 성공으로 다시 분류하지 않는다. 최종 독립 수락과 shared
문서·CHANGELOG 통합은 아래 기술 범위에 한정하며 이 문서 자체가 운영 승인을 만들지 않는다.

## 보완판 설치 관측

| 판 | exact source commit | lane manifest SHA-256 | 상태 |
| --- | --- | --- | --- |
| 0.2.2 decision-v1 | 51050a4419516a5321e9af9d47bf436b1c742bd0 | e1c83ed5880b64e2b8577916f5939d70dabb970fc820b55124a6ea311ad6791b | 명시 update/query·기준판 복구 관측 |
| 0.3.1 relation-v2 | f2add5f4ea48bb43d9eec2a7dfea0ea6c2b85053 | e8b79ecbc48782e4c01873c551126f591a89f87c0afec0b28da972c1146563b4 | 명시 update·같은 caller로 선택/query 관측 |

각 설치는 48파일/604,796bytes이며 APP entry SHA-256은
`a4d48b48a511fe596c5dd6b97dd5113e95d8b19d3294f749decd0e44916644ba`다.
실제 `0.2.2 → 0.3.1 → 0.2.2`에서 같은 0.2.2 caller를 새 CLI process로 다시 실행했고
최종 rollback digest는 초기 digest `36a027b7eaa68b981f08ddff1c7eb111c749e56065ca26dab09d22e825c6966d`와 같다.
원본 owner와 두 설치의 전후 byte inventory가 같으며 query의 store write는 0이다.
기존0.1.0, 실패0.2.0, 이전 관측0.2.1/0.3.0도 보존하고 각 manifest의 파일 hash를 확인했다.
알려진 계약 결함이 있는 이전 판을 최종 검증된 rollback 대상이라고 하지 않는다.

보완판 exact source의 producer/pair/shared profile 회귀는 21/21 PASS(skipped 0)다.
기존 맥락 회귀 108개, entry 5개, fair evaluator 3개도 통과했다. 이 수치는 앞서 명시한
default ingest 환경 실패 5개를 포함하거나 숨기지 않는다. 보완판의 기존 설치 거부 9개도
모두 기대 결과를 반환했고 원본·수락 bytes와 유효 설치를 변경하지 않은 채 기준판 digest로 복귀했다.
설치 query의 source는 두 번/108,776bytes지만, 전체 pinned 검사는 359회/약107.4MB다.
기준판 47.45초·후보판 61.29초·복구 조회 58.66초를 관측했다. 강화된 검증 비용을
성능 개선으로 표현하지 않으며 이 관측을 장시간 운영 성능 보장으로 확대하지 않는다.

## 독립 검토와 통합 판정

독립 검토의 수락 원본 결속·Python 실행 의존 목록·profile fixture·공개 export 지적을
보완한 0.2.2/0.3.1과 최종 하니스 변경은 합성 APP 기술 범위에서 ACCEPT다.
기존 독립 실행의 28 PASS와 실제 설치 왕복·원본 보존 증거를 재사용했고,
최종 검토는 영수증 해시·양세대 수락 원본 참조·하니스 두 판·수정입력 동일성을 직접 확인했다.
통합 작업면에서는 T4/보고서·APP 경계·전략 비교 22개가 PASS였다.
이전 검토의 부분 복사본에서 legacy CLI 누락으로 실패한 T4 실행과 구분한다.
차단된 권한 변조 시험은 여전히 NOT_RUN이며, 원소비 2회를 수정판 실행으로 바꾸지 않는다.
실자료 canary·일반 의미 후보 생성·연속 writer·전체 W7·품질 우월성·운영 채택은 이 판정에 포함되지 않는다.
