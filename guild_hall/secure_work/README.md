# secure_work — 보호 가공 업무 lane (사이클 1호)

한 건의 업무 요청이 **원문을 로컬에 둔 채** 공개 가능한 packet으로 가공되고, 작업자가
결과를 돌려주면 로컬에서 복원·검증해 후보로 보관되는 한 바퀴를 실행하는 lane이다.

계약은 새로 만들지 않았다. 입출력·상태·오류 규격은 **E14 모듈 계약 kit**(SDD/ICD, M01~M10,
33개 포트)이 소유하고, 업무 recipe와 합성 fixture는 **E13 인계 패키지**가 소유한다. 두 패키지는
저장소 밖 읽기 전용 원본으로 두며 vendoring하지 않는다. 이 lane은 그 포트에 **어댑터를 붙이고**
상태를 돌리는 부분만 갖는다.

> 상태: 사이클 1호. 합성 자료만 사용했고, 외부 모델 호출 0회, 외부 업로드 0회다.
> 운영판이 아니며 결과는 언제나 후보다. 자세한 설계와 남은 binding은
> [`docs/architecture/guild_hall/SECURE_WORK_CYCLE_V0.md`](../../docs/architecture/guild_hall/SECURE_WORK_CYCLE_V0.md).

## 경계 (먼저 읽을 것)

- **합성 자료만.** 실제 회사 자료는 이 lane에 넣지 않는다. 실자료 canary는 별도 Owner 결정이다.
- **허가 없이 나가지 않는다.** 외부로 보낼 bytes는 승인된 permit이 정확히 그 bytes에 묶여
  있을 때만 전송된다. permit이 없으면 엔진은 `RELEASE_REVIEW`에서 멈춘다.
- **매핑·키·원문은 로컬에만.** 슬롯의 실제 값, 복원 장부, 키는 packet·영수증·이벤트·로그 어디에도
  들어가지 않는다. 영수증은 digest·상태·건수·오류 코드만 갖는다.
- **결과는 후보다.** 이 lane에는 정본 승격도, 업무 완료 표시도, 수락 API도 없다.
- **자기 승인 금지(설계상), 신원 결속은 아직 파일 소유 기반.** 필드 검토와 전송 허가는 CLI 밖의
  결정이고 엔진은 읽기만 한다. permit은 설정에 고정된 신뢰 공개키(BIND09)로만 검증되어 permit
  파일 자신이 공개키를 자칭할 수는 없다. 다만 그 신뢰 키를 누가 쥐고 있는지에 대한 신원 등록소는
  아직 없다 — 사이클 1호에서 실제 경계는 "신뢰 서명키·job 저장소에 쓸 수 있는가"다. 사이클 1호의
  필드 검토 46건과 전송 허가는 합성 자료에 대해 lane 작성자 본인(`operator.cycle1.builder`)이
  수행했고 사람의 별도 결정이 아니다 — 합성 한정이며, 승인자와 작성자를 분리하는 것은 BIND06에서다.
- **숨은 추론은 읽지 않는다.** 로컬 모델의 `reasoning_content`류 필드는 읽지도 저장하지도 않는다.

## 배치

| 무엇 | 어디 | 비고 |
| --- | --- | --- |
| 이 lane의 코드 | `guild_hall/secure_work/` | 저장소 안, public-safe |
| E14 계약 kit / E13 recipe | `<TOOL_ROOT>/secure-work-kit/**` | 저장소 밖, 읽기 전용 원본 |
| Python 환경 | `<TOOL_ROOT>/secure-work-venv` | kit의 고정 버전만 설치 |
| 작업 루트(합성 자료·매핑·영수증) | `<PILOT_ROOT>` | 저장소 밖 |
| 상태 요약 1파일 | `<STATE_ROOT>/ops-lane/operations/secure_work/status.json` | Vigil(포트 4192) probe용, 원문·매핑 없음 |
| 외부 provider 키 / Tongs(MCP 문) bearer | `<private_root>/config/secure_work/credentials/` | Owner만 배치, 이 lane은 존부만 확인 |
| permit 신뢰 공개키 / 서명키(BIND09) | `<private_root>/config/secure_work/permit_trust.pub` / `.../credentials/permit_trust.key` | 파일 없으면 `PERMIT_TRUST_UNBOUND`/`PERMIT_SIGNER_UNBOUND`로 거부, 어떤 permit도 수락 안 함 |

