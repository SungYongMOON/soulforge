# Soulforge Report Writing Guide v0

## 목적

- [`SOULFORGE_REPORT_FORMAT_V0.md`](SOULFORGE_REPORT_FORMAT_V0.md) 는 보고서의 **구조**(adaptive role, structured record + MD 정본 + optional HTML, reader/audit 분리, 저장 경계)를 고정한다.
- 이 문서는 그 구조를 **무슨 논리·문체로 채워 결론 있는 보고까지 가는가**를 고정한다.
- 작성·검토 행동의 실행 정본은 `.workflow/report_authoring_v0/` 다.
  `.registry/skills/report_writer` (설치명 `soulforge-report-writer`)는 요청 준비와 고정 runner 호출만 담당하는 launcher다.
- 대상: 시스템 엔지니어링 실험·시험보고서, 분석보고서, 과제수행보고서, 발표자료.
- 경계: 이 문서는 문체·절차 doctrine 이다. 사실, 수치, 시험결과, 판정의 authority 는 owner 와 source 에 있다. claim ceiling 과 공개/비공개 경계는 format 문서와 `AGENT_EXECUTION_CONTRACT_V0.md` 가 소유한다.
- 사람이 직접 보내는 업무 메일 문체는 [`MAIL_SEND_STYLE_POLICY_V0.md`](MAIL_SEND_STYLE_POLICY_V0.md) 가 owner 다.

## 가장 쉬운 사용법

이미 초안이 있으면 `final_polish`를 쓴다. 초안 하나만 주고 보고서 유형과 독자를
고르면 된다. 원문 자료나 별도 의미 목록이 없어도 시작하며, 사실·수치·단위·조건·
한계·판정은 그대로 묶어 둔 채 구조, 문장 기능, 표, 요약과 다음 행동을 정리한다.
뜻이 두 갈래로 읽혀 실제 결론이 달라질 때만 질문 하나를 한다.

자료만 있고 초안이 없으면 `full_authoring`을 쓴다. 목적·기준·결론 범위를 바꿀 수
있는 정보가 비었을 때만 질문 하나씩 확인하고, 답이 없으면 지어내지 않고
`미확인`과 확인 종료조건으로 남긴다.

- Codex에서는 `$soulforge-report-writer` 또는 `/report-writer`를 호출하고 초안이나
  자료를 지정한다. 스킬은 워크플로를 시작할 뿐이며 실제 규칙과 검증은
  `report_authoring_v0`가 수행한다.
- dev-ERP에서는 초안/자료를 선택하고 모드·보고서 유형·독자만 고른다. ERP는
  편집 규칙이나 모델 프롬프트를 보유하지 않고 같은 Soulforge 워크플로 작업의
  상태와 결과만 보여준다.
- 결과는 검증된 Markdown 정본과 선택한 HTML, 그리고 분리된 감사 기록이다.
  자동 검증 통과는 사람 검토나 배포·발행 승인을 대신하지 않는다.
- 날짜 근거가 없으면 `report_date`는 `null`로 유지하고 독자용 날짜 행을 생략한다.
  v0는 보호된 수치·단위·인용 표면과 anchor를 그대로 보존하므로 단위 변환,
  인용 번호 변경, 보호 내용 이동은 수행하지 않는다.
- v0에는 신뢰된 공개분류 authority가 없으므로 산출물은 `private_work_product`다.
  초안 하나만 정리할 때는 `observed` 및 `partial|unconfirmed`보다 강한 원천
  상태를 주장하지 않는다.

## 1. 핵심 문제 — 결론 없는 데이터 덤프

측정 자료만 모아 붙인 보고는 듣는 사람이 묻게 만든다. "이 실험 왜 했어요?", "자료 많은 건 알겠는데
그래서요?", "어떻게 하겠다는 거예요?". 결과에서 멈춘 보고다. 결론은 "그래서 무엇인가"와 "다음은
무엇인가"다. 아래 골격이 이 둘을 강제한다.

## 2. So-What 5문 골격

작성 전에는 아래 5문을 intake/body planning map으로 먼저 채운다. 공개되는 첫 장의
요약/BLUF는 독립적으로 먼저 쓰지 않고, body가 기술 내용·근거 논리 검토를 통과한 뒤
검증된 body claim에서 파생한다.

