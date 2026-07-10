# Soulforge Report Writing Guide v0

## 목적

- [`SOULFORGE_REPORT_FORMAT_V0.md`](SOULFORGE_REPORT_FORMAT_V0.md) 는 보고서의 **구조**(섹션, MD 정본 + HTML companion 쌍, 저장 경계)를 고정한다.
- 이 문서는 그 구조를 **무슨 논리·문체로 채워 결론 있는 보고까지 가는가**를 고정한다.
- 대화형으로 빈칸을 채우는 도구는 `.registry/skills/report_writer` (설치명 `soulforge-report-writer`) 스킬이다.
- 대상: 시스템 엔지니어링 실험·시험보고서, 분석보고서, 과제수행보고서, 발표자료.
- 경계: 이 문서는 문체·절차 doctrine 이다. 사실, 수치, 시험결과, 판정의 authority 는 owner 와 source 에 있다. claim ceiling 과 공개/비공개 경계는 format 문서와 `AGENT_EXECUTION_CONTRACT_V0.md` 가 소유한다.
- 사람이 직접 보내는 업무 메일 문체는 [`MAIL_SEND_STYLE_POLICY_V0.md`](MAIL_SEND_STYLE_POLICY_V0.md) 가 owner 다.

## 1. 핵심 문제 — 결론 없는 데이터 덤프

측정 자료만 모아 붙인 보고는 듣는 사람이 묻게 만든다. "이 실험 왜 했어요?", "자료 많은 건 알겠는데
그래서요?", "어떻게 하겠다는 거예요?". 결과에서 멈춘 보고다. 결론은 "그래서 무엇인가"와 "다음은
무엇인가"다. 아래 골격이 이 둘을 강제한다.

## 2. So-What 5문 골격

보고/발표는 **첫 장에 이 5줄을 먼저 채우고** 시작한다.

| | 질문 | 한 줄로 채움 | 비면 듣는 말 |
| --- | --- | --- | --- |
| ① | 왜 했나 | 이게 없으면 무엇을 모르거나 못 정하나 (목적 = 풀려는 질문/결정) | "이 실험 왜 했어요?" |
| ② | 뭘 했나 | 대상·조건·횟수 한 줄 | (보통 이건 됨) |
| ③ | 뭘 얻었나 | 핵심 결과 1~2개, 숫자로 | "자료 많은 건 알겠는데…" |
| ④ | 그래서 뭔가 | 결과의 의미·종합 판정 (기준 대비 합/부, 가설 입증/반증) | "그래서요? 결론이 뭐예요?" |
| ⑤ | 다음은 | 무엇을 하겠다 / 무엇을 결정해 달라 | "어떻게 하겠다는 거죠?" |

규칙: ①④⑤를 못 채우면 아직 보고 단계가 아니다. 데이터 덤프는 ③에서 멈춘 것이다.

## 2a. 엔지니어링 B+C+D 순서

owner가 선택한 엔지니어링 문체는 B(판정 선행) + C(현황·판정·조치 3단) +
D(수치·비교기준 선행)를 합성한다. 시간 순서가 아니라 독자의 결정 순서로 배치한다.

모든 보고서와 PPT 내용의 공통 척추:

```text
판정·요청 -> 핵심 근거 수치 2~4개 -> 상세 본문 -> 한계·미확정 -> 다음 조치(담당·기한)
```

상세 본문의 반복 단위:

```text
현황·수치 -> 문제점·판정 -> 개선방향·조치
```

PPT 스토리라인은 `결론/요청 -> 영향 -> 핵심 증거 -> 대안 비교(해당 시) -> 권고 ->
위험·실행계획` 순서로 둔다. 제목은 결론 문장이고 한 슬라이드에는 판단 ID 하나만 둔다.
발표 시간의 절반이 되기 전에 결론과 핵심 증거가 끝나야 한다.

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

