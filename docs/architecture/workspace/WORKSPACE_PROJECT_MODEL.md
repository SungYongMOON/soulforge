# 워크스페이스 프로젝트 모델

## 목적

- `_workspaces/<project_code>/` 직행 구조를 고정한다.
- public repo 와 local/private project worksite 의 경계를 명확히 한다.
- `_workmeta/<project_code>/` 가 소유하는 운영 계약, binding, raw execution truth 의 위치를 고정한다.
- held mission plan owner 는 `.mission/` 이고, `_workspaces/` 는 project-local worksite owner, `_workmeta/` 는 companion private metadata owner 임을 고정한다.
- cross-project ingress/staging 은 `_workspaces/` 가 아니라 `guild_hall/state/gateway/**` 가 맡는다는 기준을 같이 잠근다.

## 구조 개요도

```mermaid
flowchart TD
  MI[".mission/"] --> MP["<mission_id>/mission.yaml<br/>held mission owner"]
  MP --> PJ["project_code"]
  GH["guild_hall/state/gateway/<br/>cross-project ingress + staging"] --> GHI["intake_inbox/"]
  W["_workspaces/"] --> R["README.md<br/>public tracked"]
  W --> P["&lt;project_code&gt;/<br/>local-only materialization"]
  P --> F["actual project files"]
  WM["_workmeta/&lt;project_code&gt;/<br/>nested private metadata root"] --> C["contract.yaml"]
  WM --> B["bindings/"]
  WM --> PM["monsters/"]
  WM --> AH["autohunt/"]
  B --> WB["workflow_binding.yaml"]
  B --> PB["party_binding.yaml"]
  B --> AB["appserver_binding.yaml"]
  B --> MB["mailbox_binding.yaml"]
  B --> EP["execution_profile_binding.yaml<br/>optional runtime binding"]
  B --> SB["skill_execution_binding.yaml<br/>optional runtime binding"]
  WM --> RUN["runs/&lt;run_id&gt;/"]
  WM --> D["dungeons/"]
  WM --> A["analytics/"]
  WM --> N["nightly_healing/"]
  WM --> RP["reports/"]
  WM --> LOG["log/"]
  WM --> AR["artifacts/"]
```

## public repo 구조

```text
_workspaces/
└── README.md
```

## local/private materialization

```text
_workspaces/
└── <project_code>/
    └── ... actual project files ...

_workmeta/
└── <project_code>/
    ├── contract.yaml
    ├── bindings/
    ├── monsters/
    ├── autohunt/
    ├── runs/
    │   └── <run_id>/
    ├── dungeons/
    ├── analytics/
    ├── nightly_healing/
    ├── reports/
    │   └── morning_report/
    ├── log/
    │   ├── nightly_sweep/
    │   └── battle_log/
    └── artifacts/
```

## 정본 규칙

- `_workspaces/<project_code>/` 가 실제 과제 현장 materialization root 다.
- 실제 프로젝트가 다른 경로에 이미 있으면 `_workspaces/<project_code>/` direct child 로 보이도록 local-only directory link 를 둘 수 있다.
- `_workmeta/<project_code>/` 는 Soulforge root 아래 nested private metadata repo 다.
- `guild_hall/state/gateway/` 가 mail fetch 와 project assignment 전 intake staging 을 함께 담는 cross-project ingress root 다.
- held mission plan 과 readiness owner 는 루트 `.mission/` 이다.
- project 후보는 `_workspaces/<project_code>/` direct child 구조를 사용한다.
- `project_code` 는 경로와 식별에 쓰는 짧고 안정적인 id 로 두고, 사람용 full title 은 `contract.yaml` 의 `display_name` 에 둔다.
- `_workmeta/<project_code>/` 는 분리된 registry 가 아니라 companion private root 안의 local contract, binding, raw execution truth 보관 위치다.
- `_workmeta/<project_code>/monsters/` 는 project-side monster current state owner 다.
- assigned execution plan 과 mission-level 배정 owner 는 `_workmeta/` 가 아니라 `.mission/` 이 소유한다.
- `_workmeta/<project_code>/autohunt/` 는 mailbox routing, workflow-party selection, retry-escalation 같은 자동사냥 운영 정책을 두는 local operating surface 다.
- runner 는 `_workmeta/<project_code>/` contract, binding, workflow, party 를 읽어 current step execution packet 을 만드는 execution role 이며 별도 canonical root 나 required local folder 가 아니다.
- runner prototype 는 한 예시로 `_workmeta/<project_code>/tools/` 아래 script 형태로 materialize 할 수 있지만, 이 경로 자체를 현행 표준 구현 위치로 고정하지는 않는다.
- `contract.yaml` 은 `.unit/<unit_id>/unit.yaml` 을 `unit_ref` 로 가리키고, binding file 은 `.workflow/<workflow_id>/workflow.yaml` 과 `.party/<party_id>/party.yaml` 을 id 기준으로 연결한다.
- binding set 은 `workflow_binding.yaml`, `party_binding.yaml`, `appserver_binding.yaml`, `mailbox_binding.yaml` 을 기본으로 두고, 필요하면 `execution_profile_binding.yaml` 과 `skill_execution_binding.yaml` 을 추가해 local runtime execution 을 설명한다.
- raw run 의 정본 owner 는 `_workmeta/<project_code>/runs/<run_id>/` 다.
- `.mission/<mission_id>/mission.yaml` 은 workflow, party, unit assignment 를 묶은 held execution plan owner 다.
- binding file 과 appserver/mailbox/execution operating metadata 는 orchestration contract 이며 raw truth owner 가 아니다.
- `autohunt/` 는 run queue 와 routing policy 를 다루지만 raw truth owner 가 아니다.
- `dungeons/`, `analytics/`, `nightly_healing/`, `reports/`, `log/`, `artifacts/` 는 모두 local/private owner 영역이다.
- tracked contract example 은 `docs/architecture/workspace/examples/<project_code>/_workmeta/` 아래에만 둔다.

