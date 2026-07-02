# ENGINE-6-KNOWLEDGE-PIPELINE-AUTOMATION — 승인 후 지식 뒷단 자동화 + 주간 트리아지

- status: proposed / parallel_group: G-guildhall-rag (**guild_hall 은 Codex 소유 표면** — dev-erp 밖)
- depends_on: 없음 / 규모 추정: 글루 스크립트 2개 + 리포트 1개 (1~2일, Codex 권장)

## 목적 (1줄)

지식 축적에서 사람 판단을 "승인 1클릭"으로 압축한다: 승인된 후보의
추출→인덱스→원장 상태 갱신은 배치가 하고, 미처리 후보는 주간 트리아지 리포트가 떠먹여준다.

## 검증된 사실 (2026-07-02 실측)

1. 후보 원장 적체 실측: P26-014 knowledge_rag_candidate_ledger 2026-06.jsonl 이벤트 7건 중
   status=open 6건(6/17~6/28 누적), accepted_for_review 1건 — **처리 루틴 부재의 물증**.
2. 지식 파이프라인 워크플로 정본이 이미 존재: `.workflow/knowledge_candidate_triage_v0/`,
   `knowledge_ingest_pipeline_v0/`, `sourcebound_knowledge_packet_operating_loop_v0/`,
   `rag_metadata_refresh_v0/`, `wiki_curation_maintenance_v0/` (디렉토리 실측).
   **새 절차를 발명하지 말고 이 워크플로들의 실행 글루만 만든다.**
3. guild_hall/rag CLI 에 source-text-index --write, validate-source-text-index,
   source-text-answer-run 등 명령 존재(guild_hall/rag/README.md 62~87행 조사).
4. 승격 판단 권한 경계(불변): LLM/자동화는 지식을 승인·승격할 수 없다
   (AGENT_EXECUTION_CONTRACT claim ceiling). 자동화 대상은 **승인 이후의 결정적 작업만**.
5. 소스카드에 approval_status 와 rag_permissions(index_build 등) 필드 실존 — "승인됨" 판정의
   기계 판독 키가 이미 있다.

## 구현 전 확인 (Codex)

- [ ] 후보 이벤트의 상태 전이 규칙: status open→accepted_for_review→(승인)→? 의 정본이
      어느 문서/워크플로에 있는지 (knowledge_candidate_triage_v0 의 workflow.yaml).
      상태 갱신을 JSONL append(새 이벤트)로 하는지 행 수정인지 — **기존 규칙 준수**.
- [ ] 인덱스 빌드 명령의 정확한 인자와 선행 조건(derived_text 준비, HWP→HWPX 전처리 등):
      guild_hall/rag README + 기존 P26-014 인덱스 3개가 어떻게 만들어졌는지 러닝 로그/receipt.
- [ ] 위키 projection 의 현재 진입점(knowledge_wiki_pipeline_v0)과 입력 요건.

## 설계 (제안 — Codex 가 소유 표면 규칙에 맞게 조정)

### A. 승인 후 자동 빌드 글루: guild_hall/rag 쪽 스크립트

```
knowledge_approved_build_runner (이름은 guild_hall 관례에 맞출 것):
1. 소스카드 스캔: approval_status 승인 계열 + rag_permissions.index_build=true
   + 대응 인덱스 부재(또는 소스 hash 변경) 인 카드 목록
2. 카드별: 추출물 준비 확인 → source-text-index --write → validate-source-text-index
3. 성공 시 후보 원장에 상태 이벤트 append (기존 전이 규칙대로), receipt 기록
4. 실패는 카드 단위 격리(한 건 실패가 배치를 안 막음), dry-run 기본
멱등키: index_id (이미 존재+hash 동일 → skip)
```

### B. 주간 지식 트리아지 리포트

```
knowledge_triage_report:
1. 전 프로젝트 knowledge_rag_candidate_ledger 의 open 후보 수집
2. 점수화(결정적): 과제 활성도(최근 30일 메일 수) + 후보 나이 + candidate_kind 가중
   (completion_knowledge > knowledge_trigger > owner_decision_gap 순 제안 — owner 조정 가능)
3. 상위 10건을 "승인/보류/기각 한 줄 결정" 형식의 마크다운으로
   _workmeta/system/reports/knowledge_triage/<date>.md 에 생성
4. owner 결정 기입 → A 러너가 다음 배치에서 소비
스케줄: 주 1회 (Codex 로컬 automation / 작업 스케줄러 — 운영은 Codex 몫)
```

### C. dev-erp 접점 (선택, 별도 슬라이스)

- ERP 지식 화면에 open 후보 수 배지 + 트리아지 리포트 링크(포인터만) — 이 패킷 범위 밖.

## 경계 가드

- 자동화는 승인 "이후"만. approval_status 를 기계가 바꾸지 않는다.
- 원문/청크를 리포트에 복사하지 않는다(제목·kind·ref·점수만).
- 이 패킷의 산출물 위치는 guild_hall/_workmeta — **dev-erp 코드 변경 없음**.

## 검사 방법

1. 합성 fixture: 승인 카드 1(인덱스 없음) + 미승인 카드 1 + 기존 인덱스 카드 1
   → dry-run 계획이 "빌드 1건"만 표시; --write 후 validate-source-text-index green; 재실행 skip.
2. 트리아지: open 후보 12건 fixture → 리포트 상위 10건 + 점수 근거 표기, 원문 부재 검사
   (금칙 필드 grep).
3. `npm run validate:rag` (기존 rag 검증 표면) + `npm run validate` green.
4. 실데이터 1회전: P26-014 open 6건이 리포트에 뜨고, owner 가 1건 승인 표기 시
   다음 배치에서 상태 이벤트가 원장에 append 되는지 (owner 참여 필요 — 파일럿 확인).

## 완료 기준

- "승인 표기 → 사람 손 0 으로 인덱스 ready + 원장 상태 갱신" 이 fixture 로 재현.
- 주간 리포트가 open 적체(현재 6건)를 표면화한다.
- 자동화가 승인 권한을 넘보지 않음이 dry-run/코드 리뷰로 확인된다.
