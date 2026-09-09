# Tool Workshop operator — Internal RC candidate

- Artifact ref: `artifact.manual.workshop_operator.v0_1_0`
- Compatibility: `>=0.1.0 <1.0.0`
- Catalog target: `candidate` / `current` after catalog registration; no verified release or operator exercise acceptance is recorded.

## Purpose

### Claude 한글 공방

실사용은 기존 Buzz의 기본 Claude Code 연결을 우선한다. 기존 봇 신원과 대화를
유지하고, 과제별 승인 작업폴더에서 문서를 작성한다. 별도 scoped 연결기나 새 job
발급기를 사용 전에 요구하지 않는다. 봇의 지침·도구 선택을 강제 OS/MCP 격리로
표현하지 않으며, 실제 실행 모델과 저장된 모델 선호도도 구분한다.

한글 양식 편집에는 사용자가 지정한 `new-hwpx-master-v5-1-20260720`의 절차를 따른다.
봇에게는 그 절차에서 갈라져 나온 봇 전용 스킬을 준다. 전용본은 원본과 이름을 달리하고
출처를 파일 안에 남기며, 원본을 따라 갱신하지 않는다. 봇 지침에 적는 스킬 이름은 전용본의
이름이어야 하고, 둘이 어긋나면 봇은 없는 스킬을 찾는다.
XML 문단·부모 구조를 파악하고 내용이 바뀐 최소 문단의 **직계 linesegarray만**
제거해 줄 배치를 다시 계산한다. 미수정 표·장식 문단의 캐시는 보존한다. 구조와
문자 검사 후 실제 한글 출력의 모든 페이지를 확인한다. 기준본 자체가 겹쳐 보이면
그 배치 캐시를 그대로 보존한 결과를 성공으로 삼지 않는다. 원본·실패본은 보존하고
교정본을 별도 파일로 전달한다.

전체 문서 작업의 충분한 시간과 짧은 초기화·인증 검사를 구분한다. 해당 봇에서
idle 제한은 전체 제한보다 짧아야 한다. 저장 화면뿐 아니라 실제 시작 결과에서
설정을 확인하고, 다른 봇의 전역 설정은 바꾸지 않는다. PDF 파일 존재나 문자
추출 성공은 가독성을 증명하지 않는다. 실제 한글/PDF 확인과 사람 수락은 구분한다.

### 선택적인 scoped HWPX 후보

명시적인 v2 한글 binding은 기존 Claude 연결에 `hwpx_build_candidate` 도구 하나를
추가한다. 모델은 허용된 `input.json`을 읽고 `workspace_write_text`로 section 초안을
작성한다. 고정 도구는 기존 HWPX 스킬의 포장·검사 코드를 사용해 문서 후보를 만들고,
기존 세션 출력 binding이 있으면 한글 PDF 출력과 모든 페이지 검사를 이어간다.
실행 파일·양식·권한·출력 경로를 모델 초안에서 선택하지 않는다.

공방의 `workRoot`와 그 아래 `JOBS/jobRef`를 명시한다. Claude 자식의 실제 cwd는
`jobRoot`로 지정하며 Buzz 부모 프로세스의 기본 cwd와 구분해 확인한다. 설정·큐·봉인
출력은 모델 쓰기 범위 밖에서 관리하고, 검증된 배달 사본을 해당 JOBS에 보관한다.
한 번의 binding은 지정 작업 하나에 결속된다. 다음 작업에는 새 작업 binding이 필요하며
불확실한 이전 실행을 같은 작업 ID로 재실행하지 않는다.

native 연결은 비패키지 실행면과 이미 등록된 `FilePathCheckerModule`을 읽기 검증해
재사용한다. 이 경로는 예약작업이나 registry alias를 새로 만들지 않는다. MSIX에서의
설치 경로 관측을 실제 사용자 경로와 혼동하지 말고 실제 실행면에서 확인한다.
권한 철회·취소·실행 사본 변경·불완전한 페이지 증거는 성공으로 반환하지 않는다.

