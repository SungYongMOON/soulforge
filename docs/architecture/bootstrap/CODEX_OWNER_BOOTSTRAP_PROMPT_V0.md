# CODEX_OWNER_BOOTSTRAP_PROMPT_V0

아래 프롬프트를 다른 PC 의 Codex 에 그대로 넣으면, 기존 설치를 정리하고 Soulforge root 아래 nested `private-state/` 구조로 다시 깨끗하게 bootstrap 하도록 지시할 수 있다.

```text
Soulforge를 이 PC에 owner-with-state 프로필로 다시 설치해줘.

목표:
- 작업 루트는 하나의 Soulforge 폴더로 유지
- private 데이터 repo 는 Soulforge root 아래 nested `private-state/` 로 둔다
- 기존 잘못된 설치 흔적은 정리하고 새로 깔끔하게 맞춘다
- public 코드/문서와 private 데이터를 같은 workspace 안에서 함께 보게 한다
- local env, token, password, cookie, session 은 Git 에서 가져오지 않고 이 PC 에서만 다시 만든다

작업 규칙:
- 먼저 현재 디스크에 Soulforge 와 private-state 관련 기존 폴더가 있는지 확인해
- 기존 설치가 잘못되어 있으면, public repo 와 private repo 의 Git 상태를 먼저 확인하고 보고해
- 보존해야 할 local env 가 있으면 먼저 알려주고, 그 뒤 잘못된 설치 흔적은 정리해
- 최종 상태는 Soulforge root 아래 nested `private-state/` 하나만 남기고, 이전 잘못된 배치는 남기지 마
- private repo 는 public repo 의 nested git 이지만, public Git 에 올라가면 안 되므로 public repo 의 `.gitignore` 가 `private-state/` 를 무시하는지 확인해
- 가능한 한 직접 진행하고, 비밀값 입력이 필요한 순간에만 나에게 요청해
- `.env`, token, password, cookie, session, credential JSON 같은 secret 파일은 절대 열어 읽지 마
- secret 이전이 필요하면 원본 파일 경로와 대상 파일 경로만 알려주고, 내가 직접 열어 복사하게 해

진행 순서:
1. 아래 문서를 먼저 읽어
   - docs/architecture/bootstrap/README.md
   - docs/architecture/bootstrap/BOOTSTRAP_PROFILES_V0.md
   - docs/architecture/bootstrap/BOOTSTRAP_DOCTOR_V0.md
   - docs/architecture/workspace/INSTALLATION_MANUAL_V0.md
   - docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md
   - docs/architecture/workspace/PRIVATE_STATE_REPO_V0.md
2. 필수 도구 확인
   - git
   - gh
   - node
   - npm
   - python3
   - uv
3. gh 가 없으면 설치하고, gh auth status 확인 후 로그인 안 되어 있으면 사용자 본인 계정으로 gh auth login 진행
4. 기존 설치가 있으면 정리하고, public repo Soulforge 를 다시 clone 하거나 기존 repo 를 깨끗한 상태로 맞춰
5. private repo 가 있으면 Soulforge root 아래 `private-state/` 로 재배치하고, nested Git repo 인데 `origin` remote 가 비어 있으면 private remote 를 먼저 연결해
   - `cd private-state && git remote add origin <private-state-repo-url> && git fetch origin main && git switch -C main --track origin/main`
6. private repo 가 없으면 Soulforge root 에서 아래처럼 clone
   - `git clone <private-state-repo-url> private-state`
7. public repo 에서 `npm install` 실행
8. sync 가능한 Soulforge Codex skill 전체를 sync
   - `npm run skills:sync -- --all`
9. owner-with-state 기준으로 doctor safe 실행
   - `npm run guild-hall:doctor -- --profile owner-with-state`
10. GitHub/remote 상태 확인
   - `npm run guild-hall:doctor -- --profile owner-with-state --remote`
11. 필요한 local env 파일이 없으면 example 에서 복사해 자리만 만들어
12. 내가 실제 값을 넣어야 하는 파일 목록과, 내가 직접 열어 복사해야 하는 원본 파일 경로만 따로 알려줘
13. local env 를 내가 채운 뒤 live doctor 실행
   - `npm run guild-hall:doctor -- --profile owner-with-state --live`
14. 끝나면 아래를 짧게 보고해
   - public repo 경로
   - private repo 경로
   - 기존 설치 정리 여부
   - skills sync 결과
   - doctor safe 결과
   - doctor remote 결과
    - 내가 직접 채워야 하는 파일 목록
    - 다음 실행 명령

Windows PowerShell 에서 `npm.ps1` execution policy 로 막히면 위 `npm run ...` 명령은 같은 의미로 `npm.cmd run ...` 형태로 바꿔 실행해.

중요:
- 프로필은 owner-with-state 로 고정
- active workspace 는 Soulforge 하나로 본다
- private repo 는 Soulforge root 아래 `private-state/` 여야 한다
- 최종 상태는 Soulforge + nested private-state 구조 하나로 정리할 것
- 기능 코드/문서/public-safe sample 은 public repo 로, 보호 대상 업무 데이터는 private repo 로 저장할 것
- `.env`, token, password, cookie, session 은 절대 Git 에 올리지 말 것
- secret 파일 내용은 절대 읽거나 출력하지 말 것
- doctor 결과의 fix_hint 를 우선 사용해 다음 조치를 결정할 것
```
