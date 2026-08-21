# Soulforge Codex Lifecycle Retention & Feature Manual Inventory Operations v0

## 개요 (Overview)

이 문서는 Soulforge Codex 스레드 수명주기 보존(Lifecycle Retention), 기능·매뉴얼 인벤토리(Feature Manual Inventory), 및 원샷 보고 자동화(Phase 3)의 운영 매뉴얼이다.

## 소유 경계 및 권한 (Ownership & Authority Boundary)

- **소유자 (Owner)**: `.workflow/codex_thread_manager_v0`
- **반복 실행 소유자**: `guild_hall/night_watch` (로컬 스펙 `soulforge-lifecycle-retention-report.spec.json`은 버전 관리되나 기본상태 `PAUSED`로 미설치·비활성 상태임; 지정 노드에서 명시적 활성화 필요)
- **표시 소비 표면**: `ui-workspace/apps/team-ops-board` (GET-only 읽기 전용 중계)
- **관측 표면**: `guild_hall/watchtower` (스냅샷 및 헬스 관측 전용, 실행/복구 권한 없음)

### 파괴적 권한 0 게이트 (Zero Destructive Authority Gate)

- **Phase 1**: 스레드 수명주기 분류 및 보존 대상을 metadata-only로 판정 (보고 전용)
- **Phase 2**: 기능 매뉴얼 및 문서 커버리지 gap 코드 스캔 (보고 전용)
- **Phase 3**: 보존·인벤토리 결합 원샷 보고서 생성 및 승인된 activity 원장 저장 (보고 전용)
- **Phase 4**: Owner 승인 영수증 바인딩, 보존 계획 수립, 합성 백업-복구 검증 게이트 (실행 환경 FEATURE_OFF 유지, 제거 권한 0)
- **Phase 5+ (Approval Gated / Feature-OFF)**: 카나리 적용, 삭제, 아카이브 등 파괴적 동작은 오너의 별도 승인 전까지 **FEATURE_OFF (0건)** 유지한다.

## 시스템 구성 요소 (Components)

| 모듈 / 파일 | 역할 |
| --- | --- |
| `.workflow/codex_thread_manager_v0/lifecycle_retention.mjs` | 스레드 수명주기 판정, worktree 프리플라이트, candidate ID 파생 |
| `.workflow/codex_thread_manager_v0/feature_manual_inventory.mjs` | 명시적 정적 카탈로그 대조 및 매뉴얼/검증기 갭 코드 스캔 |
| `.workflow/codex_thread_manager_v0/codex_retention_automation.mjs` | 보존 보고서와 인벤토리 스캔을 결합한 원샷 자동화 모듈 |
| `.workflow/codex_thread_manager_v0/codex_retention_automation_cli.mjs` | 원샷 보고서 실행 전용 CLI |
| `.workflow/codex_thread_manager_v0/lifecycle_retention_preservation.mjs` | Phase 4 오너 승인 검증, 보존 계획 수립 및 프로덕션 FEATURE_OFF 보존 인터페이스 모듈 |
| `guild_hall/backup_controller/retention_preservation_gate.mjs` | Backup Controller 수명주기 보존 합성 어댑터 및 프로덕션 feature-OFF 게이트 |
| `guild_hall/night_watch/automations/soulforge-lifecycle-retention-report.spec.json` | Night Watch 수명주기 보존 보고서 추적 스펙 (기본값: `PAUSED`, 미설치/비활성) |
| `ui-workspace/apps/team-ops-board/src/server/codex-retention-adapter.mjs` | GET loopback 백엔드 어댑터 (`/codex-retention.snapshot.json`) |
| `ui-workspace/apps/team-ops-board/src/core/codex-retention-projection.mjs` | 안전한 읽기 전용 투영 및 시한 윈도 계산 |

## 원샷 보고서 실행 방법 (Execution)

### CLI 직접 실행 (Direct CLI)

```bash
node .workflow/codex_thread_manager_v0/codex_retention_automation_cli.mjs \
  --local-root <repo-root> \
  --activity-root <activity-root> \
  --json
```

