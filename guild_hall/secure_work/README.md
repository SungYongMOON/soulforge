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
- **자기 승인 금지.** 필드 검토와 전송 허가는 CLI 밖의 사람 결정이다. 엔진은 그 결정을 읽기만 한다.
- **숨은 추론은 읽지 않는다.** 로컬 모델의 `reasoning_content`류 필드는 읽지도 저장하지도 않는다.

## 배치

| 무엇 | 어디 | 비고 |
| --- | --- | --- |
| 이 lane의 코드 | `guild_hall/secure_work/` | 저장소 안, public-safe |
| E14 계약 kit / E13 recipe | `<TOOL_ROOT>/secure-work-kit/**` | 저장소 밖, 읽기 전용 원본 |
| Python 환경 | `<TOOL_ROOT>/secure-work-venv` | kit의 고정 버전만 설치 |
| 작업 루트(합성 자료·매핑·영수증) | `<PILOT_ROOT>` | 저장소 밖 |
| 상태 요약 1파일 | `<STATE_ROOT>/ops-lane/operations/secure_work/status.json` | Vigil probe용, 원문·매핑 없음 |
| 외부 provider 키 / Tongs bearer | `<private_root>/config/secure_work/credentials/` | Owner만 배치, 이 lane은 존부만 확인 |

저장소 안의 파일에는 실제 host 경로를 쓰지 않는다. 실제 값은 `config.example.json` 형태의
JSON 한 장에 담아 저장소 밖에 두고 `SOULFORGE_SECURE_WORK_CONFIG`로 가리킨다.

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
```

- `doctor` — 어댑터 가용성 표. 키 파일·bearer는 **존재와 크기만** 본다.
- `request` — 미션 접수. 설정에 묶인 작업 루트의 source 디렉터리만 읽을 수 있다.
- `advance` — 현재 상태에 맞는 다음 동작 하나(또는 `--max-steps`만큼)를 엔진이 고른다.
  막히면 그 자리에서 멈추고 코드를 돌려준다. 대신 성공을 지어내지 않는다.
- `permit approve|deny` — 전송 허가. 정확한 request bytes·route·job·round·review·epoch에
  묶인 1회용 permit을 만든다. 서명 키는 승인 시 생성하고 즉시 버린다.
- `status` / `events` — 상태 투영과 이벤트 원장.

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
| M10 custody | 로컬 outbox + Tongs ingress 클라이언트 뼈대 | 로컬만, 업로드 미바인딩 |

키 래퍼(`<PILOT_ROOT>/vault/keywrap.local`)는 파일 권한으로만 보호되는 **시험 전용** 키다.
E14가 `KEY_WRAPPER_TEST_ONLY`로 분류한 것과 같은 등급이며, 운영 키 소유자를 대신하지 않는다.

## 검사

```sh
npm run validate:secure-work           # Node 진입점: 구문 + fail-closed 경계 (5건)
```

어댑터 경계 시험(12건)은 Python 쪽에 있고 kit과 venv가 있는 호스트에서만 의미가 있다.

```sh
SOULFORGE_SECURE_WORK_CONFIG=<config> \
  <TOOL_ROOT>/secure-work-venv/Scripts/python.exe -m pytest -q guild_hall/secure_work/tests
```

kit이 묶이지 않은 곳에서는 kit이 필요한 2건만 skip되고 나머지는 그대로 돈다.

## 지금 못 하는 것

- 외부 모델 호출. provider 키 파일이 없고 `live_enabled`가 꺼져 있다. 사이클 1호의 작업자는
  모델이 아니라 scripted worker다.
- Tongs 업로드. bearer가 없어 후보는 로컬 outbox에 남는다.
- 의미 검토. 구조 검사는 통과해도 문장의 의미가 맞는지는 판정하지 않는다
  (`STRUCTURAL_PASS_SEMANTIC_REVIEW_REQUIRED`).
- 일반적인 비공개 보장. 유출 검사는 "이 lane이 이미 로컬로 정한 문자열이 나가는 bytes에
  들어 있는가"만 답한다. 자동 분류기가 아니다.
