# Codex Pet Install Sync

## 목적

- tracked Soulforge Codex pet package를 각 PC의 local Codex pet 폴더에 명시적으로 동기화한다.
- pet은 `.registry`의 새 정본 category가 아니라 `.registry/docs/operations/codex_pets/`가 소유하는 opt-in 운영 package다.

## 경계

- source: `.registry/docs/operations/codex_pets/<pet_id>/{pet.json,spritesheet.webp}`
- target: `${CODEX_HOME:-$HOME/.codex}/pets/<pet_id>/`
- `CODEX_HOME`이 없으면 현재 사용자 home의 `.codex`를 사용한다.
- 일반 bootstrap, doctor, `git pull`은 pet을 자동 설치하거나 갱신하지 않는다.
- sync, verify, remove는 소문자 영숫자로 시작하고 소문자 영숫자·`_`·`-`만 포함한 pet ID만 받는다.

각 source package의 `pet.json`은 아래 필드를 충족해야 한다.

- `id`: 폴더의 pet ID와 동일
- `displayName`: 비어 있지 않은 문자열
- `description`: 비어 있지 않은 문자열
- `spriteVersionNumber`: 숫자 `2`
- `spritesheetPath`: 정확히 `spritesheet.webp`

## macOS / Linux

저장소 root에서 실행한다.

```bash
git pull --ff-only
npm run pets:sync -- moru
npm run pets:verify -- moru
```

제거:

```bash
npm run pets:remove -- moru
```

## Windows PowerShell

저장소 root에서 실행한다. PowerShell execution policy와 무관하게 `npm.cmd`를 사용한다.

```powershell
git pull --ff-only
npm.cmd run pets:sync -- moru
npm.cmd run pets:verify -- moru
```

제거:

```powershell
npm.cmd run pets:remove -- moru
```

`CODEX_HOME`을 별도 위치로 쓰는 PowerShell 세션도 같은 명령을 사용한다.

```powershell
$env:CODEX_HOME = Join-Path $HOME "Codex Home"
npm.cmd run pets:sync -- moru
npm.cmd run pets:verify -- moru
```

## opt-in update

1. `git pull --ff-only`로 tracked package를 갱신한다.
2. `npm run pets:sync -- <pet_id>` 또는 PowerShell의 `npm.cmd run pets:sync -- <pet_id>`를 명시적으로 실행한다.
3. `pets:verify`로 설치 파일 두 개의 SHA-256이 tracked source와 같은지 확인한다.
4. Codex가 이미 실행 중이면 앱을 다시 시작해 local pet 목록을 다시 읽게 한다.

반복 sync는 두 파일이 이미 같으면 no-op이다. 기존 target이 다른 ID를 주장하거나 예상 밖 파일·심볼릭 링크를 포함하면 sync/remove는 사용자 파일을 지우지 않고 중단한다.

## 구현

- CLI: [`scripts/sync_codex_pet.mjs`](scripts/sync_codex_pet.mjs)
- tests: [`scripts/sync_codex_pet.test.mjs`](scripts/sync_codex_pet.test.mjs)
- package owner: [`codex_pets/README.md`](codex_pets/README.md)
