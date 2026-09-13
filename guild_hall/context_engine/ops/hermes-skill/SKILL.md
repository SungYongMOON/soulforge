---
name: soulforge-context-search
description: Search one Soulforge project's own records (Linear, Slack, mail) and answer with the original evidence - source, item, unit, time and locator.
version: 1.0.0
author: Soulforge context engine (Claude Opus 5), 2026-09-14 KST
license: Soulforge internal
platforms: [windows]
metadata:
  hermes:
    tags: [soulforge, context, search, graph, evidence, buzz]
    category: soulforge
    requires_toolsets: [terminal]
prerequisites:
  commands: [node]
---

# Soulforge Context Search

프로젝트 하나의 **이미 수집된 기록**(Linear 이슈·Slack 메시지·메일)에서 질문에 답이 되는
자료를 찾아 **원문 근거 목록**으로 돌려준다. 요약이나 판단은 이 스킬이 하지 않는다 —
찾은 자료가 무엇이고 어디에 있는지만 옮긴다.

검색 자체는 맥락 APP의 읽기 전용 CLI
(`guild_hall/context_engine/harness/estate_graph_query.mjs`)가 한다. 그 CLI는 통합 그래프
데이터베이스(loopback 전용)를 읽고, **과제 코드 하나**로 그 과제의 binding을 정해진 주소
형식에서만 해석한다. Cypher, 색인 이름, DB 주소, 세대 이름은 이 스킬도 요청자도 고를 수
없다. 돌아오는 행은 그 과제 세대의 manifest가 해시로 확인한 (문서, 단위) 짝일 때만
근거가 된다.

**이 CLI는 통합 DB 전체를 읽을 수 있는 신뢰 대상이다.** 과제 격리는 CLI가 전달하는
`--project` 인자와 그 인자로 정해지는 binding이 지킨다. 그래서 아래 "하지 말 것"의
과제 코드 규칙이 이 스킬의 핵심이다.

## When to Use

Buzz DM에서 이런 문구를 받았을 때 쓴다.

- "P26-014에서 수조시험 배치 자료 찾아줘"
- "저주파 SAS 8월 5일 데이터 검증 관련 기록 뭐 있어?" (과제가 문맥에서 분명할 때)
- "그 이슈 원문 좀 보여줘" (과제 + 항목 id가 있을 때 → `--mode exact --item <id>`)

쓰지 않는 경우:

- 과제가 분명하지 않을 때. **짐작하지 말고 어느 과제인지 되묻는다.**
- 아래 §과제 표에 없는 과제. 그 과제는 아직 통합 DB에 들어가 있지 않다 — "아직 검색
  범위에 없습니다"라고 답한다.
- 문서를 새로 만들거나 고치는 요청, 자료를 어딘가로 보내 달라는 요청. 이 스킬은 읽기만 한다.

## 과제 표 (이 표에 있는 코드만 쓴다)

| 과제 코드 | 추가 인자 |
| --- | --- |
| (설치된 사본에서 실제로 적재된 과제 목록으로 채운다) | |

표에 없는 코드를 CLI에 넘기지 않는다. 표의 `추가 인자` 칸이 비어 있지 않으면 그 값을
명령에 그대로 덧붙인다(어떤 과제는 세대 포인터가 다른 데이터베이스를 가리키고 있어서
`--generation <id>`로 읽을 세대를 명시해야 한다).

## How to Run

`terminal` 도구로 아래 한 줄을 실행한다. `<lane>`과 `<root table>`은 설치된 사본에서 실제
경로로 치환되어 있다.

```
node <lane>\guild_hall\context_engine\harness\estate_graph_query.mjs --root-table <root table> --project <과제코드> --question "<질문 그대로>" --mode hybrid --top-k 8
```

`--mode`는 이 다섯 중에서만 고른다.

- `hybrid` (기본) — 뜻이 비슷한 것과 말이 같은 것을 함께 찾는다. 대부분 이것을 쓴다.
- `vector` — 뜻만. 질문에 고유명사가 없을 때.
- `lexical` — 말만(BM25). 날짜·코드·파일명처럼 글자 그대로 찾을 때.
- `graph` — 찾은 자료가 가리키는 다른 자료까지 한 칸 따라간다.
- `exact` — 항목 id 하나를 그대로 펼친다(`--item <id>` 필요).