결과의 HWPX/PDF hash, 실제 페이지 수와 모든 페이지 이미지 영수증을 확인한다.
`rendered_candidate`도 사람이 문서 내용을 수락했다는 뜻은 아니다. 구조 검사만 한
`structural_candidate`에는 `render_required:true`가 남는다. 오래된 미리보기와
실제 페이지·시각 검증을 구분한다. 기존 고정 HWPX v1과 참조형 v1은 별도 큐로 유지한다.

Operate an isolated XLSX, bounded template PPTX, or fixed HWPX structural job: check the pack, submit to its durable queue, run the fixed writer and independent validator, and preserve the candidate receipt for the separate ArtifactRevision review path. The runtime requires Node 24+. This procedure does not operate a physical CAD, Office, Hancom, or other specialist tool PC.

The HWPX profile is limited to one section, a fixed base header, a 2×2 table and
two short text replacements. It admits no preview parts. Both author and verifier
run as separate bounded Python 3.12 children, and all other ZIP entry payloads
must remain unchanged. Extra/comment metadata, unsafe entries, XML external
references and out-of-profile structures are refused before candidate custody.
Use `SOULFORGE_HWPX_TEST_PYTHON` only to select an existing trusted runtime for the
synthetic native tests. The fixture and all eleven registry base files must
travel with the installed tests. A passed structural result still needs actual
Hancom render verification; it is not proof of page count, fonts, printing or
human acceptance. Its evidence is separate from the builtin Claude document workflow.

For the standard isolated release rehearsal, pass the existing five-field
synthetic configuration with `--workshop-test-config`. Its `pythonExecutable`
selects the HWPX test runtime as well as the PPTX runtime. Both source and
installed children receive that explicit selection; ambient tool settings are
not inherited. Missing configuration still leaves native tests unexecuted.

## Prerequisites

- Reuse the existing authorization for internal, reversible development and synthetic canaries. The dispatcher resolves the exact workshop profile/tool-version reference, bounded job scope, and independent reviewer; routine implementation choices do not require another Owner question. External disclosure requires its separate exact review before execution.
- The requested tool capability exactly matches the workshop profile. No general terminal, fallback tool, or inferred capability is permitted.
- A candidate output can be retained as a safe reference; physical bytes, project source, and credentials are outside this manual.

## Allowed and forbidden actions

- Allowed: validate the Tool Workshop and deployment-pack contracts, build/install/smoke an isolated pack candidate, inspect queue/lease/fence/validator readback, and record a candidate custody receipt reference.
- Forbidden: using an unapproved physical tool, running concurrent work in a capacity-one workshop, bypassing a fence token, treating a `done_candidate` result as acceptance, completing a task automatically, changing a host/runtime configuration, or exporting project material.

## Exact repo-relative commands and interfaces

```powershell
npm.cmd run validate:tool-workshop
npm.cmd run validate:deployment-pack
node guild_hall/deployment_pack/tools/build_pack.mjs --spec guild_hall/deployment_pack/packs/tool_workshop_pack.spec.json --out APPROVED_STAGING_OUTPUT --install-verify APPROVED_ISOLATED_TARGET --smoke
node guild_hall/deployment_pack/tools/release_rehearsal.mjs --pack tool_workshop_pack
node guild_hall/deployment_pack/tools/release_rehearsal.mjs --pack tool_workshop_pack --workshop-test-config APPROVED_SYNTHETIC_TEST_CONFIG
```

- In the installed payload, create a fresh empty isolated output directory and run
  `node guild_hall/tool_workshop/src/synthetic_xlsx_canary.mjs --output-root ABSOLUTE_EMPTY_DIRECTORY`.
  This built-in fixture needs no project source or credentials. It creates separate
  state, input, attempt and output directories plus the pinned runtime binding and
  candidate receipt. It refuses an already-used target; retain it for inspection.
