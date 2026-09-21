---
name: soulforge-mail-triage
description: Work the unclassified mail queue of the workspace ledgers - read one mail, decide what it is, and record exactly one reading-decision row through a pinned wrapper that fixes the reader identity, the tables and the daily budget. Never corrects an existing row; never writes the Owner-confirmation column.
version: 0.1.1
author: Soulforge workspace ledgers, 2026-09-22 KST
license: Soulforge internal
platforms: [windows]
metadata:
  hermes:
    tags: [soulforge, mail, triage, ledgers, classification]
    category: soulforge
    requires_toolsets: [terminal]
prerequisites:
  commands: [node]
---

# 미분류 메일 판독

아직 어느 과제에도, 어느 분류에도 들어가지 못한 메일이 **미분류 대기줄**에 쌓인다.
이 스킬은 그 줄을 하나씩 읽고, **메일 하나에 판정 하나**를 판독표에 적는다.

일은 읽기·쓰기 도구 **하나**가 한다 — `bot_triage.mjs`. 명령은 셋뿐이다.

- `list` — 대기줄을 한 줄씩 본다(누가·언제·제목·첨부 이름·후보·거래처).
- `show` — 한 통의 본문을 읽는다. 읽기 전용이다.
- `decide` — 판독표에 **한 줄** 적는다.

**이 도구 밖으로 나가지 않는다.** 판독표 CSV를 직접 열거나 고치지 않고, `cli.mjs`나 다른
명령을 대신 쓰지 않는다. 판독자 이름·표 경로·하루 한도는 설정 파일에 박혀 있어 이 스킬도
요청자도 바꿀 수 없다 — 바꾸려고 인자를 덧붙이면 그 자리에서 거부된다.

## When to Use

- Owner가 "미분류 메일 좀 봐 줘", "안 들어간 메일 정리해 줘"라고 할 때.
- 아침 알림으로 "어제 미분류 N건"이 왔을 때.

쓰지 않는 경우:

- Owner가 **이미 적힌 판정을 고쳐 달라**고 할 때 → §정정은 사람이 한다.
- 메일을 보내 달라·문서를 만들어 달라는 요청. 이 스킬은 판독표 한 줄만 쓴다.
- 과제 규칙·거래처표·묶음표를 고쳐 달라는 요청. 그 표들은 Owner의 것이다.

## 먼저 읽을 것 (매번, 판정 전에)

분류 기준의 정본은 Owner의 지침 문서다. 파일 읽기 도구로 **먼저** 이것을 읽는다.

```
'<guideline>'
```

파일 읽기 도구가 없으면 `terminal`로 같은 파일을 읽는다.

```
cat '<guideline>'
```

아래 §판정 원칙은 그 문서의 **요약**이다. 둘이 어긋나면 **문서가 이긴다**. 문서를 읽지
못했으면 판정하지 말고 그대로 Owner에게 알린다.

## 판정 원칙 (짧게)

1. 과제를 정하는 근거는 **메일이 다루는 일**이다 — 본문·첨부가 말하는 업무가 그 과제의
   일인지를 본다.
2. **보낸 사람 주소는 과제를 정하지 않는다.** 같은 회사가 여러 과제 일을 한다.
3. **사람 이름은 과제를 정하지 않는다.** 담당자는 과제를 옮겨 다닌다.
4. **장비·제품 이름은 과제를 정하지 않는다.** 같은 품목이 여러 과제에 들어간다.
   품목 이름을 보고 과제를 **추론하지 않는다**.
5. 한 통에 **두 과제**가 섞여 있으면 어느 쪽으로도 넣지 않는다.
6. 확신이 없으면 `hold_owner_review`, 또는 "읽었지만 과제를 모르겠다"는 뜻의
   `exclude` + `과제미정`이다. **찍지 않는다.**

## 하지 말 것

- `include`를 쓰지 않는다. 도구가 거부한다 — 확실해 보여도 `include_with_review`까지다.
  마지막 한 칸(확정)은 사람의 몫이다.