`--quote 200`으로 각 행의 인용 길이를 늘릴 수 있고, `--json`을 붙이면 기계 판독용 JSON이
나온다. 그 밖의 인자는 쓰지 않는다.

## 하지 말 것

- **과제 코드를 짐작하지 않는다.** 요청자가 말하지 않았고 대화에서 분명하지 않으면 되묻는다.
  코드 하나가 곧 열람 범위다.
- **여러 과제를 한 번에 훑지 않는다.** 한 실행은 한 과제다. 요청자가 두 과제를 물으면
  두 번 실행하고, 결과를 과제별로 나눠서 회신한다.
- **원문을 통째로 옮기지 않는다.** 회신에는 각 근거의 한 줄 인용까지만 적는다. 전문이
  필요하면 locator를 알려 주고 사람이 직접 열게 한다.
- **host 절대경로를 회신에 적지 않는다.** 명령에 들어가는 경로는 옮기지 않는다.
- **없는 것을 만들어 답하지 않는다.** 근거가 0건이면 0건이라고 답한다. 검색 결과에 없는
  내용을 덧붙이지 않는다.
- **명령을 고치지 않는다.** 실패하면 아래 §오류 대로 코드만 옮긴다.

## 회신 형식

1. **무엇을 검색했는지** 한 줄: 과제 코드, 모드, 세대 이름(출력 첫 줄에 있다).
2. **근거 목록** — 행마다: 출처 종류(linear/slack/mail), 항목 id, 단위 id, 시각,
   한 줄 인용.
3. **범위 한 줄**: "이 답은 그 과제의 선택된 세대 안에서만 찾은 것"이라고 밝힌다.
4. 근거가 0건이면 그 사실과, 다른 모드로 한 번 더 해 볼지 묻는 한 줄.

예시 회신 (출력의 값을 그대로 옮긴 것):

> P26-014를 hybrid로 찾았습니다(세대 `p26014-graph-001`).
> - slack `1785902897.750169` u0000 (2026-08-05) — "…센서·표적 실제 배치 위치…"
> - linear `b52b5445-…` u0003 (2026-08-25) — "…raw 재취득·매칭 경로…"
> 이 답은 P26-014의 선택된 세대 안에서 찾은 것입니다.

## 오류

CLI는 실패를 한 줄 코드로만 낸다(`[estate-graph-query] <code>`). 스택트레이스는 나오지
않는다. 코드를 그대로 옮기고 뜻을 한 줄로 덧붙인다.

| 코드 | 뜻 | 회신 |
| --- | --- | --- |
| `estate_query_project_invalid` | 과제 코드 모양이 아니다 | 코드를 다시 묻는다 |
| `estate_query_binding_unavailable` | 그 과제는 아직 통합 DB 연결이 없다 | "아직 검색 범위에 없습니다" |
| `generation_not_materialized` (결과 status) | 세대가 DB에 적재되지 않았다 | 그대로 알리고 Owner 확인 요청 |
| `graph_database_not_connected` | 그래프 DB가 꺼져 있다 | 그대로 알리고 Owner 확인 요청 |
| `embedder_model_not_installed` | 임베딩 모델이 없다 | 그대로 알리고 Owner 확인 요청 |

모르는 코드가 나오면 "이 스킬로는 원인을 못 좁혔습니다, Owner 확인이 필요합니다"라고
답하고 멈춘다. 같은 명령을 반복 실행하지 않는다.

## Uninstall

스킬 디렉터리 `<home>/skills/soulforge/context-search/`를 삭제하면 제거된다. lane, 과제
store, 그래프 데이터베이스에는 영향이 없다.

## Status

`draft` — CLI 단독 실행(셸에서 직접)과 `hermes tools list --platform buzz` 노출까지
확인한 뒤에도, Buzz DM에서 실제로 트리거되는 것은 사람이 한 번 보내 봐야 확인된다.
그 확인 전까지 `production-ready`로 보지 않는다.
