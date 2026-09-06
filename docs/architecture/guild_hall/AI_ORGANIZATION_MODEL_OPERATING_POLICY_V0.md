# Soulforge AI 조직·모델 운영정책 v0

## 상태와 목적

- 상태: `canon_entry`
- Owner 승인일: 2026-07-31
- Owner 최신 변경일: 2026-08-03 — 실제 결과물 TASK 기본값을
  `gpt-5.6-terra/max`로 변경
- 현재 활성 운영: `CODEX_NATIVE + NORMAL`
- 현재 비활성: 외부 LLM 역할 대체, `TOKEN_CONSTRAINED`

이 문서는 Soulforge의 실제 조직도에 맞춰 역할별 기본 Codex 모델과 추론 강도,
보고·검토·Ultra 심의, 외부 조사·자문 지원 채널의 경계를 고정한다.

핵심 원칙은 다음과 같다.

1. 상류 방향·기준·수락 오류는 후속 TASK 전체를 무효화할 수 있으므로 강한
   모델을 유지한다.
2. 실제 조사·계산·설계·코드·시험·문서 작성은 기본적으로
   `Terra/max` TASK가 수행한다.
3. 조직도에 존재하는 모든 계층을 모든 업무에서 호출하지 않는다.
4. 상위 역할은 더 넓은 범위를 판단하지만 하위 결과물을 반복 작성하지 않는다.
5. Ultra는 상시 직책이나 CEO 기본 모델이 아니라, 정해진 중대 Gate의 심의
   절차다.
6. GPT Pro·Deep Research·NotebookLM은 모든 운영 상태에서 사용할 수 있는
   조사·자문 지원 채널이며 외부 LLM 역할 대체와 구분한다.
7. 모델을 낮춰야 하는 자원 부족 운영과 외부 LLM 역할 대체는 별도 Owner 승인
   전 활성화하지 않는다.

## 조직과 권한

조직 권한은 사용하는 모델에 따라 바뀌지 않는다.

```text
사람 Owner
→ 회사 CEO
→ 운영실 팀장 또는 프로젝트 팀장
→ 주관 분야 책임자
→ TASK 작업자
→ 필요 시 독립검토
→ 권한자 수락
→ 사람 Owner 최종승인
```

사람 Owner는 방향, 인사, 예산, 구매, 외부 약속, 기준선, 프로젝트 착수·중단,
공식 완료와 최종수락 권한을 유지한다. AI 조직의 `ACCEPT`는 내부 수락
제안이며 사람 Owner의 공식 승인을 자동으로 의미하지 않는다.

## 역할별 기본 모델

| 역할 | 기본 모델·추론 | 핵심 책임 |
| --- | --- | --- |
| 개발1팀 회사 CEO | `Sol/xhigh` | 회사 목표·포트폴리오·프로젝트 간 충돌·Owner 상신 |
| AI 기반시스템 회사 CEO | `Sol/xhigh` | AX·ERP·SYSTEM 포트폴리오·회사 간 충돌·Owner 상신 |
| AX CEO | `Sol/xhigh` | AX 제품축 방향·결과 통합 |
| ERP CEO | `Sol/xhigh` | ERP 제품축 방향·결과 통합 |
| SYSTEM 책임 | `Sol/xhigh` | 실행기반 방향·결과 통합 |
| 개발1팀 운영실 팀장 | `Sol/high` | 공통업무 분류·단일 주관 지정·후속조치 통합 |
| 프로젝트 팀장 | `Sol/xhigh` | 프로젝트 목표·위험·분야 간 통합·TASK Gate |
| 기술 방향·수락 책임자 | `Sol/high` | 분야 기준·완료조건·기술 결과 수락 |
| 운영·통제 책임자 | `Terra/high~xhigh` | 절차·상태·자원·이력 통제 |
| 실제 결과물 TASK | `Terra/max` | 조사·계산·설계·코드·시험·문서와 증거 생성 |
| 운영·상태 정리 TASK | `Terra/high` | 진행·자료·상태·보고 패킷 정리 |
| 단순 수집·형식화 | `Luna/medium` | 판단권 없는 추출·목록·형식 변환 |
| 일반 독립 기술검토 | `fresh Sol/high` | 비수행자 관점의 기술 검토 |
| 일반 독립 운영검토 | `fresh Terra/xhigh` | 비수행자 관점의 절차·증거 검토 |
| 중대 Gate 심의 | `Ultra` | 정해진 안건의 최고강도 다면 심의 |