저장소 안의 파일에는 실제 host 경로를 쓰지 않는다. 실제 값은 `config.example.json` 형태의
JSON 한 장에 담아 저장소 밖에 두고 `SOULFORGE_SECURE_WORK_CONFIG`로 가리킨다.

이 lane에는 아직 `module.manifest.json`이 없다. `module_operability` preflight는 미등재
guild_hall 디렉터리를 위반이 아니라 카운트로만 다루므로 게이트는 초록이지만, 등재를 미룬
이유는 명시해 둔다 — 사이클 1호는 pilot 상태(`PILOT_SYNTHETIC_ONLY`)이고 binding 표(위)가
아직 여럿 `NOT_BOUND`라, 계약 표면이 굳기 전에 manifest를 등록하면 다시 고쳐야 한다. lane이
pilot을 벗어나면 등록한다.

## 왜 Node 진입점 + Python 엔진인가

- 이 저장소의 명령 표면은 `npm run <script>` 위의 Node CLI다. lane 하나만 다른 모양이면
  검사·문서·호출 관례가 갈라진다. 그래서 진입점 `sfx.mjs`는 Node다.
- 엔진은 Python이어야 한다. E14 kit의 참조 코어(`sf_sewe`: projection, vault, permits,
  journal, artifacts)가 Python이고, 그 계약을 Node로 다시 구현하는 것은 kit의 구현 계약이
  명시적으로 금지한 재발명이다.
- 그래서 `sfx.mjs`는 로직을 갖지 않는다. 설정을 읽고, 거기 적힌 인터프리터를 찾고, 인자와
  종료 코드를 그대로 통과시킨다. 설정이 없거나 인터프리터가 없으면 코드 하나로 실패한다.

## 명령

```sh
node guild_hall/secure_work/sfx.mjs doctor
node guild_hall/secure_work/sfx.mjs request --recipe R1-07 --source <PILOT_ROOT>/source \
    --requester <ref> --mission "<미션명>"
node guild_hall/secure_work/sfx.mjs advance --job <job> --max-steps 10
node guild_hall/secure_work/sfx.mjs permit approve --job <job> --actor <ref>
node guild_hall/secure_work/sfx.mjs permit deny --job <job> --actor <ref>
node guild_hall/secure_work/sfx.mjs status [--job <job>]
node guild_hall/secure_work/sfx.mjs events --job <job>
node guild_hall/secure_work/sfx.mjs keys init-pilot --out <pilot 밖 디렉터리>
```

- `doctor` — 어댑터 가용성 표. 키 파일·bearer는 **존재와 크기만** 본다.
- `request` — 미션 접수. 설정에 묶인 작업 루트의 source 디렉터리만 읽을 수 있다.
- `advance` — 현재 상태에 맞는 다음 동작 하나(또는 `--max-steps`만큼)를 엔진이 고른다.
  막히면 그 자리에서 멈추고 코드를 돌려준다. 대신 성공을 지어내지 않는다.
- `permit approve|deny` — 전송 허가. 정확한 request bytes·route·job·round·review·epoch에
  묶인 1회용 permit을 만든다. 서명은 설정에 고정된 신뢰 키(`permit_trust_signing_key_path`,
  Owner 배치)로만 하며, 이 CLI가 매번 새 키쌍을 만들어 자기 자신을 검증하지 않는다 — 그 키가
  없으면 `PERMIT_SIGNER_UNBOUND`로 거부한다. 검증도 같은 짝의 공개키(`permit_trust_pubkey_path`)
  를 설정에서만 읽으며, permit 파일이 자칭하는 공개키는 절대 신뢰하지 않는다.
- `status` / `events` — 상태 투영과 이벤트 원장.
- `keys init-pilot --out <dir>` — 합성 파일럿용 임시 permit 신뢰 키쌍을 **pilot root 밖**
  지정 디렉터리에만 만든다(이미 있으면 거부, pilot root 안이면 거부). stdout과 옆의
  README에 "시험 전용, Owner 키로 교체 전 BIND05 금지"를 명시한다. kit 바인딩이 필요 없다.