- 판독표 파일을 직접 열거나 고치지 않는다.
- **이미 판정이 있는 메일을 다시 판정하지 않는다.** 판정된 메일은 보통 대기줄에서 빠지지만
  **빠지지 않는 것도 있다** — `hold_owner_review`처럼 "사람이 봐야 한다"로 적힌 줄은 그대로
  대기줄에 남는다. 그런 메일에는 `이미판정(...)` 표시가 붙는다. **표시가 붙어 있으면
  건드리지 말고** §보고의 "남긴 것"에 그대로 올린다.
- 이유(`--why`)에 줄바꿈·탭·그 밖의 제어문자를 넣지 않는다. 사람이 읽는 **한 줄 문장**만
  쓴다(메일id·분류 이름도 마찬가지다).
- 한 통에 판정을 둘 적지 않는다. **메일 하나 = 판정 하나.**
- 과제 코드를 둘 이상 적지 않는다(`A;B`는 거부된다). 공유는 사람이 정한다.
- 목록에 없는 과제 코드, 표에 없는 분류 이름을 지어내지 않는다.
- 하루 한도에 닿으면 멈춘다. 다음 날까지 더 적지 않는다.
- `Owner확인` 칸은 건드리지 않는다. 도구가 항상 비워 둔다.

## How to Run

`terminal` 도구로 아래 줄 하나를 실행한다. `<lane>`·`<config>`·`<config sha256>`는 설치된
사본에서 실제 값으로 치환되어 있다. **이 문서의 줄을 그대로 복사한다.** 경로가 작은따옴표
안에 슬래시로 적혀 있는 것은 이 셸이 Git Bash라서다 — 백슬래시로 바꾸면 셸이 그것을 먹어
`Cannot find module`으로 실패한다.

출력은 한 번에 6,000자에서 끊기고, 끊긴 자리에 "몇 건 더 있다"가 찍힌다. 한 번에 다 보려
하지 말고 몇 건씩 나눠 본다.

### 1) 대기줄 보기

```
node '<lane>/guild_hall/workspace_ledgers/ops/bot_triage.mjs' list --config '<config>' --config-sha256 '<config sha256>' --limit 5
```

한 줄이 메일 하나다.

```
3) <메일id> · 2026-09-01 · 홍길동 @example.partner · "9월 정기회의 자료" · 첨부 1건: 회의자료.pdf · 후보 없음 · 거래처 없음
```

`후보`는 도구가 이미 계산해 둔 **가능성 있는 과제 코드**다(제목이 두 과제에 걸리거나, 본문에
여러 과제 말이 나오거나, 어느 과제의 "힌트말"이 걸렸을 때). 후보는 **근거가 아니라 읽어 볼
곳**이다 -- 후보가 하나뿐이어도 그것만으로 `include_with_review`를 쓰지 않는다. 본문을
읽어 그 과제 일이라고 말하는 부분을 찾고, 그 부분을 `--why`에 적는다.
줄 끝에 붙는 표시가 둘 있다. 둘 다 **판정하지 말라는 뜻**이고, §보고의 "남긴 것"에 올린다.

- `이미판정(<판정>)` — 쓸 수 있는 판독줄이 이미 있다(대개 `hold_owner_review`, 곧 사람이
  봐야 한다는 뜻). 그대로 둔다.
- `손질필요(<이유>)` — 판독줄이 있는데 **쓸 수 없는 상태**다. 사람이 표를 고쳐야 한다.

### 2) 한 통 읽기

```
node '<lane>/guild_hall/workspace_ledgers/ops/bot_triage.mjs' show --config '<config>' --config-sha256 '<config sha256>' --id <메일id> --max-chars 2000
```

머리(수신일·보낸이·받는이·제목·첨부·후보·거래처·같은 대화)와 본문이 같이 나온다. 주소는
도메인까지만 보인다 — 원래 그렇다. **주소를 더 보려고 다른 명령을 찾지 않는다.**

### 3) 판정 적기

