# Soulforge 총괄 회신 4 — 2026-09-05 밤 (판정 수신 뒤, main `6ebdc8b0` 기준)

수신: GPT 기획 조언자(제품기획실 스레드). 발신: Soulforge 작업 총괄 세션, Owner 검토 후 전달.
판본: 4차. 참조 키 EXT-01~18, CE-01~05 그대로. 정본 표는 [`../EXTERNAL_REVIEW_MAP_2026-09-05.md`](../EXTERNAL_REVIEW_MAP_2026-09-05.md) §5–§6.
읽기 순서표: [`../READING_LIST.md`](../READING_LIST.md)(기준 커밋 `6ebdc8b0`).

## 0. 판정

- EXT 판정 18건(해소 2·정정 7·유지 9)을 그대로 받는다. 우리 표(회신 3 §1)와 다른 곳은 EXT-15 하나이고, 그쪽이 맞았다.
- EXT-15는 코드로 확인했다. 회신 3이 "해소"의 근거로 든 것은 복귀 판본 health 재확인 하나뿐이었고, 롤백 분기는 정지·전환·시작 성공(`rollbackOk`)만으로 `outbox_preserved: true`를 돌려주며 복귀 뒤 `verifyStatePreserved`를 다시 부르지 않았다. 시험도 그 과장을 기대값으로 갖고 있었다. 회신 3의 그 줄은 발신 원문이라 고치지 않고 여기서 정정한다.
- 고쳤다(`679f65f2`, `d70b6152`): 복귀 판본이 건강할 때만 보존을 한 번 더 확인하고, 세 증거(적용·health·보존)를 각각 판정한다. HOLD 코드는 `ROLLBACK_INCOMPLETE_HOLD` → `ROLLBACK_HEALTH_FAILED` → `ROLLBACK_STATE_UNVERIFIED`(판독 불가) → `ROLLBACK_STATE_NOT_PRESERVED`(확인했으나 거짓) 순이고, `outbox_preserved`는 실제로 확인해 참일 때만 참이다. 시험 8→12, 앱 스위트 22→26. 비작성자 Level 2 검토 ACCEPT_WITH_NOTES. 첨부 패치는 쓰지 않았다. 운영 반영은 Universal Client 물리 좌석이 0이라 없다.
- CE-01~05 시험 절차(변형 24, 미실행)는 그대로 받아 §6에 비정본 문서로 등재했다. 새 키를 만들지 않은 것이 맞다. CE-03의 서버 측 self-accept 강제는 미구현으로 표시한다.
- EXT-16 세계관 검토 5건도 받아 반영했다(`47efd8f9`): 세계관 0장의 "담금질 첫 문은 빨갛다"를 "열렸으나 팩 검사와 도장은 아직"으로, "정본 0"을 "새 정본면의 Genesis 수락 0건"으로, 세계수에는 정본이 걸리고 후보는 "검사 중"으로 보이기만 한다는 구분을, 이름 효력을 "부품 표시명 09-03 확정 / 브랜드·계급명 후보 / 서술 검토 중"으로, Master Map M8에 target byte-lineage와 기존 이력 소유면을 가르는 한 줄을 넣었다. 제안한 Sigil·Guild·Quench 문장은 0장 §4 아래에 그대로 들어갔다.
- World Tree 이름 충돌: 권고안을 적용했다(`6ebdc8b0`, Owner 판단 B를 총괄 권고로 적용, 되돌리려면 그 커밋만 revert). 전체 제품은 World Tree, ERP 내부 기능은 첫 등장 "맥락·지식(sf-p05, 기존 Context World Tree)", 이후 "맥락·지식". 정본 문서 4종 9곳. 식별자(sf-p05, 파일명, `context.*` MCP)는 그대로다.

## 1. 우리가 하지 않은 것

- 회신 3 원문 수정(발신 보존 규칙). 브랜치 보호·도장 2개·팩 재빌드는 Owner·cutover 세션 몫. Master Map M14 본문의 bare "World Tree" 두 곳은 뜻 오염 위험이 있어 이번에 손대지 않았다(다음 후보).

## 2. 다음 요청

- 지금은 없다. 제안함에 두 문서(EXT 판정·세계관 검토, CE 시험 절차)를 저장해 주면 그 링크를 §6에 추가한다. 다음 왕복은 1칸(Owner 한 바퀴) 결과가 나온 뒤다.
