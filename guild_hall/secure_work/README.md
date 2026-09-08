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

### G2 Linear custody 조회 후보

기존 설치 진입점의 `--g2-custody-inspect`는 현재 SOURCE 권한과 수집 영수증에
결속된 자료를 읽고 메타데이터만 반환한다. 설치 복사본의 합성 검사를 통과했으며
실제 권한·배치·G1 공개 투영 발행은 별개다. 결속 값과 주장 한계는
[G2_LINEAR_CUSTODY.md](G2_LINEAR_CUSTODY.md)를 따른다.

M02 `LocalManagerAdapter`는 각 요청에서 숫자로 된 loopback 주소를 다시 검사하며
환경 proxy와 HTTP redirect를 사용하지 않는다. 잘못된 주소·절단 응답 등은 사용 불가로
반환한다. HPP에는 이 Python 패키지의 소스도 포함하지만 외부 E14 kit·Python runtime·
모델 배치·실제 권한은 별도 결속 대상이며 소스 전달이 운영 검증은 아니다.

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
  설치 경로에는 아래의 현재 OS 역할·과제 정책 검증과 OS 신원 결속 byte broker를
  추가했다. 실제 설치·다른 SID 사이 접근 격리 증거는 아직 없으며 전체 BIND09 완료로 세지 않는다.
- **숨은 추론은 읽지 않는다.** 로컬 모델의 `reasoning_content`류 필드는 읽지도 저장하지도 않는다.

## 배치

| 무엇 | 어디 | 비고 |
| --- | --- | --- |
| 이 lane의 코드 | `guild_hall/secure_work/` | 저장소 안, public-safe |
| E14 계약 kit / E13 recipe | `<TOOL_ROOT>/secure-work-kit/**` | 저장소 밖, 읽기 전용 원본 |
| Python 환경 | `<TOOL_ROOT>/secure-work-python` | 전체 runtime과 `_pth` 시작 경로를 고정한 별도 설치 입력 |
| 작업 루트(합성 자료·매핑·영수증) | `<PILOT_ROOT>` | 저장소 밖 |
| 상태 요약 1파일 | `<STATE_ROOT>/ops-lane/operations/secure_work/status.json` | Vigil(포트 4192) probe용, 원문·매핑 없음 |
| 외부 provider 키 / Tongs(MCP 문) bearer | `<private_root>/config/secure_work/credentials/` | Owner만 배치, 이 lane은 존부만 확인 |
| permit 신뢰 공개키 / 서명키(BIND09) | `<private_root>/config/secure_work/permit_trust.pub` / `.../credentials/permit_trust.key` | 파일 없으면 `PERMIT_TRUST_UNBOUND`/`PERMIT_SIGNER_UNBOUND`로 거부, 어떤 permit도 수락 안 함 |

저장소 안의 파일에는 실제 host 경로를 쓰지 않는다. 실제 값은 `config.example.json` 형태의
JSON 한 장에 담아 저장소 밖에 두고 설치 launcher가 exact 경로·SHA를 고정한다.
`SOULFORGE_SECURE_WORK_CONFIG`나 `--config`는 실행 결속을 선택할 수 없다.

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
- `sfx.mjs`는 Node builtin만으로 설치 신뢰점·현재 OS custody·전체 runtime 파일 집합을
  검사한 뒤 Python 또는 보관 bridge를 실행한다. 설치 결속이 없으면
  `SECURE_WORK_LAUNCH_HOLD`로 실패하며 Python/SDK를 먼저 실행하지 않는다.

## 명령

아래 명령은 독립적으로 고정된 설치본의 명령 표면이다. 저장소의 launcher anchor와
`custody_runtime_binding.json`은 `null`이므로 소스 checkout 실행은 보류된다.

