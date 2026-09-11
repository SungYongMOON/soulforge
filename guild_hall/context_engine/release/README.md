# Context Engine v1 source-lane preparation

기존 `guild_hall/deployment_pack/tools/build_source_lane.mjs`를 사용한다.
APP runtime/algorithms/profile과 실제 shared import closure만 repo-relative로 묶는다.
ERP caller 전체, harness/tests, gold, 실자료, credentials를 설치본에 넣지 않는다.

```text
node guild_hall/context_engine/release/closure.mjs --write
node guild_hall/context_engine/release/verify_module.mjs
node guild_hall/deployment_pack/tools/build_source_lane.mjs --repo <clean-checkout> --spec guild_hall/context_engine/release/context-engine-v1.spec.json --out <owned-scratch>/context-engine-v0.1.0
node guild_hall/context_engine/release/verify_installation.mjs --lane <owned-scratch>/context-engine-v0.1.0 --input <owned-scratch>/input.json --receipt <owned-scratch>/standalone-query.receipt.json
```

builder는 clean tracked HEAD를 요구한다. `closure.mjs --write`는 개발 준비 도구이므로
생성한 spec/closure를 검증하고 commit한 뒤 builder를 실행한다. builder CLI가
LANE_MANIFEST.sha256, LANE_MANIFEST.md, build.receipt.json 세 파일을 만든다.
기존 `verifyLane`의 listed-byte 검사에 더해 설치 검사기는 unexpected file도 거부한다.

`prepare_standalone_input.mjs`는 개발용 공개 합성 state 준비만 수행한다. Python 경로는
`SOULFORGE_TEST_PDF_PYTHON`으로 명시하며 추가 설치를 하지 않는다. 이 스크립트와 fixture는
source-lane에 포함되지 않는다. 설치 APP은 생성된 state snapshot을 읽을 뿐 harness를 찾지 않는다.

설치 검사기는 Node24의 permission 모드로 APP을 **설치본 자신의 cwd**에서 실행한다.
읽기 허용 범위는 설치본과 자기 소유의 별도 state parent뿐이다. NODE_PATH/사전 NODE_OPTIONS를
비우며 개발 checkout 읽기를 실제 거부하는 probe와 쓰기 거부·query 전후 byte parity를 확인한다.
정상·default-off·거부 actor 응답을 확인하고 개발 관측과 같은 semantic pack digest를 요구한다.

현재 runtime/명시 computed asset closure에는 Node builtins만 import되며 bare package fallback은
허용하지 않는다. 이 목록은 정적 literal import probe와 명시적 Python worker를 합친 것이다.
computed/config access 전체를 정적 분석만으로 증명하지 않으므로 실제 설치 실행이 별도 gate다.
Python/PDF package는 명시적 host prerequisite이며 query proof에서 parser를 다시 실행하지 않는다.
명시 update의 Python byte/membership pin과 no-site 실행은 [세대 전환](../docs/GENERATION_TRANSITION.md)을 따른다.

## 서로 다른 manifest

`module.manifest.json`은 기존26필드 operability declaration이다. 개발 APP의 harness/tests/docs까지
포함한 source-tree digest와 설치 runtime subset의 artifact digest를 혼동하지 않기 위해 이 선언의
nullable release_digest는 현재 null로 둔다. `verify_module`은 실제 전체 source digest를 별도 관측한다.

설치 검사 receipt의 release_binding_manifest는 기존 module_binding shape를 별도로 검증한다.
실제 clean commit, lane-manifest byte hash, profile byte hash, exact dependency versions를 결속한다.
관찰된0.1.0 외 ABI 범위를 주장하지 않는다. schema/ABI promotion·독립 review·project binding 및
code+data 전환을 구조 검사 성공으로 대신하지 않는다. rollback compatible 목록은 아직 비어 있다.

위 명령은 최초0.1.0 query 증거의 재현 예다. 현재 spec의 module version에 맞는 새 경로에 설치한다.
새 데이터 세대 생성·두 전략 전환은 `harness/installed_generation_flow.mjs --phase incumbent|candidate`
명령을 별도로 실행한다. 설치 전환과 revised harness/실제 소비 평가는 별도 증거이며
이들을 production 완료로 확대하지 않는다.
