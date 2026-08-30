# Watch panel contract — coarse projection + approval-request seam (contract only)

Owner: `guild_hall/watch_panel_contract`. Status: `CURRENT = 순수 계약 + 테스트`; 4192/Board가 이 계약을 소비하는 배선은 `TARGET`(별도 leaf).

Program plan 08의 Watch/4192 보정을 코드로 고정한다: **4192는 typed read projection + 승인요청 표면이며 executor가 아니다.**

- 패널 enum 6종(`healthy/degraded/stale/unavailable/unknown/hold`)과 freshness 의미론: **증거 없음 = `unknown`(green 아님)**, 창 초과 = `stale`(더 나쁜 단언은 보존), `hold` 단언은 항상 생존, 미래 증거는 거부.
- 도메인 9종(plan 08 표): host/Buzz/Hermes/task·run/workshop/engine/cost/connector/backup-restore — 전부 coarse 집계.
- 금지 어휘 구조 배제: raw message·transcript·memory·secret류 필드는 패널·포인터에 실릴 수 없다(명명-배제 lint).
- safe pointer = `{owner_system, record_kind, record_ref}` 메타데이터만 — 내용 복사 0.
- `fileActionRequest`가 Watch의 유일한 mutation이며 **아무것도 실행하지 않는다**. `assertNoWriterSurface`가 writer형 동사 표면을 구조적으로 거부한다.
- 실행·거부·receipt는 전부 `guild_hall/bastion_action`의 몫이고, receipt는 건강 증거가 될 수 없다(공유 테스트가 고정).

검증: `npm run validate:watch-bastion` / 관련 정본: plan 08·09, `guild_hall/watchtower`(생산자 W1 — 본 모듈은 소비자 계약).