- `createDurableToolWorkshop` persists the queue in `workshop.sqlite`; the fixed
  `createXlsxWorkshopRunner` requires matching project, resource, tool version,
  dependency hashes and existing disjoint roots. The canary demonstrates this
  wiring with synthetic approval refs; it does not issue real execution authority.
- Optional independent native readback uses
  `python guild_hall/tool_workshop/tests/native_xlsx_canary_readback.py --root SAME_CANARY_DIRECTORY`
  in an existing runtime containing openpyxl. It checks the exact receipt bytes and
  cells, and rejects formulas, external links and hidden sheets.
- The original PPTX profile reuses an approved two-slide text template. The
  optional approved text profile supports 2–20 slides and 1–4 textboxes per slide,
  with exact geometry, font, placeholder and content checks. It requires an
  explicitly installed Python 3.12 runtime and licensed `@oai/artifact-tool`
  2.8.59 renderer, each hash-pinned locally. Those external runtime bytes are
  not redistributed in this source pack. The command is portable Node/Python;
  it does not call a Codex API or start PowerPoint.
- Run the installed payload's
  `node guild_hall/tool_workshop/src/synthetic_pptx_canary.mjs --output-root ABSOLUTE_EMPTY_DIRECTORY --artifact-root APPROVED_RENDERER_DIRECTORY --python-executable APPROVED_PYTHON_EXECUTABLE`.
  It creates the synthetic template, runs author/independent native validation,
  reimports the actual PPTX to PNG, and preserves hashes in the candidate receipt.
  Inspect every PNG and the editable text before treating this exercise as passed.
  Add `--korean-text` in a different fresh directory to exercise the four-slide
  Korean fixture, then run
  `python guild_hall/tool_workshop/tests/native_pptx_canary_readback.py --root SAME_CANARY_DIRECTORY`
  with an existing python-pptx verification runtime for independent native readback.
- To include the actual PPTX path in both source and installed smoke, provide a
  JSON file with exactly `artifactRoot`, `templatePath`, `pythonExecutable`,
  `templateProvenance: "synthetic_fixture"`, and the synthetic `templateApprovalRef`.
  The rehearsal copies and hashes this limited input in its fresh private root.
  Without it, three real PPTX tests are explicitly skipped and the strict rehearsal
  stays HOLD; the packet and XLSX tests still run. The configured suite includes
  the Korean fixture and the 20-slide/80-textbox maximum profile. Text is never
  shrunk, normalized or truncated to pass: invalid Unicode or an exceeded layout
  budget requires corrected approved input/template. Images/charts, arbitrary
  template structures and other specialist adapters remain development work.
  Host font coverage and renderer-internal clipping are not fully proved by the
  pixel guard; inspect every new business template's actual rendered pages.
- `guild_hall/agent_observation/resource_job_shop.mjs` is the adjacent host/resource observation contract; it is not a physical tool controller.
- `guild_hall/vault_revision/` owns the separate review/acceptance route for any ArtifactRevision candidate.

## Buzz Claude 봇 설정 절차

문서 공방 봇을 Buzz의 기본 Claude 연결기로 세우고 유지할 때의 실제 절차다. scoped
연결기는 범위 검증용이며 이 절차의 선행조건이 아니다.

### 봇이 스킬을 인식하는 경로

Claude 연결기는 세션이 열릴 때 두 자리만 훑는다. 설정 폴더 아래 `skills/`와, 봇이
실행되는 작업 폴더 아래 `.claude/skills/`다. Buzz 둥지의 `.agents/skills/`는 Buzz
자체 규약 자리이며 Claude 연결기가 읽지 않는다. 그 자리에 둔 스킬은 봇 스킬 목록에
나타나지 않는다.

스킬 본체는 `SKILL.md` 한 파일이고 앞머리에 `name`과 `description`이 있어야 한다.
다른 도구용 스킬 트리(`.codex/skills` 등)에서 가져올 때는 그 파일을 복사한다. 복사본은
원본과 자동으로 동기화되지 않으므로 원본을 고치면 봇 쪽도 같이 덮어쓴다.

### 봇마다 스킬을 나누는 방법

