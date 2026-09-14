---
name: soulforge-context-search
description: Search one Soulforge project's own records (Linear, Slack, mail), then read a found item back to its original - every unit in full, its attachment list, and the text inside one attachment - and answer with source, item, unit, page and locator. Also reads one window of an unclassified voice recording (transcript only) so a mixed session can be judged interval by interval.
version: 2.1.0
author: Soulforge context engine (Claude Opus 5), 2026-09-15 KST
license: Soulforge internal
platforms: [windows]
metadata:
  hermes:
    tags: [soulforge, context, search, graph, original, attachment, evidence, voice, buzz]
    category: soulforge
    requires_toolsets: [terminal]
prerequisites:
  commands: [node]
---

# Soulforge Context Search

프로젝트 하나의 **이미 수집된 기록**(Linear 이슈·Slack 메시지·메일)에서 질문에 답이 되는
자료를 **찾고**, 찾은 항목을 **원본까지 되읽어** 근거 목록으로 돌려준다. 순서는 하나다.

**찾기 → 필요한 항목의 본문 전문 읽기 → 첨부 목록 확인 → 필요한 첨부의 텍스트 읽기 →
(그림이 필요하면 렌더는 만들 수 있으나 이 봇은 이미지를 읽지 못한다).**

아직 어느 과제 것도 아닌 **음성 녹음**은 다른 길이다. 과제 코드로 들어가지 않고 세션 id로
**구간(창) 하나씩** 전사를 읽어, 창마다 어느 과제 얘기인지를 **후보로만** 적는다(§음성 구간 검토).

요약이나 판단은 이 스킬이 하지 않는다 — 찾은 자료가 무엇이고 어디에 있는지만 옮긴다.

일은 읽기 전용 CLI **두 개**가 한다. 둘 다 같은 lane에 있고 같은 규칙을 따른다.

- **검색 CLI** `estate_graph_query.mjs` — 통합 그래프 데이터베이스(loopback 전용)에서 항목을
  찾는다. 행마다 **그 단위의 첫 줄만** 인용한다. 원문 전체도 첨부도 이 CLI로는 나오지 않는다.
- **읽기 CLI** `estate_original_read.mjs` — 항목 하나를 원본으로 되읽어 **단위 전문**과
  **첨부 목록**을, 그리고 고른 첨부 하나의 **추출 텍스트**를 준다.

둘 다 **과제 코드 하나**로 그 과제의 binding을 정해진 주소 형식에서만 해석한다. Cypher,
색인 이름, DB 주소, 세대 이름, 파일 경로는 이 스킬도 요청자도 고를 수 없다. 돌아오는 것은
그 과제 세대의 manifest가 해시로 확인한 것일 때만 근거가 된다.

**이 CLI들은 통합 DB 전체를 읽을 수 있는 신뢰 대상이다.** 과제 격리는 CLI에 넘기는
`--project` 인자와 그 인자로 정해지는 binding이 지킨다. 그래서 아래 "하지 말 것"의
과제 코드 규칙이 이 스킬의 핵심이다.

## When to Use

Buzz DM에서 이런 문구를 받았을 때 쓴다.

- "`<과제코드>`에서 `<주제>` 자료 찾아줘"
- "`<주제>` 관련 기록 뭐 있어?" (과제가 문맥에서 분명할 때)
- "그 이슈 원문 좀 보여줘", "첨부에 뭐가 들어 있어?" (과제 + 항목 id가 있을 때 → 읽기 CLI)
- "이 녹음 무슨 얘기야?", "그 세션 앞 10분만 훑어줘" (**세션 id가 있을 때** → 7) 음성 읽기)

쓰지 않는 경우:

- 과제가 분명하지 않을 때. **짐작하지 말고 어느 과제인지 되묻는다.**
- 아래 §과제 표에 없는 과제. 그 과제는 아직 통합 DB에 들어가 있지 않다 — "아직 검색
  범위에 없습니다"라고 답한다.
- 문서를 새로 만들거나 고치는 요청, 자료를 어딘가로 보내 달라는 요청. 이 스킬은 읽기만 한다.

## 과제 표 (이 표에 있는 코드만 쓴다)

