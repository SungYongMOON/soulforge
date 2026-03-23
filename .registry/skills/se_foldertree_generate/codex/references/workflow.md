# SE 폴더트리 생성 절차

## 목적

SE 프로젝트의 루트 폴더, 게이트별 폴더, 작업 하위 폴더, 계획 관리 파일을 한 번에 생성한다.

## 입력

- 생성 모드 `new-root` | `in-place`
- 사업 유형
- 상위 체계업체
- 품질등급
- 시작일 `YYYYMMDD`
- 프로젝트명
- 프로파일 `A`, `B`, `C`
- 출력 루트 경로
- 필요하면 수정한 스펙 파일 경로

## 입력 확인 규칙

- 값이 하나라도 비어 있으면 먼저 사용자에게 묻는다.
- 현재 bundled spec 이 지원하는 조합은 `체계개발 / LIG 넥스원 / A` 뿐이다.
- 지원하지 않는 조합이면 생성하지 말고 새 spec/variant 가 필요하다고 중단한다.
- `in-place` 는 `--out` 을 최종 프로젝트 루트로 본다.
- `new-root` 는 `--out` 을 상위 경로로 보고, 그 아래 `{START}_{PROJECT_NAME}` 루트를 새로 만든다.

## 기본 스펙

기본 스펙 파일은 `assets/SE_FolderTree_Guide.md`다. 스킬 내부 에셋을 그대로 사용할 수도 있고, 작업 폴더에 복사해 조정한 뒤 `--spec`으로 넘겨도 된다.

게이트 번호 체계를 바꿔야 하면 `scripts/convert_gate_numbers.py`를 사용해 스펙 복사본을 변환한다.

```bash
cd "$SKILL_DIR"
python scripts/convert_gate_numbers.py input.md output.md
```

## 기존 프로젝트 루트에 바로 생성하는 예시

```bash
cd "$SKILL_DIR"
python scripts/generate_tree.py \
  --spec assets/SE_FolderTree_Guide.md \
  --layout-mode in-place \
  --business-type "체계개발" \
  --prime-contractor "LIG 넥스원" \
  --quality-grade A \
  --start 20260109 \
  --name "프로젝트명" \
  --profile A \
  --out "<최종프로젝트루트>"
```

## 새 프로젝트 루트를 상위 경로 아래에 생성하는 예시

```bash
cd "$SKILL_DIR"
python scripts/generate_tree.py \
  --spec assets/SE_FolderTree_Guide.md \
  --layout-mode new-root \
  --business-type "체계개발" \
  --prime-contractor "LIG 넥스원" \
  --quality-grade A \
  --start 20260109 \
  --name "프로젝트명" \
  --profile A \
  --out "<상위경로>"
```

## 사전 점검 예시

실제 생성 전에 `--dry-run`으로 경로와 산출물을 확인한다.

```bash
cd "$SKILL_DIR"
python scripts/generate_tree.py \
  --spec assets/SE_FolderTree_Guide.md \
  --layout-mode in-place \
  --business-type "체계개발" \
  --prime-contractor "LIG 넥스원" \
  --quality-grade A \
  --start 20260109 \
  --name "프로젝트명" \
  --profile A \
  --out "<최종프로젝트루트>" \
  --dry-run
```

`--dry-run` 도 preview 경로 아래에 `plan_manifest.json`, `plan_progress.json`, CSV, 인덱스 파일을 실제로 만든다. 기존 프로젝트를 건드리지 않으려면 preview 전용 경로를 따로 잡는다.

## 주요 옵션

- `--layout-mode`: `new-root`, `in-place`
- `--business-type`: 사업 유형
- `--prime-contractor`: 상위 체계업체
- `--quality-grade`: 품질등급
- `--manifest-format`: `json`, `csv`, `both`, `none`
- `--no-manifest`: manifest 생성 비활성화
- `--no-progress`: progress 생성 비활성화

## 생성 산출물

- `plan_manifest.json`
- `plan_progress.json`
- 작업 목록 CSV
- 제외 목록 CSV
- 폴더 인덱스 텍스트
- `PROJECT_ID.txt`

## 실행 전제

- Python 실행 환경
- `requirements.txt`에 적힌 파이썬 패키지 설치

필요 시:

```bash
python -m pip install -r "$SKILL_DIR/requirements.txt"
```

## 검증 포인트

- 출력 루트 아래에 프로젝트 루트 폴더가 기대한 이름으로 생성되었는지
- 프로파일에 맞는 작업 폴더만 생성되었는지
- `plan_manifest.json`과 `plan_progress.json`이 같이 생성되었는지
- CSV와 인덱스 파일이 누락되지 않았는지

## 체크리스트

- [ ] 시작일, 프로젝트명, 프로파일을 확정했다.
- [ ] 생성 모드, 사업 유형, 상위 체계업체, 품질등급을 확정했다.
- [ ] 현재 bundled spec 이 입력 조합을 지원하는지 확인했다.
- [ ] 스펙 파일을 그대로 쓸지 복사본을 조정할지 결정했다.
- [ ] `--dry-run`으로 산출물을 확인했다.
- [ ] 실제 생성 명령을 실행했다.
- [ ] manifest, progress, CSV, 인덱스 파일을 확인했다.