`max`는 실제 결과물 TASK의 최대 reasoning effort이며 Ultra 심의와 다르다. CEO·manager·
책임자의 판단 turn, 운영·상태 정리, 단순 수집·형식화와 독립검토는 실제 결과물
TASK로 간주하지 않으며 위 표의 기존 profile을 유지한다. 새 실제 결과물 TASK는
runtime이 지원하면 `gpt-5.6-terra/max`를 요청한다. 기록에서는 요청 모델·reasoning
effort와 실제 관찰 모델·reasoning effort를 각각 구분하고, runtime에서 실제 모델이나
effort를 관찰하지 못했으면 해당 관찰값을 `UNKNOWN`으로 둔다.

이 표는 상시 역할의 기본 profile이다. 개별 workflow의 검증된
`profile_policy.yaml`과 상충할 때는 다음을 구분한다.

- 조직 역할의 판단·조정 turn: 이 문서의 역할 profile
- 등록 workflow의 bounded 실행 turn: 해당 workflow의 검증된 profile
- 둘이 한 turn에 겹치면 더 강한 품질선 또는 명시된 Owner 지시를 적용하고,
  관찰되지 않은 실제 모델은 추정하지 않는다.

## 보안 분류(G1/G2/G3)와 조직 종류

이 절은 보안 설계(E08·E12·E14·v0.11)가 정의한 역할 분류를 이 문서의 역할·모델 체계와 연결한다. G1/G2/G3는 위 "역할별 기본 모델" 표의 개별 역할(CEO·팀장·책임자 등, 모든 조직 종류를 가로지르는 판단 계층)에 각각 매기는 값이 아니라, `18_TEAM_PILOT_ACCESS_AND_RELEASE_PLAN_V0.md` §13이 쓰는 조직 종류(`organization_kind`)에 대응하는 분류다(두 번호 체계를 섞지 않는다).

| organization_kind | 조직 그룹(§13) | 보안 분류 | 원본 접근 | 외부 전송 |
| --- | --- | --- | --- | --- |
| `project` | 1 프로젝트별 AI 조직 | G3 외부 작업 | 없음(packet만) | 허가된 bytes만(사람·정책 관문 통과분) |
| `tool_workshop` | 2 전문 툴 공방 | G3 외부 작업 | 없음(packet만) | 허가된 bytes만(사람·정책 관문 통과분) |
| `common` | 3 공통 AI 인력 | G2 데이터 관리 | 있음(로컬만) | 금지(가공 packet은 G3로만) |
| `platform` | 4 플랫폼·엔진 | G1 시스템 관리 | 없음(합성만) | 없음 |

규칙(보안 설계 B1~B8): G3에는 원본 전체를 주지 않는다. 전송 전 검토·허가는 사람·정책 관문이 최종이다. 매핑·키·원문·hidden reasoning은 로그에 남기지 않는다. 결과는 항상 후보(검사 중)이며 사람 수락 뒤에만 정본이다. 첫 사이클은 합성 자료만 쓴다.

정본 봇 명부와 그룹별 구성은 [`../foundation/team_member_engineering_program/18_TEAM_PILOT_ACCESS_AND_RELEASE_PLAN_V0.md`](../foundation/team_member_engineering_program/18_TEAM_PILOT_ACCESS_AND_RELEASE_PLAN_V0.md) §13이 소유한다. 보안 설계 원본(E08·E12·E14·v0.11)은 이 저장소 밖에 있으며 여기서는 이름만 인용한다.

## 음성 비서

실시간 음성 비서는 사람 Owner의 대표 접점이자 일상 업무 라우터다.

- 기본 모델: `Terra/high~xhigh`
- 공통 운영업무는 개발1팀 운영실 팀장에게 전달한다.
- 프로젝트 업무는 해당 프로젝트 팀장에게 전달한다.
- AX·ERP·SYSTEM 업무는 해당 회사 route로 전달한다.
- 상태조회는 가능한 경우 ledger에서 답하고 CEO를 깨우지 않는다.
- 기술 방향, 기준선, 프로젝트 착수·중단, 구매·외부발송, 공식 완료를 직접
  확정하지 않는다.
- 모호한 음성 요청을 실제 지시로 확대하지 않고 사람 Owner에게 확인한다.
- 현재 실시간 음성 규칙에 따라 다른 task에 메시지를 보내는 행위는 그 음성
  세션에서 사람 Owner가 명시적으로 요청한 경우에만 수행한다.