| 과제 코드 | 추가 인자 | 비고 |
| --- | --- | --- |
| (설치된 사본에서 실제로 적재된 과제 목록으로 채운다) | |

표에 없는 코드를 CLI에 넘기지 않는다. 표의 `추가 인자` 칸이 비어 있지 않으면 그 값을
명령에 그대로 덧붙인다(어떤 과제는 세대 포인터가 다른 데이터베이스를 가리키고 있어서
`--generation <id>`로 읽을 세대를 명시해야 한다).

## How to Run

`terminal` 도구로 아래 줄 하나를 실행한다. `<lane>`·`<root table>`·`<tools config>`는 설치된
사본에서 실제 경로로 치환되어 있다. **명령은 이 문서의 줄을 그대로 복사한다(경로 형식을
바꾸지 않는다).** 경로가 작은따옴표 안에 슬래시로 적혀 있는 것은 이 셸이 Git Bash라서다 —
백슬래시로 바꾸면 셸이 그것을 먹어 `Cannot find module`로 실패한다.

이 셸이 한 번에 돌려주는 출력은 5만 자에서 잘린다. 아래 `--max-chars` 값은 그 아래로
잡아 둔 것이다. 임의로 키우지 않는다.

### 1) 찾기 — 검색 CLI

```
node '<lane>/guild_hall/context_engine/harness/estate_graph_query.mjs' --root-table '<root table>' --tools-config '<tools config>' --project <과제코드> --question "<질문 그대로>" --mode hybrid --top-k 8
```

`--mode`는 이 다섯 중에서만 고른다.

- `hybrid` (기본) — 뜻이 비슷한 것과 말이 같은 것을 함께 찾는다. 대부분 이것을 쓴다.
- `vector` — 뜻만. 질문에 고유명사가 없을 때.
- `lexical` — 말만(BM25). 날짜·코드·파일명처럼 글자 그대로 찾을 때.
- `graph` — 찾은 자료가 가리키는 다른 자료까지 한 칸 따라간다.
- `exact` — 항목 id 하나를 그대로 펼친다(`--item <id>`와 `--question` 둘 다 필요 — 아래 표).
  **첫 줄만** 보여 주므로 목록 확인용이다. 본문을 보려면 읽기 CLI를 쓴다.

모드마다 반드시 있어야 하는 인자는 다르다. 빠지면 그 자리에서 멈춘다.

| 모드 | 반드시 있어야 하는 인자 |
| --- | --- |
| `hybrid` · `vector` · `lexical` · `graph` | 비어 있지 않은 `--question "<질문>"` |
| `exact` | `--item <항목 id>` **와** 비어 있지 않은 `--question` **둘 다**. `--question`에는 그 항목 id를 그대로 넣어도 된다 |

`--question`이 없거나 비어 있으면 모드와 상관없이 `estate_query_question_invalid`로 멈춘다.
`--quote 200`으로 각 행의 인용 길이를 늘릴 수 있고, `--json`을 붙이면 기계 판독용 JSON이
나온다. 그 밖의 인자는 쓰지 않는다.

### 2) 본문 첫 부분 + 첨부 목록 — 읽기 CLI (후보마다 먼저 이것)

```
node '<lane>/guild_hall/context_engine/harness/estate_original_read.mjs' --root-table '<root table>' --tools-config '<tools config>' --project <과제코드> --item <항목 id> --attachments --max-chars 400
```

한 번에 **단위 목록**(단위마다 id·종류·시각·글자수)과 앞부분 글, 그리고 **첨부 목록**이 같이
나온다. `--max-chars`는 단위마다가 아니라 **항목 전체에 걸친 합계**다 — 앞 단위부터 그만큼
보여 주고, 다 쓰면 남은 단위는 `[잘림: N자 중 M자 — --unit <id> --max-chars <더 큰 값>]`으로
자기 id와 길이만 알려 준다. 그래서 이 한 번으로 **무엇이 몇 자짜리로 들어 있는지**를 먼저
보고, 읽을 단위를 고른다.

### 3) 필요한 단위만 전문으로 — 읽기 CLI

