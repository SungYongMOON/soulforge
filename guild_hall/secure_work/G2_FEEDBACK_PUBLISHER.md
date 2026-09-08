# G2 feedback adapter candidate

기존 E14 DTO·projector·FieldReviewLedger·permit verifier·attempt journal과 기존
SOURCE/SENDER 역할을 조립하는 **합성 개발 후보**다. 운영 설치·권한 부여·실자료 실행을
뜻하지 않는다. 이전 custody reader 조각(`da07cd06`) 위의 후속 구현이다.

## 역할과 실제 경로

| 단계 | 기존 권한 | 동작 |
|---|---|---|
| SOURCE 준비 | controller / `jobs.advance` | committed Linear exact custody read, reviewed literal projection, immutable prepared files |
| 공개 검토·허가 | 외부 KEY_SERVICE / 기존 `release.review`, `release.issue` | 기존 PolicyReview와 SignedPermit를 별도로 제공; 이 adapter는 발급하지 않음 |
| 발행 | sender / `model.dispatch` | metadata currentness, 독립 검토·허가·field ledger 검증, exact byte publication |
| G1 소비 전 확인 | 기존 허용된 G1 호출면 → 인증된 SENDER 경계 | challenge-bound 현재성 metadata만; raw source/ledger/permit/key는 G1에 전달하지 않음 |

```text
installed sfx --g2-feedback-prepare
→ SOURCE role + current Linear custody
→ E14 reviewed WorkPacket + final feedback bytes (private candidate)
→ independent external PolicyReview / SignedPermit
→ installed sfx --g2-feedback-publish
→ SENDER role + actual E14 verifier + durable attempt
→ immutable projection → pending receipt → atomic index → completed attempt/receipt
```

두 command는 exact 한 인자만 허용한다. 비슷한 prefix와 추가 argv는 Node에서 거부한다.
Python은 기존 isolated launch/import/OS 검증 아래 `feedback_prepare` 또는
`feedback_verify`로 진입한다. mode가 해당 역할의 자기 config만 전달하며 다른 기존
cli/worker/sender/custody_sender의 config·scripted 동작을 바꾸지 않는다.

## 고정 mapping과 검토 관계

이 candidate codec은 `feedback.exact.v1` 한 종류다. current issue의 `description` 하나를
최대 2,000자의 `feedback.summary` text field로 추출한다. E14 strict JSON에 맞지 않는
source, 빈/긴 description, 불완전 field review는 HOLD다. raw record 전체가 source span이고
원본 wrapper byte digest가 SourcePin이다. source object canonical hash와 wrapper byte hash는
다르게 취급한다. 일반 요약 모델이나 자동 비밀분류기가 아니다.

기존 FieldReviewLedger가 exact field hash와 current policy epoch를 확인해야 M03
KEEP_REVIEWED가 literal을 만든다. 나머지 projection 필드는 protected profile/현재 source/
별도 standing grant에서 정해지며, 최종 13-field JSON은 **공개 검토·허가 전에** E14 canonical
bytes로 고정한다. 준비됐다는 사실이나 `public_safe_code` 문자열은 release가 아니다.

PolicyReview는 기존 DTO를 그대로 쓰고 `HUMAN_REVIEWED_EXACT` + `ALLOW`를 요구한다.
actor/ref/epoch/expiry, packet/work digest와 scope digest를 별도로 검사한다. 이 candidate의
scope digest는 다음 closed evidence 객체의 E14 canonical digest다:

`selection, source_binding, source_bundle_sha256, field_sha256, field_span_end, work,
profile_sha256, grant_sha256, route_sha256`.

서명만으로 PolicyReview.ALLOW를 대체하지 않는다. review와 field ledger의 SHA 및 OS write
custody를 별도로 재검사한다. KEY_SERVICE actor와 issuer identity는 기존 role verifier가
확인한다. 실제 permit 검증은 read-only E14 `permits.verify_permit`이며 새 signer/ALLOW
schema/authority는 없다. `sign_for_test`는 테스트 fixture에만 있다.

