# Report Writer Skill

측정 자료만 나열하고 결론이 없는 보고를 막는 self-contained doctrine skill.

모든 보고/발표가 "왜 했나 → 뭘 했나 → 뭘 얻었나 → 그래서 뭔가 → 다음은"(So-What 5문)에 먼저
답하게 하고, 실무 register(개조식 종결, 근거 있는 단정, 수치 + 불확도, 종합 판정 1문장,
권고 -> 의사결정)로 정리하도록 돕는다.

## 구성

- `skill.yaml` — canon entry (behavior, use_when/avoid_when, boundary).
- `codex/SKILL.md` — lean bridge: operating steps, boundary, references 포인터.
- `codex/references/scaffold_and_register.md` — So-What 골격, 자가 체크리스트, register 규칙(실제 보고서 근거), 조건부 de-slop.
- `codex/references/examples.md` — 타입별 채워진 합성 예시 + 데이터덤프 Before/After.

## 경계

- 문체와 구조만 강제한다. 사실, 수치, 시험결과, 합부 판정 authority 는 owner 와 source 에 있다.
- 측정 불확도·규격 ID 같은 추적성 값은 source 가 없으면 채우지 않는다.
- 공개 예시는 합성이며 실제 전문 보고서(NTSB/NIST/NASA/KRISS 등)의 구조를 모사한다. 비공개 업무 원문, secret, 호스트 경로는 넣지 않는다.
- 보고서 구조 정본은 `docs/architecture/workspace/SOULFORGE_REPORT_FORMAT_V0.md`.

## 설치 이름

sync 후 Codex-facing 이름:

```text
soulforge-report-writer
```

## 상태

- `candidate` (first build). skill first-build verification gate 의 fresh-context 평가 통과 전에는 production-ready 로 보고하지 않는다.
