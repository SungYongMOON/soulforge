# Report Writer Skill

`report_authoring_v0`를 호출하는 얇은 Codex launcher다. 보고서 작성 절차,
편집 규칙, 적응형 타입 구조, 요약 파생, 의미 보존, 렌더링은 모두
`.workflow/report_authoring_v0/`가 소유한다.

## 책임

- `/report-writer`를 정확한 workflow id `report_authoring_v0`로 해석
- `full_authoring`의 실행 전 material-gap 질문을 한 번에 하나씩 진행
- `final_polish`는 draft 하나만으로 시작하며 optional source/manifest 부재로 차단하지 않음
- 고정 runner의 `prepare -> validate -> finalize`를 호출하고, fresh executor와
  별도 fresh semantic verifier의 결과를 연결
- 최종 reader deliverable과 audit artifact ref를 분리해 보고

Node runner는 모델을 호출하거나 보고서를 작성하지 않는다. Codex controller 또는
향후 승인된 worker adapter가 stage output을 만들고, runner는 고정 계약 검증·조율·
렌더·receipt 채택만 수행한다.

## 사용 예

초안이 있으면 한 파일만 지정해 호출한다.

```text
$soulforge-report-writer 이 초안을 final_polish로 정리해줘. 유형은 시험 보고서,
독자는 경영 검토자야. 사실과 판정은 바꾸지 말고 최종 Markdown도 만들어줘.
```

초안이 없고 자료에서 작성해야 하면 `full_authoring`을 명시한다. 이 경우에도
결론을 바꿀 수 있는 공백만 한 번에 하나씩 확인한다. dev-ERP 사용자는 같은 두
모드를 화면에서 선택하지만 스킬이 아니라 동일 workflow job을 제출한다.

## 경계

- 사실·수치·인용·인과·역할·판정 authority는 owner/source에 남는다.
- 본문·입력·생성 artifact는 `_workspaces` 또는 owner-approved worksite에 둔다.
  `_workmeta`에는 pointer/hash/size/status 등 receipt metadata만 둔다.
- default route, owner 승인, publish/send, project-share writeback authority는 없다.
- ERP는 skill이 아니라 workflow/runner를 직접 호출한다.
- `codex/references/examples.md`는 synthetic illustration이며 실행 doctrine이 아니다.
- 로컬 authority 발급은 정확한 hash/result binding과 호출자가 선언한 서로 다른 ref만
  검사하며 실제 actor/process 독립성을 증명하지 않는다. 로컬 claim은
  `local_context_separation_declared`다.
- v0는 보호 anchor와 수치·단위·인용 표면을 그대로 보존하고, 날짜 근거가 없으면
  `report_date: null`로 둔다. 출력은 `private_work_product`이며 초안 단독 정리는
  `observed` 및 `partial|unconfirmed` 범위를 넘지 않는다.

## 설치 이름

sync 후 Codex-facing 이름:

```text
soulforge-report-writer
```

## 상태

- `candidate` launcher. 고정 runtime lane의 callable acceptance와 promotion gate는
  열려 있으며 production-ready가 아니다. default route는 꺼져 있다.
- 2026-07-14 실제 한국어 `final_polish` pilot은 독립 의미 검증, authority 발급,
  finalize, metadata-only receipt, exact replay까지 통과했다. 이 결과는 launcher와
  candidate runtime의 실행 가능성 근거이며 배포 보정, owner 승인, 외부 발행 권한은 아니다.
