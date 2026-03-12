# known limitations

## 목적

이 문서는 Soulforge v1 closeout 시점에 의도적으로 남겨 둔 제한, 경고, 운영상 주의점을 사실 기준으로 정리한다.
이 문서는 변명 문서가 아니라 현재 상태를 숨기지 않고 운영에 필요한 사실을 고정하는 문서다.

## known warnings

- `workspace_default_loadout_scope`
  현재 `contract.default_loadout` 검사는 `.agent_class/loadout.yaml.active_profile` 하나와의 비교까지만 다룬다. multi-profile 정식 설계 전까지는 이 경고가 남는다.

## known limitations

- renderer 는 여전히 `derive-ui-state --json` 소비자 역할의 read-only prototype 이며, 정본 수정 기능을 제공하지 않는다.

## 표현 계층 남은 과제

- diagnostics filtering 이 없다.
- diagnostics 나 project card 로 이동하는 deep-link 가 없다.
- richer detail panel 이 없다.
- 매우 큰 installed catalog 나 workspace 목록에서는 collapse, expand, filtering 이 필요할 수 있다.

## data/contract 남은 과제

- `contract.default_loadout` 와 loadout profile 의 관계를 multi-profile 기준으로 다시 정의해야 한다.
- viewer 에서 필요한 추가 표현 메타를 넣더라도 root 계약 문서와 derived state 최소 필드 경계를 유지하는 규칙은 후속 차수에서 더 정교화할 여지가 있다.

## 운영 상 주의점

- `unbound` 는 오류가 아니라 상태 분류 결과다. 운영 보고에서 `invalid` 와 같은 급으로 취급하지 않는다.
- viewer snapshot 은 `derive-ui-state` 명령이 non-zero 여도 partial payload 를 사용해 생성될 수 있으므로, exit code 와 payload 존재 여부를 함께 본다.
- closeout 문서는 계약 문서를 대체하지 않는다. 세부 스키마와 resolve 규칙은 기존 contract 문서를 정본으로 유지한다.

## 후속 차수 후보

- multi-profile loadout 설계와 `workspace_default_loadout_scope` 경고 해소
- viewer 의 filtering, deep-link, detail panel 추가