## owner 경계

- 프로젝트 실자료와 산출물은 `_workspaces/<project_code>/` 안에 남긴다.
- `gateway` inbox / mailbox / monster event staging 은 `guild_hall/state/gateway/` 안에 남긴다.
- held mission metadata 와 readiness 는 `.mission/<mission_id>/` 아래에 남긴다.
- `.registry`, `.unit`, `.workflow`, `.party`, `guild_hall` 은 project binding 대상 또는 운영 owner 일 뿐, per-project 실자료 owner 가 아니다.
- `.mission` 은 workflow/party/unit resolve 결과를 project-local run truth 와 분리해 소유한다.
- `_workmeta/` 도 local execution surface 일 뿐 mission assignment owner 는 아니다.
- 첫 실제 프로젝트 온보딩은 read-only structure review 후 bounded first run/use 를 수행하고, 그 다음 `_workmeta` local rule 을 보정하는 순서를 기본안으로 본다.
- tracked example contract 와 binding YAML 은 local `_workmeta/<project_code>/` shape 를 public-safe 하게 보여주는 mirror 일 뿐, runtime owner 가 아니다.
- tracked example 의 `runner/` packet sample 은 설명용 mirror 이며, local runtime 의 required directory 를 뜻하지 않는다.
- `execution_profile_binding.yaml` 은 workflow step 의 `execution_profile_ref` 를 model, reasoning, attached skill name, MCP/tool preference 로 resolve 하는 local runtime metadata 다.
- `skill_execution_binding.yaml` 은 canonical `skill_id` 를 installed Codex skill name 으로 resolve 하는 local runtime metadata 다.
- `autohunt/policy.yaml`, `routing.yaml`, `mailbox_rules.yaml` 은 monster routing 과 자동사냥 운영 정책을 설명하는 local operating metadata 다.
- `.workflow/history` 와 `.party/stats` 에 public repo 로 올라올 수 있는 것은 curated summary 뿐이다.
- raw execution truth 를 public repo 루트로 재배치하는 `.run/` 모델은 사용하지 않는다.

## 보안과 추적 정책

- public repo 에서는 `_workspaces/README.md` 만 추적한다.
- 실제 `<project_code>` 와 그 하위 파일은 local environment 에서만 materialize 한다.
- canonical 문서에는 실제 project code, 실제 과제명, 외부 로컬 경로, private workspace 경로 예시를 적지 않는다.
- tracked 정본 문서와 public-safe example 에서는 실제 과제 식별자 대신 `demo_project`, `example_project`, `Example Project` 같은 generic placeholder 만 쓴다.
- project assignment 규칙을 정본으로 승격할 때는 비밀 project code, 내부 관리번호, 외부에 닫힌 식별자를 직접 판정 키로 적지 않는다.
- 여러 과제에 겹칠 수 있는 약어, 제품군명, 일반 사업유형은 단독 project hint 로 확정하지 않고 보조 힌트로만 다룬다.
- 실제 프로젝트 첫 온보딩 절차는 [`PROJECT_ONBOARDING_V0.md`](PROJECT_ONBOARDING_V0.md) 를 따른다.
- first run/use 중 생기는 실제 프로젝트별 working note 와 evidence 는 `_workmeta/<project_code>/reports/onboarding/`, `_workmeta/<project_code>/artifacts/onboarding/` 같은 local-only 경로에 둔다.
- 새 시작 행위의 대화 순서와 실제 작업 순서는 사용자가 따로 요청하지 않아도 `_workmeta/<project_code>/reports/onboarding/project_start_worklog.md` 같은 local-only workflow record 로 남기는 것을 기본안으로 본다.
- validator 는 public-safe mode 와 opt-in local scan 을 구분해 동작한다.

