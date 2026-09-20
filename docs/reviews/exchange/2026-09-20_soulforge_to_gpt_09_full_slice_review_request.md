# Soulforge → GPT 재자문 09 — 오늘 만든 것 전체(개념 + 코드) 검토 요청 (2026-09-20 밤)

기준 커밋: `41e0ea12`(main). 판본: 1차. 회신 키는 EXT-68~ / CE-25~ 이어서 사용. 회신 08(EXT-63~67/CE-20~24)에 대한 우리 대응은 이 문서 §3에 적었다.
작성: Claude Fable 5.1 (Owner 지시로 작성). 이 문서는 제안함 사본이며 정본이 아니다.

## 0. 부탁하는 것

회신 08은 설명서만 보고 판정했다. 이번에는 **개념 전체**와 **실제 코드**를 같이 봐 달라.

1. **개념이 맞는가.** 아래 §1의 흐름(수집 → 1단계 카드 → 2단계 대조 → 답변 → 아침 예외 질문 → 정정 고리)이 "커넥터 없이 우리 수집만으로 프런티어 모델만큼 맥락을 정리한다"는 목표에 맞는 구조인가. 빠진 층, 순서가 틀린 곳, 없어도 되는 층을 말해 달라.
2. **코드가 회신 08의 판정과 맞는가.** §2의 파일을 읽고, EXT-64(수락 경계)·EXT-65(예외 입구)·EXT-66(내용 검증)·EXT-67(제한 운영)과 CE-21~24의 반례 중 코드가 이미 만족하는 것, 어긋나는 것, 시험이 없는 것을 파일·함수 이름으로 짚어 달라.
3. **Owner의 한 가지 걱정**: 사람에게 너무 많이 묻게 될까 봐 예외 입구를 좁혔다. 회신 08의 넓힌 입구를 받으면서도 하루 질문 수를 묶는 방법(예: 예외함은 다 보존하되 아침에는 우선순위 상위 N건만)이 §1 구조 안에서 어디에 들어가야 하는지.

## 1. 개념 한 장

```
[수집: 메일·Slack·Linear·녹음 → custody 원문, 불변]
        │
        ▼
[1단계 카드]  야간 03:00, 전날 녹음마다 대화 구간 카드(제목·설명·성격·과제 후보 strong/weak/미분류)
        │     로컬 모델(27B) 배치, 같은 녹음 안의 문맥만 사용, 외부 자료 없음, 재생성 가능, 비정본
        ▼
[2단계 대조]  카드 ↔ 같은 날 ±1 메일 제목·발신자, Linear 이슈 제목 → provisional / candidate / exception / skip
        │     route 원장에는 candidate로만 씀(confirmed는 사람만), 영수증에 exception_review 목록
        ▼
[답변]  봇(맥락이, 같은 로컬 모델)이 질문을 받으면 카드 표의 시간·제목·과제 후보 열만 읽고,
        │     결정·액션이 필요한 구간만 설명 열·전사 창을 읽어 답 → 결론·날짜·사람·제목, 포인터는 끝 한 줄
        ▼
[아침 예외 질문]  브리핑 끝 "어제 애매한 것 N건"  (계획, 미연결)
        ▼
[정정 고리]  DM 한 줄 → voice_route_cli confirm/withdraw → 카드·페이지 반영  (계획, 명령만 있음)
        ▼
[정본]  과제 폴더·과제 페이지에는 accepted 또는 strong provisional만  (계획)
```

운영 방침(Owner 09-20): 기본은 해 놓고 고치기 / 예외만 아침에 모아 묻기 / 정정은 카드에 반영 / 확정은 정본에 쓸 때만 / 판정 규칙은 독립 모듈.

## 2. 읽기 순서표 (전부 커밋 41e0ea12 고정)

