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

## 무엇이 실제로 돌았는가 (2026-09-05 관측, UTC — receipt·event 타임스탬프 기준. 커밋
날짜·CHANGELOG 날짜는 KST(+9)라 하루 차이로 보일 수 있다)

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
| M10 | Custody | 로컬 outbox + Tongs(MCP 문) ingress 클라이언트 뼈대 | BIND07 | `LOCAL_ONLY` · 업로드 `NOT_BOUND` |
| — | 상태 투영 | Vigil(포트 4192)이 읽을 수 있는 상태 요약 1파일 | BIND08 | `BOUND` |

### 남은 binding

| ID | 무엇이 남았나 | 무엇이 있어야 닫히나 |
| --- | --- | --- |
| BIND01 | 실제 업무 자료 소스(승인된 저장 위치, identity 검사) | 실자료 canary에 대한 Owner 결정. 지금은 합성 디렉터리 하나만 읽는다 |
| BIND02 | 모델 제안의 품질 판정과 실패 모드 계측 | 반복 실행 표본. 1회 관측으로는 품질을 주장하지 않는다 |
| BIND03 | 운영 키 소유자(OS 보호 저장소 또는 사내 KeyService) | 지금 키 래퍼는 시험 전용이고, Windows에서는 `0o600`이 적용되지 않아 상속 ACL로 로컬 사용자 모두가 읽을 수 있다 |
| BIND04 | 실제 분류·공개 권한자 | 사이클 1호의 승인자는 합성 자료에 대한 운영자이며 분류 권한자가 아니다 |
| BIND05 | 외부 provider route | Owner가 키 한 줄 파일을 배치하고 route를 명시적으로 켜야 한다. **이번 lane 호출 0회.** BIND09가 닫히기 전에는 켜지 않는다 |
| BIND06 | 독립 의미 검토자 | 구조 통과는 의미 통과가 아니다. 작성자와 분리된 검토가 필요하다. 사람 승인자와 lane 작성자의 분리도 여기서 닫는다 |
| BIND07 | Tongs(MCP 문) 보관 | Owner가 bearer를 발급하고 ingress를 켜야 한다. **이번 lane 업로드 0회** |
| BIND08 | Vigil(포트 4192) 화면 노출 | 상태 파일은 있고, 화면에 띄우는 것은 Vigil 쪽 결정이다 |
| BIND09 | 허가 주체의 신원 결속(신뢰 키 등록소 또는 OS 사용자 결속) | permit은 이제 설정에 고정된 신뢰 공개키로만 검증되어 자기 서명은 막혔지만, 그 신뢰 키를 누가 쥐고 있는지에 대한 신원 등록소는 아직 없다. 지금은 신뢰 서명키·job store 쓰기 권한이 곧 전송 허가다. BIND05를 켜기 전에 닫혀야 한다 |
| BIND10 | 누적 공개 원장(security 요약 B8) | `released_history`가 매 job `[]`로 고정돼 있다. 같은 승인된 문장이 새 mission_id로 반복 재공개돼도 누적 기록이 없다. requester·mission family 단위로 살아남는 저장소와 "무엇을 공개로 친다"의 정의(패킷 필드? candidate bytes? 어느 round?)를 Owner가 정해야 닫힌다 |

## 경계가 실제로 닫혔는지 확인한 방법

1. **허가 없는 전송 0.** permit 파일이 없는 상태에서 `advance`는 `RELEASE_REVIEW`에서
   `PERMIT_REQUIRED`로 멈췄다. permit은 정확한 request bytes·route digest·job·mission·round·
   review·policy epoch에 묶이고 1회용이며, kit journal이 permit id 유일성을 durable하게 잡는다.
   단, 이 permit이 증명하는 것은 "설정에 고정된 신뢰 공개키(BIND09)로 서명이 검증됐다"까지다.
   검증 공개키는 이제 `permit_trust_pubkey_path`에서만 읽고 permit 파일 자신이 자칭하는 값은
   신뢰하지 않으므로 자기 서명 permit(다른 키쌍으로 서명한 permit.json을 직접 써넣는 것)은
   거부된다(검토자 재현 2026-09-06 및 회귀 시험). 다만 그 신뢰 키를 누가 쥐고 있는지에 대한
   신원 등록소는 없다 — 신뢰 서명키와 job store 쓰기 권한을 함께 쥔 무엇이든 permit을 승인할
   수 있다. 필드 검토 원장도 서명 없는 평범한 파일이다.
