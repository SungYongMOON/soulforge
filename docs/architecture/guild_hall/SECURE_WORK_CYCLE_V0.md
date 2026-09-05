# Secure Work Cycle v0 — 사이클 1호

> 상태: `PILOT_SYNTHETIC_ONLY`. 합성 자료 1건이 접수부터 로컬 보관까지 한 바퀴 돌았다.
> 운영 승인이 아니고, 실자료 canary도 아니며, 결과는 후보다.
> 실행 표면은 [`guild_hall/secure_work/README.md`](../../../guild_hall/secure_work/README.md)가 소유한다.

## 결정

업무 원문을 로컬에 둔 채 외부 작업자에게 일을 시키는 구조를, **새 계약을 발명하지 않고**
기존 E14 모듈 계약 kit(SDD/ICD, M01~M10)의 포트에 어댑터를 붙여 만든다. kit 원본은 저장소 밖
읽기 전용으로 두고 vendoring하지 않는다. 저장소에는 어댑터·상태 진행·영수증만 둔다.

사이클 1호의 목적은 성능이나 완성도가 아니라 **경계가 실제로 닫히는지 확인하는 것**이다.
그래서 작업자를 모델이 아니라 scripted worker로 두고, 외부 route와 보관 route를 의도적으로
바인딩하지 않은 채 전체 사슬을 돌렸다.

## 무엇이 실제로 돌았는가 (2026-09-05 관측)

| 확인 | 관측값 |
| --- | --- |
| kit 무결성 | E14 321/321 파일, E13 70/70 파일 sha256 일치. 미등재 파일 0, 누락 0 |
| kit 자체 검사 | E14 pytest **88 passed**, E14 offline roundtrip `OFFLINE_REFERENCE_COMPLETE`, E13 pytest **79 passed** |
| 합성 미션 | E13 합성 fixture 6종 → recipe R1-07(업무·변경 보고) 1건 |
| 추출 | source pin 6, 필드(문장 조각) 55, 그중 토큰 9(entity 3 · quantity 6) |
| 로컬 관리자(G2) | 로컬 endpoint 실제 호출 1회, 43개 필드 제안 → CODE 선택 55개 안에 43개 모두 포함, CODE가 거부한 제안 0 |
| 보호 가공 | 공개 packet fact 55 · slot 9 · section 5, 봉인된 binding 9, 유출 검사 지적 0 |
| 전송 | scripted worker 1회(별도 프로세스, 빈 작업 디렉터리), 외부 네트워크 호출 0 |
| 복원·검증 | 구조검사 `STRUCTURAL_PASS_SEMANTIC_REVIEW_REQUIRED`, 필수 절 충족, 슬롯 9개 전부 로컬 복원 |
| 보관 | 로컬 outbox 4파일, `server_acknowledged: false`, `accepted: false` |
| 상태 전이 | 13건 전부 이벤트 원장에 기록 |

## E14 모듈 ↔ 이 lane의 binding

| E14 | 모듈 | 이 lane이 붙인 것 | binding | 상태 |
| --- | --- | --- | --- | --- |
| M01 | Source & Identity | 파일 시스템 exact revision 읽기(파일 sha256 + byte span). latest fallback 없음 | BIND01 | `BOUND_SYNTHETIC` |
| M02 | Local Context Planner | OpenAI 호환 로컬 endpoint. 제안만 하고 선택은 CODE가 재도출 | BIND02 | `BOUND_LOCAL` |
| M03 | Projection Compiler | kit 참조 구현 그대로 | — | `KIT_REFERENCE` |
| M04 | Binding Vault | kit SQLite vault + 로컬 파일 키 래퍼 | BIND03 | `BOUND_TEST_KEY_ONLY` |
| M05 | Release Authority | 필드 검토 원장(파일) + CLI 1회용 permit | BIND04 | `BOUND_OPERATOR_NOT_AUTHORITY` |
| M06 | Provider Codec & Egress | scripted worker(별도 프로세스) / 외부 provider 뼈대 | BIND05 | `SCRIPTED_BOUND` · 외부 `NOT_BOUND` |
| M07 | Mission State Engine | kit journal(SQLite CAS·멱등·attempt 불확실성) | — | `KIT_REFERENCE` |
| M08 | Result Binder | kit 구조검사 + literal-safe Markdown 복원 | — | `KIT_REFERENCE` |
| M09 | Validator Host | ValidationReport 생성(구조·유출검사 결과 요약) | BIND06 | `PARTIAL` · 의미 검토 `NOT_RUN` |
| M10 | Custody | 로컬 outbox + Tongs ingress 클라이언트 뼈대 | BIND07 | `LOCAL_ONLY` · 업로드 `NOT_BOUND` |
| — | 상태 투영 | Vigil이 읽을 수 있는 상태 요약 1파일 | BIND08 | `BOUND` |

### 남은 binding