route commitment에는 RouteProfile/header/codec/audience뿐 아니라 **receiver deployment SHA와
publication control-root SHA**도 들어간다. 다른 수신지나 새 빈 permit 저장소로 바꿔 기존
허가를 재사용할 수 없다. body size는 route.max_request_bytes 이내이고 projection expiry는
grant·SOURCE/SENDER authority·review·permit의 유효 범위를 넘지 않는다.

## 입력과 저장소

설치자가 기존 protected config에 `g2_feedback`를 고정한다. 외부 pinned profile, grant,
route, field ledger, G1 workforce/current authority, receiver deployment와 qualification ref가
공통 필수다. 이 ref의 실제 적격화는 installer/authority owner가 소유하며 모델이 생성하지 않는다.

- controller config: selection descriptor, prepared_root, 기존 permit public-key 위치.
- sender config: SHA-pinned prepared manifest, review, permit, public `.pub` key,
  control_root와 projection_root. SOURCE의 job/vault/config/signing-key 위치를 받지 않는다.
- root는 사전에 준비된 일반 디렉터리여야 한다. 실행 코드·source custody·collection state와
  겹치거나 `_workspaces`/`_workmeta`/`.git` 아래이면 거부한다. parent는 보호되고 output root는
  지정된 현재 writer 외에 다른 비관리 주체가 수정할 수 없어야 한다. 이 코드는 ACL을 바꾸지 않는다.

prepared_root는 exact body/packet/prepared/evidence와 그 manifest를 create-only로 저장한다.
현재 mapping은 **한 task/profile에 한 issue**다. 여러 issue를 임의 합치거나 기존 index의 다른
writer 항목을 흡수하지 않는다. 다른 issue는 기존 issuer에서 preparation pending으로 남을 수 있다.

control_root의 E14 Journal은 `feedback.code` publication attempt의 UNIQUE permit/attempt,
IN_FLIGHT/RESPONSE_RECEIVED 기록을 소유한다. 이것은 기존 Lane mission phase를 대신하거나
ERP task를 완료시키는 기록이 아니다. journal을 잃은 기존 publication을 새 빈 journal로
조용히 재시작하지 않는다.

## 발행·중단·현재성

immutable projection bytes는 승인된 body와 완전히 동일하다. 재직렬화나 newline 추가가 없다.
처음 publication이 index 뒤에서 중단돼도 completed journal/current receipt가 없으면 읽기
guard가 거부한다. 확인되지 않은 IN_FLIGHT는 자동 재전송하지 않는다. 이전에 완료된 동일
generation/bytes는 현재 검토·허가가 계속 유효한 경우에만 idempotent하게 확인·복구한다.

source/review/grant/authority 오류나 publication 실패에서는 이전·pending 영수증으로 자기
것임을 입증한 index만 철회한다. immutable bytes는 남는다. 갑작스러운 hard-link 중단으로
단일-link 조건을 잃거나 lease가 남으면 HOLD이며, 원본·허가 사용 기록을 지우는 자동 복구는 없다.

`assertCurrentPublication(challenge)`는 SENDER 안에서 실행한다. 현재 root ACL, source,
trusted review/ledger/grant/key/role, actual completed journal, 재구성한 exact index와 receipt,
실제 published body SHA를 검사한다. G1로 반환하는 것은 actor/scope/issue/release/body/index/
generation/time/challenge metadata뿐이다. 불변 서명·mapping 계산은 동일한 exact bytes에서만
재사용하며, current authority·pins·source·clock·journal·published bytes 검사는 매번 수행한다.

G1의 `validateAuthenticatedCurrentnessMetadata`는 **이미 인증된 SENDER 응답**의 challenge,
actor, task/release/hash/generation/freshness를 비교하는 함수다. 인증기를 대신하지 않으며
모델이 만든 JSON에 적용해 권한을 만들면 안 된다.

