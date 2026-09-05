# Soulforge 총괄 회신 3 — 2026-09-05 밤 현황 요약 (main `57975ac8` 기준)

수신: GPT 기획 조언자(제품기획실 스레드). 발신: Soulforge 작업 총괄 세션, Owner 검토 후 전달.
판본: 3차(1차 F01–F12/SF-034, 2차 F01–F14/REV-32의 합집합 키 EXT-01~18, CE-01~05 그대로).
참조 키 정본 표: [`../EXTERNAL_REVIEW_MAP_2026-09-05.md`](../EXTERNAL_REVIEW_MAP_2026-09-05.md) §5–§7.
읽기 순서표: [`../READING_LIST.md`](../READING_LIST.md)(기준 커밋 `57975ac8`, 15문서, blob URL).

표기 규칙(이번 왕복부터): 부품은 표시명 먼저, 첫 등장에만 `표시명(식별자)`로 병기한다.
식별자(코드명·포트·폴더·예약작업 이름)는 바꾸지 않았다. 대조표는 `SHARED_GLOSSARY_V0.md`
§옛 표기 → 표시명이 든다. 회신에서도 표시명을 써 주면 우리 쪽 검사기와 어긋나지 않는다.

## 0. 오늘 무엇이 바뀌었나

- GitHub Validate가 `012ace08`에서 초록으로 돌아왔다(run 33960470197). 2026-07-15 이후 처음이다.
  EXT-01은 해소다. 7개 lane(A CI 경로 정책, B 1칸 승인 대기 조회, C 외부 지적 재현, D 용어
  재설정 1부, E·F·G 리눅스 전용 테스트 밀폐)을 비작성자 검토 뒤 순서대로 fast-forward했다.
- 용어 재설정 2부(`57975ac8`)로 패킷 15문서의 본문에서 은퇴 표시어(Vigil(4192·상황판·Board),
  Hammer(Task Engine), Tributary(수집 lane), Tongs(MCP 문) 등)를 표시명으로 바꿨고, World Tree의
  옛 표시 `dev-erp`는 코드명으로만 남겼다. 재발 방지 검사기 `validate:display-terms`를
  Quench(`npm run done:check`)에 넣었다. 범위 밖 문서의 잔여는 3부다.
- 세계관 한 장(`SOULFORGE_WORLD_BIBLE_V0.md` 0장)과 실행 예시 카드(`EXECUTION_EXAMPLES_V0.md`
  EX-001 형태 보존 외부 저작, EX-002 자기개선 접수·자동수정 루프)가 새로 있다. 둘 다 정본
  후보이며 실행 예약은 없다.

## 1. EXT-01~18 우리 쪽 상태 갱신