| 순서 | 무엇 | 링크 | 봐 줄 것 |
|---|---|---|---|
| 1 | 운영 방침 절(정책 문서, "2026-09-20 운영 방침" 절과 상태 모델 표) | https://github.com/SungYongMOON/soulforge/blob/41e0ea12/docs/architecture/workspace/VOICE_RECORDING_LIBRARY_V0.md | 구현됨/계획 표시가 코드와 맞는지, 상태 모델과 09-20 절의 예외 정의 불일치 |
| 2 | 판정 모듈 v0(교체 가능 모듈) | https://github.com/SungYongMOON/soulforge/blob/41e0ea12/guild_hall/context_engine/src/runtime/voice_attribution_policy.mjs | `classifyAttribution` 검사 순서, `RISK_MARKERS`·`MONEY_PATTERN`, `strong_conflict`, weak 승격 조건 |
| 3 | 판정 모듈 시험 | https://github.com/SungYongMOON/soulforge/blob/41e0ea12/guild_hall/context_engine/tests/voice_attribution_policy.test.mjs | CE-22 반례 중 없는 것 |
| 4 | 2단계 대조기 | https://github.com/SungYongMOON/soulforge/blob/41e0ea12/guild_hall/context_engine/harness/estate_voice_card_reconcile.mjs | `mailCorroborates`·`linearCorroborates`(같은 날 제목·발신자 승격), 원장 쓰기 경계(`RECONCILE_ACTOR`, 사람 행 보호, fail-closed), 영수증 |
| 5 | 대조기 시험 | https://github.com/SungYongMOON/soulforge/blob/41e0ea12/guild_hall/context_engine/tests/estate_voice_card_reconcile.test.mjs | CE-21 반례 중 없는 것 |
| 6 | route 원장 writer(사람 확정 명령) | https://github.com/SungYongMOON/soulforge/blob/41e0ea12/guild_hall/context_engine/harness/voice_route_cli.mjs | confirmed는 사람만인지, 정정 뒤 AI가 덮어쓰지 못하는지 |
| 7 | 1단계 야간 실행기 | https://github.com/SungYongMOON/soulforge/blob/41e0ea12/guild_hall/context_engine/harness/voice_conversation_list_nightly.mjs | CE-24: backlog 7일·30초 미만 skip·lock·영수증·실패 처리 |
| 8 | 예약작업 등록기 | https://github.com/SungYongMOON/soulforge/blob/41e0ea12/guild_hall/context_engine/ops/register-voice-conversation-list-task.ps1 | pin·드라이런 digest·등록 후 검증·되돌림 |
| 9 | 카드 생성기(strong/weak 임계값이 아직 여기 있음) | https://github.com/SungYongMOON/soulforge/blob/41e0ea12/guild_hall/context_engine/src/runtime/voice_conversation_list.mjs | `checkCandidates` 근처, 임계값을 판정 모듈로 옮겨야 하는지 |
| 10 | 봇이 쓰는 두 CLI(검색·원문 읽기) | https://github.com/SungYongMOON/soulforge/blob/41e0ea12/guild_hall/context_engine/harness/estate_graph_query.mjs · https://github.com/SungYongMOON/soulforge/blob/41e0ea12/guild_hall/context_engine/harness/estate_original_read.mjs | 답변 경로가 카드·원문 중 무엇을 언제 읽는지 |
| 11 | 회신 08과 우리 패킷 08 | https://github.com/SungYongMOON/soulforge/blob/41e0ea12/docs/reviews/exchange/2026-09-20_soulforge_to_gpt_08_context_summary_layer.md | 대조용 |

봇 지침(맥락이 프로필의 SKILL·SOUL)은 요청자 신원과 과제 별칭이 들어 있어 공개 저장소에 없다. 변경 5개의 내용은 패킷 08 §2에 있다.

## 3. 회신 08에 대한 우리 대응(초안, Owner 결정 전)

- EXT-63 동의 → 채택. 다음 측정부터 ①원문+도구 ②같은 모델+카드 ③+2단계를 구분.
- EXT-64 정정 → 채택. 정책 절 4항에 "accepted는 귀속 수락, 카드 속 결정·기한은 별개 근거 상태" 추가 예정.
- EXT-65 반대 → 인정. 정책 문서 상태 모델(`exception_review_required` = 충돌·새 과제·낮은 신뢰도·필수 맥락 누락)보다 09-20 절이 좁게 쓰였다. strong 충돌은 커밋 41e0ea12에서 이미 `exception`. 새 과제 후보·필수 맥락 누락·판독 불가(skip 아님)·weak 승격 끄기는 Owner 결정 뒤 판정 모듈 v1로.
- EXT-66 정정 → 채택(계획). 중요 필드 원문 재독 단계는 다음 조각.
- EXT-67 동의(조건) → 채택. 09-21 03:00 첫 실행 영수증 확인 전까지 사용 범위 유지.

## 4. 오늘 밤 코드 검토 이력(참고)

비작성 검토 2회(외부 모델 Opus). 1회차 필수 8건(위험 표지 '원' 부분 일치, Linear 제목 한 단어 일치 승격, 과제 코드 글자 그대로 미대조, 원장 못 읽으면 fail-open, import 실패 미기록, 사람 후보 덮어쓰기, strong 충돌 미처리, 문서 표시) → 2회차 필수 1건(금액 정규식이 "1. 원인"을 금액으로) + 권장 4 + 사소 3 → 전부 반영. 시험 87/87, 경로 정책 위반 0. 9/18 실제 카드 드라이런: provisional 8 · candidate 51 · exception 6 · skip 36(1회차 exception 14 → 6, 줄어든 8건은 전부 '원' 오탐).

## 5. 요청

§0의 세 가지를 EXT-68~/CE-25~ 키로. 코드 지적은 파일·함수 이름으로. 회신은 제안함 문서로.
