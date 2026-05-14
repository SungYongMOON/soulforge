# .registry/skills/se_foldertree_generate

- `se_foldertree_generate/skill.yaml` 은 SE 프로젝트 폴더 트리와 계획 파일 초기화를 위한 active canonical skill entry 다.
- bundled 리소스가 필요한 skill 이므로 `codex/assets/`, `codex/scripts/`, `codex/references/`, `codex/requirements.txt` 를 함께 tracked package 로 둔다.
- `codex/SKILL.md` 는 lean bridge 로 유지하고, Soulforge mapping 과 resource map 은 `codex/references/mapping.md` 로 분리한다.
- 실행 절차 예시와 옵션 체크리스트는 `codex/references/workflow.md` 로 분리한다.
- draft variant 검토는 `codex/assets/variants/` 와 `codex/scripts/preview_variants.py` 로 분리하며, 이 경로는 실제 폴더를 생성하지 않는다.
- skill 은 실행 전에 생성 모드, 사업 유형, 상위 체계업체, 품질등급, 시작일, 프로젝트명, 프로파일, 출력 루트를 먼저 확인해야 한다.
- bundled 리소스 참조는 skill root 기준 상대경로를 기본으로 두고, tracked package 에 host-local 절대경로를 넣지 않는다.
- 현재 bundled spec 지원 조합은 `체계개발 / LIG 넥스원 / A`, `탐색개발 / 공통 / 없음`, `운용연구개발 / 공통 / 없음` 이다.
- `탐색개발` 과 `운용연구개발` 기본형은 common SE spine 기반 public-safe baseline 이며, contractor-specific overlay 나 project-specific tailoring 은 별도 variant/spec 로 분리한다.
- actual model, MCP/tool set, installed skill name, install path, output root 선택은 tracked skill folder 가 아니라 local runtime owner 가 맡는다.
