# Soulforge Artifact Template System V0

## 목적

Soulforge의 문서 산출물은 다음 세 계층을 분리한다.

```text
authoring workflow -> artifact rendering workflow -> format-native template
```

- authoring workflow는 사실, 수치, 판정, 문장과 발표 storyline을 확정한다.
- artifact rendering workflow는 승인된 내용을 다시 쓰지 않고 배치·렌더·검사한다.
- Codex skill은 workflow를 호출하는 얇은 버튼이다.
- ERP는 허용된 `workflow_id`와 job 상태만 다루는 화면이다.

“항상 같은 템플릿”은 포맷 간 픽셀 동일성을 뜻하지 않는다. 동일한
`template_family_id`, revision, 색상·글꼴·간격·표·차트 문법, 콘텐츠 골격을
포맷별 네이티브 템플릿이 공유한다는 뜻이다.

## 템플릿 식별 계약

실행기는 workflow-owned request schema의 아래 중첩 필드가 모두 없으면 렌더를
시작하지 않는다. 이 문서의 이름은 논리적 별칭이며 별도 평면 스키마가 아니다.

```yaml
template_binding:
  family: team_default_v0
  revision: "0.1.0"
  sha256: <64-hex>
  template_ref: <workspace-relative path>
```

- 같은 revision의 파일을 무음 교체하지 않는다.
- 파일 내용이 바뀌면 revision과 SHA-256을 함께 갱신한다.
- 실행 전 snapshot의 실제 SHA-256을 패킷 값과 비교한다.
- 산출물 영수증에는 workflow ID/revision과 template family/revision/hash를 함께 남긴다.

## 소유권과 저장 경계

| 대상 | 소유 surface |
| --- | --- |
| 실제 템플릿 파일 | `_workspaces/SE_TEMPLATE_LIBRARY/<family>/...` |
| 프로젝트 실행용 고정본 | 프로젝트의 `00_Temp/template_snapshot/` 또는 owner-approved equivalent |
| 실제 PPTX/DOCX/XLSX/HTML/PDF | `_workspaces/<project_code>/...` |
| 포인터·해시·검사 결과 | `_workmeta/<project_code>/...` metadata-only receipt |
| 공개 예시 | `docs/architecture/workspace/examples/`의 합성 fixture만 |

실제 보고서 본문, Office 파일, 외부 다운로드 원본을 `_workmeta`나 public Git에
복사하지 않는다.

## 입력과 출력

렌더 workflow의 정확한 필드명은 형식군별 owner가 소유한다.

- DOCX/XLSX/HTML:
  `.workflow/document_artifact_publisher_v0/templates/document_publish_request.template.yaml`
- PPTX(현재 생성 중단):
  `.workflow/presentation_artifact_render_v0/templates/presentation_render_request.template.yaml`

DOCX/XLSX/HTML publisher의 최소 의미 입력은 다음과 같다.

- `approved_for_render` 또는 명시적으로 선언된 `synthetic_fixture` strict content packet
- packet schema ref/SHA-256와 design-token ref/version/SHA-256
- workflow revision과 immutable Git commit 또는 package ref
- 프로젝트·항목 ID, 요청 형식(`docx | xlsx | html`), 출력 위치와 idempotency key
- 실제 artifact는 `_workspaces`, metadata-only receipt는 `_workmeta`에 둔다는 경계

PPTX renderer를 명시적으로 재개할 때만 아래 입력을 사용한다.

- 승인된 `presentation_packet` 또는 workflow kind `storyline`
- exact ref/revision/SHA-256를 허용하는 승인 객체
- `owner_approved | synthetic_fixture` provenance와 승인 또는 합성 fixture 선언 ref
- workflow revision과 immutable Git commit 또는 package ref
- 프로젝트·항목 ID
- template family/revision/hash/snapshot ref
- 출력 위치와 idempotency key

최소 출력은 다음과 같다.

- 편집 가능한 산출물 ref와 SHA-256
- template identity가 포함된 manifest/receipt
- executor self-check와 fresh-context independent verification ref
- 모든 슬라이드 visual QA evidence ref
- `complete | review_required | failed`
- 오류 코드와 명시적 재시도 가능 여부·조건

renderer/publisher는 내용을 요약하거나 새 결론을 만들지 않는다. authoring과
final polish는 upstream authoring workflow가 먼저 확정해야 한다.

## `team_default_v0` 파일럿

revision `0.1.0`의 PowerPoint 파일럿은 기존 이력으로 보존하되, 현재 owner 요청에
따라 PPT/PPTX 생성·확장·template packaging은 중단한다. 아래 항목은 재개 판단을
위한 과거 구현 범위이며 현재 문서 publisher의 실행 경로가 아니다.

- 16:9 editable PPTX
- 표지, BLUF+요청, 섹션, 지표, 차트+해석, 표+결론, 비교, 결정 요청,
  다음 행동, 근거 부록의 10개 exemplar slide
- 원본 색상·도형만 사용하며 외부 이미지·아이콘·템플릿·폰트를 번들하지 않음
- `Malgun Gothic`을 참조하되 폰트 파일은 번들하지 않음

현재 artifact-tool의 master/layout PPTX export에서 `invalid int32` 오류를
재현했으므로, revision `0.1.0`은 네이티브 Slide Master/POTX라고 주장하지 않는다.
대신 편집 가능한 exemplar slide와 renderer의 layout contract로 동일 형식을
강제한다. 네이티브 master 또는 `.potx`로 전환할 때는 새 revision, 새 hash,
전체 재렌더 검증이 필요하다.