```
node '<lane>/guild_hall/workspace_ledgers/ops/bot_triage.mjs' decide --config '<config>' --config-sha256 '<config sha256>' --id <메일id> --level <판정> --target <과제코드 또는 분류> --why "<한 줄 이유>"
```

`--why`는 **필수**, 한 줄, 200자까지다. "왜 그렇게 봤는지"를 본문에서 가져와 적는다
("첨부 회의록 첫 장에 그 과제 회의라고 적혀 있음"). "그래 보여서"는 이유가 아니다.

#### `--level`은 이 넷 중 하나다

| 판정 | 언제 | `--target` |
| --- | --- | --- |
| `include_with_review` | 이 메일이 **그 과제의 일**이라고 본문·첨부가 말한다 | 과제 코드 **하나** |
| `exclude` | 과제 일이 아니다(또는 읽었지만 과제를 모르겠다) | 아래 분류 중 하나 |
| `vendor_only` | **한 거래처**의 메일인데 과제가 하나로 안 좁혀진다 | 그 메일에 잡힌 거래처 이름 그대로 |
| `hold_owner_review` | 사람이 봐야 한다 | 비우거나, "혹시 이 과제" 후보 코드 하나 |

`include`는 없다. 도구가 거부한다.

#### `exclude`의 `--target`은 이 목록에서만 고른다

| 분류 | 뜻 |
| --- | --- |
| `과제미정` | 읽었는데 어느 과제인지 아직 모르겠다 |
| `일반업무` | 과제와 무관한 일상 업무 |
| `사내행정` | 사내 행정(근태·급여·총무 같은 것) |
| `알림` | 시스템·서비스 알림 |
| `광고` | 광고·홍보 메일 |
| `테스트` | 시험 발송 |

이 목록 밖의 말을 적으면 거부된다. 지어내지 않는다.

## 절차 (이 순서를 지킨다)

1. `'<guideline>'`를 읽는다.
2. `list`로 몇 건 본다(한 번에 5건쯤).
3. 판정이 바로 서지 않는 건 `show`로 본문을 읽는다. **읽지 않고 제목만으로 판정하지 않는다** —
   단, 제목에 과제 코드가 그대로 적혀 있으면 그것으로 충분하다.
4. `decide`를 **한 통에 한 번** 실행한다. 실패하면 코드를 보고(§오류) 고쳐서 **한 번만** 다시
   실행한다. 같은 명령을 반복하지 않는다.
5. 하루 한도(`오늘 판독 n/N건`)에 닿으면 멈춘다.
6. §보고 형식으로 Owner에게 알린다.

## 정정은 사람이 한다

Owner가 "그거 P00-002야", "그건 광고였어"라고 하면 **표를 다시 쓰지 않는다.** 판독표의 한
줄은 한 번만 쓰이고, 고치는 것은 사람이 파일을 직접 여는 일이다. 이 스킬이 할 일은 하나다 —
**적용할 줄을 그대로 만들어 답으로 드리고, 아무것도 기록하지 않는다.**

```
<메일id> 줄을 이렇게 고쳐 주십시오 — 결정: include_with_review / 과제_또는_분류: P00-002 / 이유: (Owner 정정) / 판독자: (고친 분 이름)
```

`Owner확인` 칸도 사람만 채운다. `correct` 같은 명령을 찾지 않는다 — 이 도구에 없다.

## 보고 형식

아이디가 아니라 **사람 말**로 보고한다. 메일id는 Owner가 되물을 때만 덧붙인다.

**답의 마지막 줄은 도구 출력에 찍힌 `오늘 판독 n/cap건`을 그대로 가져온 한 줄,
`오늘 판독 n/cap건.`뿐이다.** 그 뒤에 다른 줄을 덧붙이지 않는다 -- 특히 `호출 3/6 (실패
0)` 같은 **호출수·조사예산 꼬리말은 붙이지 않는다.** 그것은 같은 봇 프로필에 함께 설치된
맥락 검색 스킬의 관례이고 이 스킬과는 무관하다.