개조식 종결: 줄 끝을 "~합니다/~됩니다" 대신 "~확인 / ~검증 / ~필요 / 명사구"로. 한국 실무 보고서의 기본 문체다. copular `-임`은 쓰지 않는다. `움직임`, `흔들림`, `책임`, `모임`처럼 어휘 자체가 `임`으로 끝나는 명사는 예외다.

본문 판정은 증거 수준과 종결을 맞춘다.

| 증거 수준 | 본문 종결 |
| --- | --- |
| 문서·데이터로 확정 | `확인되었다` |
| 계산·분석 산출 | `분석되었다`, `나타났다` |
| 근거가 있는 작성자 판단 | `판단된다` |
| 방향은 있으나 단정 불가 | `볼 수 있다`, `어려울 수 있다` |
| 최대 완곡 | `사료된다` (문서당 0~1회) |

owner-facing 용어: format 문서대로 `판정 범위`, `적용 범위`, `출처 및 추적성`, `고려사항`, `문서 관리` 를 쓴다.

## 4. de-slop — 조건부 금지 (판단 동사는 보존)

헤지어를 무조건 금지하지 않는다. 같은 문장/항목에 아래 grounding 중 하나라도 있으면 정당하다.
(a) 근거·데이터 참조  (b) 명명된 원인  (c) 정량 bound(±, %, k, n=)  (d) 명시적 미확인 라벨.

| 신호어 | 정당 (PASS) | 금지 (FLAG) | 고치는 법 |
| --- | --- | --- | --- |
| 판단됨 / 판단된다 | "원인은 큐 대기로 판단됨(로그상 X초)" | "개선이 필요하다고 판단됨" (근거 없음) | 근거 1줄 추가 |
| ~일 수 있음 | "측정 한계로 ±2% 오차 가능" | "효과가 있을 수 있음" (근거 없음) | 정량화 또는 미확인 라벨 |
| 추가 검토 필요 | "미확인: A 계측 후 확정 필요" | "추가 검토가 필요할 수 있음" (누가/왜 없음) | 무엇을·왜·누가 |
| 획기적/매우/강력한/최적 | (해당 없음) | 항상 | 수치로 대체 |
| 종합적으로/결론적으로 말하자면/앞서 살펴본 바와 같이 | (해당 없음) | 항상 | 삭제하고 결론을 바로 |
| ~에 있어서 / ~를 통하여 / 되어지다 | (정착 표현 일부) | 대개 | 능동·동사화 |

de-slop 목적은 근거 없는 헤지 제거이지 판단 동사 박멸이 아니다. 요구사항·규격·합부기준 영역은 hedge 를
결함으로 보고(근거 있어도 정량화 강제), 분석·판단·한계 영역에만 위 조건부 규칙을 적용한다.

before/after (정보 밀도):

```text
나쁨: 다양한 요인을 종합적으로 고려한 결과 일부 개선 여지가 있을 수 있는 것으로 사료됩니다.
좋음: 지연시간이 목표(50 ms)를 23% 초과. 원인은 큐 대기(전체 지연의 68%). 큐 깊이 16→4로 목표 달성.
```

## 5. AI 협업 절차

핵심: 너는 판단 공급자, AI 는 구조·압축·비판 도구다. 작성 패스와 de-slop 패스를 같은 호출에서 섞지 않는다 —
쓴 사람이 자기 글을 못 자른다.

| 단계 | 누가 | 산출 |
| --- | --- | --- |
| 1. 사실 덤프 | 사람 | raw 데이터·관찰·가정 |
| 2. 골격 매핑 (또는 인터뷰) | AI + 사람 | So-What 슬롯 배치, 빈칸·모순 목록 |
| 3. 슬롯 채우기 | AI | register 규칙으로 짧은 초안 |
| 4. de-slop 패스 (별도 호출) | AI | 근거 없는 헤지/과장만 제거 |
| 5. 논리 비판 패스 (옵션) | AI | 근거 없는 주장·반례 목록 |
| 6. 사람 폴리시 | 사람 | 톤 확정, 최종본 |

