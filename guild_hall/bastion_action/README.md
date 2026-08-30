# Bastion action gate — approved restart/isolate/restore/rollback seam (in-memory only)

Owner: `guild_hall/bastion_action`. Status: `CURRENT = 순수 gate + synthetic executor 테스트`; 실제 executor binding·물리 복구는 `TARGET`(별도 Owner gate).

Program plan 09의 실행 경계를 고정한다: **Watch의 요청은 실행이 아니고, Bastion만 검증 후 실행하며, receipt는 결코 건강 상태를 조작하지 못한다.**

- 검증 순서: terminal receipt replay → action kind → expiry → 승인 기록(요청 exact binding) → policy(허용 target·action) → maintenance lease(정책 요구 시) → restore/rollback은 exact backup generation + isolated-restore proof ref 필수 → 그제서야 주입 executor port 호출.
- 모든 거부는 executor에 닿기 전에 일어나고, 거부·실행 모두 request_id당 terminal·멱등 receipt다(거부 뒤 유효 컨텍스트 재시도도 replay — 새 요청이 필요).
- receipt에는 건강 어휘가 구조적으로 없다(`receiptCarriesNoHealthClaim`); Watch 패널은 오직 fresh evidence로만 변한다.
- executor 실패·기형 반환도 terminal `failed` receipt로 봉인되어 재시도가 포트에 재도달하지 못한다. 단, 포트 호출과 기록 사이의 crash는 이 core가 관측할 수 없으므로 **실제 executor adapter는 request_id 기준 멱등이어야 한다(MUST)** — real-executor leaf의 명시 수락 조건.
- replay는 request_id 기준이며 요청 본문 digest 결속은 아직 없다 — real-binding leaf에서 content pin을 추가한다.
- 이 저장소에는 synthetic executor만 존재 — 실제 프로세스·서비스·저장소는 도달 불가.

검증: `npm run validate:watch-bastion` / 관련 정본: plan 08·09, `guild_hall/backup_controller`(복구 정책·LB1 — 본 모듈은 실행 gate seam만).