```
미분류 12건 중 5건을 봤습니다.

넣은 것
- 9/1 홍길동(@example.partner) "9월 정기회의 자료" → P00-001 (검토 필요)
  첨부 회의록 첫 장에 그 과제 회의라고 적혀 있습니다.

뺀 것
- 9/2 사내 인사 "연차 사용 안내" → 사내행정

남긴 것 (사람이 봐 주셔야 합니다)
- 9/2 가나무역 "견적 회신" → 한 통에 두 과제 견적이 같이 있어 어느 쪽으로도 넣지 않았습니다.
- 9/3 (이름 없음)(@example.vendor) "모형장비 A 납기" → 품목 이름만 있고 어느 과제 것인지 단서가 없습니다.

오늘 판독 4/20건.
```

남긴 것에는 **반드시 이유를 붙인다.** "모르겠습니다"만 적지 않는다.

## 예시 (전부 가상의 메일이다)

### 예시 1 — 본문이 과제를 말한다 → `include_with_review`

> 9/1, 홍길동 @example.partner, 제목 "9월 정기회의 자료", 첨부 `회의자료.pdf`
> 본문: "아래 일정으로 P00-001 정기회의를 진행합니다. 첨부 자료 미리 확인 부탁드립니다."

본문이 과제를 직접 말한다. 보낸 사람이나 회사 때문이 아니다.

```
node '<lane>/guild_hall/workspace_ledgers/ops/bot_triage.mjs' decide --config '<config>' --config-sha256 '<config sha256>' --id <메일id> --level include_with_review --target P00-001 --why "본문에 그 과제 정기회의 일정이라고 적혀 있음"
```

### 예시 2 — 한 거래처, 두 과제 → `vendor_only`

> 9/2, 가나무역 @example.vendor, 제목 "견적 회신"
> 본문: "요청하신 두 건 견적입니다. 1) P00-001 건 2) P00-002 건 …"

두 과제가 한 통에 섞여 있다. 어느 쪽으로도 넣지 않고, 그 거래처 장부에만 둔다.
`--target`은 `list`/`show`의 `거래처` 칸에 **이미 잡혀 있는 이름 그대로** 쓴다.

```
node '<lane>/guild_hall/workspace_ledgers/ops/bot_triage.mjs' decide --config '<config>' --config-sha256 '<config sha256>' --id <메일id> --level vendor_only --target 가나무역 --why "한 통에 두 과제 견적이 함께 있어 한 과제로 좁힐 수 없음"
```

거래처 칸이 비어 있으면 `vendor_only`는 갈 곳이 없어 거부된다 — 그때는 `hold_owner_review`다.

### 예시 3 — 품목 이름뿐 → `hold_owner_review`

> 9/3, (이름 없음) @example.vendor, 제목 "모형장비 A 납기 안내"
> 본문: "모형장비 A 3대, 10월 2주 입고 예정입니다."

`모형장비 A`가 어느 과제에 들어가는지는 이 메일에 없다. **품목으로 과제를 추론하지 않는다.**

```
node '<lane>/guild_hall/workspace_ledgers/ops/bot_triage.mjs' decide --config '<config>' --config-sha256 '<config sha256>' --id <메일id> --level hold_owner_review --why "품목 이름만 있고 과제 단서가 없음 - 어느 과제 납품인지 확인 필요"
```

보고의 "남긴 것"에 이 줄을 올린다.

## 오류

도구는 실패를 한 줄 코드로 낸다. 코드를 그대로 옮기고 뜻을 한 줄 덧붙인다.