```
node '<lane>/guild_hall/context_engine/harness/estate_original_read.mjs' --root-table '<root table>' --tools-config '<tools config>' --project <과제코드> --item <항목 id> --unit <단위 id> --max-chars 6000
```

2)에서 잘린 단위 중 **답에 필요한 것만** 이렇게 다시 읽는다. `--unit`을 주면 그 단위 하나만
나오므로 상한을 그 단위에 다 쓴다. 모든 단위를 큰 상한으로 한꺼번에 읽지 않는다 — 셸 출력
상한에 걸려 오히려 가운데가 사라진다.

### 4) 첨부 목록만

```
node '<lane>/guild_hall/context_engine/harness/estate_original_read.mjs' --root-table '<root table>' --tools-config '<tools config>' --project <과제코드> --item <항목 id> --attachments
```

목록 줄은 `#번호 · 종류 · 이름 또는 file id · mime · 크기 · sha256 앞 12자 · 상태 · 형식`이다.
상태 뜻은 §상태 어휘를 본다.

### 5) 첨부 하나의 텍스트

```
node '<lane>/guild_hall/context_engine/harness/estate_original_read.mjs' --root-table '<root table>' --tools-config '<tools config>' --project <과제코드> --item <항목 id> --attachment <번호>
```

`<번호>`는 목록의 `#번호`다(file id나 sha256 앞 12자도 받는다). 슬라이드·쪽이 여럿이면
`--slide <n>` 또는 `--page <n>`으로 하나만 볼 수 있다. 읽는 형식은 pptx·pdf·xlsx·txt·md·csv
뿐이고 그 밖은 `unsupported_format`이다.

### 6) 그림이 필요하면 — 렌더

```
node '<lane>/guild_hall/context_engine/harness/estate_original_read.mjs' --root-table '<root table>' --tools-config '<tools config>' --project <과제코드> --item <항목 id> --attachment <번호> --render
```

PNG를 만들어 `derived_root/<sha256hex>/slide-<n>.png` 같은 **자리표시 locator**로 알려 준다.
그 자리는 **사람이 여는 곳**이고, **이 봇은 이미지를 읽지 못한다.** 렌더를 만들었다는 것은
본 것이 아니다 — 답에는 locator와 "시각 검증 미실시"를 함께 적는다.

### 7) 미분류 음성 세션의 한 구간 — 읽기 CLI

```
node '<lane>/guild_hall/context_engine/harness/estate_original_read.mjs' --root-table '<root table>' --tools-config '<tools config>' --voice-session <세션 id> --from <시작초> --to <끝초>
```

- **과제 코드를 넣지 않는다.** 인박스 녹음은 아직 어느 과제 것도 아니다. `--project`나 `--item`을
  같이 넣으면 `voice_session_conflicting_arguments`로 거부된다.
- **세션 id는 요청자가 준다.** 모르면 되묻는다. 폴더·파일을 뒤져 찾지 않는다 — 이 CLI에 목록 기능은 없다.
- `--from`/`--to`는 **녹음 시작부터의 초**다. 빼면 처음부터 허용된 길이만큼 읽는다.
- 기본은 이 집이 직접 만든 **로컬 ASR 전사**다. `--transcript provider`를 붙이면 공급자 전사를 읽는다.
- 답 끝에 `[이어 읽기] --from N --to M`이 나오면 **그 줄을 그대로** 다음 호출에 쓴다. `[끝]`이면 그 창은 다 본 것이다.
- **오디오와 공급자 요약은 나오지 않는다.** 요약은 격리된 자료라 이 통로로 오지 않는다 — 없는 것을 있는 것처럼 말하지 않는다.
- 인박스 읽기 **선언이 없으면** `access_denied`다. 우회하지 말고 그대로 알린다.

**이 형은 lane이 갱신된 뒤에만 동작한다.** 설치된 lane이 옛 판본이면 이 명령은
`[estate-original-read] original_read_item_invalid`로 멈춘다(관측된 동작이다). 그때는 다시
시도하지 말고 **"음성 구간 읽기는 아직 이 lane에 올라가 있지 않습니다"**라고 그대로 알린다.