2. **검토 없는 literal 0.** 필드 검토 원장이 없을 때 M03은 `FIELD_REVIEW_REQUIRED`로 실패하고
   job은 `HOLD`로 내려갔다(관측: 46개 KEEP_REVIEWED 후보 전부 미승인). 원장을 채운 뒤에만
   `RELEASE_REVIEW`로 올라간다. 사이클 1호에서 그 46건의 필드 검토와 전송 허가는 모두 합성
   자료에 대해 lane 작성자 본인(`operator.cycle1.builder`)이 승인했고 사람의 별도 결정이
   아니다 — 합성 한정이며, 승인자와 작성자를 분리하는 것은 BIND06에서다.
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
5. permit 신뢰 키의 신원 결속(BIND09) — 신뢰 키 등록소 또는 OS 사용자 결속. BIND05 전에 닫는다.
6. 누적 공개 원장(BIND10) — requester·mission family 단위로 살아남는 저장소를 설계한다.

## 창구(B) — Hermes 봇 강도담 스킬 (2026-09-06)

`feat/secure-work-buzz-skill`(commit `43da5f637f14a6b4805592b9293c6b7a4805cbfb`)에서 Buzz DM
창구를 열었다. Hermes 루트 프로필(표시명 강도담)이 "사이클 시험"류 요청을 받으면 이 lane의
`sfx` 명령을 대신 실행하고 결과를 회신하는 스킬이다. 사이클 자체의 binding·상태는 바뀌지
않았다 — 여전히 `PILOT_SYNTHETIC_ONLY`다. 이 절은 그 스킬·lane·시험 결과만 기록한다.

### 스킬 위치

- 저장소 정본: `guild_hall/secure_work/hermes_skill/soulforge/secure-work-cycle/SKILL.md`.
  host 경로는 자리표시자(`<SECURE_WORK_LANE>`·`<SECURE_WORK_CONFIG>`·
  `<SECURE_WORK_PILOT_SOURCE>`)로만 남긴다.
- 설치 사본(git에 커밋되지 않음, WSL로 배치): `<home>/skills/soulforge/secure-work-cycle/SKILL.md`
  — 자리표시자를 lane 빌드 시점의 실제 절대경로로 치환한 버전.

### lane 위치

`guild_hall/deployment_pack/lanes/secure_work_lane.spec.json`으로 만든
`install/source-lanes/secure-work-lane-v1`(등록 예약작업 없음 — on-demand CLI 전용). 빌드
receipt: source commit `43da5f637f14a6b4805592b9293c6b7a4805cbfb`, 파일 21개(tracked 20 +
carried forward 1), manifest digest
`e59e11305dd55db060422686ee321337de0ff02d9853ddf64b6b01933a88c682`. `sfx.mjs`는 Node 내장
모듈만 import해 실제 미추적 의존성이 없다 — carried forward 1건은 진짜 런타임 파일이
아니라, `build_source_lane.mjs`의 "carried set이 비면 안 된다"는 불변조건을 만족시키기
위해 문서화해 둔 placeholder 1개뿐이다(spec의 `carried_forward_rationale` 참고). `--verify`로
21개 파일 0 실패 확인.

### 함께 고친 것 — `build_source_lane.mjs`의 Windows CLI 가드

이 lane을 처음 빌드하다가 그 도구의 자기 호출 가드(`import.meta.url`을 수작업 `file://` +
역슬래시치환 템플릿과 비교)가 Windows drive-letter 경로에서는 항상 거짓임을 발견했다 —
drive-letter 절대경로는 "file:" scheme 바로 뒤에 슬래시가 3개 와야 `import.meta.url`의
실제 모양과 같아지는데, 그 수작업 템플릿은 슬래시 2개짜리 URL만 만들어 어떤 Windows
실행에서도 같을 수 없었다. `main()`이 조용히
건너뛰어져 exit 0·출력 0·아무것도 안 만들어졌다 — 기존 시험 스위트는 export된 함수를
직접 호출해 이 가드를 거치지 않으므로 지금까지 드러나지 않았다. 표준 idiom인
`pathToFileURL(argv1).href` 비교로 고쳤고 기존 12개 시험은 그대로 통과한다(export 함수의
동작 자체는 바뀌지 않았다). 다른 lane의 향후 `--verify`/재빌드 CLI 호출도 이 수정으로
실제로 동작하게 된다 — 이전까지는 Windows에서 이 도구의 CLI 진입점 자체가 한 번도 실행된
적이 없었을 가능성이 있다(exported 함수를 직접 부르는 시험 경로만 검증되어 있었다).