| | 질문 | 한 줄로 채움 | 비면 듣는 말 |
| --- | --- | --- | --- |
| ① | 왜 했나 | 이게 없으면 무엇을 모르거나 못 정하나 (목적 = 풀려는 질문/결정) | "이 실험 왜 했어요?" |
| ② | 뭘 했나 | 대상·조건·횟수 한 줄 | (보통 이건 됨) |
| ③ | 뭘 얻었나 | 핵심 결과 1~2개, 숫자로 | "자료 많은 건 알겠는데…" |
| ④ | 그래서 뭔가 | 결과의 의미·종합 판정 (기준 대비 합/부, 가설 입증/반증) | "그래서요? 결론이 뭐예요?" |
| ⑤ | 다음은 | 무엇을 하겠다 / 무엇을 결정해 달라 | "어떻게 하겠다는 거죠?" |

규칙: 의사결정형 보고는 ① 목적, ④ 의미/판정 범위, ⑤ 다음 행동 또는 명시적
`요청 없음` 상태가 필요하다. 단, 명명된 기준이 없으면 합부 판정을 만들지 않고
관찰·제한된 결론·미확인 상태로 남긴다.

## 3. 실무 register 규칙 (실제 전문 보고서 근거)

실재하는 시험·평가·조사 보고서에서 추출한 규칙이다. 각 규칙에 실제 출처 한 개.

| 규칙 | 적용 형태 (한국 SE 보고서) | 근거 |
| --- | --- | --- |
| BLUF — 헤드라인 결과/판정을 도입부 1줄에 단정 | 요약 첫 줄에 핵심 수치·판정을 명사구로 | 환경부/국립환경과학원 정도관리("99.2%" lede) |
| 종합 판정 1문장 명문화 | 항목 판정 위에 "최종 판정: ~ (근거)" 단정문 | NTSB AAR-19/02 (probable-cause 단일 단정문) |
| 수치는 측정 불확도와 한 쌍 | "값 ± 불확도, 신뢰수준 95%, k=2" 패턴 | NIST TN 2077; KRISS TR-2022-018 |
| 사실은 단정 / 추론만 완충 | 측정·결과는 "~확인", 원인 해석만 "~로 보임/추정" | NIST TN 2203 ("might be attributed to") |
| finding → evidence 접속 가시화 | "따라서 ~로 판단함"으로 근거→판정 연결 | NTSB AAR-19/02 ("Thus, the NTSB concludes that") |
| 권고 → 의사결정 귀결 | 소결 직후 "따라서 ~ 권고(승인/보류/재설계)" | NTSB AIR-25-01 ("Therefore, the NTSB recommends") |
| 요구사항/권고에 추적 ID + 상태 | REQ/권고 ID + 검증분류(시험/시연/분석/검사) + 상태 | NTSB AAR-19/02 (권고 ID + open/closed 상태) |
| 실패·한계도 단정 1문장 + 원인 | 미달/부적합은 완충 없이 명시 후 원인 | Sandia SAND2019-11643 ("…was unsuccessful") |
| 성과는 개조식 명사구로 단정 | "~ 도출/수립/선정/구축"로 검증 가능한 산출 단정 | 교통안전공단 TRKO201600009191 ("인증기준 도출") |

개조식 종결은 제목, 카드, 체크리스트형 bullet에 유효한 선택지다. 근거와 추론의
관계를 설명하는 본문은 완전문장을 사용한다. 특정 종결형을 문서 전체에 기계적으로
강제하지 않는다.

owner-facing 용어: format 문서대로 `판정 범위`, `적용 범위`, `출처 및 추적성`, `고려사항`, `문서 관리` 를 쓴다.

## 4. Final polish — 기능·근거 기준 (금지어 목록 없음)

헤지어나 특정 어휘만으로 문장을 탈락시키지 않는다. 같은 문장/항목의 기능과 아래
grounding을 함께 본다.
(a) 근거·데이터 참조  (b) 명명된 원인  (c) 정량 bound(±, %, k, n=)  (d) 명시적 미확인 라벨.

