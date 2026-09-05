# docs/reviews/exchange — 문서 왕복 규약

이 폴더는 **정본이 아니다.** Soulforge와 외부 조언자(예: GPT) 사이에 오가는 문서 왕복의
경로만 고정한다. 판정과 정본 반영은 [`docs/reviews/README.md`](../README.md)와
`docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`가 정한 owner 문서에서만 일어난다.

## 왕복 방향

- **우리 → 외부**: 이 폴더에 `YYYY-MM-DD_soulforge_to_<who>_NN.md`로 커밋하면(그리고
  push되면), 외부는 GitHub 커넥터로 그 blob URL을 직접 읽는다. 색인되지 않으므로
  URL을 직접 준다.
- **외부 → 우리**: 외부는 Owner 드라이브의 제안함 폴더에 문서로 저장하고, Soulforge
  세션이 그 드라이브를 직접 읽는다. 사람이 본문을 대화창에 붙여넣지 않는다.

## 문서 머리 규칙

모든 문서는 머리에 다음을 적는다: 기준 커밋, 판본(1차/2차 등 구분이 있으면 그것도),
참조 키(`EXT-nn`, `CE-nn`). 참조 키의 정본 표는
[`../EXTERNAL_REVIEW_MAP_2026-09-05.md`](../EXTERNAL_REVIEW_MAP_2026-09-05.md)가 든다.

## 규칙

- 이 폴더는 비정본 기록이다. 정본 반영은 owner 문서에서만 일어나며, 이 폴더에 적힌
  판정은 참고일 뿐이다.
- 새 폴더 트리나 제2 정본을 만들지 않는다.
- 실제 이름·호스트 경로·비밀은 넣지 않는다. 자리표시자만 쓴다.
- 이 폴더에 파일을 추가하면 `npm run validate:path-policy`를 통과해야 한다.
- 2026-09-05 회신 01·02는 발신 당시 원문을 그대로 보존한다(머리 규칙과 표시명 규칙은 그 이후 왕복부터 적용).