관리 봇은 모두 같은 작업 폴더에서 실행되므로 작업 폴더에 둔 스킬은 그 둥지의 모든
Claude 봇이 공유한다. 봇 하나에만 주려면 그 봇의 환경변수에 `CLAUDE_CONFIG_DIR`로
전용 설정 폴더를 지정하고 그 폴더의 `skills/` 아래에 둔다. 그러면 사용자 전역 스킬도
그 봇 시야에서 함께 빠진다. Claude 프로그램에 내장된 스킬은 설정 폴더와 무관하므로
남는다.

전용 설정 폴더에는 로그인 자격 파일이 있어야 봇이 기동한다. 그 파일은 Owner가 직접
배치하며 자동화나 대리 복사의 대상이 아니다.

### 봇마다 다른 작업 폴더를 주는 방법

관리 봇의 작업 폴더는 설정 항목이 아니다. 데스크톱이 프로세스 전체에 하나로 계산해
모든 봇을 같은 둥지에서 띄우고, ACP harness는 그 값을 세션 생성 요청의 `cwd`로 어댑터에
전달한다. harness 정의에도 봇 기록에도 이 값을 담는 자리가 없고, harness가 읽는
환경변수 목록에도 없다.

값이 실제로 흐르는 지점은 harness와 어댑터 사이뿐이므로, 그 사이에 얇은 중계기를 두고
세션 생성 요청의 `cwd` 한 필드만 바꾼 뒤 나머지를 그대로 통과시킨다. 중계기는 봇마다
만들지 않는다. 스크립트 하나와 harness 등록 하나를 공용으로 두고, 봇마다 다른 것은
작업 폴더를 지정하는 환경변수 한 줄뿐이다. 봇을 새로 세울 때 코드도 harness도 건드리지
않는다.

중계기는 fail-open으로 만든다. 지정값이 비었거나 절대경로가 아니거나 실제 디렉터리가
아니면 한 줄을 기록하고 스트림을 그대로 흘려보낸다. 오타가 봇을 정지시키지 않게 한다.

이 방식은 어댑터를 바꾸지 않으므로 steering 같은 어댑터 기능을 잃지 않는다. 되돌리기는
실행기를 원래 것으로 돌려놓는 것으로 끝난다.

### 지침을 두 층으로 나눈다

봇의 작업 폴더가 정해지면 그 폴더의 컨텍스트 파일이 지침으로 자동 주입된다. 그러면
같은 규칙을 봇 등록과 폴더 파일 양쪽에 두게 되는데, 둘은 합쳐져 들어갈 뿐 서로를
덮어쓰지 않는다. 한쪽만 고치면 조용히 어긋나므로 겹치지 않게 나눈다.

- 봇 등록에는 일감이 바뀌어도 변하지 않는 것만 둔다. 정체성, 응답 언어, 사실 확인
  기준, 보고 형식, 넘지 않는 권한 경계다. 그리고 작업 폴더의 컨텍스트 파일이 규칙
  정본이라는 한 줄을 둔다.
- 자리 폴더의 컨텍스트 파일에는 그 자리에서 무엇을 어떻게 하는지를 둔다. 다루는 문서
  종류, 사용할 스킬 이름, 작업 폴더 구성, 작업 id 규칙, 검증 절차다.

봇 등록에는 규칙 파일을 읽지 못하면 작업을 시작하지 말고 보고하라는 문장을 함께 둔다.
자동 주입이 끊긴 것을 즉시 드러내기 위한 것이며, 끊긴 채로 봇이 자기 판단으로 일하는
상태를 막는다.

이렇게 나누면 봇을 다른 자리로 옮길 때 작업 폴더 지정만 바꾸면 되고, 같은 자리에 다른
봇을 앉힐 때도 자리 규칙은 그대로 재사용된다.

### 공방 봇의 외부 커넥터는 기본으로 끈다