출력 머리에 **어느 전사인지**와 그 전사의 `evidence_role`·`claim_ceiling`이 붙는다. 그 값이
답에 쓸 수 있는 **확인 등급의 상한**이다.

| 머리에 나온 것 | 답에 쓸 수 있는 최대 |
| --- | --- |
| `transcript local` + `claim_ceiling observed` | "독립 기계 전사에 이렇게 적혀 있다" (`전사 확인`) |
| `transcript provider` + `claim_ceiling (선언 없음)` | 위보다 약하다 — 공급자 전사는 정본이 아니다. 근거로 쓸 때 그렇게 적는다 |
| `revision_mismatch` | run이 선언한 판본과 파일이 다르다 — 읽은 쪽을 밝히고 두 값을 다 적는다 |

어느 경우에도 **"그가 그렇게 말했다"로 옮기지 않는다.** 기계 전사에 그렇게 적혀 있는 것이다.

구간 줄은 이렇게 나온다.

```
[seg <구간 id>] <시작>s–<끝>s <시계 시각> KST · <speaker 라벨> · <글자수>
```

시계 시각은 **녹음 시작 시각 + 그 구간의 offset**이다(사람이 적어 둔 시각이 아니다).
`speaker` 라벨은 **정렬 힌트**다 — 신원도 아니고 담당자도 아니다.

## 절차 (이 순서를 지킨다)

1. **단서가 있으면 `lexical`, 뜻으로 찾아야 하면 `hybrid`**로 검색한다. 단서(부품명·문서번호·
   이슈 번호·시험 조건 id·파일명)는 글자 그대로 넣는다.
2. **후보 항목마다 읽기 CLI 2)로 본문을 읽는다.** 검색의 `exact`는 첫 줄만 주므로 목록
   확인용일 뿐이다. 본문을 읽지 않고 본문 내용을 말하지 않는다.
3. **첨부 목록을 확인한다**(2)에 이미 포함되어 있다). 본문 글이 있는 게시물에도 첨부가
   있을 수 있다.
4. **답에 필요한 첨부만 5)로 읽는다.** 값·표·문장은 추출된 텍스트에서 그대로 옮긴다.
5. **치수·배치·그림에 관한 질문이면** 6)으로 렌더를 만들어 locator를 주되, "이 봇은 이미지를
   읽지 못하므로 시각 검증 미실시"라고 적는다.

**세션 id를 받았으면 이 순서가 아니라 §음성 구간 검토로 간다.** 그 길은 창을 먼저 읽고
단서로 과제를 좁히는, 방향이 반대인 절차다.

**호출 상한은 6회다**(검색·읽기·첨부·렌더·음성 구간을 모두 합쳐, 실패와 재시도도 센다). 7회째는 CLI가
`investigation_budget_exhausted`로 거부하고 지금까지 무엇을 물었는지 6줄로 돌려준다. 그러면
**확보한 근거로 답하고 남은 일을 말한다** — 다시 시도하지 않는다. 읽기 CLI 출력 머리의
`budget n/6`이 지금까지 쓴 횟수다.

계산해 두면 대개 이렇게 쓴다: 검색 1 → 후보 본문+첨부 목록 1~2 → 필요한 단위 전문 1 →
첨부 텍스트 1 → 렌더 1. 음성이면: 구간 읽기 1~2 → 단서로 과제 하나씩 검색 1~2 → 본문 1.

### pptx처럼 도형이 있는 첨부를 읽을 때

추출 결과는 도형마다 `shape id · 이름 · 종류 · box left/top/width/height(%)`와 그 안의
텍스트 런으로 나온다. 일반 규칙은 이렇다.

- **값은 텍스트 런에서 그대로 옮긴다.** 반올림·환산·보정하지 않는다.
- **어느 변, 어느 대상의 치수인지**는 그 값이 든 텍스트상자와 **인접한 선 도형**의 길이·위치로
  판단한다(박스 **폭이 0%면 세로선**, **높이가 0%면 가로선**). 판단했으면 근거가 된 **도형 id와
  좌표를 함께 적고 `좌표 확인`**으로 표기한다.
