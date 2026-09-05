# Reading list — reviewer packet contents

이 문서는 `reviewer_packet_<date>.manifest.json`이 담는 15개 공개 문서를 읽기
순서대로 GitHub blob URL로 나열한다. 외부 조언자에게 첨부가 보이지 않을 때
패킷 파일 대신 이 목록을 줄 수 있다.

기준 커밋: `57975ac8` (main, 2026-09-05). 이 목록은 병합 뒤 별도 커밋으로
재생성한다(목록이 자기 커밋을 가리킬 수 없으므로 직전 커밋을 가리킨다). 재생성은
기획 세션이 병합 뒤 한다.

생성 규칙: 이 목록은 `guild_hall/validate/export_reviewer_packet.mjs`의
`REVIEWER_PACKET_DOCUMENTS` 순서, 그리고 `npm run export:reviewer-packet`이 만드는
`reviewer_packet_<date>.manifest.json`의 `documents[].relative_path`에서 만든다.
손으로 순서를 바꾸지 않는다.

갱신 시점: 패킷을 다시 만들 때(`npm run export:reviewer-packet`) 기준 커밋과 아래
목록을 같이 갱신한다. 문서 구성 자체가 바뀌면(파일 추가·삭제·경로 변경) 같은
변경에서 이 목록도 갱신한다. 목록에 실린 문서의 내용이 바뀌는 커밋이 병합될
때도 재생성한다.

1. [`README.md`](https://github.com/SungYongMOON/soulforge/blob/57975ac8/README.md)
2. [`docs/architecture/foundation/SOULFORGE_WORLD_BIBLE_V0.md`](https://github.com/SungYongMOON/soulforge/blob/57975ac8/docs/architecture/foundation/SOULFORGE_WORLD_BIBLE_V0.md)
3. [`docs/architecture/foundation/SOULFORGE_OWNER_MASTER_ARCHITECTURE_AND_RELEASE_MAP_V1.md`](https://github.com/SungYongMOON/soulforge/blob/57975ac8/docs/architecture/foundation/SOULFORGE_OWNER_MASTER_ARCHITECTURE_AND_RELEASE_MAP_V1.md)
4. [`docs/architecture/foundation/SHARED_GLOSSARY_V0.md`](https://github.com/SungYongMOON/soulforge/blob/57975ac8/docs/architecture/foundation/SHARED_GLOSSARY_V0.md)
5. [`docs/architecture/foundation/DOCUMENT_OWNERSHIP.md`](https://github.com/SungYongMOON/soulforge/blob/57975ac8/docs/architecture/foundation/DOCUMENT_OWNERSHIP.md)
6. [`docs/architecture/foundation/TARGET_TREE.md`](https://github.com/SungYongMOON/soulforge/blob/57975ac8/docs/architecture/foundation/TARGET_TREE.md)
7. [`docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md`](https://github.com/SungYongMOON/soulforge/blob/57975ac8/docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md)
8. [`AGENTS.md`](https://github.com/SungYongMOON/soulforge/blob/57975ac8/AGENTS.md)
9. [`docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`](https://github.com/SungYongMOON/soulforge/blob/57975ac8/docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md)
10. [`docs/architecture/foundation/team_member_engineering_program/00_MASTER_INDEX_AND_DECISIONS.md`](https://github.com/SungYongMOON/soulforge/blob/57975ac8/docs/architecture/foundation/team_member_engineering_program/00_MASTER_INDEX_AND_DECISIONS.md)
11. [`docs/architecture/foundation/team_member_engineering_program/10_EXTERNAL_CONNECTORS_AND_BACKUP.md`](https://github.com/SungYongMOON/soulforge/blob/57975ac8/docs/architecture/foundation/team_member_engineering_program/10_EXTERNAL_CONNECTORS_AND_BACKUP.md)
12. [`docs/architecture/foundation/team_member_engineering_program/17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md`](https://github.com/SungYongMOON/soulforge/blob/57975ac8/docs/architecture/foundation/team_member_engineering_program/17_PHYSICAL_ARCHITECTURE_PATH_REGISTRY_AND_STORAGE_MAP.md)
13. [`docs/architecture/foundation/team_member_engineering_program/18_TEAM_PILOT_ACCESS_AND_RELEASE_PLAN_V0.md`](https://github.com/SungYongMOON/soulforge/blob/57975ac8/docs/architecture/foundation/team_member_engineering_program/18_TEAM_PILOT_ACCESS_AND_RELEASE_PLAN_V0.md)
14. [`docs/reviews/EXTERNAL_REVIEW_MAP_2026-09-05.md`](https://github.com/SungYongMOON/soulforge/blob/57975ac8/docs/reviews/EXTERNAL_REVIEW_MAP_2026-09-05.md)
15. [`CHANGELOG.md`](https://github.com/SungYongMOON/soulforge/blob/57975ac8/CHANGELOG.md) (head only in the packet)

이 목록 자체는 정본이 아니다. 각 문서의 owner는
[`DOCUMENT_OWNERSHIP.md`](../architecture/foundation/DOCUMENT_OWNERSHIP.md)를 따른다.
