# 09. 다음 작업과 인수인계

## 9.0 확정 순서 (Owner 확정 2026-08-18 — 이 순서대로 간다, 바꾸면 여기 먼저 고친다)

목표: 엔진이 "없다"만이 아니라 **"이제 이걸 이렇게 하라"**를 체계공학 근거와 함께 답하게 하고, 그 답을 MCP로 쓰게 한다.

| 순서 | 조각 | 만드는 것 | 끝나면 되는 것 |
| --- | --- | --- | --- |
| A1 | 관측 확대(있냐 + 성숙도) | 문서 색인·메일 첨부·03_Out → 산출물별 있음/없음 후보 + 성숙도(D/U/F, 파일명·판·승인) → Owner 확인 → 관측 | KVDS 불명 95가 있음/없음으로 갈림 |
| A2 | 선후 관계표 + 순서 계산(파이프라인) | 스펙 행에 `입력 산출물(depends_on)` 열(①은 NASA/DoD, ②③은 방사청·발주처 근거) + 컴파일러 정렬(규정 필수→진입 조건→선후) | 4층 합친 결과에서 과제·사업유형·등급·발주처별 순서가 자동으로 나옴; 빈 과제도 "무엇부터" 답함 |
| A3 | 산출물별 가이드 카드(어떻게) | 스펙 행 + 정본 인용(색인) + 양식 + 앞뒤 관계 + 담당 capability → 카드 | 첫 "이제 뭐 해야 해?" 답: 위치·부족·다음 3개(왜·어떻게·근거·담당). Owner용, 스크립트로 |
| B1 | 엔진 MCP 서버(feature-OFF 제작) | 도구: 규칙 보기·판단·다음 할 일·가이드 카드·관측 넣기·답 넣기. 엔진 폴더 안, 로직 없음, 같은 잠금 | Owner 결정으로 켜면 팀원·AI 비서가 씀 |
| B2 | 답변 우편함 | 사람 답(있음/해당 없음/근거) → 맥락 사실 → 다음 실행 관측 | 같은 질문 반복 안 함 |
| B3 | 야간 예약 실행 | 운영 체크아웃에서 주 1회 runner + 결과 브리프 | 사람이 안 눌러도 돎 |
| C1 | 과제 착수 명령 | 5입력 → 폴더트리·규칙 컴파일·빈 덧씌움·결속 뼈대·base packet 틀·첫 판단 | 새 과제 하루 안에 태움 |
| C2 | 발주처 덧씌움 추가·사업유형 재기준(D43) | 한화 등 발주처 지침 → overlay; 탐색·선행·운용 스펙 실제 과제로 검증 | 다른 과제도 같은 답 |
| D1 | 문서 내용 검사기(제대로 됐나) | 산출물별 필수 절·표·양식 → 내용 충족/부족/미검사 관측 | "있는데 부실"까지 답함 |
| D2 | 요구 추적 후반(R2 원장·R3 투영·R4 카드) | 계약 요구→산출물→시험 원장과 투영 | "잘 하고 있냐"(요구 118 추적) |
| E1 | 조언 lane 승격 | 정본 인용 붙인 조언(판단과 분리) | "어떻게 판단해야 하냐" |

원칙: A→B→C→D→E 순, 한 번에 한 조각, 각 조각은 시험·영수증·문서 동기화·commit+push로 닫는다. 판단(A1·A2·D1·D2)은 결정론, 안내(A3·E1)는 정본 인용 붙인 안내로 분리한다. 새 기초(잠금·계약·store)는 더 만들지 않는다.
Owner 결정 대기: D42~D45, MCP 켜기 시점, Needs 정책 후보, D40.

## 9.1 다음 조각 (상세 참고표)

| # | 조각 | 입력 | 출력 | 완료 기준 |
| --- | --- | --- | --- | --- |
| 1 | **①↔② 토큰 별칭 정합** | ① `generic_se_base.json`, ② `system_dev_common_no_grade.json`, 어휘 | 어휘에 canonical+aliases(또는 ② 토큰 정규화 + 반복 행), 비교 드라이버 재실행 | 같은 게이트에서 ①∩② 토큰 수가 사람이 검토한 대응표와 일치, 시험 추가, D44 표시명 표와 함께 Owner 확인 |
| 2 | **표준 항목 관측 확대 + runner 재실행(27 정책)** | run 03 packet, 120_CDR 정책 27, 과제 폴더·색인 관측 | run 04(zero-write) | 불명 16~18 중 관측 가능한 것이 present/absence_confirmed로 바뀌고 mission 후보가 담당 capability로 나옴 |
| 3 | **NASA SE Handbook 반영(① 보강)** | `src_NASA_SE_HANDBOOK_*.json`, ① 스펙 | 행 인용 보강 또는 행 추가, 도출 기록 §6-1 닫기 | 3-출처 바닥 규칙 재확인, `--check`·시험 통과 |
| 4 | **R2 원장 writer** | R1/R2 준비 조각, Owner 승인 소량 pin(rtm 25 + contract_sow 18, 한 stage) | JSONL 원장 4종 writer + 재생 parity | 설계 §8 R2 완료 기준 4개, `guard:workmeta-write` 전건 |
| 5 | **커버리지 generation 생성기(R3 후반)** | R2 원장 | `projections/rtm/generations/<id>/` + packet | 같은 cutoff 두 번 → digest 동일 |
| 6 | **탐색·선행·운용·응용 variant 재기준(D43)** | 대조표 §10 초안, 정본 881호·974호 | draft variant 스펙 | 실제 과제 1건 검증 전 승격 금지 |
| 7 | **문서 내용 검사기(설계 §2.1A)** | 산출물 원문(private) | 산출물 안 필수 절·표 존재 판정 | zero-write, 정본 기준 |
| 8 | R4 카드·ERP read model·MCP 뷰 | R2/R3 | 얇은 카드, SQLite read model, MCP 뷰 4종 | 7조건 게이트 리포트 |
| 9 | **답변 우편함(Context Response 수신 경로)** — MCP·P5 시점 | 독립검토 스레드(V1.2, 2026-08-11) 지적: 엔진은 질문+답변 영수증 둘 다 있어야 판정을 바꾸는데 답변을 실제로 받는 경로가 없음. `kernel/context_receipt.mjs`(Phase 3, 합성 전용·전송 없음)에 영수증 **검증**만 있고 runner는 질문을 내지도 답을 읽지도 않음 | 우편함 writer(답 → 답변 영수증+후보, private) + runner의 질문 발행/답변 읽기 + P5 승인자 등록 | Owner 판단(2026-08-18): **MCP 구현 단계에서** 함. 그때까지 답은 `artifact_observations`(누가·언제·근거)로 수동 공급하고 엔진 코드는 바꾸지 않는다 |