공방 봇은 지시서와 입력 꾸러미를 받아 그 범위의 작업만 하고 candidate를 돌려주는 자리다.
메일·드라이브·메신저·이슈 트래커에 스스로 닿을 일이 없다. 필요한 자료는 자리의 입력
폴더로 들어오며, 봇이 밖에서 찾아오지 않는다. 따라서 계정 커넥터는 기본으로 꺼 둔다.

봇의 실행기는 사람 계정의 로그인 자격으로 기동하므로, 그 계정에 붙은 커넥터가 그대로
따라 들어온다. 설정 폴더를 봇마다 갈라도 이것만은 따라온다. 계정이 같기 때문이다.
실제로 한 자리에서 커넥터 일곱 종·도구 이백여 개가 세션에 결속된 것을 관측했고, 그 중
그 자리 업무에 쓰이는 것은 하나도 없었다.

끊는 것은 봇 환경변수 한 줄이다. 예약 키가 아니므로 봇마다 다르게 줄 수 있다. 같은 계정
·같은 자격 파일을 쓰는 두 봇에서 한쪽만 끄고 다른 쪽을 그대로 둔 대조로, 봇 단위로
적용되는 것을 확인했다. 끈 봇에서는 세션에 결속된 커넥터 도구가 0개였다.

이것은 지침에 의한 자제와 다르다. 지침만 있는 봇은 도구를 쥔 채 쓰지 않기로 약속한
상태이고, 끈 봇은 도구가 아예 없다. 보고서에 "접근하지 않았다"고 적는 것과 "접근할 수
없다"는 것을 같은 말로 쓰지 않는다.

자료를 밖에서 가져와야 하는 작업이 생기면 그 자리를 예외로 열지 말고, 자료를 입력
폴더에 넣어 주는 경로로 처리한다. 그래야 무엇이 들어왔는지가 job 폴더에 남는다.

### 자료 경계 — 정해진 것, 닫힌 것, 열려 있는 것

공방 실행기는 외부 상용 모델이다. 그러므로 우리 자료에 직접 닿지 않는 것이 원칙이다.
정본 저장소 접근은 구역으로 나뉘어야 하고 보안 구역은 닿을 수 없어야 한다. 자료는 내부
로컬 세션이 가공해 내보낸 것만 공방의 입력 폴더로 들어온다. 공방이 정본 저장소를 직접
읽지 않는다. 구역 분할의 구체 설계는 아직 정해지지 않았으므로 여기서 만들지 않는다.

**닫힌 것.** 계정 커넥터는 봇 단위로 끊을 수 있고, 끈 자리에서 결속 도구 0개를 확인했다.
메일·드라이브·메신저·이슈 트래커로 직접 나가는 경로는 그 자리에서 없다.

**열려 있는 것.** 터미널은 준다. 공방은 스크립트를 짜고 문서 프로그램을 몰아 결과를
뽑아야 하므로 터미널이 업무의 필요조건이다. 그 결과로 로컬 파일시스템 전체가 읽힌다.
실제로 한 자리가 지시받은 작업을 하려고 회사 문서 폴더를 직접 읽은 관측이 있다. 현재
이를 막는 것은 지침 문장 하나뿐이며 기술적 울타리가 아니다. 이 구멍은 커넥터보다 크다.

**인터넷.** 커넥터와 다른 축이다. 실행기는 웹 검색·가져오기 결과를 다루며, 커넥터를 꺼도
이쪽은 닫히지 않는다. 참고 자료 조사와 공개 문서 확인은 허용한다. 다만 조회한 것을 근거로
남기고, 가져온 내용을 확인 없이 사실로 쓰지 않는다. 우리 자료를 검색창에 넣지 않는다.

**맞바꿈.** 도구를 다 주면 여러 번 고치는 작업이 되지만 자료 경계가 없다. 도구를 묶으면
경계가 생기지만 한 번 만들고 끝나는 구조가 된다. 터미널이 필요조건이므로 도구를 통째로
묶는 방식은 이 자리에 쓸 수 없다. 둘 다 성립하는 형태는 정해지지 않았다.

