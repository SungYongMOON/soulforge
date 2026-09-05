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
| `READING_LIST.md` | 패킷 매니페스트의 14개 문서를 GitHub blob URL로 나열한 읽기 순서표. 첨부가 안 보일 때 패킷 대신 준다 |
| `exchange/` | 외부 조언자와의 문서 왕복 규약과 실제 왕복 문서(`YYYY-MM-DD_soulforge_to_<who>_NN.md`) |

## 외부 작업공간 포인터 (제안함, 정본 아님)

| 작업공간 | 내용 | 취급 |
| --- | --- | --- |
| Google Drive `Soulforge_기획·검토 / ChatGPT_제품기획실_20260905` 와 `v0.1_main-b1aa2a9_구조검토·출시계획` | 외부 모델(ChatGPT)의 제품 기획·독립검토 후보 문서 두 벌: 먼저읽기, 전체구조·컨셉, 독립검토·출시계획(발견사항 F01–F14), App PRD, 매뉴얼 후보, 백로그 시트, 개념도, 앱 시안, 점검 스크립트·QA 결과, 회귀 패치 후보 | Owner 계정만 접근. 산출물은 입력이며 이 폴더의 대응표를 거쳐서만 owner 문서에 반영. 점검 스크립트와 회귀 패치는 우리 트리에서 재현·검토 전 실행·적용 금지. 호스트 인벤토리가 든 결과물은 링크 공유 금지 |
| Google Drive `50_PRO_ADVISORY_External_LLM_Execution` (E00–E06) | 외부 상용 LLM 실행계·보안·방산 법령 자문(ChatGPT Pro): Owner 의도, 외부 주력·정책 고정 실행계, Computer Use 자문, 맥락 보존형 Work Compiler, 법령·채택 기술 재검토, 52건 합성 시험계획, 세계관 설명서 | 위와 같음. 연구 계보(별도 Master 연구·Qwen Stage0)는 정본 밖이며 plan 05·plan 09 를 통해서만 들어온다. 취약점·법령 판정 서술은 공개 문서에 요약만, 세부는 비공개 영역. E05 시험계획 전문은 평가 대상 봇에게 주지 않는다 |

## 규칙

- 외부 모델에는 저장소 연결 대신 리뷰어 패킷을 준다. 패킷은 로컬 절대경로 정책 검사를
  통과해야만 써진다(`guild_hall/validate/export_reviewer_packet.mjs`).
- 비공개 중첩 저장소(`_workmeta`, `private-state`)와 `_workspaces`는 패킷에 들어갈 수 없다.
- 외부 산출물(기획 초안, 그림, 매뉴얼 골격)은 입력이다. 워크사이트에 참고로 두고,
  Owner 결정 없이는 어떤 정본에도 올리지 않는다. 같은 내용을 담는 별도 클라우드
  폴더를 만들지 않는다.