정리 잔여(엔진 밖): ai_usage_meter 상태 폴더 해시 64→16(수집기 정지 창), `_workspaces/system` 실험·git_push 잔재, P23-037/RAW 뿌리 축약, 지식 intake 파일 61개 슬러그 반복, 휴지통 삭제(09-17 이후).

## 9.1A 출시 형태 (Owner 결정 2026-08-18)

- **밖에서 엔진을 부르는 정문은 MCP 하나다.** 팀원·AI 비서·Owner 모두 MCP로 묻고(판단·결손·불명), 답·관측도 MCP로 넣는다. 터미널 CLI 제품은 만들지 않는다(다른 회사 개발자에게 공급할 때만 껍질로 추가 검토).
- 지금 있는 스크립트(runner·드라이버)는 내부용이다: 개발·검증·야간 예약 실행이 치는 것이며 사용자에게 배포하지 않는다. "CLI 배포"라는 별도 산출물은 없다 — 배포되는 것은 엔진 코드 한 벌(운영 체크아웃 최신화)뿐이다.
- MCP 서버는 dev-ERP 안이 아니라 엔진 owner 아래 독립으로 둔다(예: `guild_hall/engineering_engine/mcp/`). dev-ERP는 존폐 미정이므로 엔진 출시 경로가 그것에 의존하지 않게 한다.
- MCP 도구는 로직을 갖지 않고 기존 순수 함수·runner를 그대로 부른다(한 로직, 여러 호출자). 잠금은 하나: launch 파일 + sha 핀 + Owner 동결 grant + zero-write + `_workmeta` 영수증. MCP 활성화 시점·답변 우편함(9.1의 9번)은 Owner 결정.
- 밤에는 예약 실행이 같은 runner를 부른다(엔진용 예약은 아직 미설정).

## 9.2 새 작업자(LLM 포함) 시작 체크리스트

1. `AGENTS.md` → `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md` → 이 매뉴얼 README·01·02·03 순으로 읽는다. 관련 없는 문서를 선적재하지 않는다.
2. HEAD·`.git/index.lock`·dirty change ownership 확인. 다른 스레드(예: Codex 엔진 스레드)가 실행 중이면 repo 무접촉.
3. 바꾸려는 것이 규칙이면 **스펙 md**를 고친다(코드 아님). exporter → `--check` → `validate:se-stage-rules` → `validate:se-foldertree-compiled` → 실제 과제 1건 재컴파일.
4. 새 파일·폴더는 `npm run validate:path-length`(예산 200/60/60/해시 16). `_workmeta` 아래에 쓰기 전 `npm run guard:workmeta-write -- --assert-write-target "<target>"`.
5. private 원문·사업명 세부·개인명·절대경로·secret은 public 파일에 넣지 않는다. 실행 결과는 수치와 상대 포인터만.
6. 병렬 코더를 쓰면: 패킷(설계 authority·baseline HEAD·입력·산출물·검증 명령·commit 메시지)을 문서로 주고, 격리 worktree, ff-merge 전 HEAD 검증. 결과 통합 시 계약 불일치는 컴파일러가 수용하고 시험으로 고정. 신선한 컨텍스트로 적대적 검토 1회.
7. 끝낼 때: 시험·validator 실제 결과 기록, `CHANGELOG.md`, 로드맵 delta log, 마스터플랜 CURRENT, 이 매뉴얼의 해당 장, five-field capture, commit+push, `규칙 강화 체크:`.

## 9.3 하지 말 것

- 규칙을 엔진 코드에 하드코딩하거나 컴파일러가 규칙을 "보완"하게 만들기.
- overlay로 evidence level 올리기·바꾸기(D45), 표준이 이미 요구하는 항목에 `add`.
- 어휘 밖 토큰을 스펙에 두고 넘어가기(unmapped context로 조용히 빠진다 — 시험이 잡는지 확인).
- 관측을 이웃 requirement로 추정해 붙이기, 미관측을 결손으로 접기.
- 실제 과제 실행 결과·원문을 public 문서·fixture에 넣기. Task 생성·승인·canon 승격·ERP write를 엔진이 하게 만들기.
- 새 top-level root·schema·workflow·정책 store를 Owner 계약 없이 만들기.

## 9.4 Owner에게 보고하는 법(이 프로젝트의 관행)

- 짧게, 한국어로, 비유 한 줄 + 표 하나. 다음 액션은 **하나**만 제시한다(긴 목록은 결정을 어렵게 한다).
- 매핑표·영수증 나열 대신 "무엇이 바뀌었고 무엇이 남았나"를 수치로. 확인 못 한 것은 UNKNOWN/HOLD로 정직하게.
