# B8 — 줄기 지도 v2 렌더 (골격·작업·이력 구분 + 드래그 재부착 UI)

- 상태: done 2026-07-06 (execution_owner: erp_surface_thread_claude, worker: claude_fable-5)
- 정본 기준: `STEM-V2-ONTOLOGY.md` (줄기 3종 + 연결 등급 + 드래그=사람확정), 서버 계약: `B6-STEM-REATTACH-API.md`, 데이터: ENGINE-11 산출 `branches.csv`/`occurrences.csv` (`/api/context/graph` v2 필드)
- Owner 문제 제기(2026-07-06): "지도가 뭐가 바뀐게 없는데 … 너무 겹쳐져서 보기 힘들고, 실제 저기 적힌것들이 어떤 의미인지도 모르겠고, 옮겨 붙이는것도 안되고"

## 구현 (static/app.js drawTrunkGraph/drawTrunkMap + src/lexicon.mjs + static/style.css)

1. **종류 구분 렌더** — `branch_kind`별 색·모양: 골격=보라 사각(기둥), 작업=초록 원, 이력=주황 원, legacy=파랑 반투명. 종류별 묶음 배치(골격→이력→작업→legacy)로 같은 성격이 이웃.
2. **legacy 기본 숨김** — v2 줄기가 하나라도 있으면 옛 제목조각 가지(legacy)는 기본 제외, `옛 가지 {n}개 보기/숨기기` 토글로 표시. v2 없는 과제는 기존 그대로.
3. **의미 범례** — 종류별 색점 칩 + 힌트 한 줄(원 크기=자료량 · 가운데 숫자=자료+할일 · 빨간 배지=미결 리뷰 · 점선=확정 대기 제안 · 드래그 안내). 지도·목록·표 3뷰 모두 v2 필터 공유.
4. **상태 표기** — 이력 `proposed`=점선 외곽+`제안` 태그, 완료 작업=✓+흐림. 라벨 지그재그(짝홀 dy)로 원주 겹침 완화.
5. **가지 상세** — 클릭 시 종류/상태/탄생~종료 메타 + 이력줄기 회차 타임라인(`날짜(자료수)` 나열, occurrences.csv 조인).
6. **드래그 재부착(사람 확정)** — 작업(초록) 가지를 끌어 골격 게이트(`gate:*`) 사각에 놓으면 `POST /api/items/reanchor` 로 SE 단계 이동. 6px 미만 이동=클릭(펼치기)으로 구분, 게이트 외 대상은 안내 토스트. move/up 리스너는 컨테이너에 1회만 부착(가지 클릭 repaint 마다 중복 부착 → 드래그 1번에 API 다발 발사 결함을 검증 중 발견·수정).

## 검증 (fixture :memory: 4315 + 실데이터 project_context 사본)

- P26-014: 지도 9노드(골격5·이력4, legacy 27 숨김), 토글 9↔36, 범례·힌트, 이력 상세 회차 노출 확인.
- P24-049: 골격7·작업5·이력17 렌더, 작업→`gate:120_CDR` 드래그 합성 → reanchor POST **정확히 1건**(가지 클릭 2회로 repaint 유발 후에도) → fixture에 해당 할일 없어 `이동 실패: item_not_found` 토스트(배관 증명), 콘솔 오류 0.
- lexicon parity(비즈니스·판타지 동일 키) node:test green, `node --check` OK, 전건 스위트 별도 실행.

## 남김 (후속 레인)

- 이력줄기 `proposed` 확정/거절 1클릭 UI — 엔진측 branch status 쓰기 경로 필요(별도 패킷).
- 드래그 대상 확장(mgmt:* 앵커, 이력 회차로 할일 옮기기)은 owner 사용 피드백 후.
