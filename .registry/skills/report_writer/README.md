# Report Writer Skill

측정 자료만 나열하고 결론이 없는 보고를 막는 `report_authoring_v0` thin launcher skill.

모든 보고/발표가 "왜 했나 → 뭘 했나 → 뭘 얻었나 → 그래서 뭔가 → 다음은"(So-What 5문)에 먼저
답하게 하고, 실무 register(개조식 종결, 근거 있는 단정, 수치 + 불확도, 종합 판정 1문장,
권고 -> 의사결정)로 정리하도록 돕는다. engineering dual mode에서는 하나의
Engineering Case Model을 보고서 Markdown과 PPT 스토리라인 Markdown으로 함께 투영하고,
수치·판정·용어·익명화 일관성을 결정적으로 검사한다.

## 구성

- `skill.yaml` — canon entry (behavior, use_when/avoid_when, boundary).
- `codex/SKILL.md` — lean bridge: operating steps, boundary, references 포인터.
- `codex/references/scaffold_and_register.md` — So-What 골격, 자가 체크리스트, register 규칙(실제 보고서 근거), 조건부 de-slop.
- `codex/references/examples.md` — 타입별 채워진 합성 예시 + 데이터덤프 Before/After.
- `codex/references/engineering_case_model.md` — Case Model, PPT 스토리라인, trade-study, 익명화, numeric signature 계약.
- `codex/scripts/render_engineering_case.mjs` — report/PPT projection + redacted consistency report renderer.

## 경계

- 문체와 구조만 강제한다. 사실, 수치, 시험결과, 합부 판정 authority 는 owner 와 source 에 있다.
- 측정 불확도·규격 ID 같은 추적성 값은 source 가 없으면 채우지 않는다.
- 공개 예시는 합성이며 실제 전문 보고서(NTSB/NIST/NASA/KRISS 등)의 구조를 모사한다. 비공개 업무 원문, secret, 호스트 경로는 넣지 않는다.
- 보고서 구조 정본은 `docs/architecture/workspace/SOULFORGE_REPORT_FORMAT_V0.md`.
- 문체 doctrine 정본은 `docs/architecture/workspace/SOULFORGE_REPORT_WRITING_GUIDE_V0.md`; skill reference는 실행 quick-card일 뿐 두 번째 doctrine owner가 아니다.
- dual mode는 Markdown 내용 투영만 제공한다. binary DOCX/PPTX 생성과 레이아웃 검증은 범위 밖이다.

## 설치 이름

sync 후 Codex-facing 이름:

```text
soulforge-report-writer
```

## 상태

- `active`. public-safe 합성 실험형·trade-study 두 건의 fresh B→separate V 최종 사이클과 Level 3 acceptance를 통과한 bounded Markdown dual mode다.
- default route는 꺼져 있고 binary DOCX/PPTX 생성·실업무 원문 검증·모델 비용 calibration은 포함하지 않는다.