| 신호어 | 정당 (PASS) | 금지 (FLAG) | 고치는 법 |
| --- | --- | --- | --- |
| 판단됨 / 판단된다 | "원인은 큐 대기로 판단됨(로그상 X초)" | "개선이 필요하다고 판단됨" (근거 없음) | 근거 1줄 추가 |
| ~일 수 있음 | "측정 한계로 ±2% 오차 가능" | "효과가 있을 수 있음" (근거 없음) | 정량화 또는 미확인 라벨 |
| 추가 검토 필요 | "미확인: A 계측 후 확정 필요" | "추가 검토가 필요할 수 있음" (누가/왜 없음) | 무엇을·왜·누가 |
| 획기적/매우/강력한/최적 | source가 정의·입증한 공식 명칭/평가일 때만 보존 | 근거 없는 홍보 강도 | 검증 가능한 수치·기준으로 대체 |
| 종합적으로/결론적으로 말하자면/앞서 살펴본 바와 같이 | 실제 논리 전환을 명확히 할 때 | 기능 없는 도입구 | 의미 손실 없이 삭제하고 결론을 바로 |
| ~에 있어서 / ~를 통하여 / 되어지다 | (정착 표현 일부) | 대개 | 능동·동사화 |

final polish 목적은 어휘 박멸이 아니라 reader need, 명료성, 정확성, 근거, 전문적
유용성을 높이는 것이다. 요구사항·규격·합부기준에서는 source의 modality와 comparator를
그대로 보존하고, 분석·판단·한계에서는 근거 수준에 맞춰 표현한다. AI detector, detector
회피 목표, fluency/similarity 점수, word blacklist를 gate로 쓰지 않는다.

before/after (정보 밀도):

```text
나쁨: 다양한 요인을 종합적으로 고려한 결과 일부 개선 여지가 있을 수 있는 것으로 사료됩니다.
좋음: 지연시간이 목표(50 ms)를 23% 초과. 원인은 큐 대기(전체 지연의 68%). 큐 깊이 16→4로 목표 달성.
```

## 5. AI 협업 절차

핵심: owner/source가 truth를 공급하고 workflow가 구조·검토·투영을 수행한다. Node
runner는 모델을 호출하거나 보고서를 쓰지 않으며, Codex controller 또는 승인된 worker가
고정 계약에 맞는 stage output을 만든다.

| 단계 | 누가 | 산출 |
| --- | --- | --- |
| 1. 입력·gap scan | owner + controller | hash-bound source/draft refs, material gap register |
| 2. 기술 내용 패스 | fresh executor | body draft, protected claims, evidence gaps |
| 3. 근거 논리 패스 | fresh executor | 타입 role 적합성, evidence→conclusion→Ask 추적 |
| 4. 요약 파생 | fresh executor | body claim ID에 묶인 summary/BLUF |
| 5. grammar/tone 패스 | fresh executor | 의미 불변 final candidate |
| 6. 독립 의미 검증 | 별도 fresh verifier | 모든 hash-bound input 대비 pass/block |
| 7. runner finalize | deterministic runner | reader deliverable, audit refs, metadata-only receipt |
| 8. 사람 검토 | 독립 human + owner | publishable/production-ready 판단과 승인 |

`full_authoring`만 material gap을 한 번에 한 질문씩 묻는다. `final_polish`는 draft 하나로
시작하며 optional source/manifest가 없다는 이유로 인터뷰하거나 차단하지 않는다.

검토 지시 예시(고정 runner request에는 prompt를 넣지 않음):

```text
이 보고서를 다시 쓰지 말고 문장 기능과 근거를 검사해줘. 의미·근거·역할·조건을
보존하면서 기능 없는 도입, 근거 없는 강도, 모호한 행위자, 분리된 수치 tuple만
"위치 - 문제 - 수정 후보"로 제시해. 단어 자체만으로 flag하지 마.
```

## 6. 보고서 타입별 골격

타입과 reader decision에 따라 section role을 고른다. 비적용 optional role은 빈 제목으로
만들지 않는다. 상세 runtime matrix는
`.workflow/report_authoring_v0/references/editorial_contract.md`가 소유한다.