조직을 라우팅할 때는 다음 정본을 먼저 확인한다.

- 회사 조직도·보고 관계:
  [`DEVELOPMENT1_TEAM_AND_AI_PLATFORM_ORGANIZATION_V0.md`](DEVELOPMENT1_TEAM_AND_AI_PLATFORM_ORGANIZATION_V0.md)
- 공통업무 접수·분류·라우팅:
  [`COMMON_TEAM_OPERATIONS_AND_ROUTING_V0.md`](COMMON_TEAM_OPERATIONS_AND_ROUTING_V0.md)
- exact Codex task route:
  [`CODEX_WORK_DIRECTORY_V1.md`](CODEX_WORK_DIRECTORY_V1.md)

## 프로젝트 책임자 분류

### 기술 방향·수락 책임자 — `Sol/high`

- 시스템공학·요구사항
- 하드웨어 설계
- SW 설계
- 기구 설계
- 전장·인터페이스 통합
- 시험·검증
- 품질·입증
- 안전·보안보증

이들은 요구사항 해석, 입력과 출처, 가정과 경계조건, 적용 모델, 계산·시험
방법, 요구 충족 증거, 타 분야 영향, 남은 불확실성을 확인해
`ACCEPT / REVISE / HOLD`를 제안한다. TASK 결과물을 처음부터 다시 작성하지
않는다.

### 운영·통제 책임자 — `Terra/high~xhigh`

- 형상·변경관리
- 기술자료·데이터관리
- 구매·자재·재고
- 일정·계약·대외협력
- 생산·정비지원
- 원가·예산
- 홍보·대외공개

이들은 절차·상태·자원·이력·외부 협력을 관리한다. 기술 방향, 설계 타당성,
기준선 판단이 필요하면 관련 Sol 기술책임자 또는 프로젝트 팀장에게 반환한다.
형상·변경관리 책임자는 변경 접수·영향 대상·이력·기준선 상태·승인 흐름을
통제하지만 기술적 타당성과 최종 기준선 변경을 단독 승인하지 않는다.

## 개발1팀 운영실 책임자

| 책임 | 기본 모델 | 권한 경계 |
| --- | --- | --- |
| 전략기획·포트폴리오 | `Terra/xhigh` | 분석안 작성, 최종 선택은 CEO·Owner |
| 인력·역량·조직지원 | `Terra/high` | 조직 방향 변경은 CEO·Owner |
| 경영관리·예산·행정 | `Terra/high` | 중대 예산·계약은 Owner |
| 구매·자산·재고 | `Terra/high` | 기술선정은 프로젝트 기술책임자 |
| 품질·표준·지식관리 | `Terra/xhigh` | 기술표준 제·개정은 Sol Gate |
| 제작·정비·시험환경 | `Terra/xhigh` | 시험기준·설계변경은 기술책임자 |
| 협업·회의·결정·공지 | `Terra/high` | 결정을 만들지 않고 기록·전파 |

## 기본 실행 흐름

일반 기술 TASK는 다음 범위에서 닫는다.

```text
프로젝트 팀장 Sol/xhigh
→ 주관 분야 책임자 지정
→ 기술책임자 Sol/high가 목표·가정·범위·완료조건·검증기준 정의
→ TASK Terra/max가 실제 수행과 증거 제출
→ 기술책임자 Sol/high가 ACCEPT / REVISE / HOLD
→ 다른 분야·회사·Owner 영향이 없으면 종료
```

분야 간 충돌만 프로젝트 팀장에게 올리고, 프로젝트·회사 간 충돌이나 Owner
유보 권한만 회사 CEO에게 올린다. CEO와 팀장은 하위 계산·설계·시험을 반복
수행하지 않는다.

현재 만들어진 완료·과거 TASK를 profile 적용만을 위해 다시 깨우지 않는다.
진행 중 실제 결과물 TASK는 다음 정상 실행 turn 또는 새 지시에서 `Terra/max`를
요청하고, 새 실제 결과물 TASK는 처음부터 `Terra/max`를 기본값으로 사용한다.
runtime 미지원이나 실제 적용 미관찰을 조용히 다른 profile로 바꾸거나 적용된
것처럼 보고하지 않는다.

## Ultra 심의

Ultra의 의미는 다음과 같다.

