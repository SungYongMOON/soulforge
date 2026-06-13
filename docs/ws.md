# Workspace System Check Prompt

Use this file when another PC cannot copy and paste a long prompt.

Short command to type in Codex:

```text
docs/ws.md 실행
```

Prompt:

```text
현재 열린 Soulforge 저장소 루트 기준으로 workspace system 공유/정션 상태만 점검해줘.

규칙:
- 보고/기록은 repo-relative path만 사용
- 로컬 절대경로, 드라이브명, 사용자명 기록 금지
- secret, .env, token, cookie, session, 업무 원문 내용 열람 금지
- 삭제, 이동, 수정, 업로드, 권한 변경, repair 실행 금지
- 필요하면 dry-run repair plan만 제시하고 실행 전 owner 승인을 받을 것

확인:
1. public, _workmeta, private-state git status
2. _workmeta/system/bindings/workspace_junctions.yaml 존재 여부
3. _workspaces/system 또는 Systems가 실제 폴더인지, 정션인지, 공유 경로인지
4. 파일 내용은 보지 말고 repo-relative path, count, mtime 수준만 비교
5. PC마다 파일이 다른 원인 추정과 안전한 해결 순서 요약
```