- 원자적 결과물은 `<activity-root>/reports/codex_retention/current.json`에 저장된다.
- Sanitized activity event가 `<activity-root>/events/YYYY/YYYY-MM.jsonl`에 기록된다.
- 파괴적 플래그(`--apply`, `--delete`, `--remove`, `--prune`)는 거부된다.

## Watchtower 미감시 로컬 바인딩 설정 (Watchtower Ignored-Local Binding)

Watchtower에서 `codex_retention_report` 프로브의 헬스를 관측하려면, 로컬 binding 파일(`watchtower_binding.v1.json`)에 아래 프로브 항목을 등록한다 (Watchtower는 상대 경로를 `state_root` 기준으로 해소하지 않으므로 프로브 `path`는 정확한 절대 경로여야 한다):

```json
{
  "schema_version": "soulforge.watchtower.binding.v1",
  "state_root": "<watchtower-state-root>",
  "probes": {
    "codex_retention_report": {
      "kind": "json_file",
      "path": "<activity-root>/reports/codex_retention/current.json",
      "expected_schema_version": "soulforge.codex_thread_manager.codex_retention_automation_report.v1",
      "timestamp_field": "generated_at",
      "status_field": "status",
      "ok_values": ["PASS", "HOLD"],
      "period_seconds": 86400,
      "grace_seconds": 3600,
      "missing_is_unmonitored": true
    }
  }
}
```

## Phase 4 승인 및 보존 계약 (Approve & Preserve Contract)

1. **승인 영수증 (Approval Receipt)**: 오너 승인은 정확한 `candidate_id` (`cand-...`), Phase 3 보고서 해시(`report_digest`), 허용된 단일 액션(`preserve`), 발급시각(`issued_at`), 만료시각(`expires_at`), 및 보존 전략(`preservation_branch` 또는 `_local_hold`)에 바인딩된다.
2. **합성 복구 검증 게이트 (Synthetic Restore-Check Gate)**: 별도의 읽기 어댑터를 통해 보존된 개체/바이트를 다시 읽고 해시를 재계산하여 완전한 일치가 확인된 경우에만 검증된 보존 영수증(`PRESERVED_VERIFIED`)을 발급한다.
3. **프로덕션 FEATURE_OFF 및 제거 권한 0**: 공개 `executeRetentionPreservation` 인터페이스는 외부 어댑터 주입을 허용하지 않으며 항상 프로덕션 FEATURE_OFF (`preservation_count: 0`, `removal_count: 0`)를 반환한다. 실제 Git 브랜치 생성이나 local_hold 페이로드는 생성되지 않는다. 테스트 어댑터에 의해 생성되는 합성 영수증은 테스트용 증거 (`claim_ceiling: synthetic_evidence_only`, `evidence_kind: synthetic_test_proof`)일 뿐 실제 운영상의 보존이 아니다.
4. **보존과 정리/제거 권한 분리**: 보고서 및 후보 대상의 액션(`lifecycle_retention_action`, `retention_action`)은 보존 단계에서 strictly `HOLD`여야 하며, 보존 계획 및 승인 절차(Preservation)는 정리/제거(Cleanup/Removal) 권한이 여전히 `HOLD`로 고정된 상태에서도 오너 승인에 따라 진행될 수 있다.

## 안전 규칙 및 데이터 위생 (Safety & Sanitization Rules)

1. **절대 경로 미노출**: 보고서 및 UI 투영에는 오파크 식별자(`cand-...`, `worktree-...`), 상대 경로, 갭 코드, 숫자 카운트만 포함된다.
2. **원문/비밀 exclusion**: 프롬프트, 트랜스크립트, 추론 내용, credential, 세션 파일 원문은 수집하지 않는다.
3. **Fail-Closed**: 카탈로그 오류, 경로 탈출 시도, 파일 손상 시 즉시 `HOLD` 또는 `unavailable` 상태로 닫힌다.