## 한 바퀴가 지나는 상태

```text
RECEIVED → SOURCE_PINNED → G2_PREPARED → RELEASE_REVIEW → READY → RUNNING
        → RESULT_QUARANTINED → STRUCTURE_CHECKED → BOUND → REVIEW_PENDING
        → CANDIDATE_READY → CUSTODY_PENDING → (CUSTODY_ACKNOWLEDGED)
```

전이는 E14 `registry/state_machine.json`이 허용한 것만, kit의 journal(CAS + 멱등 명령)로
기록한다. 필드 검토가 없으면 `HOLD`, 전송 허가가 없으면 `RELEASE_REVIEW`, Tongs bearer가
없으면 `CUSTODY_PENDING`에서 멈춘다.

## 어댑터

| E14 | 붙인 것 | 상태 |
| --- | --- | --- |
| M01 source | 파일 시스템 exact revision 읽기(sha256 + byte span) | 동작 |
| M02 local manager | OpenAI 호환 로컬 endpoint(`127.0.0.1:18080/v1`) | 동작, 제안은 CODE가 재검증 |
| M03 projection | kit 참조 구현 | 동작 |
| M04 vault | kit SQLite vault + 로컬 파일 키 래퍼 | 동작, **키 래퍼는 시험 전용** |
| M05 release authority | 필드 검토 원장 + 1회용 permit CLI 승인 | 동작, 자동 승인 없음 |
| M06 transport | scripted worker(별도 프로세스) / OpenRouter 뼈대 | scripted 동작, 외부 route는 키 부재로 미바인딩 |
| M07 state engine | kit journal(SQLite CAS) | 동작 |
| M08·M09 result | kit 구조검사 + Markdown 복원 + ValidationReport | 동작 |
| M10 custody | 로컬 outbox + 기존 IngressClient를 쓰는 합성 검증 포트 | 합성 loopback 검증, 실제 승인·자격증명 연결 미바인딩 |

키 래퍼(`<PILOT_ROOT>/vault/keywrap.local`)는 **시험 전용** 키다. 생성 시 `0o600`을
주지만 Windows에서는 그 모드가 적용되지 않고 상위 디렉터리 ACL을 그대로 상속하므로,
실제로는 로컬 사용자 모두가 읽을 수 있다(관측 2026-09-06). 초기화 시 `icacls`로 현재
사용자 단독 접근을 시도하고 결과(적용/실패, 값·경로는 미기록)를 키 옆의 영수증 파일에
남기며, 실패하면 `doctor` 표에 경고가 뜬다. 합성 자료 전용인 이유가 이것이다.
E14가 `KEY_WRAPPER_TEST_ONLY`로 분류한 것과 같은 등급이며, OS 보호 저장소 전에는
운영 키 소유자를 대신하지 않는다.

## 검사

```sh
npm run validate:secure-work           # Node 진입점: 구문 + fail-closed 경계 (5건)
```

어댑터·permit 신뢰 경계 시험(26건)은 Python 쪽에 있다. 14건은 kit 없이도 돌고, 나머지
12건은 kit과 venv가 있는 호스트에서만 의미가 있다.

```sh
SOULFORGE_SECURE_WORK_CONFIG=<config> \
  <TOOL_ROOT>/secure-work-venv/Scripts/python.exe -m pytest -q guild_hall/secure_work/tests
```

kit이 묶이지 않은 곳에서는 kit이 필요한 12건만 skip되고 나머지 14건은 그대로 돈다.

### M10 사이클 2호 기능 조각

기존 `TongsCustodyAdapter`의 생성자와 `deposit` 위치 인자는 유지한다. 새 keyword 인자
`input_revision`, `expected_sha256`, `expected_size`는 정확한 후보에 필수다. 입력 revision은
엔진의 source bundle digest·base candidate revision·round에서 만든 불투명 식별자이며,
ingress occurrence에도 결속된다. `custody_bridge.mjs`는 기존
`ui-workspace/apps/dev-erp-mcp/src/ingress_client.mjs`를 그대로 호출한다. 별도 전송 프로토콜이나
수락 API를 만들지 않으며, Tongs 제어 포트를 ingress 주소로 해석하지 않는다.