```sh
node guild_hall/secure_work/sfx.mjs doctor
node guild_hall/secure_work/sfx.mjs request --recipe R1-07 --source <PILOT_ROOT>/source \
    --requester <ref> --mission "<미션명>"
node guild_hall/secure_work/sfx.mjs advance --job <job> --max-steps 10
node guild_hall/secure_work/sfx.mjs permit approve --job <job>
node guild_hall/secure_work/sfx.mjs permit deny --job <job>
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
  설치 CLI의 actor는 현재 OS 신원과 고정 역할 정책에서만 얻는다. `--actor`, `--role`,
  `--principal`로 caller가 신원을 지정할 수 없다. 기존 모듈 직접 호출은 합성 시험의 seam이다.
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
| M06 transport | OS named-pipe sender/worker broker / OpenRouter 뼈대 | 실제 local pipe 합성 프로토콜 검증, 다른 SID 설치·접근 격리 NOT_RUN |
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

기존 합성 Python/Node 포트는 계정을 상속했다. 현재 M10은 아래 목적별 custody sender로
controller의 승인 조회·candidate byte 전달·ACK 재확인을 연결한다. M06 byte broker는
공개 packet만 전달하며 별도 M10 승인/호출을 대신하지 않는다. 구형 `--custody-bridge`의
상속 호출은 제거했다. 합성 종단과 실제 역할 설치는 별개의 검증이다.
실제 Owner 설치/launcher 결속·분리 계정 증거는 없고,
M06 worker가 source·vault·job store·서명키에 접근하지 못한다는 실제 token/접근 시험과
전체 BIND09 신원 경계는 후속 구현·검증 대상이다. M07의 file-owned 1회 소비·재시작
보강은 아래 절의 범위에서 검증됐으며, 실제 키 배치만으로 전체 경계가 닫히지 않는다.

불변 launcher의 코드 연결과 전체 전이 의존성 검사, M06 공개 byte 전달은 아래 범위로 구현했다.
M07 journal은 controller에만 두어 별도 principal에 원장/저장 경로를 배포하지 않는다.
M10 승인 포트의 역할 전달도 아래 범위로 구현했다. 남은 **통합 작업**은 실제 역할
설치·접근 격리 입증, 기존 TrustedContext owner와 전체 BIND09 정책의 통합이다. 현재 역할 정책 consumer와 M07의
파일 소유 기반 합성 1회 소비·재시작 검증 범위는 아래와 같다. **Owner 입력/설치 작업**은
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

## M07 1회 소비와 재시작

기존 E14 `Journal`의 SQLite `synchronous=FULL`, permit/attempt UNIQUE 예약과
`RESERVED → IN_FLIGHT → RESPONSE_RECEIVED | DELIVERY_UNKNOWN`을 그대로 사용한다.
송신 전에 예약과 IN_FLIGHT가 durable하게 기록되며 별도 소비 장부·새 상태기계를 만들지 않는다.
`dispatch.controller_lock`은 job별 로컬 OS 잠금으로 협력하는 controller를 배제한다.
Windows byte-range lock과 POSIX flock은 controller 종료 때 해제되지만 소비 기록은 남는다.
잠긴 동안 다른 advance는 `DISPATCH_BUSY`이고, SQLite transaction을 I/O 동안 잡지 않는다.

engine은 RUNNING 진입 전, 실제 transport 호출 직전, 응답 후, 최종 전이 직전에 현재
permit 결정·신뢰 공개키·서명/만료·code policy epoch·job/mission/round·review·exact body/route와
source/assignment/work/plan을 다시 확인한다. source는 현재 bytes를 재추출해 고정 bundle과
대조하고 literal field review도 다시 읽는다. journal revision과 RUNNING 상태를 CAS로
결속하므로 취소·구버전 전이 뒤의 늦은 응답은 후보로 진행하지 않는다. 실패 경로가 오래된
job snapshot으로 현재 정책 변경을 덮어쓰지 않는다. 오류에는 원문·provider 오류·issuer 값을
출력하지 않는다.

재시작은 `advance`의 RUNNING 경로에서 같은 잠금을 얻은 뒤 처리한다.

| durable 증거 | 처리 |
| --- | --- |
| RUNNING, attempt 없음 | 기존 protocol상 transport 호출 전이다. 현재 binding/권한을 다시 검증해 1회 예약부터 재개 |
| RESERVED | IN_FLIGHT 전에 끝난 증거이므로 NOT_SENT로 기록. 소비는 환불하지 않음 |
| IN_FLIGHT | DELIVERY_UNKNOWN으로 복구. 응답 파일이 있어도 임의 수락/재송신하지 않음 |
| RESPONSE_RECEIVED + exact reply/marker + 현재 binding/권한 | 송신 없이 RESULT_QUARANTINED로 재개 |
| NOT_SENT, DELIVERY_UNKNOWN, 응답/marker 손실·변조 | STOP 유지. 같은 permit 자동 재사용 없음 |

응답은 transport 복귀 전에 file fsync와 원자 교체로 저장하고 digest·크기·attempt·binding
marker를 기록한다. E14가 RESPONSE_RECEIVED를 기록한 뒤에만 복구 대상으로 삼는다.
파일 교체와 SQLite를 하나의 분산 transaction이라고 주장하지 않는다. 중간 crash나
전원 손실로 marker/bytes가 불완전하면 DELIVERY_UNKNOWN이며, 부분 파일은 결과가 아니다.

미송신·불명 상태의 재시도는 독립 확인과 새 검토를 거친 **새 job**으로만 수행한다. 이 버전은
같은 job의 소비를 초기화하는 CLI나 provider 조회·재전송을 만들지 않는다. 소비가 있는 HOLD는
field review 파일이 있다는 이유만으로 자동 재개되지 않는다. end-to-end exactly-once나
이미 보낸 요청 취소를 주장하지 않으며, 결과의 `accepted: false`는 그대로다.

이번 현재 권한 검사는 기존 **파일 소유 기반 합성 경계**다. 별도 승인자 신원 등록소·동적
정책 authority·M06 OS principal 격리를 대신하지 않는다. 불변 launcher의 코드 연결과
의존성 검사는 아래 합성 범위이고, 실제 설치/분리 접근 증거는 없다. 전체 BIND09와 M06은
남은 구현과 실제 분리 접근 시험이 필요하며 Owner 값/키 배치만으로 완성되지 않는다.

```sh
python -I -B guild_hall/secure_work/tests/test_dispatch_lock.py
SOULFORGE_SECURE_WORK_KIT_ROOT=<TOOL_ROOT>/secure-work-kit \
  python -I -B -m pytest -q guild_hall/secure_work/tests/test_dispatch_restart.py