**표현 규칙.** "접근하지 않았다"와 "접근할 수 없다"를 같은 말로 쓰지 않는다. 지침에 의한
자제를 기술적 차단으로 보고하지 않는다.

### 입력이 없을 때

지시서가 없으면 무엇이 필요한지 먼저 묻는다. 양식이 없으면 새로 만들어 제안할 수 있으며,
그때는 그것이 새로 만든 것이고 승인된 양식이 아님을 함께 밝힌다. 참고가 필요하면 공개
자료를 조사한다. 어느 경우에도 정본 저장소나 다른 자리의 폴더를 뒤져 원본을 찾아오지
않는다. 자료가 밖에 있으면 입력 폴더로 들어오게 하는 것이 경로다.

### 봇마다 갈리는 것과 그 방법

한 봇을 세울 때 봇마다 달라지는 것은 아래 넷이며 모두 환경변수로 준다. 공용 중계기
스크립트와 harness 등록은 하나씩만 두고 재사용하므로, 봇이 늘어도 코드는 늘지 않는다.

| 갈리는 것 | 방법 | 효과 |
| --- | --- | --- |
| 작업 자리 | 작업 폴더 지정 변수 | 그 자리의 컨텍스트 파일이 지침으로 주입된다 |
| 스킬 | 설정 폴더 지정 변수 | 그 폴더의 `skills/`만 보인다. 사람 계정 스킬도 빠진다 |
| 외부 커넥터 | 커넥터 사용 변수 | 계정에 붙은 커넥터가 그 봇에서만 빠진다 |
| 작업 시간 | 침묵 허용치·절대 상한 변수 | 문서 작업 길이에 맞춘 상한을 두지 않는다 |

새 자리를 세우는 순서는 자리 폴더와 컨텍스트 파일 준비, 전용 설정 폴더 준비와 자격
파일 배치(Owner 행위), 봇 등록의 실행기 전환과 환경변수 기재, 기동 뒤 확인이다. 확인은
봇에게 작업 폴더·주입된 규칙·결속된 스킬·결속된 커넥터를 묻고 harness 로그의 실제 실행
명령과 대조한다. 넷 중 하나라도 확인 전에는 적용됐다고 세지 않는다.

### 자리 파일이 실제로 읽히는지 확인한다

파일이 존재한다는 것과 봇이 그것을 지침으로 받았다는 것은 다르다. 자리에 컨텍스트
파일을 두었다는 이유만으로 규칙이 적용된다고 보지 않는다. 봇에게 현재 작업 폴더와 그
파일의 내용이 지침에 들어와 있는지를 물어 확인하고, harness 기동 로그에서 실제 실행
명령과 중계기의 기록 줄을 함께 본다. 확인 전에는 그 파일을 지침으로 세지 않는다.

### 턴 길이 설정

문서 작업 길이에 맞춘 상한을 잡지 않는다. 절대 상한은 안전밸브로 크게 두고, 실제
판정은 침묵 허용치로 한다. 침묵 타이머는 봇이 출력을 낼 때마다 되돌아가므로 작업이
길어도 진행 신호가 있으면 유지된다.

관리 화면에 이 두 값의 입력란이 없다. 환경변수 `BUZZ_ACP_IDLE_TIMEOUT`과
`BUZZ_ACP_MAX_TURN_DURATION`으로 넣는다. 두 값은 예약 키가 아니므로 사용자 지정
값이 우선한다. 침묵 허용치는 절대 상한보다 반드시 작아야 하며 같으면 기동이 거부된다.
절대 상한의 최대는 7일이다.

### 설정을 반영시키는 방법

환경변수 입력란은 한 줄 추가가 아니라 그 칸 전체를 저장한다. 새 값을 넣을 때 기존
값을 같이 적지 않으면 함께 지워진다.

봇 기록은 정의와 실행 인스턴스 두 벌로 존재하며 실행 시 둘을 합쳐 쓴다. 손으로 고칠
때는 양쪽에 같은 값을 넣어야 재시딩에 안전하다.