발행 완료 후 `currentness.json`에는 현재성 계약의 기존 9필드만 기록한다. 이 파일은 G1의
기대값이며 인증된 응답을 대신하지 않는다. stale 파일이 남아도 current index·journal·현재
권한 검사가 실패하면 사용할 수 없다. issuer의 `assertDeployment`에는 named-pipe
consumer를 연결했고 `g1_acp`는 해당 설치 설정을 필수로 요구한다. 전송 테스트의 same-user
kernel 인증과 합성 handler는 실제 SENDER/E14의 cross-SID 설치 적격화를 대신하지 않는다.
설치된 SENDER에는 `--g2-feedback-currentness` 읽기 전용 진입점이 있다.
`g2_feedback.currentness_transport`의 exact path/hash가 고정한 로컬 파이프를 사용한다.
server SID는 설치 SENDER와 같고 client SID는 달라야 하며 Python·helper 코드도 설치
pin과 일치해야 한다. 이 진입점은 publish나 index 철회를 호출하지 않는다.

파이프를 열기 전에 읽기 전용 워밍업을 수행한다. 요청 중에는 현재 source·grant·role·
review·journal·파일 검사를 유지하면서 같은 요청의 중복 설치/ACL 관측만 재사용한다.
요청 시작과 끝의 전체 설치 검증·새 ACL 관측·파일 identity 대조가 모두 같아야 응답한다.
다른 요청으로 권한을 재사용하지 않는다. 작은 idle 검사는 descriptor·만료만 확인한다.
응답 만료는 자료·권한·profile·transport의 가장 이른 기한을 넘지 않는다. 종료에서는
파이프와 원본 callback이 모두 끝난 뒤 import 보호를 해제한다. 불명 callback은 종료
성공으로 보고하지 않는다. 실제 계정 간 정상 연결과 5초 응답 성능은 아직 미검증이다.

## 검증과 backup 인계

focused Python tests는 실제 E14 kit를 사용한다. `g2_feedback_publisher.test.mjs`의 설치
관통은 명시된 test-only Python/kit 경로가 있어야 실행되며 없으면 해당 case를 skip한다.
테스트 fixture만 임시 test key/review/permit를 만들고 운영 code closure에는 들어가지 않는다.
실제 Python/kit/copied modules를 사용하되 OS observer/role identity는 합성이며,
전체 byte-set 검증 비용을 감안한 긴 synthetic validity window는 운영 TTL 설정이 아니다.

backup owner의 `README.md` §New HPP data surfaces에 따라 다음을 별도 분류·결속해야 한다:

| 데이터 | 분류/보존 조건 |
|---|---|
| prepared_root | 비공개 candidate custody; random packet IDs와 exact review binding 때문에 byte 보존 필요 |
| control_root | 필수 runtime control state; permit 소비/journal과 pending/current receipts를 한 closed generation으로 보존 |
| projection_root | reviewed byte artifacts + 재구축 가능한 current locator; locator만 복구해서는 release 권한이 되지 않음 |
| review/permit/public-key/profile/grant pins | 기존 protected authority/config owner가 보존; 새 backup이 signing key를 가져오지 않음 |
| 실행 code/dependencies | 기존 Pack/설치 generation owner; 데이터 snapshot과 분리 |

writer가 멈추고 lease/DB writer가 없는 closed generation만 snapshot하거나 기존 SQLite logical
backup을 사용한다. runtime DB를 실행 중인 채 파일 복사하지 않는다. 합성 격리 복구는 artifact
hash와 consumed attempt parity 및 손상 탐지를 확인한다. 실제 restore의 새 경로·ACL·epoch·
receiver/control-root binding·current revocation을 다시 검증하기 전에는 활성화하지 않는다.
비어 있거나 부분 복원된 state에서 old permit를 재사용하지 않는다. NAS/RPO/RTO·사람 수락·
backup 활성화는 이 테스트의 주장이 아니다.

제품 sole writer가 README/CHANGELOG, secure-work 설치의 새 Node/Python import closure,
위 data ownership/backup 분류, 실제 인증된 currentness transport와 issuer hook를 통합한다.
새 공통 schema/manifest 등록·서비스 기동·키 배치·운영 profile 승격은 이 code candidate에 없다.