```

OS 잠금 시험은 stdlib만 필요하다. E14 통합 시험은 runtime config·vault·키 파일·ACL·network
없이 합성 자료와 프로세스 메모리 안의 공개된 시험용 서명값만 사용한다. 실제 child에서
예약/호출/응답 저장 전후 강제 종료, 동시 controller, 응답 유실/변조, 호출 직전 회수,
응답 대기 중 회수·epoch/source 변경·취소와 새 프로세스의 재개를 확인한다.

## 고정 launcher와 전체 실행 의존성

`sfx.mjs`의 `INSTALLATION_ANCHOR`와 기존 `custody_runtime_binding.json`은 저장소에서
`null`이다. 기존 installer가 `renderInstalledLauncher(source, anchor)`로 생성할 수 있는 것은
고정 소스 bytes뿐이다. 이 함수는 등록·ACL·계정·예약작업·활성화를 수행하지 않는다.
설치 anchor는 설치 root, trust owner SID, binding SHA, Node와 OS 관측 실행본 pin을 고정한다.
caller argv/env/job는 이 값이나 검증자를 바꾸지 못한다. binding은 기존 M10 입력에 내부
`launch` 필드를 더하며, 별도 schema/정본/승인 발행 체계를 만들지 않는다.

`launch.roots`는 각각 exact `path`와 전체 `files[{relative_path,sha256}]`다. 기존 source-lane
전체 목록 방식으로 추가·누락·변조·중복·symlink/junction·사용자 코드 hardlink를 거부한다.
고정 launcher와 자신을 가리키는 binding은 순환 hash를 만들지 않도록 설치 root 목록에서만
제외하며 독립 설치 anchor/OS custody가 소유한다. config는 별도 고정 경로·SHA로 확인한다.
Node 실행 디렉터리·Python 실행 디렉터리와 stdlib/native 파일·모든 Python source·E14 kit·
recipe·IngressClient·전이 SDK와 package metadata를 전체 root 목록으로 묶는다. 한 실행에서
관찰된 import만 수집한 목록은 사용하지 않는다. 외부 kit/runtime은 복사·재배포하지 않고
명시된 read-only 설치 root를 결속한다. 업무 source·vault·job/outbox·상태·credential/key
경로와 겹치는 root는 inventory 전에 거부하며, 목록 자체도 credential형 이름을 거부한다.
root 자체·모든 상위 경로 성분·재귀 entry에서 `working`, `_workspaces`, `_workmeta`,
`canonical` 및 대소문자·`working-data`/`canonical_bytes`/`workspace`/`workmeta` 같은
표기 변형을 폴더 열람이나 파일 읽기 전에 거부한다. 이름 검사는 추가 방어일 뿐, 일반 이름의
폴더에 업무 데이터가 없다는 증명이 아니다. config에 명시된 금지 경로와의 겹침 검사 및
installer가 root를 코드·runtime 전용으로 확정할 의무는 그대로다.

Python은 고정 `python.exe` 옆의 정확한 `python._pth`가 `python_paths`와 일치해야 한다.
다른 `_pth`·`import site`·임의 시작 경로를 거부하고, `-I -S -B -X utf8`로 시작해 상속 환경과
cwd를 검색 경로에서 뺀다. 지원 범위는 명시된 normal directory와 source/native module이다.
venv의 외부 base runtime, zip stdlib, sourceless/custom loader를 조용히 허용하지 않는다.
Python 초기 encodings/stdlib/DLL은 Python hook 전에 실행되므로 Node 전체 검사가 먼저다.
이후 Python source는 확인한 bytes를 직접 compile해 기존 `.pyc`를 선택하지 않으며, Node
resolve/load hook은 승인 목록 밖 파일과 변경된 동적 import를 거부한다.

config load·kit bind·engine 요청/각 step/전이·송신 현재 결속 검사, scripted worker와 M10
bridge 재실행은 고정 launcher를 다시 통과한다. bridge는 검증 후 SDK를 동적으로 import하며
각 송신 경계의 기존 권한 재검사에 현재 전체 generation 검사도 묶는다. 직접 bridge/CLI 실행은
거부한다. 전체 root의 byte/metadata 재검사는 비용이 있으므로 실제 runtime 크기에서 성능을
측정해야 하며, 합성 시험의 짧은 실행 시간을 설치 SLA로 확대하지 않는다.

**신뢰의 시작은 이 JavaScript보다 앞의 installer/OS다.** 승인된 비패키지 OS 실행면이
고정 Node·launcher·cwd와 깨끗한 환경으로 실행하고 generation 및 상위 경로를 sender에게
불변으로 유지해야 한다. `NODE_OPTIONS`의 preload와 OS DLL loader는 JavaScript 시작보다
앞서므로 뒤의 검사만으로 안전해지지 않는다. Node와 OS 관측기의 시스템 DLL/Windows는
OS 신뢰 기반이며, Windows 관측 실행본의 WinSxS hardlink는 그 pin/OS custody 범위에서만
허용한다. 실제 설치·계정·ACL·launcher 등록 증거는 아직 없고, 자기 선언 hash나 생성 파일
존재만으로 준비 완료를 주장하지 않는다. 같은 sender SID를 상속하는 worker는 M06 격리가 아니다.

검증은 합성 root/fake role metadata와 명시적 test runtime만 사용한다. 실제 설치/키/config,
운영 서비스 또는 E14 원본은 이 시험의 입력이 아니다.

```sh
node --test guild_hall/secure_work/tests/launch_binding.test.mjs
python -I -S -B guild_hall/secure_work/tests/test_launch_runtime.py
npm run validate:secure-work
```

## 현재 역할·과제 정책과 worker 등록 사전 검사

`execution_authority.mjs`는 E14 `ports.TrustedContext`와 기존 `release.issue`/`model.dispatch`
규칙을 따르는 **설치 입력 consumer**다. config에 고정한 `execution_authority.policy_path`와
`policy_sha256`를 현재 설치 무결성과 OS owner/ACL 관측 뒤 읽는다. 별도 정책 발행기·신원
등록소·schema·소비 원장·승인 영수증은 만들지 않는다. 정책과 key 경로를 caller의 env/argv/job로
지정할 수 없으며, 저장소의 실제 설치 anchor/binding은 계속 `null`이다.

내부 입력의 `roles`는 controller/sender/worker/reviewer 각각의 SID·principal ref·purpose·
capability를 고정한다. 네 SID와 ref는 서로 달라야 하고 설치 trust owner도 실행 역할과
달라야 한다. 관리자/위험 privilege·미등록 SID·잘못된 purpose·빠진 capability·동일 역할
alias는 거부한다. `context`는 project·assignment와 epoch·task ref·route digest·audience를,
정책은 현재 epoch·만료·폐기 여부와 permit 공개키 digest/issuer를 묶는다. 역할 명칭을
요청에 적었다는 사실은 권한이 아니다. 실제 token SID와 현재 파일·정책 검사는 매번 다시 한다.

| 실행 지점 | 필수 역할·검사 |
| --- | --- |
| controller CLI·요청·advance | controller / SOURCE, 해당 `jobs.*` capability와 현재 과제 scope |
| permit approve/deny | reviewer / KEY_SERVICE, 현재 과제·route·epoch, 외부 고정 서명키 custody |
| READY의 permit 신원 결속 | 승인 actor/ref와 내부 E14 `key_id`가 고정 reviewer/issuer와 일치 |
| permit 소비 전 | controller / SOURCE·현재 jobs.advance와 설치 byte-channel 계약 검사. OS lock·M05 검증·M07 예약/IN_FLIGHT는 controller 소유 |
| `--sender` | 별도 sender / G3_PROVIDER·model.dispatch와 고정 등록 검사 뒤 1회 byte relay 대기 |
| `--worker` | 별도 worker / G3_PROVIDER와 고정 등록 검사 뒤 1회 byte 처리 대기. controller가 상속 token으로 시작하지 않음 |

서명키 metadata 검사에서 controller/sender/worker·광범위 그룹·미등록 principal에 읽기를
허용한 키는 거부한다. 검증기는 private key bytes를 읽지 않는다. 서명 함수는 현재 역할의
principal·purpose·route·epoch·audience와 발급 인자를 **키 접근 전에 직접 대조**하고,
permit 만료를 역할 정책 만료 이내로 제한한다. 실제 서명키 fingerprint도 일치해야 하며
서명 뒤 현재 역할/만료를 다시 확인한다. 기존 E14 서명 검증·1회 소비 journal을 대체하거나
기존 필드/분류 검토를 자동 승인하지 않는다.

`--worker-preflight`는 설치에 고정한 단일 등록 작업의 XML digest·worker principal·제한된
실행 수준·logon 유형·고정 Node/launcher/인자/cwd·task owner/Allow ACL을 읽어 대조한다.
`Schedule.Service`에서 읽기만 하며 task 등록·Start·Run·계정·ACL·credential 변경은 없다.
구문 검사는 실행 경로의 문법만 확인했고, 등록 metadata 검증 시험은 주입한 합성 값이다.
실제 등록 작업이나 별도 worker token의 접근 거부를 관측한 결과가 아니다.

등록만 있는 구형 입력의 사전 검사 결과는 `WORKER_BYTE_CHANNEL_UNBOUND`다. 아래 채널
계약까지 현재 검증한 입력은 `WORKER_CHANNEL_BOUND_INACTIVE`이며 두 경우 모두
`execution_enabled: false`다. 등록 readback은 실행 성공이나 접근 격리 증거가 아니다.
저장소의 launcher anchor/binding은 계속 `null`이며 IPC 설치 실행도 거부한다.
실제 SID·정책·계정·설치 ACL의 Owner 배치와 다른 SID 접근 시험은 미수행이다.
이 조각은 전체 M06/provider·M10/custody 또는 전체 33포트 완료가 아니다.

```sh
node --test guild_hall/secure_work/tests/execution_authority.test.mjs
python -I -S -B guild_hall/secure_work/tests/test_execution_roles.py
npm run validate:secure-work
```

## Controller → sender → worker byte broker

`ipc_pipe.py`는 Windows 로컬 named pipe만 사용한다. client는 OS가 반환한 server PID의
process token SID를 조회하고, server는 pipe client의 identification token을 OS로 조회한
뒤 즉시 revert한다. JSON의 SID·역할 필드는 인증에 쓰지 않는다. 신원 조회가 불가능하거나
고정 expected SID와 다르면 첫 업무 frame 전에 거부한다. server token 조회를 허용하는
실제 Windows 접근 권한도 설치의 검증 대상이며 오류를 같은 SID 실행으로 우회하지 않는다.

pipe 생성 시 현재 역할과 exact 상대 SID에만 read/write를 허용하는 임시 객체 DACL,
remote-client 거부와 first-instance 제한을 함께 지정한다. 파일·계정·기존 ACL·등록 작업은
변경하지 않는다. 읽기/쓰기는 nonblocking이며 최대 120초의 한 monotonic 기한을 공유한다.
각 broker는 한 연결만 처리하고 종료하며 launcher의 프로세스 제한은 150초다.
reconnect/retry/서비스 자동 기동은 없다.

`ipc.py`는 5-byte type/length framing, control 8 KiB·깊이 3·노드 64, 요청/응답 각각
1 MiB 제한을 읽기 전에 적용한다. control은 중복 key·미등록 필드·형식·순서를 거부하는 JSON,
업무 bytes는 별도 binary frame이다. pickle/object 역직렬화는 없다. 연결마다 256-bit 새
challenge, 순차 확인 번호, exact scope·attempt digest·body digest/size가 결속된다.
old challenge, 바뀐 과제/할당/epoch/route/audience와 잘못된 bytes는 처리 전에 거부한다.

controller는 기존 M05와 M07 `DispatchReference`의 reserve/IN_FLIGHT를 먼저 durable하게
기록한다. 기존 OS controller lock은 전체 교환과 응답 저장까지 유지한다. sender/worker는
journal을 열거나 별도 소비 원장을 만들지 않는다. sender 전달과 worker 실행 전에 upstream
확인 요청을 중계하여 controller의 **현재** 원천·permit·scope·epoch·journal revision을 다시
검사한다. 각 역할의 고정 launcher도 현재 코드/정책/OS 신원을 확인한다. 응답은 controller가
기존 hash/fsync/marker 규칙으로 저장한 뒤에만 M07 `RESPONSE_RECEIVED`가 된다.
중단·부분 응답·기한 초과·확인 실패는 E14 `DELIVERY_UNKNOWN`으로 남아 자동 재송신하지 않는다.
검사 이후의 동시 권한 회수와 이미 실행된 작업을 취소하거나 외부 exactly-once를 보장하지 않는다.

### Installer가 고정하는 입력

기존 설치 anchor에 `role: {name, sid}`를 고정한다. 이름은 controller/sender/worker/reviewer
중 하나이며 trust owner와 별개다. OS SID가 이 pin과 다르면 **binding/config 내용을 읽기 전**
거부한다. 구형 anchor는 기존 비채널 검사만 가능하며 IPC 권한은 얻지 못한다.

controller, sender, worker는 각자 별도 불변 launcher/binding/config를 갖는다. sender/worker
config의 허용 필드는 `schema`, `execution_role`, `runtime.python_executable`, `kit_root`,
`recipe_root`, `execution_authority.{policy_path,policy_sha256}`뿐이다. source/pilot/job/vault,
상태·adapter·controller 설정·공개키/서명키 위치를 넣으면 거부한다. peer는 키 bytes도 읽지 않는다.
Python peer 시작 packet에는 config 경로/내용을 싣지 않고 고정 public code/runtime 경로만 싣는다.
기존 full-config/상속 stdin worker는 이 경계를 만족하지 않아 scoped broker로 대체했다.

기존 실행 정책 내부에 다음 항목을 추가한다. 새 정책 발행기·schema owner·계정 생성기가 아니다.

| 입력 | 내용 |
| --- | --- |
| `ipc.sender_pipe`, `ipc.worker_pipe` | 서로 다른 `soulforge-secure-` 접두사의 고정 로컬 endpoint 이름. host/경로/동적 route 불허 |
| `sender_registration`, `worker_registration` | `task_path`, `xml_sha256`, `launcher_path`, `node_path`, `working_directory` |
| 등록 검증 | exact 역할 SID·제한 실행 수준·logon type·task owner/ACL·고정 launcher/Node/cwd·`--sender` 또는 `--worker` 인자 |
| 실행본 검증 | controller는 sender/worker, sender는 자신/worker, worker는 자신만 코드 pin/등록을 검사. 역방향 launcher pin은 순환 hash를 만들므로 금지 |

등록은 읽기만 하며 등록 작업을 시작하지 않는다. 승인된 비패키지 OS 실행면이 각 broker를
해당 다른 SID로 시작해야 한다. 실제 설치, 계정/파일 ACL, app-control·불변 실행면, worker의
source/vault/job/key 접근 거부와 설치 규모의 실행 시간 증거는 `NOT_RUN`이다.
설치물은 worker → sender → controller 순으로 봉인한다. downstream launcher/binding의
public code metadata는 부모 generation의 전체 목록에 포함하고, upstream generation과
controller 설정·업무·키 경로는 peer 목록에 넣지 않는다. 생성한 세 역할의 실제 file hash와
전체 목록을 재검증하는 합성 설치 시험으로 순환 없는 봉인 가능성을 확인한다.

### 검증 주장 범위

| 시험 | 실제 실행한 면 | 주장 범위 |
| --- | --- | --- |
| Python protocol | 실제 Windows named pipe, sender/worker 자식 프로세스, kernel SID 조회, 임시 객체 DACL | 동일 SID의 **격리된 프로토콜 시험**; 다른 SID 접근 격리 증거 아님 |
| OS identity 거부 | server expected SID 불일치, client expected SID 불일치 | 업무 handler 호출 0 확인; 같은 계정으로 허용하는 production fallback 없음 |
| E14 통합 | 실제 read-only kit M05/M07 + 두 실제 pipe + scripted WorkerReply | 1회 예약·정상 응답·worker crash·중계 중 permit 회수/assignment epoch/취소·재전송 거부 |
| Node 설치 계약 | 합성 OS/등록 metadata | full peer config·누락 identity·같은 SID·구형 등록·scope/launcher drift 거부; 실설치 입증 아님 |
| 실제 다른 SID 설치 | 미실행 | `NOT_RUN`; production-ready 주장 없음 |

```sh
node guild_hall/validate/run_secure_work_python.mjs --kit-root <READ_ONLY_TEST_KIT>
node --test guild_hall/secure_work/tests/execution_authority.test.mjs guild_hall/secure_work/tests/launch_binding.test.mjs
```

실제 pipe 시험은 Windows에서 실행하며 다른 OS에서는 명시적으로 skip한다. protocol fixture는
생산 runtime authority를 대체하지 않는 test-only 진입점을 사용한다. 기존 테스트 wrapper는
운영 config·키·외부 route를 상속하지 않는다. broker 구현·프로토콜 검증과 실제 역할 배치·접근
검증은 별개이며 전체 BIND09의 남은 통합도 별개다.

## M10 controller → custody sender 인계

controller의 `step_deposit`는 기존 job OS lock을 잡고 현재 source bundle·assignment·epoch·
route·candidate/outbox digest·CUSTODY_PENDING journal revision을 확인한다. 검토/전송 허가는
M06 permit을 전용하지 않고 기존 `loadCustodyAuthority`의 exact candidate·input revision·
route·principal에 묶인 M10 승인으로 검증한다. controller의 outbox/SQLite는 controller에만
남고 sender에는 식별자·digest·승인 대상 bytes만 전송한다. 원문 디렉터리·job/vault·candidate
경로, signer/credential 경로는 controller와 sender 사이 wire에 넣지 않는다.

`CustodySession`은 실제 Windows pipe 한 연결에서 최대 6개의 순차 승인/실행 요청을 처리한다.
매 요청은 기존 새 challenge·scope·digest framing에 결속되며 요청별 현재 확인은 최대 256회다.
`custody_sender`는 `--custody-operation`으로 **같은 custody sender 계정**의 Node bridge를
호출한다. 이것은 다른 역할을 상속 실행하는 fallback이 아니다. Node는 기존 승인 검증기와
IngressClient를 실행하고, 전송/응답 경계의 확인 요청을 pipe의 controller까지 중계한다.
복원된 candidate는 sender에서 hash를 확인한 임시 snapshot으로 기존 chunk/finalize/status
호출에 전달된다. source path를 sender에 넘겨 파일을 열도록 하지 않는다.

controller에는 custody token/SDK CLI 경로가 필요 없다. [`config.example.json`](config.example.json)은
controller 입력이며, 별도 [`custody_sender.config.example.json`](custody_sender.config.example.json)은
custody sender 입력이다. 예제는 placeholder·disabled 상태로 운영 권한을 만들지 않는다.

| 설치 입력 | 결속 |
| --- | --- |
| sender anchor `role.purpose` | `custody.deposit` 고정. M06 `--sender`/`--worker` 채널에 사용할 수 없음 |
| sender config | 기존 최소 runtime/code 입력에 `execution_purpose`, `custody_authority`, 정확한 `adapters.custody`만 추가 |
| custody adapter 입력 | `enabled`, `live_enabled`, `ingress_url`, `token_file`, exact-file `token_sha256`. source/job/vault와 다른 adapter는 금지 |
| 실행 정책 `custody_channel` | 서로 구분되는 고정 `pipe`와 기존 shape의 `registration`. exact sender SID·Node·launcher·cwd·`--custody-sender` 인자 검증 |
| 봉인 순서 | custody sender → controller. sender가 upstream controller launcher/config를 pin하지 않아 순환이 없음 |

M06 최소 sender/worker config에는 custody 필드를 계속 금지한다. M10은 기존 controller/sender
SID 정책을 재사용하고 목적별 launcher/config/등록 작업을 분리한다. 같은 sender SID의 목적
구분은 코드·불변 실행면의 결속이며 별도 OS 계정의 접근 격리를 새로 주장하지 않는다.

자격증명 값은 승인된 custody sender의 기존 token loader 안에만 머문다. `token_sha256`는
정확한 파일 bytes에 결속하며 승인 확인 이후 매 전송 경계와 ACK용 승인 조회에서 다시 검사한다.
파일이 바뀌면 같은 principal로 보이는 새 credential이어도 거부한다. Node 작업 도중에는 읽은
credential fingerprint도 유지해 변경된 토큰으로 조용히 바꾸지 않는다. 값은 Python·stdout·
영수증·controller에 전달하지 않는다.

M10의 기존 SQLite durable intent를 유지한다. submission ID가 있으면 다음 실행은
status-only이며 후보 bytes를 재업로드하지 않는다. ID가 없는 응답 유실/중단은 같은 ingress
idempotency key로 재조정한다. 실제 server가 이미 받은 chunk나 제출을 같은 key로 재사용하며,
새 key를 만들거나 무조건 새 업로드를 시작하지 않는다. ACK 뒤 현재 source/권한을 잃으면
로컬 ACK를 기록하지 않고 intent를 남긴다. 이미 이루어진 원격 custody를 취소했다는 뜻은 아니다.
M05/M07의 1회 소비 규칙은 바꾸지 않았으며 M10의 idempotent 재조정과 혼동하지 않는다.
`server_acknowledged`는 접수 증거이며 `review_state: NOT_OBSERVED`, `accepted: false`를 유지한다.

### 실제 보장하는 기한과 검증 범위

pipe 교환에는 최대 120초의 monotonic I/O 기한을 사용한다. Node의 ingress 작업은 45초
검사를 사용하며 개별 HTTP 호출은 최대 10초다. Python은 Node 자식의 stdin 쓰기와 stdout
읽기를 별도 스레드로 수행해 정체 시 남은 pipe 기한에 중단하고 자식을 종료한다. 종료 정리에는
최대 5초 wait와 1초 thread join이 추가될 수 있다. 설치 launcher의 broker 자식 제한은 150초다.
동기 OS/전체 generation/source 검사와 시작 지연을 포함하는 **controller 전체 hard deadline을
보장한다는 주장은 하지 않는다**. 기한 확인은 이 검사 전후에 적용되며 기한 이후 bytes/ACK를
성공으로 수락하지 않는다. 실제 설치 규모의 검사 시간과 다른 SID token 조회권한은 미측정이다.

실제 합성 시험은 Windows kernel identity 검사와 named pipe, Python adapter/SQLite,
실제 M10 서명 검증, 기존 IngressClient/server의 2-chunk upload/finalize/status를 함께 실행한다.
새 controller의 status-only ACK, source/승인/credential 변경, ACK 직후 권한 상실과 sender
강제 종료 후 같은 제출 재개를 확인한다. E14 source·assignment·epoch·route·candidate·
journal 취소 gate도 별도 실제 journal 시험을 사용한다. Node의 OS/등록 관측은 합성 값이고
프로세스는 같은 SID다. **ISOLATED_SAME_SID_PROTOCOL_TEST**이며 실제 다른 SID 접근 격리,
계정/ACL/task 설치, credential 배치, 운영 활성화, 실과제 전송은 모두 `NOT_RUN`이다.

```sh
node --test guild_hall/secure_work/tests/custody_handoff.test.mjs
node guild_hall/validate/run_secure_work_python.mjs --kit-root <READ_ONLY_TEST_KIT>
npm run validate:secure-work
```

전체 BIND09의 기존 TrustedContext/신원 owner 및 운영 키 서비스 통합을 이 모듈의 파일 정책
consumer와 동일시하지 않는다. 이 잔여 통합과 실제 계정·권한·승인·credential 배치는 별도 항목이다.

## JSON 표기·원문 상태·로컬 유용성 보완

`guard.scan_released_bytes`는 원래 전송 bytes를 바꾸지 않고, 일반 텍스트 검사와 함께 JSON을
한 번 해석해 문자열 key/value를 검사한다. UTF-8, Unicode escape·surrogate pair·일반 escape와
NFC 정규화까지가 범위다. JSON 문자열 안의 escape를 다시 풀거나 값을 이어 붙이지 않는다.
최대 1 MiB·중첩 32·노드 16,384를 넘거나 JSON 형태 입력이 잘못되면 raw 값을 출력하지 않는
`RELEASE_SCAN_*` finding으로 차단한다. 일반 텍스트 입력은 기존 검사로 남는다. 이 검사는
이미 정한 비공개 문자열과 경로만 찾으며 일반적인 비공개 보장이나 공개 승인이 아니다.

추출기는 제한된 문장 규칙으로 결함 부재와 근거 부재를 구분하고, 완료형 제안 철회·취소,
영문 `TBD`와 `미정`, 숫자 접두사에 무관한 `change_request` 파일명을 지원한다. 원문과 byte
span은 그대로다. 복합 부정·가정·인용·지원하지 않는 언어 전체의 의미 정확성을 보증하지 않는다.

`utility.check_evidence_preservation(packet, document)`는 기존 E14 구조 검사 뒤 같은 문서의
fact 인용·의존성·status·literal/slot 순서를 대조한다. 같은 근거를 보존한 단락 재조립은
`PASS_IN_SCOPE`, 슬롯 교환·새 문장·상태 변경·지원 밖 재서술은 `HOLD`다. engine은 구조 확인,
복원, 검증 경계에서 이를 실행해 변경된 근거를 `SEMANTIC_EVIDENCE_HOLD`로 멈춘다.
JSON key 순서와 절/독립 단락의 배치 순서는 의미 근거를 바꾸지 않는다. 통과는 **근거 보존만**
뜻하며 원문 사실성·일반 의미·기술적 수락을 승인하지 않는다.

`utility.evaluate_local_comparisons(source_dir, source_bundle_sha256=..., project_ref=...,
assignment_ref=..., assignment_epoch=...)`는 현재 source를 재추출하고 E14 bundle digest가
정확히 일치할 때만 계산한다. 파일마다 하나씩의 `측정값`·`허용 상한` 선언문, 동일한 지원 단위,
FACT 상태와 실제 quantity field를 확인해 Decimal로 `측정값 <= 상한`을 판단한다. 숫자·역할·
operator를 caller가 지정하지 않는다. 누락·중복·단위/형식 불일치·source 변경은 `HOLD`이며,
대상 문장이 없으면 `NOT_APPLICABLE`이다. 단위 환산과 일반 수학/공학 판단은 지원하지 않는다.

engine의 검증 단계는 비교 결론·근거 digest를 로컬 `local_validation.json`에만 보존한다.
값 원문은 넣지 않고, packet·outbox·이벤트·영수증에는 비교 결론도 자동 복사하지 않는다.
로컬 계산은 `COMPUTED_IN_SCOPE`가 될 수 있지만 `disclosure: HOLD`, `semantic_accepted: false`,
기존 ValidationReport의 `utility: REVIEW_REQUIRED`는 유지된다. 외부 공개와 전체 업무 의미
승인은 별도 문제다. kit 자체, E14 DTO와 상태기계는 수정하지 않았다.

순수 계약 시험은 테스트 전용 `SOULFORGE_SECURE_WORK_KIT_ROOT`로 read-only kit를 지정할 수
있다. 운영 config를 읽지 않으며 production 설정 loader의 동작은 바꾸지 않는다.

```sh
python -B -m pytest -q guild_hall/secure_work/tests/test_source_guards.py
SOULFORGE_SECURE_WORK_KIT_ROOT=<TOOL_ROOT>/secure-work-kit \
  python -B -m pytest -q guild_hall/secure_work/tests/test_utility_contract.py