DOCX, XLSX, HTML은 `.workflow/document_artifact_publisher_v0/`의 별도 native
adapter lane으로 분리한다. 세 형식은 같은 strict packet과
`soulforge_team_document_v0` design tokens를 소비하지만, 각각 Documents,
Spreadsheets + loader-provided `@oai/artifact-tool`, escaped self-contained HTML
renderer의 고유 구조와 검증기를 사용한다. DOCX/XLSX/HTML/PDF payload와 render
QA 이미지는 `_workspaces`에만 두며 public canon에는 portable schema, tokens,
합성 fixture와 validator만 둔다.

현재 evidence ceiling은 다음과 같다.

- DOCX와 HTML: 한 합성 packet에 대한 adapter receipt 통과
- XLSX: semantic/formula/round-trip/all-sheet visual 검사는 통과했지만 OOXML
  `pageSetup`과 `Print_Area` 누락으로 `blocked_print_configuration`
- end-to-end `document_artifact_publisher_v0`: 미실행
- default route, team-default, production-ready: 모두 `false`

## 보고서 workflow 연결 조건

`report_authoring_v0`의 P0 hardening과 artifact publication은 owner를 분리한다.
실제 보고서 경로에 연결하려면 authoring workflow가 다음을 먼저 제공해야 한다.

- 명시적 `final_report` 또는 승인된 strict content packet
- 입력 대비 사실 보존 영수증
- 저장 경계가 `_workspaces` payload / `_workmeta` metadata-only로 정렬된 상태

그 전에는 합성 fixture 또는 독립적으로 owner-approved 된 strict packet만 받는다.
publisher는 보고서 문장, 사실, 판정, voice profile을 생성하거나 수정하지 않는다.

## 외부 자료 수집 정책

외부 자료는 기본적으로 파일을 내려받아 번들하지 않고, 적용 패턴과 원문 링크만
카탈로그화한다. 파일 수집 후보는 다음을 모두 만족해야 한다.

- 명시적 재배포 라이선스
- attribution 요구사항
- 폰트·이미지·아이콘의 별도 라이선스
- 매크로와 외부 런타임 의존성
- SHA-256과 원문 URL

조건이 불명확하면 link-only로 유지한다. YouTube 영상·자막, 회원 자료, 유료
Canva/Figma 요소, 출처 불명 Office 템플릿, unsigned VBA를 팀 기본 팩에 넣지 않는다.

## 조사에서 채택한 패턴

- 사용자 지정 영상은 Excel 데이터를 웹 대시보드에 배포하는 사례다. 파일 자체보다
  데이터와 표현 분리, 디자인 시스템 선고정, 생성과 배포 분리 패턴을 채택했다:
  <https://www.youtube.com/watch?v=vPR4eVtTqvo>
- 오빠두엑셀의 PPT 강의에서 회사 템플릿·팔레트·layout 재사용 패턴을 대조했다:
  <https://www.oppadu.com/lesson/claude-slide-ppt/>
- PowerPoint의 정식 일관성 surface는 theme, template, Slide Master다:
  <https://support.microsoft.com/en-us/powerpoint/create-and-save-a-powerpoint-template>
  <https://support.microsoft.com/en-us/powerpoint/create-your-own-theme-in-powerpoint>

이 링크는 설계 근거이며 외부 파일의 복제·재배포 권한을 뜻하지 않는다.

## 승격 조건

PPT/PPTX lane은 현재 중단 상태이며 명시적 owner 재개 전에는 더 이상 생성하거나
승격하지 않는다. 기존 `presentation_artifact_render_v0` evidence는 과거 이력으로
보존한다.

`document_artifact_publisher_v0`과 DOCX/XLSX/HTML team default는 아래를 모두
통과하기 전 production/default route로 승격하지 않는다.

1. portable strict packet validator의 positive fixture와 PPT/broken-ref/absolute-path negative fixture 통과
2. DOCX final manifest/receipt와 전 페이지 visual QA 완료
3. XLSX key-range/formula/chart 검사, A4 `pageSetup`, explicit `Print_Area`, 전 sheet visual QA 완료
4. HTML zero-remote-request, desktop/narrow, A4 전 페이지 visual QA 완료
5. extracted workflow의 fresh-context end-to-end executor 1회와 별도 verifier 1회 통과
6. owner sample에서 Microsoft Word/Excel/browser round-trip 확인
7. 기술 Word, 계산 Excel, HTML 공유를 포함한 실제 보고서 3건 비교
8. owner의 로고·폰트·색상·인쇄성·default-route 명시 승인

현재 1, 2와 HTML adapter-level 합성 검증은 통과했다. XLSX print configuration과
3, 5~8은 남아 있으므로 workflow는 registered non-default candidate이며
`end_to_end_workflow_pilot_executed: false`, `default_route_safe: false`를 유지한다.

아래 항목은 PPT/PPTX를 재개할 경우에만 다시 적용하는 과거 lane 기준이다.

1. 합성 fixture의 모든 숫자·단위·날짜·부호·ID·판정·부정문 보존
2. PPTX 재열기 후 모든 슬라이드 렌더 및 overflow 검사 통과
3. immutable workflow revision의 fresh-context executor 1회와 builder source를 보지 않은 별도 verifier 1회 통과
4. owner 실제 보고서 3건 비교
5. owner의 로고·폰트·색상·인쇄성 승인

현재 PPT/PPTX lane의 과거 1~3은 단일 합성 fixture에 한해 통과했지만, 이는 새
DOCX/XLSX/HTML publisher의 pilot evidence가 아니며 PPT 재개 권한도 부여하지 않는다.
