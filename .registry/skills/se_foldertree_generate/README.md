# .registry/skills/se_foldertree_generate

- `se_foldertree_generate/skill.yaml` 은 SE 프로젝트 폴더 트리와 계획 파일 초기화를 위한 active canonical skill entry 다.
- bundled 리소스가 필요한 skill 이므로 `codex/assets/`, `codex/scripts/`, `codex/references/`, `codex/requirements.txt` 를 함께 tracked package 로 둔다.
- `codex/SKILL.md` 는 lean bridge 로 유지하고, Soulforge mapping 과 resource map 은 `codex/references/mapping.md` 로 분리한다.
- 실행 절차 예시와 옵션 체크리스트는 `codex/references/workflow.md` 로 분리한다.
- draft variant 검토는 `codex/assets/variants/` 와 `codex/scripts/preview_variants.py` 로 분리하며, 이 경로는 실제 폴더를 생성하지 않는다.
- skill 은 실행 전에 생성 모드, 사업 유형, 상위 체계업체, 품질등급, 시작일, 프로젝트명, 프로파일, 출력 루트를 먼저 확인해야 한다.
- bundled 리소스 참조는 skill root 기준 상대경로를 기본으로 두고, tracked package 에 host-local 절대경로를 넣지 않는다.
- 현재 bundled spec 지원 조합은 `체계개발 / LIG 넥스원 / A`, `선행연구 / 공통 / 없음`, `탐색개발 / 공통 / 없음`, `운용연구개발 / 공통 / 없음` 이다.
- `탐색개발` 과 `운용연구개발` 기본형은 common SE spine 기반 public-safe baseline 이며, contractor-specific overlay 나 project-specific tailoring 은 별도 variant/spec 로 분리한다.
- `선행연구` 기본형도 같은 방식의 public-safe baseline 이며, 자료조사/대안분석/전환판단에 무게를 둔다.
- 2026-08-18 정본 대조(`codex/references/source_verification_v0.md`, DRAFT): `체계개발` variant 의 SRR~PCA spine 은 방위사업관리규정 제56조④5·제79조② 와 부합(필수 산출물 17건 보강 대상), `탐색개발`·`선행연구` 기본형은 체계개발 명명틀을 차용한 상태라 정본 기준 재기준(re-base) 대상, `운용연구개발` 은 경미 성능개량/현존전력 트랙 분리 대상, `응용연구` 는 제안안만 있다. 재기준 전까지 이 세 기본형은 "미검증 기본형" 으로 취급한다.
- `codex/scripts/export_variant_json.py` 는 각 spec 의 YAML front section 을 `codex/assets/compiled/<support_key>.json` (schema `soulforge.se_foldertree_compiled_variant.v0`) 으로 결정론적 컴파일하며, spec 을 고치면 재생성해야 한다. 드리프트 가드는 `npm run validate:se-foldertree-compiled` (= `export_variant_json.py --check`) 이고 aggregate `validate` chain 에는 넣지 않는다. 세부는 `codex/references/variants.md` 의 "Compiled JSON" 절을 따른다.
- `체계개발` spec (v0.8) 의 task 에는 선택 기계 필드 `artifact_type_id`, `evidence_level`, `source_refs`, `verification_status`, `applies_when` 이 붙어 있고 2026-08-18 대조에서 빠진 필수 17건이 추가됐다. 생성기는 모르는 키를 무시하므로 폴더 생성 결과는 이 필드로 바뀌지 않는다. 나머지 3종 기본형은 compiled JSON 에서 `verification_status: unverified` 로 나간다.
- actual model, MCP/tool set, installed skill name, install path, output root 선택은 tracked skill folder 가 아니라 local runtime owner 가 맡는다.