```

## 작업·recipe 저장 경계

job/recipe ID는 경로를 만들기 전에 안전한 ASCII 단일 이름인지 검사한다. 기존 생성형
`o_`+32자리 hex와 `job.synthetic`, `R1-07` 같은 안전한 이름은 유지하고, 구분자·드라이브·
ADS·Windows 예약 장치명·끝점·대소문자/짧은 경로 alias는 거부한다. root와 상위 경로의
symlink·junction·reparse point, 파일 hardlink와 비정규 파일을 읽기 전에 확인한다.
job metadata는 256 KiB, recipe는 64 KiB, 상태 투영은 64 KiB로 읽기를 제한하며,
중복 JSON key·잘못된 UTF-8·JSON 형태·job ID/schema 불일치는 원문 없는 HOLD로 반환한다.

작업 읽기는 고정 역할 consumer의 현재 entry 검사 → 제한된 `job.json` metadata 읽기 →
과제·할당·epoch·task·route·audience의 정확한 대조 → 현재 권한 재검사 순서다. 과제 범위를
확인하려면 그 metadata는 읽어야 하며, foreign 작업의 payload나 metadata를 성공 결과로
돌려주지 않는다. 승인 CLI는 `release.issue`/`release.review`를 사용하고 `jobs.get`으로
승인자를 가장하지 않는다. `--role-entry`는 기존 `entry(operation)`의 읽기 전용 연결이며,
scope 없는 permit authorization이나 새 권한 발행을 허용하지 않는다.

목록은 모든 job의 범위를 검사하고, 누락·부분 생성·손상·foreign 작업이 하나라도 있으면
전체를 보류한다. 상태 읽기는 journal이 없을 때 SQLite 파일을 새로 만들지 않는다.
현재 허용된 작업 밖의 과거 상태 포인터·영수증 폴더는 상태 결과로 복사하지 않는다.

새 요청은 매번 `o_`+UUID hex를 발급하고 폴더·첫 metadata 파일을 배타적으로 생성한다.
같은 초·미션·요청자여도 기존 job을 재사용하지 않으며, 강제 ID 충돌은 기존 bytes를
보존한 채 HOLD다. 저장 시 이미 읽은 bytes와 현재 파일을 비교하고 손상·링크·변경을
확인하면 덮어쓰지 않는다. 실패 중 남은 부분 파일/폴더는 자동 삭제·복구하지 않는다.
기존 부분 상태가 있으면 후속 목록도 HOLD이며 명시적 검토가 필요하다.

이 검사는 안정적으로 보호된 OS 상위 디렉터리를 전제로 한다. 관찰된 alias·파일 교체를
거부하지만 적대적 동시 writer에 대한 OS 격리, 전체 mission의 atomic/CAS, 여러 파일의
단일 commit, M07 상태기계·기존 controller 잠금의 완성을 새로 주장하지 않는다.
합성 회귀는 저장 경계·정상 재열기·현재 역할·부분 상태와 기존 재시작 동작을 검사한다.

```sh
node guild_hall/validate/run_secure_work_python.mjs --kit-root <READ_ONLY_TEST_KIT>
npm run validate:secure-work
```

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
