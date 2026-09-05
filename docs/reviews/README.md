# docs/reviews — 비정본 검토 기록

이 폴더는 **정본이 아니다.** 외부 검토(다른 모델, 외부 사람)의 결과를 우리 정본에
대응시킨 기록과, 밖에 내보내는 리뷰어 패킷의 산출물만 둔다. 여기 적힌 판정은
참고이며, 정본 변경은 항상 owner 문서(`docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`)
쪽에서 일어난다.

## 문서 색인

| 파일 | 역할 |
| --- | --- |
| `EXTERNAL_REVIEW_MAP_<date>.md` | 외부 검토 한 건을 정본에 대응시킨 표. 무엇이 맞고, 무엇을 못 봤고, 점검표 항목이 우리 산출물 어디에 있는지 |
| `reviewer_packet_<date>.md` (+ `.manifest.json`) | `npm run export:reviewer-packet`이 만든 공개 안전 패킷. 생성물이라 추적하지 않는다(`.gitignore`). 외부에 줄 때는 이 파일 하나만 준다 |

## 규칙

- 외부 모델에는 저장소 연결 대신 리뷰어 패킷을 준다. 패킷은 로컬 절대경로 정책 검사를
  통과해야만 써진다(`guild_hall/validate/export_reviewer_packet.mjs`).
- 비공개 중첩 저장소(`_workmeta`, `private-state`)와 `_workspaces`는 패킷에 들어갈 수 없다.
- 외부 산출물(기획 초안, 그림, 매뉴얼 골격)은 입력이다. 워크사이트에 참고로 두고,
  Owner 결정 없이는 어떤 정본에도 올리지 않는다. 같은 내용을 담는 별도 클라우드
  폴더를 만들지 않는다.
