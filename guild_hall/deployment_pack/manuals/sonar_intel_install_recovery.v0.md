# 소나 인텔 설치·사용·자료 복구 안내

상태: 로컬 출시 후보. HPP Server Pack의 선택 실행 앱이며 설치만으로 서버나 수집기를
시작하지 않는다. 외부 수집 권한, 운영 서비스 등록, 사람의 복구 수락은 별도다.

## 설치와 조회

배포 담당자는 기존 HPP builder의 manifest·SBOM·설치 readback을 완료한다. 소나 구성
요소 목록은 `tools/sonar_intel_pack_members.mjs`, 실행면은 아래 모듈이 소유한다.
Node >=22.5가 필요하고 소나 자체 npm 의존성은 없다. SQLite 자료 복구는 `node:sqlite`를
사용할 수 있는 동일 Node 환경이 필요하다. SQLite가 없는 환경은 JSONL 자료만 지원한다.

```text
node <payload>/ui-workspace/apps/sonar-intel/server.mjs --data-dir <external_data_dir> --port <port>
```

`<external_data_dir>`는 절대 경로의 앱 전용 작업 자료 폴더다. payload·source·정본
`_workspaces`/`_workmeta`와 겹치지 않게 지정한다. 경로가 없으면 서버는 자료를 만들지
않고 빈 상태를 보인다. 잘못된 경로는 다른 위치로 fallback하지 않고 종료한다.
출력된 `http://127.0.0.1:<port>`에서 수집 상태·자료·분석 근거를 읽는다. 기본 포트는
4420이며 격리 검증에는 `--port 0`으로 자동 임시 포트를 사용한다. 종료는 실행 프로세스에
Ctrl+C/SIGTERM을 보내고 실제 종료와 포트 해제를 확인한다. 다른 앱은 종료하지 않는다.

설정은 설치된 `config/sources.json`, `config/keywords.json`이다. 설치 payload를 직접
고치지 말고 검토한 설정을 다음 코드 판본에 묶는다. 설정 부재·손상은 기동 오류다.
꺼짐·권리 미확인·수집 실패·자료 없음·분석본 없음은 각각 다른 상태다. 화면의
`최신 결과 다시 읽기`는 읽기만 하며 수집이나 분석을 실행하지 않는다.

## 로컬 분석과 내보내기

```text
node --max-old-space-size=192 <payload>/ui-workspace/apps/sonar-intel/tools/analyze_once.mjs --data-dir <existing_external_data_dir> --as-of <UTC_ISO_timestamp>
node <payload>/ui-workspace/apps/sonar-intel/tools/export_snapshot.mjs --data-dir <existing_external_data_dir>
```

분석은 CORE를 보존하고 `analysis.json`만 바꾼다. 수집 이력·권리·자료 판본이 분석 근거와
함께 표시된다. 새 논문 소스의 권리 계약을 운반하지 못하는 CSV/JSON 교환은 거부한다.
내보내기 위치는 기본 `<external_data_dir>/export`, 변경 시 `--export-dir`도 외부 절대
경로여야 한다. 수집은 별도 `tools/collect_once.mjs --data-dir ...`이며 실제 출처·상품·
허용 목적·예산을 확인한 사람이 명시적으로 실행한다. 이 설치 검사는 외부 수집을 하지 않는다.

## 자료 백업 분류와 복구

| 자료 | 분류·처리 |
| --- | --- |
| `intel.db` 또는 `intel.jsonl` | 포함. CORE는 하나만 존재해야 한다. SQLite는 논리 내보내기와 quick_check, JSONL은 정확한 바이트 복사 |
| `analysis.json`, `last_run.json` | 포함. 같은 시점의 분석본·수집 관측 의미 보존 |
| `budget-<source>.json` | 포함. 남은 예산을 자동 충전하거나 초기화하지 않음 |
| `export/` | 재생성 가능하므로 제외 |
| lock, SQLite WAL/SHM, 임시 분석 파일, 복원 후 수집 중지 표식 | 실행 제어 상태라 복사 제외. CORE writer와 백업은 공통 lease로 배타 실행 |
| 그 외 항목 | 미분류. 내용을 읽거나 조용히 누락하지 않고 백업 거부 |

이 분류는 앱 자료 세대에만 적용한다. HPP의 기존 백업 스케줄·NAS 바인딩·정본 저장소를
변경하지 않으며 자료 수집을 백업 증거로 간주하지 않는다.

```text
node <payload>/ui-workspace/apps/sonar-intel/tools/data_recovery.mjs backup --data-dir <existing_external_data_dir> --backup-dir <new_external_backup_dir>
node <payload>/ui-workspace/apps/sonar-intel/tools/data_recovery.mjs verify --backup-dir <external_backup_dir>
node <payload>/ui-workspace/apps/sonar-intel/tools/data_recovery.mjs restore --backup-dir <external_backup_dir> --data-dir <new_external_restore_dir>
```

백업과 복원은 새 경로만 만든다. 백업이 반환한 manifest SHA-256을 별도로 보관하고
verify/restore 때 `--expected-manifest-sha256`으로 지정한다. 이 digest는 unsigned
manifest의 일관성 검사와 별개인 외부 판본 pin이다. 모든 멤버의 이름·크기·hash와 파일
집합을 확인한 뒤 복원하며 기존 자료를 덮어쓰지 않는다. 복원한 위치를 조회 서버에 지정해
자료 수·원래 ID·분석 기준 시각·근거 링크가 기대와 같은지 확인한다.

복원은 과거 시점의 예산을 되살릴 수 있으므로 `collection-disabled-after-restore`를
남겨 수집 CLI를 차단한다. 조회·분석은 가능하다. 담당자가 현재 권리·현재 제공자 잔여량과
로컬 예산을 대조하고 수집 재개를 별도로 승인하기 전에는 이 표식을 해제하지 않는다.
도구는 재개를 자동 승인하거나 표식을 자동 제거하지 않는다.

## 코드 업데이트·되돌리기와 손상 복구

기존 `tools/pack_lifecycle.mjs`의 upgrade/rollback/backup/restore는 **HPP 코드 전체**의
판본을 다룬다. HPP 담당자가 해당 Pack 서비스의 정지·재기동 범위를 승인받아 수행한다.
소나 자료 폴더는 그대로 유지하고, 코드 backup이 자료 backup을 대신한다고 보지 않는다.
업데이트 전에 자료 generation을 별도로 보관한다. 코드 rollback은 이전 한 세대를 유지하며,
코드 손상 복원과 자료 복원 뒤에는 각 manifest readback과 실제 조회를 다시 확인한다.

격리 검증은 소나 구성 요소만 담은 임시 HPP spec으로 설치·기동·분석·HTTP·종료·코드
업데이트/되돌리기/복원·자료 복원을 시험한다. 전체 HPP의 운영 복구나 NAS 준비, 사람 수락을
증명하지 않는다. 운영 활성화 및 자료 경로 이관은 이 안내서 실행 예시의 자동 부수효과가 아니다.
