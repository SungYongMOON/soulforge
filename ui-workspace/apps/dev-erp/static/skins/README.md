# 던전 배경 (달빛조각사 스킨) — 로컬·비공개

판타지 모드에서 **과제 허브에 들어가면** 그 과제의 배경 이미지가 화면에 깔립니다(과제마다 다른 "던전").

## 넣는 법
판타지 모드 기준, 두 가지 배경입니다. 다른 PC에서도 보이게 하려면 공유
worksite인 `_workspaces/system/dev-erp/skins/` 에 먼저 넣습니다.

| 화면 | 파일 경로 |
|---|---|
| **메인(콕핏/프로젝트 홈)** = 길드 내부 전경 | `_workspaces/system/dev-erp/skins/main.png` 또는 `.jpg` |
| **과제 허브** = 그 과제의 던전 | `_workspaces/system/dev-erp/skins/dungeons/<과제번호>.png` 또는 `.jpg` |

- 예: 과제 `P26-005` → `_workspaces/system/dev-erp/skins/dungeons/P26-005.png`, 메인 → `_workspaces/system/dev-erp/skins/main.png`
- 같은 파일을 로컬에서만 쓰려면 기존처럼 `static/skins/` 아래에 둘 수 있습니다.
  서버는 공유 worksite 를 먼저 찾고, 없을 때 로컬 `static/skins/` 로 fallback 합니다.
- 다른 공유 위치를 써야 하면 `--skins_dir <path>` 또는 `DEV_ERP_SKINS_DIR=<path>` 로
  지정합니다.

**기본 배경(원본 일러스트)**: 이미지를 안 넣어도 `skins/regions/*.svg`(직접 그린 원본, 저작권 무관)가 깔립니다.
owner가 위 경로에 png/jpg를 넣으면 그게 **우선**(레이어 위)으로 덮입니다. (이미지 없으면 svg → 그라데이션 순서)
- 권장: 가로형(예 1600×900 이상), `.png` 또는 `.jpg`.
- 파일이 없으면 그냥 미스트 그라데이션 배경(현행)으로 보입니다.
- 위에 옅은 크림 스크림이 깔려 패널/글자는 그대로 읽힙니다(가독성 유지).

## ⚠️ 저작권 — 공개 repo에 올리지 않음
게임 캡처·아트는 **카카오게임즈/XL게임즈 저작물**이라 공개 GitHub repo에 올리지 않습니다.
이 폴더(`skins/`)의 이미지는 `.gitignore` 로 추적 제외됩니다. 다른 PC와 공유해야
하는 개인용 이미지는 public GitHub 가 아니라 `_workspaces/system/dev-erp/skins/`
같은 owner-approved 공유 worksite 에 둡니다. 이 README 만 git 에 추적됩니다.
