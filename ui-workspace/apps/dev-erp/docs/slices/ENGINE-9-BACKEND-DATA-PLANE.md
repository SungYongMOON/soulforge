# ENGINE-9-BACKEND-DATA-PLANE — 데이터 평면 일원화 (Soulforge=백엔드, runtime=무상태 서버)

- status: **ready** / parallel_group: G-intake-cycle / depends_on: 없음 (E1·E8 done 전제)
- 규모 추정: 배선 ~120줄 + 이관 스크립트 ~150줄 + 테스트 ~150줄 (1~1.5일)
- 작성: claude_fable-5 (2026-07-05, ERP 표면 스레드에서 진단 완료분 인계)

## owner 결정 (2026-07-05, 원문 취지)

> "내가 원하는 건 Soulforge 에 있는 데이터를 ERP 에 뿌리는 것. runtime 안에 그걸 넣고 싶지
> 않다. runtime 은 껍데기일 뿐이고 ERP 서버일 뿐이다. runtime 에 데이터가 쌓이면 안 된다.
> **Soulforge 가 백엔드다.**"

즉: dev checkout(`C:\Soulforge`)의 `_workmeta` 가 유일한 project-metadata 창고이고, runtime
clone 은 코드+운영상태(DB·TLS·mailbox env·로그)만 가진다.

## 검증된 사실 (2026-07-04~05 실측, ERP 표면 스레드)

1. **runtime `_workmeta` = `P00-000_INBOX` 단독**(project_context 119 nodes 보유). dev
   `_workmeta` = 7과제 project_context(P21-062, P23-043, P24-049 641n, P25-000, P25-054,
   P25-057, P26-014 344n). runtime `_workmeta` 는 git repo 아님(`.git` 없음, 동기화 장치 없음).
2. **읽기 경로는 이미 백엔드 전환 완료(2026-07-05)**: 지식 overview·위키 본문·줄기 그래프가
   전부 `KNOWLEDGE_SHELL.root`(`--knowledge_shell_root` 플래그) 하나를 쓰도록 일원화돼 있고,
   운영 기동 ps1 이 `C:\Soulforge` 를 가리킨다. **이 패킷의 대상은 '쓰기' 경로다.**
3. **엔진 spawn 에 백엔드 전달이 없다**: `src/mail_collect.mjs:201` 이
   `node tools/auto_intake_cycle.mjs --db <rel> --apply --json` 만으로 자식을 띄운다 —
   `--workmeta`/`--project` 미지정 → 자식이 자기(=runtime) checkout 의 `_workmeta` 에 쓴다.
4. **도구들은 이미 재지정 파라미터를 갖고 있다**(배선만 없음): `auto_intake_cycle.mjs` 의
   `opts.workmeta`, `haengbogwan_run.mjs --workmeta-root`, `mail_to_task_ledger.mjs --workmeta`.
5. autosync 폴링/write-through 의 root 는 `server.mjs`(autosync ON 블록)에서
   `resolve(HERE,"..","..","..")` = 자기 checkout 고정.
6. **줄기 per-project 공급 공백**: 분류는 실과제로 되는데(runtime DB 에 P26-014 할일 존재)
   auto_intake → haengbogwan 체인에 `--project` 가 안 흘러 실과제 줄기가 자라지 않는 정황.
   단, ③의 workmeta 미전달과 얽혀 있어 정확한 1차 원인은 착수 게이트에서 실측할 것.

## 구현 (3단계)

### E9-a. 백엔드 루트 관통 배선

- env `DEV_ERP_BACKEND_ROOT`(기본 = 자기 ROOT) 신설. runtime ps1 은 `C:\Soulforge` 로 설정.
- `server.mjs` 가 spawn/구동하는 전 데이터 경로에 관통:
  - `mail_collect.mjs` → `auto_intake_cycle.mjs` 에 `--workmeta <backend>/_workmeta` 전달
    (내부의 haengbogwan_run·mail_to_task_ledger·receipts·completion_feed 로도 관통되는지 확인)
  - autosync `startAutosyncPoll(store, { root })` + `afterItemWrite/afterInputWrite` 의
    `writeTaskToLedger/writeInputToLedger({ root })` 를 backend root 로
  - 메일 원장(메일_이력.csv) 기록·스캔 경로(`scan_mail_ledger` 등) 동일
- **백엔드로 옮기지 않는 것(경계)**: mailbox env refs(`guild_hall/state/**`, secret 은 runtime
  PC 로컬 유지), send_mail.py 등 **코드 경로**(자기 checkout 의 tools/guild_hall 사용),
  SQLite DB, TLS.

### E9-b. 줄기 per-project

- auto_intake step4(haengbogwan_run --apply-context)에 그 사이클 분류 결과의 프로젝트 목록을
  `--project <code>` 반복 인자로 전달(INBOX 포함). 실과제 줄기가 백엔드에서 자라게 한다.

### E9-c. 기존 runtime `_workmeta` 병합 이관 (1회)

- runtime `_workmeta`(INBOX 원장·줄기·receipts, 메일_이력.csv 등)를 백엔드로 멱등 병합:
  키 = 이력키/source_id/node_id/edge_id (haengbogwan_project_context 의 `mergeRows` 재사용 가능).
- 병합 후 runtime `_workmeta` 는 비우고, 이후 재생성 0 을 완료 기준으로 감시.

## 착수 게이트 (추측 금지 — 실측 후 진행)

- [ ] runtime 의 write-through 가 실제로 어디에 썼는지 확인: runtime DB 에 P26-014 할일이
      있는데 runtime `_workmeta/P26-014/` 디렉터리가 없다 — write-through 실패 로그
      (`[autosync] write-through 실패`) 여부와 원장 실물 위치를 확인하고 유실분이 있으면 E9-c
      병합 범위에 포함.
- [ ] 동시 쓰기 안전: 백엔드 `_workmeta` 에 (a) runtime 엔진 15분 주기 (b) dev 쪽 수동/Codex
      실행이 함께 쓸 때 tmp+rename 원자성으로 충분한지, nested private repo 의 git 상태가
      더러워지는 워크플로 충돌이 없는지 확인. 필요 시 간단한 lock 파일.
- [ ] `--workmeta` 전달 시 auto_intake 내부 하위 spawn 전부가 그 값을 이어받는지(부분 전달로
      두 창고에 반씩 쓰는 최악 케이스 방지) 경로 추적 테스트.

## 완료 기준

1. 운영 4300 줄기 그래프 드롭다운에 실과제(P26-014 등)가 뜨고, **새 메일 인입 후 해당 과제
   줄기가 백엔드에서 자란다**(수집 2사이클 관찰).
2. 관찰 기간(48h) 동안 runtime `_workmeta` 에 신규/변경 파일 0.
3. node:test 전건 green + 백엔드 미지정(기본값) 환경에서 기존 동작 100% 보존(하위호환).

## 검증 방법

- 수집 1사이클 전후 `git -C C:\Soulforge\_workmeta status --short` diff 로 백엔드 성장 확인.
- `Get-ChildItem C:\Soulforge-runtime\_workmeta -Recurse | ? LastWriteTime -gt <배포시각>` = 0건.
- ERP 화면: 지식 → 줄기 그래프에서 과제 선택 → 최신 이벤트가 가지 하위 목록에 표시.