봇 기록 파일에는 변경 감시자가 없다. 손편집은 클라이언트 재기동 시에만 반영되고,
클라이언트가 떠 있는 동안 편집하면 클라이언트가 다시 쓰면서 덮어쓴다. 손편집은
클라이언트를 닫은 뒤에 하고 백업을 먼저 뜬다.

스킬 목록은 세션이 열릴 때 한 번만 읽는다. 스킬을 넣거나 옮긴 뒤에는 봇을 정지했다
다시 시작해야 반영된다.

### 확인 방법

저장 화면이 아니라 실제 기동 결과로 확인한다. 기동 로그 첫 줄에 침묵 허용치와 절대
상한이 실제 적용값으로 찍힌다. 스킬은 봇에게 목록을 물어 등록 여부를 확인하고, 파일
존재만으로 등록을 주장하지 않는다. 기동 실패는 로그에 코드로 남으므로 그 코드를 그대로
읽는다.

### 이 설정이 보장하지 않는 것

스킬 목록에서 빼는 것은 오사용과 혼선을 줄이는 조치이며 기술적 차단이 아니다. 기본
연결기의 봇은 파일 읽기와 터미널을 그대로 가지므로, 목록에 없는 스킬 파일을 직접 읽어
절차를 따르거나 요청받은 설치를 수행할 수 있다. 지침에 적은 금지는 봇의 약속이며 울타리가
아니다. 실제 차단이 필요하면 도구 권한 자체를 제한해야 하고, 전용 설정 폴더가 봇마다
분리되어 있으므로 그 권한 규칙도 봇 단위로 둘 수 있다. 다만 문서 작성 스킬이 실제로
사용하는 실행 수단을 먼저 관측한 뒤에 정한다.

### 호스트 관측 주의

패키지 격리된 세션에서 사용자 AppData 경로를 읽거나 쓰면 실제 파일이 아니라 가상 사본을
볼 수 있다. 봇 기록과 클라이언트 상태는 실뷰가 보장되는 경로로만 관측하고 편집한다.
같은 이유로 패키지 세션에서 클라이언트를 실행하지 않는다. 클라이언트 저장소가 갈린다.

## Expected readback and evidence

- Pack/version/digest and installed-copy smoke readback for the isolated candidate only.
- Exact workshop profile, capability/tool-version reference, job/lease/fence token, queue state, validator outcome, and candidate custody receipt reference.
- A candidate output state only; independent review and acceptance must occur through their separate owner path.

## HOLD / stop

Stop on capacity conflict, missing/expired lease, stale fence token, capability/version mismatch, validator failure, absent project scope, conflicting writer, missing independent reviewer, or any request for unapproved hardware/software side effects. UI idle, a crashed runner, or an unverified process stop does not free a lease.

## Rollback and escalation

Release a lease only through the exact contract path; an expired takeover invalidates the older fence token. Do not delete a candidate output to resolve a conflict. Preserve the job/lease/receipt references and escalate to the Workshop owner, project reviewer, or isolated-pack operator as appropriate.

For a restart, stop the exact child and reuse the same roots and pinned binding.
Use `mode: "open_existing"`; it refuses missing prior state, including a deleted
database and marker. First creation uses `mode: "create_new"`. The backward-compatible
default `open_or_create` cannot distinguish an entirely erased state directory
from a new one and is not a restart-loss detector. Cancellation stays requested
until the child is observed closed. After expiry the next acquisition fences the
old worker; files without a committed receipt are unregistered output. The pack
rehearsal exercises code-generation backup/upgrade/rollback/damaged-copy restore;
it does not back up a running workshop database or approve operational recovery.

## Optional scoped Claude text adapter