- 좌표로도 어느 변인지 정할 수 없으면 **`미확인`**이다. 그럴듯한 쪽으로 정하지 않는다.
- 렌더 이미지는 이 봇이 볼 수 없으므로 어떤 경우에도 **`시각 검증 미실시`**를 함께 적는다.

## 음성 구간 검토 (미분류 녹음)

한 녹음에 여러 과제 얘기가 섞여 있다. 그래서 판정 단위는 녹음이 아니라 **창(구간)** 이다.

1. **창 하나를 읽는다**(7형). 한 번에 한 창이다.
2. 그 창에서 **구별력 높은 단서**를 뽑는다 — 과제명·부품명·시험명·문서번호·장비명·날짜·인명.
   흔한 낱말("회의", "일정", "자료")은 단서가 아니다.
3. 그 단서로 **후보 과제를 한 번에 하나씩** 검색한다(1형, `--project`에 후보 하나). 후보 둘이면
   두 번 부르되 예산을 보고 정한다. 여러 과제를 한 번에 훑지 않는다.
4. 검색에 걸린 항목이 판정을 가를 만하면 **본문을 읽는다**(2·3형).
5. **창마다 판정한다.**
   - `candidate(<과제코드>)` — 근거 ref가 있을 때만. 근거 = 검색·읽기로 확인한 **항목 id**.
   - `unclassified` — 단서가 흔하거나, 근거가 안 나오거나, 두 과제 어느 쪽도 될 때. **모호하면 이쪽이다.**
   - **`confirmed`는 이 봇이 쓰지 않는다.** 확정은 사람이 한다. 판정은 제안일 뿐이다.
6. 예산 안에서 **못 본 창**은 답 끝에 `다음 회차: --from N --to M`으로 남긴다. 억지로 다 훑지 않는다.

판정마다 반드시 함께 적는다.

- **발언 시각**(KST)과 **구간 id**. 어느 창에서 나온 말인지 없으면 근거가 아니다.
- **발언자 ≠ 담당자.** speaker 라벨은 정렬 힌트이고, 말한 사람이 그 일의 담당자라는 뜻이 아니다.
- **인명·수치는 기계 전사라 오인될 수 있다.** 들린 대로 적힌 철자를 **그대로** 옮기고
  `전사 오인 가능`을 붙인다. 비슷한 이름으로 고쳐 적지 않는다.
- **판정이 `candidate`라고 해서 그 과제의 자료를 더 열지 않는다.** 열람 범위는 판정으로 넓어지지 않는다.

답에는 §회신 형식의 표를 더한다.

| 구간 | 판정 | 근거 | 미확인 사유 |
| --- | --- | --- | --- |
| `seg <id>` <시각> KST | `candidate(<과제코드>)` 또는 `unclassified` | 항목 id·단위 id (없으면 `—`) | 왜 더 못 좁혔는지 |

## 상태 어휘 (출력의 상태 낱말을 답에 이렇게 옮긴다)

| 상태 | 답에 적을 말 |
| --- | --- |
| `ok` | 열렸다. 본문·목록·추출을 그대로 옮긴다 |
| `attachments_none` | 이 항목에는 첨부가 없다 |
| `attachment_list_unavailable` | 이 출처는 첨부 목록을 제공하지 않는다 |
| `bytes_not_collected` | 첨부 이름만 수집됐고 바이트는 미수집이다 |
| `access_denied` | 허용 범위 밖이다 |
| `unsupported_format` | 형식 미지원 — 이름·종류·크기만 말할 수 있다 |
| `hash_mismatch` | 저장된 바이트가 포인터와 달라 읽지 않았다 |
| `revision_mismatch` | 원본이 색인 판본과 다르다(두 doc_key를 다 보여 주고 읽은 쪽을 밝힌다) |
| `not_in_scope` | 그 항목 id는 이 세대의 목록에 없다 — 검색으로 id를 다시 확인한다 |
| `investigation_budget_exhausted` | 호출 6회를 다 썼다 — 확보한 근거로 답하고 남은 일을 말한다 |

음성 읽기(7형)에만 나오는 상태.