```text
Ultra = 사전에 정의된 중요 Gate에서 실행되는 최고강도 다면 심의 절차
```

Ultra는 상시 CEO 모델이 아니며, 이름만으로 멀티에이전트 토폴로지를
의미하지 않는다. 실제 토폴로지는 실행 workflow가 명시하고 관찰한 범위에서만
보고한다.

다음은 Ultra 필수 Gate다.

- 신규 프로젝트 기술방향 최초 확정
- 요구사항 기준선 확정
- 신규 시스템 아키텍처 채택
- SRR·PDR·CDR의 중대 기준선·설계성숙도·진행 판정
- 주요 HW·SW·기구·전장 인터페이스 기준선 확정
- 설계 동결
- 대규모 제작·구매 착수 전 기술판정
- 기존 요구사항·설계 기준선의 중대한 변경
- 잘못 판단하면 다수 후속 TASK가 무효화되는 결정
- 프로젝트 착수·중단·대폭 방향 전환
- 프로젝트 간 우선순위의 대규모 변경
- AX·ERP·SYSTEM 간 정본·authority 충돌
- 큰 예산·인력·자원 재배치
- 외부기관에 대한 중대한 일정·성능 약속
- 안전·보안·대외공개의 중대한 최종 판단
- 사람 Owner의 명시적 Ultra 요청

단순한 회의 개최, 정상 보고, 상태조회는 Ultra Gate가 아니다. 책임자·팀장은
분야 간 결론 충돌, 기존 기준으로 판단 불가, 근거 상충·부족, 방향을 크게
바꾸는 불확실성이 있으면 추가 Ultra 심의를 요청할 수 있다.

Ultra에는 전체 대화와 원문을 무조건 넣지 않는다. 결정사항, 유효 기준선,
핵심 가정, 선택지, 충돌점, 기술·일정·예산 영향, 되돌림 가능성, 증거 위치를
담은 bounded decision packet을 우선 제공하고 필요한 증거만 확장한다.

## CEO 보고와 기억

팀장의 정상 보고는 먼저 정식 ledger 또는 보고면에 기록하며, 단순 접수와 ACK
때문에 CEO를 호출하지 않는다.

CEO 호출 조건은 다음으로 제한한다.

- CEO 결정 필요
- 프로젝트 또는 회사 간 충돌
- Owner 상신 필요
- 중대 blocker 또는 포트폴리오 영향
- Ultra 결과 수신
- 사람 Owner의 직접 질문

CEO briefing은 다음 형태를 사용한다.

```text
짧은 현재 상태
+ 지난 CEO 판단 이후 변경분
+ 결정이 필요한 안건
+ 일정·예산·자원 영향
+ 필요 시 확장할 증거 포인터
```

전체 TASK 대화, 테스트 로그, 계산 과정, 변경되지 않은 장표를 매번 반복
전달하지 않는다.

## Codex에서 Hermes Bot으로 전달하는 기본 대화 통로

사람 Owner가 Codex 대화에서 Hermes Bot에게 업무지시나 후속질문 전달을 요청하면,
기본 통로는 대상 profile이 이미 소유한 canonical `Bot Chat`이다. 같은 Bot을
계속 상대하는 업무는 이 지속형 대화에 축적하며, 새 제목의 일반 CLI chat,
`source=tool` 세션, Kanban task를 기본 전달 통로로 사용하지 않는다.

외부 wrapper나 로컬 명령 표면은 다음 의미를 보존해야 한다.

```text
hermes -p <exact-profile> chat --in ~ -c "Bot Chat" --create-if-missing ...
```

- 먼저 exact profile과 제목이 정확히 `Bot Chat`인 기존 canonical session을
  resolve한다.
- 기존 session이 있으면 그 session 또는 최신 압축 lineage tip을 재사용하고,
  없을 때만 `--create-if-missing`으로 하나를 만든다.
- profile alias wrapper를 써도 위 identity와 같은 profile state store를
  가리켜야 한다.
- 기본 전달에서는 `--source tool`이나 `--source desktop`으로 source를 가장하지
  않고 source override를 생략한다.
- 동일 Bot Chat의 동시 turn을 피하고 호출자가 직렬화한다.
- 전송 후 반환된 session id가 resolve한 canonical session id와 같은지 확인한다.
  Desktop 화면의 즉시 갱신은 보장하지 않으므로 필요하면 사용자가 해당 Bot
  카드나 탭을 다시 열어 최신 history를 hydrate한다.