The pack includes `guild_hall/tool_workshop/CLAUDE_ACP_SCOPE.md` and its four
production modules. The same modules can be built as the separate versioned
`tool-workshop-claude-acp-v3` source lane using the repository-owned
`tool_workshop_claude_acp_v3_lane.spec.json`; the earlier v1/v2 specs and lanes are
preserved. V3 retains the v2 negotiation of Buzz's newer request to supported ACP1
and acknowledges only the
pinned model. Foreign model/permission settings and extra MCP servers remain
refused. The v3 identifier is a packaging revision, not ACP protocol 3 support.
Version agreement is not full bot or tool-chain acceptance. These optional Claude
repairs are not a prerequisite for the first pilot's existing single-task bot route.
This tracked-only first build omits
`--previous-lane`; it contains no inherited workspace metadata, profile, native
runtime, credentials, instructions or job data. Verify the resulting manifest
before registering its exact installed entrypoint as a Buzz custom harness.

The trusted dispatcher prepares the fixed local binding outside the mutable job
folder and pins the instruction/input/runtime bytes and three workspace tool
names. Use the installed entrypoint's `--preflight` mode before sending work. It
checks native metadata, model and MCP names with no user prompt. The ordinary
entrypoint supports ACP text jobs with manifest-bound reads and create-only text
drafts. It retains official CLI authentication in its normal host location and
does not copy credentials into a new home. Never run the production adapter from
a Git checkout or inherit arbitrary client MCP servers, shell tools or settings.

Before each actual work prompt, including later turns, v3 separately invokes the
pinned CLI's `auth status --json` in that session's fixed cwd and environment.
`--preflight` does not perform this auth observation. Only the typed `loggedIn`
boolean and allowlisted authentication method are interpreted; raw auth fields,
account identifiers and stderr are discarded. The probe is bounded to 16 KiB and
15 seconds, and its positive observation expires within 30 seconds and the binding
expiry. It is never reused for a later prompt. `AUTH_REQUIRED` means the CLI
reported no authentication; `AUTH_STATE_UNAVAILABLE` means that observation could
not be established. Neither outcome authorizes reading credentials, logging in,
changing settings, or inferring provider quota from error prose.

An operational failure sends one fixed notice and a terminal ACP response with
`stopReason: "end_turn"`, `_meta.accepted: false`, and typed
`_meta.failure_meta` (`status: "failed"`, fixed code, `retryable: false`). Only
recognized native result subtypes/error codes classify a failure; unknown values
remain unknown. Actual cancellation returns `cancelled`. Failed-session replay
returns the retained result with no new notice, auth probe or work-process spawn;
another attempt requires a newly created session and the usual binding checks.
`directChildClosed: false` means direct-child closure was not confirmed, and a new
session cannot run while an observed prior child remains live. This is not a
descendant-process termination guarantee or rollback of partial draft files.

Buzz's referenced transport may label that terminal response `ok`/`end_turn` and
ignore the custom failure metadata. Such labels mean transport processing ended,
not work success or acceptance. A failure notice observed in an ACP stream/log
does not prove delivery to actual Bot Chat or propagation to a business status.
Read those outcomes separately; this adapter has no relay publisher. Actual Buzz
child-context authentication, real model work and installed-v3 operation require
their own measurements. The packed scope, Buzz-compatibility and failure suites
use synthetic CLI fixtures and run as both source and installed smoke, including
direct reads of the preserved v1/v2/v3 source-lane specifications.

After actual custom-harness selection, read the bot configuration back and run a
short public/synthetic canary. Registration, metadata preflight, actual inference,
PPTX queue execution, native/render validation and artifact custody are distinct
results. A successful text draft does not prove the latter steps. Follow the
scope document for exact binding fields, current CLI checks and limitations;
do not treat file hashes or this adapter as OS principal isolation. Working files
stay in the approved bot work folder. Only accepted canonical bytes and their
lineage may later enter canonical storage through its existing authority.

## Known issues

- Current evidence covers durable queue replay, real Node XLSX and template PPTX generation, separate validation, PPTX reimport/render, and native file readback. No physical Tool PC, Office round-trip/print or operating-principal isolation is proven.
- `done_candidate` is not artifact acceptance, knowledge promotion, project completion, or release.
- This candidate has no `last_verified_release` and no exercise receipt, so it cannot release the Tool Workshop Pack.