소형·급한 보고는 2→4→6 빠른 길로 줄인다. 빈칸이 많으면 `report_writer` 스킬의 인터뷰 모드가 2단계를
한 번에 한 질문씩 채운다.

복붙용 de-slop 프롬프트 (조건부):

```text
이 보고서를 작성하지 말고 검사만 해줘. 아래 신호어 중 같은 문장에 근거/명명원인/정량값/미확인 라벨이
하나도 없는 경우만 골라 "위치 - 문제 - 고친 문장" 표로. 근거 있는 판단 동사는 건드리지 마.
신호어: 사료됩니다 / 추가 검토가 필요할 수 있음 / 획기적 / 매우 / 종합적으로 / ~에 있어서 / 되어지다.
```

## 6. 보고서 타입별 골격

실험/분석/과제수행 보고서는 format 문서의 owner-facing spine(시험 목적 / 시험 조건 / 요청·검토 항목 /
검토 결과 / 고려사항 / 후속 조치)과 owner 용어(판정 범위·적용 범위·출처 및 추적성·고려사항·문서 관리)를
상위 계약으로 따른다. 9개 generic 섹션이 아니라 이 spine 이 상위다.

| 타입 | 핵심 골격 (두괄식) | 약한 곳에서 자주 빠지는 것 |
| --- | --- | --- |
| 실험/시험 | 핵심결론 → 시험목적 → 시험조건(대상/환경/장비+교정유효일/시험일자) → 검토결과(측정값±불확도) → **종합 합부 판정 + 규격 ID** → 고려사항 → 후속 | 종합 판정 1문장, 교정상태, 불확도(k=2,95%) |
| 분석 | 핵심결론 → 문제/결정질문 → 범위/방법/가정 → **기준·가중치(대안보다 먼저)** → 비교(trade) → 해석 → **권고 → 의사결정** | 권고→의사결정 귀결, 미채택 영향 |
| 의사결정·trade-study | 결정 요청 → 평가 기준·가중치 → 대안×기준 점수 → 명시 산식·가중총점 → 권고 → 잔여 위험 | 기준 ID, 가중치 합, 점수 누락, 권고 근거 |
| 평가·점검 | 현황 → 문제점·판정 → 개선방향·조치를 절마다 반복 | 문제만 있고 조치 없음, 담당·기한 없음 |
| 과제수행 | 요약 → 개요 → **계획 vs 실제 마일스톤(일정 baseline)** → 산출물 → 이슈/리스크 → **의사결정/지원 요청** → 자원정산 | 일정 baseline, escalation/의사결정 요청 |
| 발표자료 | 표지 → **BLUF 결론 + Ask(1장)** → 배경(SCQA) → 근거 3장 이하(완전문장 headline) → 권고/다음 → 백업 | 결론 헤드라인, 명시적 Ask |

채워진 예시는 `report_writer` 스킬의 [`examples`](../../../.registry/skills/report_writer/codex/references/examples.md) 에 있다.

## 7. 실제 샘플로 재튜닝

조직의 좋은 보고서를 확보하면 register 를 추출해 규칙을 그 문체로 맞춘다. 개인정보·회사 원문·secret 은
format 문서 저장 규칙대로 분리하고, public 예시 폴더에는 합성만 둔다. 추출 절차: 문장 길이·종결 패턴,
결론 위치, 숫자 붙이는 법, 조직 관용구·금지 표현을 뽑아 2~3장에 반영한다.

## 8. 산출 형식

- 정본은 MD, 사람 검토본은 HTML companion. format 문서의 쌍 규칙을 따른다.
- 현재 지원: Markdown + HTML. engineering dual mode는 같은 Case Model에서 report Markdown + PPT storyline Markdown을 함께 만든다. 후속 후보: binary docx, pptx, hwpx (HWP 는 [`HWP_NORMALIZATION_V0.md`](HWP_NORMALIZATION_V0.md) 의 HWPX 정규화 순서를 따른다).

## 8a. Engineering Case Model 동시 투영