| 타입 | 핵심 골격 (두괄식) | 약한 곳에서 자주 빠지는 것 |
| --- | --- | --- |
| 실험/시험 | 핵심결론 → 시험목적 → 시험조건(대상/환경/장비+교정유효일/시험일자) → 검토결과(측정값±불확도) → **종합 합부 판정 + 규격 ID** → 고려사항 → 후속 | 종합 판정 1문장, 교정상태, 불확도(k=2,95%) |
| 분석 | 핵심결론 → 문제/결정질문 → 범위/방법/가정 → **기준·가중치(대안보다 먼저)** → 비교(trade) → 해석 → **권고 → 의사결정** | 권고→의사결정 귀결, 미채택 영향 |
| 과제수행 | 요약 → 개요 → **계획 vs 실제 마일스톤(일정 baseline)** → 산출물 → 이슈/리스크 → **의사결정/지원 요청** → 자원정산 | 일정 baseline, escalation/의사결정 요청 |
| 발표자료 | 표지 → **BLUF 결론 + Ask(1장)** → 배경(SCQA) → 근거 3장 이하(완전문장 headline) → 권고/다음 → 백업 | 결론 헤드라인, 명시적 Ask |
| 기타 | 목적/결정질문 → 범위·근거 → 발견/현재상태 → 해석·한계 → 지원되는 결론/상태 → 다음 또는 요청 없음 → 추적성 | generic section 강제, 불필요한 판정 |

요약/BLUF는 위 body role이 검증된 뒤 파생한다. 채워진 synthetic illustration은
`report_writer` 스킬의 [`examples`](../../../.registry/skills/report_writer/codex/references/examples.md)에
있지만 runtime policy나 source truth는 아니다.

## 7. 실제 샘플로 재튜닝

조직의 좋은 보고서를 확보하면 register 를 추출해 규칙을 그 문체로 맞춘다. 개인정보·회사 원문·secret 은
format 문서 저장 규칙대로 분리하고, public 예시 폴더에는 합성만 둔다. 추출 절차: 문장 길이·종결 패턴,
결론 위치, 숫자 붙이는 법, 조직 관용구·금지 표현을 뽑아 2~3장에 반영한다.

## 8. 산출 형식

- 정본은 MD, 사람 검토본은 HTML companion. format 문서의 쌍 규칙을 따른다.
- 현재 지원: Markdown + HTML. 후속 후보: docx, pptx, hwpx (HWP 는 [`HWP_NORMALIZATION_V0.md`](HWP_NORMALIZATION_V0.md) 의 HWPX 정규화 순서를 따른다).

## 9. 완료와 검증 경계

- 사실·수치·판정의 정확성은 owner 와 source 가 검증한다. 이 가이드와 AI 패스는 문체와 논리 표현만 다듬는다.
- 종료 검증은 `AGENT_EXECUTION_CONTRACT_V0.md` 의 post-development review gate 와 `.workflow/post_development_review_gate_v0/` 를 따른다.
- claim ceiling 은 실제 검증 수준 이상으로 올리지 않는다.

## 관련 문서

- [`SOULFORGE_REPORT_FORMAT_V0.md`](SOULFORGE_REPORT_FORMAT_V0.md) — adaptive 구조와 structured/MD/optional HTML artifact set 정본
- `.workflow/report_authoring_v0/` — 작성·검토·요약 파생·의미 보존 실행 정본
- `.workflow/report_authoring_v0/references/editorial_research_basis.md` — NIST,
  NASA, GAO, Digital.gov, BIPM 및 사실 일관성 연구를 실행 규칙에 연결한
  공개 근거표
- `.registry/skills/report_writer/` — 고정 workflow launcher (설치명 `soulforge-report-writer`)
- [`MAIL_SEND_STYLE_POLICY_V0.md`](MAIL_SEND_STYLE_POLICY_V0.md) — 사람이 보내는 업무 메일 문체
- [`HWP_NORMALIZATION_V0.md`](HWP_NORMALIZATION_V0.md) — HWP → HWPX 정규화 순서
- `../foundation/AGENT_EXECUTION_CONTRACT_V0.md` — 종료 검증과 claim ceiling
- register 근거 출처(공개): NTSB(ntsb.gov), NIST(nvlpubs.nist.gov), NASA(ntrs.nasa.gov), NREL/Sandia(osti.gov), KRISS(kriss.re.kr), KISTEP(kistep.re.kr), 환경부(me.go.kr)

## 상태

- Draft v0 guidance. 실제 보고서 근거와 workflow-owned editorial contract에 맞춰
  adaptive roles, body-derived summary, meaning-based polish 경계를 보정했다.
- `report_writer` skill은 이 doctrine을 복제하지 않고 `report_authoring_v0`를 호출한다.