- 후보 bytes·크기·프로젝트 scope·input revision·route·principal·occurrence·idempotency를
  로컬 `custody.sqlite`의 durable intent에 먼저 고정한다. 같은 key의 다른 결속은 충돌이다.
  서버의 제출 ID를 받으면 그 ID만 재조회하며, 응답 유실로 ID가 없으면 같은 ingress key로
  재시도한다. 이 포트는 자체 자동 재시도 루프를 만들지 않는다.
- bridge는 후보를 hash/size 검사한 임시 snapshot으로 읽고, 실제 보내는 chunk도 그 bytes와
  비교한다. 매 chunk/finalize 전 현재 `whoami`의 account/device/agent·project·capability를
  확인한다. 이는 방어를 추가하는 것이며 수신 서버의 권한 집행을 대신하지 않는다.
- 응답은 32 KiB 이하의 고정 필드·타입·제출 ID·project·lane·SHA·size만 받는다. 다른 응답은
  차단하고 로컬 격리 장부에는 digest와 코드만 남긴다. 오류에는 원문·traceback을 출력하지 않는다.
- `pending_server_ack`는 `CUSTODY_PENDING`에 남는다. `verified_server_ack`를 개별 조회로
  확인하고 로컬 결속을 durable하게 저장한 뒤에만 `CUSTODY_ACKNOWLEDGED`로 진행한다.
  응답 뒤에도 Node가 현재 principal/권한/만료를 확인하고, Python은 SQLite ACK 변경 직전에
  같은 binding·principal의 현재 권한을 다시 확인한다. 그 사이 권한 회수·변경·만료가 생기면
  로컬 ACK를 기록하지 않는다. 이미 보낸 요청과 원격 보관을 취소했다는 뜻은 아니며,
  durable intent를 보존해 권한 복구 뒤 같은 제출을 다시 확인한다.
  두 상태 모두 제출 접수일 뿐이며 `review_state: NOT_OBSERVED`, `accepted: false`다.
  World Tree의 개별 검토 증거가 없으므로 「검사 중」 착지를 주장하지 않는다.

**M10 검증기와 호출 연결은 구현됐고, 실제 설치 결속은 없다.** Python과 Node는 설치본의
고정 `custody_runtime_binding.json`을 읽는다. 저장소 값은 `null`이다. 승인된 불변 launcher가
이 파일과 실행본을 독립적으로 고정해야 하며, 그 전제 없이 파일이 자기 owner/hash를 선언한
것을 신뢰하지 않는다. argv·stdin·job·환경변수·일반 설정은 이 신뢰점을 대신할 수 없다.
`live_enabled` 기본 false를 유지하며, 실제 결속 없음은 `CUSTODY_RUNTIME_AUTHORITY_HOLD`다.

설치 결속의 내부 입력은 config의 경로·SHA, trust owner SID, Node와 OS 관측 실행기의 경로·
SHA다. 고정 config는 정책의 경로·SHA와 승인 파일 root를 가리킨다. 정책은 M10 행위·epoch·
만료/폐기·approver/sender SID·프로젝트·route·ingress principal·신뢰 공개키·서명키 위치·
실행 코드 hash를 결속한다. 승인 서명은 exact candidate binding digest·정책 SHA/epoch·issuer·
발급/만료에 묶인다. M06의 permit을 custody 권한으로 전용하지 않는다. 이들은 모듈 내부
입력 계약이며 새 canon owner, 정책 저장소 또는 승인 발행 API가 아니다.