### 회신 형식

스킬 본문(두 사본 모두)에 고정: job id·현재 상태(원문 phase + 쉬운 뜻)·이벤트/영수증
건수·산출 파일명(host 경로 제외)·다음에 필요한 것. 승인은 사람이 대화에 "승인"이라고 쓴
뒤에만 `sfx permit approve`를 실행한다 — 요청 문구 자체를 승인으로 해석하지 않는다.

### 셸 단독 시험 (2026-09-06, 봇 없이, 합성 자료만)

강도담 게이트웨이를 거치지 않고 스킬이 지시하는 명령을 그대로 실행했다(합성 pilot의 기존
6개 문서, pilot root는 사이클 1호가 이미 쓰던 것과 동일).

| 명령 | 결과 |
| --- | --- |
| `doctor` | M01·M02·M04·M05(원장·신뢰키)·M06(scripted) `AVAILABLE`; M06(openrouter)·M10(전부) `UNAVAILABLE`(키·bearer 없음 — 설계대로) |
| `request --recipe R1-07` | `job_id o_452459b07c050058ef7ea375c584d7b2`, phase `RECEIVED` |
| `advance --max-steps 10` | RECEIVED→SOURCE_PINNED→G2_PREPARED→RELEASE_REVIEW, `PERMIT_REQUIRED`에서 정지(`"ok": false`는 오류가 아니라 더 진행할 동작이 없다는 정직한 멈춤) |
| `status` / `events` | phase `RELEASE_REVIEW`, 이벤트 4건(제출 1 + 전이 3). field review는 필요하지 않았다 — 같은 합성 원문이 앞선 사이클에서 이미 필드 검토를 통과했기 때문 |
| lane 폴더에서 재실행 | `install/source-lanes/secure-work-lane-v1`로 cd해 같은 `doctor`·`status`를 재현 — 동일 결과 |

`permit approve`/`deny`는 실행하지 않았다 — 사람의 실제 "승인" 문구가 없는 셸 시험에서 그
경계까지 넘는 것은 스킬 자신이 지키기로 한 규칙과 어긋난다. `RELEASE_REVIEW` /
`PERMIT_REQUIRED`가 이번 시험의 HOLD 지점이다. 강도담 게이트웨이가 이 새 스킬 파일을
실제로 읽어 Buzz DM에서 트리거하는지는 확인하지 않았다(재시작 금지 — 아래 Owner 아침
확인 항목).

### Owner 아침 확인 (재시작 없이)

1. Buzz에서 강도담에게 "사이클 시험"류 문구로 DM을 보내 스킬이 실제로 트리거되는지 본다
   (다음 정기 재시작이나 기존 세션 갱신 시점에 반영된다 — 이 작업은 재시작을 하지 않았다).
2. 트리거되면 회신에 job id·phase·이벤트 건수·다음 필요 사항이 위 형식대로 나오는지 본다.
3. 대화에 "승인"이라고 직접 써서 승인 전에는 `permit approve`가 실행되지 않고, 승인 뒤에는
   실행된다는 것을 한 번 확인한다.

## 관련 문서

- [`guild_hall/secure_work/README.md`](../../../guild_hall/secure_work/README.md)
- [`../foundation/team_member_engineering_program/05_ENGINEERING_MCP_CLIENT_DATA_PLANE.md`](../foundation/team_member_engineering_program/05_ENGINEERING_MCP_CLIENT_DATA_PLANE.md)
- [`../foundation/SHARED_GLOSSARY_V0.md`](../foundation/SHARED_GLOSSARY_V0.md)