- 잘못 만들어진 일반 세션은 canonical 전달 성공과 기록 확인 전에는 삭제하지
  않는다. 정리가 필요하면 별도 권한으로 soft archive를 우선 검토한다.

Kanban은 상태·작업판 운영, 일반 CLI/tool 세션은 격리된 시험·integration 호출처럼
각 표면의 고유 목적이나 Owner의 명시 요청이 있을 때만 사용한다. 이 대화 통로
규칙은 Bot의 기술승인, 외부전송, 구매, 파일 writer, 기준선 또는 완료 권한을
추가하지 않는다.

## 조사·자문 지원 채널

다음 채널은 `CODEX_NATIVE`에서도 사용할 수 있으며 내부 역할을 자동 대체하지
않는다.

| 채널 | 상태 | 역할 |
| --- | --- | --- |
| ChatGPT Deep Research | `RESEARCH_EVIDENCE` | 외부 사실·표준·사례·공식 출처 조사 |
| NotebookLM / Deep Research | `REFERENCE_CORPUS`, `RESEARCH_EVIDENCE` | 출처 묶음·장기 근거 corpus |
| GPT Pro | `EXTERNAL_ADVISORY` | 기존 결론에 동조하지 않는 반론·대안·위험 자문 |
| 실제 외부 전문가 | `EXTERNAL_ADVISORY` | 승인된 범위의 전문 자문 |

Research는 “어떤 사실·표준·자료가 존재하는가”를 다루고, Advisory는 “그 근거를
우리 프로젝트에 적용하면 무엇이 타당한가”를 다룬다. 지원 채널 결과는 내부
`ACCEPT`나 공식 결정이 아니다.

GPT Pro와 Ultra에 같은 질문을 같은 역할로 반복하지 않는다.

- GPT Pro: 독립 반론과 외부 자문
- Ultra: 내부 의견·외부 근거·외부 자문·조직 제약의 통합 심의

## 현재 비활성 정책

Kimi, Gemini, Claude 또는 Antigravity 실행환경의 외부 모델이 CEO·팀장·책임자·
TASK·검토자 역할을 실제 대신하는 경우만 외부 LLM 역할 대체로 본다.

현재 상태는 다음과 같다.

```yaml
default_backend: CODEX_NATIVE
resource_state: NORMAL
hybrid_role_substitution: DISABLED
token_constrained_overlay: DISABLED
```

외부 LLM 역할 대체는 정확한 provider, 실행환경, 모델, 버전, reasoning,
도구권한, context, 데이터 정책, 비용·quota, fallback을 등록하고
`RESEARCH → SHADOW → ASSIST → SUBSTITUTE` 보정을 통과한 업무군에 한해 별도
Owner 승인으로 활성화한다.

토큰 부족 overlay는 핵심 품질선을 무조건 낮추는 정책이 아니라 호출·컨텍스트·
중복·동시성을 줄이는 별도 정책이다. 이번 등록으로 활성화하지 않는다.

## 적용과 주장 한계

- 이 문서는 역할별 기본 profile과 호출 경계를 정한다.
- 개별 Codex task의 모델·추론 변경은 task tool이 허용한 실제 turn에만
  관찰할 수 있다. 메시지 전송 시 override가 적용됐다는 사실과 UI의 영구
  기본설정이 바뀌었다는 주장은 구분한다.
- 완료·과거 task는 일괄 재호출하지 않는다.
- Kimi 설치·로그인·호출, Antigravity 모델 교체, 외부 모델 대체, 토큰 부족
  모드는 이 정책 등록의 실행 범위가 아니다.
- 실제 모델·provider가 관찰되지 않으면 `UNKNOWN`으로 보고한다.

## 관련 정본

- `DEVELOPMENT1_TEAM_AND_AI_PLATFORM_ORGANIZATION_V0.md`
- `COMMON_TEAM_OPERATIONS_AND_ROUTING_V0.md`
- `PROJECT_WORK_ORGANIZATION_AND_TASK_ROUTING_V0.md`
- `CODEX_WORK_DIRECTORY_V1.md`
- `../foundation/AGENT_EXECUTION_CONTRACT_V0.md`
- `../../../.workflow/codex_thread_manager_v0/`
- `../foundation/team_member_engineering_program/18_TEAM_PILOT_ACCESS_AND_RELEASE_PLAN_V0.md`