| 상태 | 답에 적을 말 |
| --- | --- |
| `access_denied` | 음성 인박스를 읽을 선언이 없거나 이 목적을 허용하지 않는다 — 우회하지 않고 그대로 알린다 |
| `session_not_found` | 그 세션 id가 인박스에 없다 — id를 다시 확인한다(비슷한 것으로 바꾸지 않는다) |
| `session_ambiguous` | 같은 id의 폴더가 둘이다 — 고르지 않는다, 그대로 알린다 |
| `transcript_unavailable` | 요청한 전사가 없거나 아직 끝나지 않았다 |
| `window_without_speech` | 그 구간에는 전사된 말이 없다 — 다른 구간을 읽는다 |
| `revision_mismatch` | run이 선언한 판본과 읽은 파일이 다르다 — 두 값을 다 적고 읽은 쪽을 밝힌다 |

**지금 이 연결에서 메일 첨부는 목록만 나온다**(이름·종류·크기까지). 바이트가 수집돼 있지
않아 상태는 `bytes_not_collected`이고 내용은 읽을 수 없다. 내용을 아는 척하지 않는다.

## 회신 형식

1. **무엇을 했는지** 한 줄: 과제 코드, 검색 방식, 세대 이름(출력 첫 줄에 있다).
2. **근거 목록** — 행마다 **위치**와 **확인 등급**을 반드시 붙인다.
   - 위치 = `출처 · 항목 id · 단위 id · (첨부면) 첨부 번호와 슬라이드/쪽 · (도형이면) 도형 id`
   - 확인 등급 = `텍스트 확인`(본문·추출 텍스트에서 글자로 봤다) / `좌표 확인`(도형 좌표로
     판단했다, 근거 도형 id를 적는다) / `시각 확인`(**이 봇은 불가**) / `미확인`
   - 본문을 상한에 걸려 일부만 읽었으면 `N자 중 M자`로 적는다. 전부 읽었을 때만 "전문"이라고
     쓴다.
3. **첨부 줄**: 목록에 있던 첨부와 그 상태(§상태 어휘의 말로). 못 읽은 것은 왜 못 읽었는지.
4. **범위 줄**: 찾은 범위(과제·세대·방식) / 찾았으나 없었던 것 / 이 연결로는 확인할 수 없는 것.
5. **마지막 줄**: `호출 n/6 (실패 m)`.

음성 구간 검토(7형)면 2와 3 자리에 **구간 표**가 들어가고, 1은 과제 코드 대신
`세션 id · 읽은 창(초) · 어느 전사(local/provider)`를 적는다. 마지막 줄 앞에
`다음 회차: --from N --to M`(못 본 창이 있을 때)을 둔다.

> 세션 `<세션 id>`의 `<N>–<M>초`를 독립 기계 전사로 읽었습니다.
> | 구간 | 판정 | 근거 | 미확인 사유 |
> | `seg <id>` <시각> KST | `candidate(<과제코드>)` | linear `<항목 id>` | — |
> | `seg <id>` <시각> KST | `unclassified` | — | 단서가 두 과제에 모두 나옵니다 |
> 발언자 라벨은 정렬 힌트입니다(발언자 ≠ 담당자). 인명·수치는 기계 전사라 전사 오인 가능.
> 다음 회차: --from <N> --to <M>
> 호출 5/6 (실패 0)

예시 회신 (값은 전부 자리표시자다):

> `<과제코드>`를 hybrid로 찾고, 후보 1건을 원본까지 읽었습니다(세대 `<세대 id>`).
> - slack `<항목 id>` / 단위 `<단위 id>` (KST 시각) — "`<한 줄 인용>`" — 텍스트 확인, 전문
> - 첨부 #1 `<이름 또는 file id>` pptx — 슬라이드 1의 텍스트 런에서 "`<값>`" — 텍스트 확인
>   어느 변의 치수인지는 인접 세로선 도형 `<도형 id>`(폭 0%)로 판단 — 좌표 확인
>   렌더: `derived_root/<sha256hex>/slide-1.png` — 시각 검증 미실시(이 봇은 이미지를 읽지 못함)
> 이 답은 `<과제코드>`의 선택된 세대 안에서 찾은 것입니다.
> 호출 4/6 (실패 0)