보고서와 PPT 스토리라인을 함께 만들 때는 intake·빈칸 인터뷰 후 텍스트 de-slop을
별도 패스로 수행하고 `soulforge.engineering_case_model.v0` revision을 고정한다.
report-only 또는 PPT-only 사실 문장을 따로 만들지 않는다.

Case Model에는 판정·근거 ID·수치·단위·비교기준·범위·공차·표본·불확도·미확정
상태·조치 담당/기한·용어·PPT 판단 ID·제목 binding term·명시 익명화 mapping을 둔다. renderer는 model
revision과 SHA-256을 양쪽 projection에 기록하고 다음 세 검사를 모두 통과시킨다.

1. Case Model → report projection
2. Case Model → PPT storyline projection
3. report projection → PPT storyline projection

각 PPT 장은 판단 ID 하나만 갖고, 제목의 `title_binding_terms`가 제목과 연결된
판정/판단 양쪽에 실제로 있어야 한다. consistency `pass`는 결정론적 기계 정합성
통과만 뜻하며, 제목이 진짜 결론 문장인지와 보조 내용이 판단 하나에 종속되는지는
별도 fresh semantic verifier가 확인한다. 숫자 서명은 `점`, `식`, `건`, `회`, `원`,
시간 단위 등 선언된 한글 단위도 값과 함께 묶어 검사한다.

익명화 대상과 대체어는 추측하지 않는다. owner가 제공한 발주처·인명·회사명 mapping만
caption과 Markdown alt text까지 적용한다. 검증 보고서에는 원 label을 다시 쓰지 않는다.

의사결정/trade-study는 기준·가중치·대안별 점수·산식을 Case Model에 명시한다. 계산된
최고점만으로 권고를 추론하지 않고, owner/source가 명시한 권고와 잔여 위험만 투영한다.
구체 schema·명령·합성 예시는 `.registry/skills/report_writer/codex/references/engineering_case_model.md`가
제공한다.

## 9. 완료와 검증 경계

- 사실·수치·판정의 정확성은 owner 와 source 가 검증한다. 이 가이드와 AI 패스는 문체와 논리 표현만 다듬는다.
- 종료 검증은 `AGENT_EXECUTION_CONTRACT_V0.md` 의 post-development review gate 와 `.workflow/post_development_review_gate_v0/` 를 따른다.
- claim ceiling 은 실제 검증 수준 이상으로 올리지 않는다.

## 관련 문서

- [`SOULFORGE_REPORT_FORMAT_V0.md`](SOULFORGE_REPORT_FORMAT_V0.md) — 보고서 구조와 MD/HTML 쌍 정본
- `.registry/skills/report_writer/` — 대화형 빈칸 채우기 + 골격/register/예시 (설치명 `soulforge-report-writer`)
- [`MAIL_SEND_STYLE_POLICY_V0.md`](MAIL_SEND_STYLE_POLICY_V0.md) — 사람이 보내는 업무 메일 문체
- [`HWP_NORMALIZATION_V0.md`](HWP_NORMALIZATION_V0.md) — HWP → HWPX 정규화 순서
- `../foundation/AGENT_EXECUTION_CONTRACT_V0.md` — 종료 검증과 claim ceiling
- register 근거 출처(공개): NTSB(ntsb.gov), NIST(nvlpubs.nist.gov), NASA(ntrs.nasa.gov), NREL/Sandia(osti.gov), KRISS(kriss.re.kr), KISTEP(kistep.re.kr), 환경부(me.go.kr)

## 상태

- v0.3 owner-approved B+C+D register와 copular `-임` 금지를 반영했다. 실제 보고서 근거 + 소나테크형 실무 샘플 register로 보정했으며 owner 샘플이 더 들어오면 3장을 재튜닝한다.
- `report_writer` 스킬(active)이 이 doctrine을 소비한다. Engineering dual mode의 검증 범위는 public-safe 합성 입력 기반 Markdown report + PPT storyline이며 binary DOCX/PPTX와 실업무 원문 검증은 포함하지 않는다.