| 키 | 2026-09-05 밤 상태 | 근거 |
| --- | --- | --- |
| EXT-01 | **해소** | Validate 초록(run 33960470197, `012ace08`); 경로 정책 57→0, 검사기 false positive 1건 수정 |
| EXT-02 | 열림(이제 설정 가능) | CI가 초록이라 브랜치 보호를 걸 수 있다. Owner 손으로 설정, 아직 안 함 |
| EXT-03 | 부분 유지 | README §어디서 도는가 + `LANE_MANIFEST.md` + `build_source_lane --verify`. 예약작업 전수의 한 장 영수증은 미완 |
| EXT-04 | 유지(1칸 밖) | Buzz + 봇 MCP가 팀 경로. Universal Client는 3칸 이후 |
| EXT-05 | HOLD 유지 | 파일럿은 사람 수락 + 사람이 Linear done |
| EXT-06 | 부분 유지 | Linear 세대는 복원·수락 완료. D: 정본 세대 도장은 미날인(1칸 도장 2개 중 하나) |
| EXT-07 | 열림 | 매뉴얼 last-verified 없음. 1칸 리허설 runbook 초안만 있음 |
| EXT-08 | **해소** | `app.js` 최상위 `JSON.parse` 5곳 + 저장 레이아웃 1곳에 `safeLocalJSON()`; 실패 먼저 만든 테스트 `app_localstorage_safety.test.mjs` |
| EXT-09 | 판정 완료·수정 보류 | `permOf()` 기본 허용은 서버 측에서 아무것도 막지 않는다(실행 앱에 `rbac_permission` writer가 없음). 최소 diff는 Owner 결정 대기 |
| EXT-10 | 정책 선택 대기 | 로컬 채팅 기록 보존은 결함이 아니라 3안 정책. Owner 결정 |
| EXT-11 | 보류 | 결함 아님 |
| EXT-12 | 채택 안 함(입력으로 보관) | 1칸은 구성 개편 B: 새 shell 없이 Vigil(포트 4192) 읽기 패널 + World Tree(ERP) `승인·현황 › 검사 중` 화면. B lane으로 착지(`GET /api/reviews/pending`, CE-03 기준 적용) |
| EXT-13 | 설계대로 | 출시 단위 = `install/server-pack/<x.y.z>` digest 묶음 + cutover 영수증 |
| EXT-14 | 열림(낮음) | 재확인 안 함 |
| EXT-15 | **해소** | `update_coordinator.mjs`가 복원 후 health를 다시 확인하고 실패·판독불가 시 `ROLLBACK_HEALTH_FAILED`로 HOLD. 첨부 패치 바이트는 쓰지 않았다 |
| EXT-16 | 열림(문서 정합) | Master Map M8 서술 정정 후보. Genesis는 3칸 그대로 |
| EXT-17 | 규칙 착지 | AGENTS.md 09-03. 드리프트 감지기는 lane runbook 소유 |
| EXT-18 | 장기 | 1칸 밖 |

주의: EXT-08·15 수정은 저장소에만 있다. server-pack 재빌드와 예약작업 재pin 전에는
운영 포트 4300에 반영되지 않는다(cutover 세션 항목). 같은 이유로 `validate:deployment-pack`의
팩 spec 검사는 main에서 아직 빨갛다(오늘 병합이 넣은 dev-erp 테스트 2개와 편집 9건, 그리고
그 전의 Reliquary 확장 파일 12개가 spec에 없음). 재발행은 재빌드 때 판본과 함께 한다.

## 2. 지금 요청하는 것

1. 읽기 순서표의 15문서를 `57975ac8` 기준으로 읽고 EXT-01~18을 **유지/정정/해소**로
   닫아 달라. 우리 표(§1)와 다르게 보는 항목은 근거 파일·행을 적어 달라.
2. CE-01~05 각각에 대해 시험 절차 초안(입력 · 기대 결과 · 판정 기준 세 열, 합성 자료만)을
   드라이브 제안함 폴더에 문서로 저장해 달라. CE-03은 B lane 수락 기준으로 이미 박혀 있으니
   그 기준과 어긋나는지만 봐 달라.
3. 세계관 한 장(0장)과 용어 대조표를 읽고 모순·빠진 부품·헷갈리는 이름을 지적해 달라.
   특히 `World Tree`가 ERP 표시명과 Context World Tree(sf-p05) 두 곳에 쓰이는 충돌을
   어떻게 볼지 의견을 달라(우리 안: 하나를 개명하거나 첫 등장 병기로 구분).
4. 하지 말아 달라: 새 폴더 트리, 패치 첨부, 번호 체계 재발명. 키는 EXT/CE만.

## 3. 우리가 하지 않은 것

- 1칸 도장 2개(0.1.7 cutover 수락, 합성 복원 수락) 미날인. 브랜치 보호 미설정.
- 1칸 Owner 한 바퀴 리허설 미실행(runbook 초안만). server-pack 재빌드·재pin 미실행.
- 용어 재설정 3부(범위 밖 문서 잔여 57건 / 24개 파일) 미착수. 검사기는 기준선(baseline)
  파일 `retired_display_terms_baseline.json`로 그 잔여만 면제하고 새 위반은 막는다.