## 하지 말 것

- **과제 코드를 짐작하지 않는다.** 요청자가 말하지 않았고 대화에서 분명하지 않으면 되묻는다.
  코드 하나가 곧 열람 범위다.
- **여러 과제를 한 번에 훑지 않는다.** 한 실행은 한 과제다.
- **파일명으로 디스크를 뒤지지 않는다.** `find`·`grep`·파일 열기로 이 CLI를 대신하지 않는다.
  첨부는 CLI가 원문 포인터를 따라갈 때만 열린다.
- **명령의 경로 형식을 바꾸지 않는다.** 작은따옴표와 슬래시를 그대로 둔다.
- **값을 추정하지 않는다.** 추출 텍스트에 없는 숫자·이름을 채워 넣지 않는다.
- **읽지 않고 "전문 확인"이라고 적지 않는다.** 잘린 채 읽었으면 잘렸다고 적는다.
- **6회를 넘겨 부르지 않는다.** 거부가 오면 그 자리에서 답을 정리한다.
- **원본을 고치거나 옮기지 않는다.** 이 스킬은 읽기만 한다. host 절대경로는 회신에 적지 않는다.
- **없는 것을 만들어 답하지 않는다.** 근거가 0건이면 0건이라고 답한다.
- **음성 구간에 `confirmed`를 쓰지 않는다.** 이 봇이 낼 수 있는 것은 `candidate`와 `unclassified`뿐이다.
- **음성 판정으로 열람을 넓히지 않는다.** 후보 과제를 확인하는 검색은 한 번에 한 과제이고,
  판정이 `candidate`가 되어도 그 과제의 다른 자료를 더 열어 보지 않는다.
- **오디오·공급자 요약을 구하지 않는다.** 이 통로로는 오지 않고, 들어 본 것처럼 적지 않는다.

## 오류

CLI는 실패를 한 줄 코드로만 낸다(`[estate-graph-query] <code>` 또는
`[estate-original-read] <code>`). 스택트레이스는 나오지 않는다. 코드를 그대로 옮기고 뜻을
한 줄로 덧붙인다.

| 코드 | 뜻 | 회신 |
| --- | --- | --- |
| `estate_query_question_invalid` | `--question`이 없거나 비어 있다(`exact`도 필요하다) | 빠진 `--question`을 채워 한 번만 다시 실행한다 |
| `estate_query_project_invalid` | 과제 코드 모양이 아니다 | 코드를 다시 묻는다 |
| `estate_query_binding_unavailable` | 그 과제는 아직 통합 DB 연결이 없다 | "아직 검색 범위에 없습니다" |
| `estate_query_tools_config_required` · `original_read_tools_config_required` | `--tools-config`가 빠졌다 | 이 문서의 줄을 그대로 다시 복사해 실행한다 |
| `investigation_budget_exhausted` | 이 조사의 호출 6회를 다 썼다 | 확보한 근거로 답하고 남은 일을 말한다. 다시 부르지 않는다 |
| `investigation_budget_key_unavailable` | 호출을 어느 조사에 달지 정할 수 없다 | 그대로 알리고 Owner 확인 요청 |
| `voice_session_conflicting_arguments` | `--voice-session`에 `--project`·`--item`을 같이 넣었다 | 한 호출은 하나다 — 음성만 남기고 다시 실행 |
| `voice_session_id_invalid` | 세션 id 모양이 아니다 | 세션 id를 다시 묻는다 |
| `original_read_item_invalid` (7형에서) | 이 lane에 음성 읽기가 아직 없다 | "음성 구간 읽기는 아직 이 lane에 올라가 있지 않습니다" — 다시 부르지 않는다 |
| `voice_window_invalid` · `voice_max_chars_invalid` | `--from/--to`나 글자 상한 값이 모양이 아니다 | 초 단위 숫자로 다시 실행한다 |
| `voice_transcript_kind_invalid` | `--transcript`는 `local` 또는 `provider`뿐이다 | 둘 중 하나로 다시 실행한다 |
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

7형(음성 구간 읽기)은 **lane 갱신 대기 중**이다. 1~6형은 지금 lane에서 그대로 동작한다.