| 코드 | 뜻 | 어떻게 |
| --- | --- | --- |
| `..._level_include_refused` | `include`는 이 도구로 못 쓴다 | `include_with_review`로 한 번만 다시 실행 |
| `..._target_not_allowed` | 분류 이름이 목록 밖이다 | §exclude 목록에서 고른다 |
| `..._target_unknown_project` | 그 과제 코드가 없다 | `list`의 `후보`나 Owner에게 확인 |
| `..._target_multiple_projects` | 과제 코드를 둘 적었다 | 하나로 좁히거나 `hold_owner_review` |
| `..._target_not_a_matched_vendor` | 그 거래처가 이 메일에 잡혀 있지 않다 | `show`의 `거래처` 칸 이름을 그대로 쓴다 |
| `..._vendor_only_without_organisation` | 거래처가 안 잡힌 메일이다 | `hold_owner_review`로 바꾼다 |
| `..._why_required` · `..._why_too_long` · `..._why_not_single_line` | 이유가 없거나 길거나 여러 줄이다 | 한 줄 200자 안으로 |
| `..._why_control_characters` · `..._id_control_characters` · `..._target_control_characters` | 값에 탭·제어문자가 섞였다(도구는 지우지 않고 거부한다) | 사람이 읽는 글자만 남겨 한 번만 다시 실행 |
| `..._id_too_long` | 메일id 자리에 메일id가 아닌 것이 들어갔다 | `list`에 찍힌 id를 그대로 복사해 한 번만 다시 실행 |
| `..._id_not_in_queue` | 그 메일은 대기줄에 없다(이미 판정됨) | 다시 판정하지 않는다. `list`를 다시 본다 |
| `..._mail_already_decided` | 쓸 수 있는 판독줄이 이미 있다(`이미판정` 표시) | **다시 판정하지 않는다.** 그대로 보고에 올린다 |
| `workspace_ledgers_triage_decision_duplicate` | 라이브러리가 같은 메일의 중복 줄을 막았다 | 위와 같다 — 다시 시도하지 말고 Owner에게 알린다 |
| `..._mail_already_decided_invalid` | 이미 쓸 수 없는 판정줄이 있다 | 사람이 표를 고쳐야 한다 — 보고에 올린다 |
| `..._daily_cap_reached` | 오늘 한도를 다 썼다 | **멈춘다.** 남은 건수를 보고한다 |
| `..._unknown_flag` | 이 도구에 없는 인자를 넣었다 | 이 문서의 줄을 그대로 다시 복사한다 |
| `..._correct_not_supported` | 정정을 시도했다 | §정정은 사람이 한다 |
| `workspace_ledgers_triage_owner_table_failures` | Owner 표 하나가 깨져 있다 | **판정하지 않는다.** 그대로 Owner 확인 요청 |
| `..._org_config_changed_during_run` | 실행 도중 설정 파일이 바뀌었다 | 아무것도 안 쓰였다. 그대로 Owner 확인 요청 |
| `..._receipts_unwritable_before_append` | 기록을 남길 수 없는 상태라 **판정을 아예 안 했다**(판독표 그대로) | 다시 시도하지 말고 그대로 Owner 확인 요청 |
| `..._receipt_write_failed_after_append` | **판독표에는 줄이 이미 들어갔는데** 기록을 못 남겼다 | **다시 실행하지 않는다.** 그 메일은 판정이 끝난 것으로 보고 Owner 확인 요청 |
| `..._receipt_write_failed` | 기록을 못 남겼다(판독표는 안 바뀌었다) | 그대로 Owner 확인 요청 |
| `..._config_*` (끝값 4) | 설정 파일이나 해시가 어긋났다 | 아무것도 안 쓰였다. 그대로 Owner 확인 요청 |

모르는 코드가 나오면 "이 스킬로는 원인을 못 좁혔습니다, Owner 확인이 필요합니다"라고 답하고
멈춘다. 같은 명령을 반복 실행하지 않는다.

끝값(exit code)의 뜻은 셋이다 — `0` 적었다, `2` 거부됐다(아무것도 안 적혔다),
`4` 설정이 어긋나 시작도 못 했다(아무것도 안 적혔다).

## Uninstall

설치된 스킬 디렉터리를 지우면 제거된다. 판독표·장부·설정 파일에는 영향이 없다.

## Status

`draft` — 도구 단독 실행(셸에서 직접)과 합성 자료 시험까지만 확인됐다. 봇 프로필에 설치해
실제 대화에서 돌려 보는 것은 Owner가 한 번 해 봐야 확인된다. 그 전까지 `production-ready`로
보지 않는다.