| ID | 무엇이 남았나 | 무엇이 있어야 닫히나 |
| --- | --- | --- |
| BIND01 | 실제 업무 자료 소스(승인된 저장 위치, identity 검사) | 실자료 canary에 대한 Owner 결정. 지금은 합성 디렉터리 하나만 읽는다 |
| BIND02 | 모델 제안의 품질 판정과 실패 모드 계측 | 반복 실행 표본. 1회 관측으로는 품질을 주장하지 않는다 |
| BIND03 | 운영 키 소유자(OS 보호 저장소 또는 사내 KeyService) | 지금 키 래퍼는 파일 권한뿐인 시험 전용이다 |
| BIND04 | 실제 분류·공개 권한자 | 사이클 1호의 승인자는 합성 자료에 대한 운영자이며 분류 권한자가 아니다 |
| BIND05 | 외부 provider route | Owner가 키 한 줄 파일을 배치하고 route를 명시적으로 켜야 한다. **이번 lane 호출 0회** |
| BIND06 | 독립 의미 검토자 | 구조 통과는 의미 통과가 아니다. 작성자와 분리된 검토가 필요하다 |
| BIND07 | Tongs 보관 | Owner가 bearer를 발급하고 ingress를 켜야 한다. **이번 lane 업로드 0회** |
| BIND08 | Vigil 화면 노출 | 상태 파일은 있고, 화면에 띄우는 것은 Vigil 쪽 결정이다 |

## 경계가 실제로 닫혔는지 확인한 방법

1. **허가 없는 전송 0.** permit 파일이 없는 상태에서 `advance`는 `RELEASE_REVIEW`에서
   `PERMIT_REQUIRED`로 멈췄다. permit은 정확한 request bytes·route digest·job·mission·round·
   review·policy epoch에 묶이고 1회용이며, kit journal이 permit id 유일성을 durable하게 잡는다.
2. **검토 없는 literal 0.** 필드 검토 원장이 없을 때 M03은 `FIELD_REVIEW_REQUIRED`로 실패하고
   job은 `HOLD`로 내려갔다(관측: 46개 KEEP_REVIEWED 후보 전부 미승인). 원장을 채운 뒤에만
   `RELEASE_REVIEW`로 올라간다.
3. **packet에 원문·경로·매핑 없음.** 나가는 bytes를 대상으로 자동 검사(원본 파일명, 소스 참조,
   host 경로, file URI, 슬롯 뒤에 숨긴 실제 값)와 손 확인을 함께 했다. 9개 슬롯 값
   (고객명·과제명·금액·메일주소·전압 2종·응답시간 2종·변경 후보 전압) 어느 것도 packet에 없고,
   원본 파일명·확장자·digest·host 경로도 없다. packet에 남는 식별자는 opaque token뿐이다.
4. **로그에 매핑·키·원문 없음.** 이벤트와 영수증은 쓰기 직전에 같은 검사를 통과해야 하며,
   통과하지 못하면 기록 자체가 거부된다(`EVENT_WOULD_LEAK` / `RECEIPT_WOULD_LEAK`).
5. **작업자 격리.** scripted worker는 별도 프로세스에서, 빈 임시 디렉터리를 작업 디렉터리로,
   released body만 stdin으로 받아 실행된다. 원본 디렉터리·vault·job store 경로를 받지 않는다.
6. **숨은 추론 미수집.** 로컬 모델에는 추론 블록을 끄도록 요청하고, 응답에서 보이는 답변
   필드만 읽는다.

## 이 lane이 주장하지 않는 것

- 일반적인 비공개 보장. 유출 검사는 "이 lane이 이미 로컬로 정한 문자열이 나가는 bytes에 있는가"만
  답하는 **유한한** 검사다. 자동 분류기가 아니며, 정상 토큰의 잘못된 의미적 사용은 잡지 못한다.
- OS 수준 격리. 프로세스 분리와 작업 디렉터리 제한은 코드 수준 경계이며, 방화벽·샌드박스·
  권한 분리의 증거가 아니다.
- 의미 정확성. 구조 통과와 슬롯 복원은 문장의 의미가 옳다는 뜻이 아니다.
- 성능. 로컬 모델 1회, 미션 1건의 관측이며 품질·속도 주장을 만들지 않는다.
- 정본 승격. 결과는 후보로 남는다. 수락은 사람의 별도 결정이고 정본면은 Covenant 뒤의 문제다.

## Owner 손

| 항목 | 무엇을 하나 | 없으면 |
| --- | --- | --- |
| 외부 provider 키 | `<private_root>/config/secure_work/credentials/openrouter.key`에 한 줄 파일 배치 후 설정의 route를 켠다 | M06 외부 route가 `ADAPTER_UNAVAILABLE` |
| Tongs bearer | ingress 자격 발급 후 `<private_root>/config/secure_work/credentials/`에 배치하고 ingress를 켠다 | 후보가 로컬 outbox에 남는다 |
| 필드 검토 | 어떤 문장을 원문 그대로 내보내도 되는지 결정한다 | M03이 `HOLD` |
| 전송 허가 | `sfx permit approve` | 전송 0 |
| 실자료 전환 | 합성 → 실자료 canary 결정 | 합성만 |
| 수락 | 후보를 검토하고 수락한다 | 후보로 남는다 |

## 다음 사이클 후보

1. 외부 작업자 1회 실제 왕복(허가 뒤, 합성 자료로). 응답 격리와 `DELIVERY_UNKNOWN` 경로 확인.
2. Tongs 보관 1건과 `verified_server_ack` 영수증.
3. 독립 의미 검토자 붙이기(작성자와 분리).
4. 로컬 관리자 제안 품질을 여러 번 관측해 CODE 재도출과의 차이를 계측.

## 관련 문서

- [`guild_hall/secure_work/README.md`](../../../guild_hall/secure_work/README.md)
- [`../foundation/team_member_engineering_program/05_ENGINEERING_MCP_CLIENT_DATA_PLANE.md`](../foundation/team_member_engineering_program/05_ENGINEERING_MCP_CLIENT_DATA_PLANE.md)
- [`../foundation/SHARED_GLOSSARY_V0.md`](../foundation/SHARED_GLOSSARY_V0.md)