`custody_authority.mjs`의 실제 Windows 관측기는 현재 token SID·그룹·보유 privilege와 파일/
상위 디렉터리 owner·Allow ACE·reparse 여부를 읽는다. sender가 approver와 같거나, 관리자/
위험 privilege를 갖거나, 신뢰·실행 파일에 쓰기 권한이 있거나, 서명키를 읽을 수 있으면 거부한다.
Allow ACE는 Deny가 가리는 경우에도 보수적으로 거부할 수 있다. Python에서 나온 검증 필드는
Node의 권한원이 아니며 Node가 매 송신 경계에서 다시 확인한다. bearer 값은 이 검증 뒤
고정 credential 경로에서만 읽고 프로세스 환경·stdout·영수증으로 전달하지 않는다.

이번 범위는 **M10 sender 측 부분 검증**이다. Python과 Node는 같은 sender SID를 상속하며
이를 역할 분리로 주장하지 않는다. 실제 Owner 설치/launcher 결속·분리 계정 증거는 아직 없고,
M06 worker가 source·vault·job store·서명키에 접근하지 못한다는 실제 token/접근 시험과
전체 BIND09·M07 1회 소비 경계는 후속 구현·검증 대상이다. 실제 키 배치만으로 닫히지 않는다.

남은 **코드 작업**은 불변 launcher의 신뢰점 등록/실행 연결과 전체 전이 의존성 무결성 검사,
M06 worker의 별도 principal 격리, M07의 durable 1회 소비 통합이다. **Owner 입력/설치 작업**은
실제 역할 SID·승인 정책·route·binding 값 확정과 해당 계정/ACL 배치다. 두 종류의 공백을
구분하며, Owner 값만 채우면 남은 코드가 자동으로 완성된다고 주장하지 않는다.

합성 시험은 저장소 manifest의 ingress 의존성 외에는 Python kit·pytest·실제 키가 필요 없다.
임시 ingress 서버는 OS가 고른 loopback 포트에서만 실행한다.

```sh
python -m unittest discover -s guild_hall/secure_work/tests -p test_custody_contract.py -v
node --test --test-timeout=30000 guild_hall/secure_work/tests/custody_bridge.test.mjs
node --test guild_hall/secure_work/tests/custody_authority.test.mjs
npm run validate:secure-work
```

Python 시험은 durable intent/ACK, crash·변경 충돌·격리, engine의 M10 전이 호출까지 검사한다.
E14 journal 전체를 흉내 내지 않으며, kit 미바인딩 상태에서 전체 사이클 시험을 했다고
주장하지 않는다. Node 시험은 실제 IngressClient와 임시 ingress 서버로 정확한 bytes,
같은 제출 재시도, 개별 ACK와 전송 직전 권한 변경을 검사한다. 코드 상태는 독립 검토 전
후보이며 운영 활성화·실자료 canary·사람 수락 증거가 아니다.

Windows 자기 관측 시험은 새 임시 합성 파일의 token/ACL 메타데이터만 읽고 ACL을 바꾸지
않는다. 분리된 실제 역할의 접근 거부 증거는 아니다. 저장소의 Python 시험은 격리 환경에서
실행할 수 있으며, pytest 부재를 Owner 승인 문제로 취급하지 않는다. E14 kit 미바인딩 시
그 kit에 의존하는 시험만 skip한다. 기존 ingress의 제출 저장 후 티켓 갱신 전 중단 복구도
실제 서비스 fault injection으로 검사하며, identity·bytes·멱등 색인이 다르면 복구하지 않는다.

## 지금 못 하는 것

- 외부 모델 호출. provider 키 파일이 없고 `live_enabled`가 꺼져 있다. 사이클 1호의 작업자는
  모델이 아니라 scripted worker다.
- 실제 Tongs 업로드. M10 검증기/loader는 연결됐지만 독립적으로 고정된 Owner 설치 결속과
  실제 역할 분리 증거가 없어 후보는 로컬 outbox에 남는다. 합성 포트 시험 통과가 실제
  업로드 권한이나 사이클 완성을 뜻하지 않는다.
- 의미 검토. 구조 검사는 통과해도 문장의 의미가 맞는지는 판정하지 않는다
  (`STRUCTURAL_PASS_SEMANTIC_REVIEW_REQUIRED`).
- 일반적인 비공개 보장. 유출 검사는 "이 lane이 이미 로컬로 정한 문자열이 나가는 bytes에
  들어 있는가"만 답한다. 자동 분류기가 아니다.
