# G2 Linear exact-custody reader

이 조각은 현재 committed Linear revision을 기존 `SOURCE` controller에게만 읽어 주는
내부 어댑터다. 별도 [G2 feedback publisher](G2_FEEDBACK_PUBLISHER.md)가 exact released
bytes 발행을 담당한다. 이 reader 자체는 발행하거나 G1 실행 권한을 만들지 않는다.
실자료·모델·네트워크·설치·운영 활성화 시험은 수행하지 않았다.

## 구현 범위

- `g2_linear_custody_reader.mjs`는 기존 `createLinearReadEvidenceReader`로 committed
  receipt, collection freshness, source/scope/hash/generation을 확인한다.
- 기존 `loadExecutionAuthority`의 `jobs.advance`를 사용한다. 새 역할·권한은 없다.
  `purpose=SOURCE`, 고정 producer, project 및 `linear.task:<identifier>`가 일치해야
  한다. author-provided role 문자열은 운영 CLI의 권한 입력이 아니다.
- raw read 전후 같은 authority와 observation을 재검사한다. immutable issue wrapper의
  schema/kind/id/identifier/updated_at 및 canonical object SHA를 검증한다. collector의
  `canonicalBytes(wrapper)`와 파일 bytes도 완전히 같아야 하므로 duplicate key나
  비정규 추가 bytes를 반환하지 않는다. 파일 SHA와
  canonical object SHA를 혼동하지 않는다. 일반 단일-link 파일과 최대 byte 수만 허용한다.
- `read()`는 exact collector wrapper Buffer를 로컬 caller에게만 반환한다. source가
  바뀌면 old selection을 거부한다. 반환 뒤 시간이 지난 caller는 사용 직전 `current()`를
  다시 확인해야 한다. 이미 반환한 bytes를 원격으로 회수한다는 보장은 없다.
- `current()`는 원문을 읽지 않으며 metadata와 현재 controller 권한만 재검사한다.
  collection polling은 hard delete 부재를 증명하지 못한다는 기존 한계가 유지된다.

## 고정 입력 실행면

기존 `sfx.mjs --g2-custody-inspect`는 immutable installation anchor 검증과 import
closure guard를 통과한 뒤 실제 authority/metadata/custody ports를 조립한다. 원문은
출력하지 않고 source digest/generation과 `G2_FEEDBACK_MAPPING_UNBOUND`만 반환한다.
읽은 Buffer를 정리하지만 JavaScript parser 전체 heap의 안전 소거를 주장하지 않는다.
source checkout의 기존 sfx anchor는 비어 있으므로 실행은 exit 2로 거절된다.
새 handler를 직접 실행해도 거절한다. 별도의 설치 launcher/anchor는 없다.

운영 연결은 이번 변경에 포함되지 않는다. sole installer가 기존 protected config에
다음 `g2_linear_custody` 입력을 고정하고 전체 import closure를 봉인해야 한다:

| 입력 | 의미 |
|---|---|
| `expectedBinding` | 기존 Linear metadata reader의 exact custody/state/source/scope pins |
| `producerRef` | 기존 SOURCE controller의 exact principal ref |
| `maxAgeMs`, `maximumBytes` | 기존 증거 freshness와 custody file 최대 크기 |
| `selection` | SHA가 고정된 JSON descriptor; issue_id, issue_content_sha256, scope_ref, generation_seq만 포함 |

임의 argv/env 설정이나 synthetic 실행 모드는 없다. `inspect`는 G2 local model 호출,
job creation, field approval, permit, transport, projection/index write를 하지 않는다.
selection descriptor는 source 권한 자체가 아니며 별도 현재 controller 권한이 필수다.

## 왜 publisher를 연결하지 않았는가

`engine.py:Lane._prepare_wire()`는 `{"packet": WorkPacket, "released_history": []}`를
최종 request로 만들고 `scripted.subprocess` route를 고정한다. `_current_dispatch()`는
그 동일 request, packet, route, source bundle, field review, policy/permit을 재검증한다.
기존 feedback consumer는 별도의 13-field projection JSON을 요구한다.
WorkPacket request 승인 뒤 feedback JSON으로 바꾸면 승인된 bytes가 바뀐다.
`public_safe_code`라는 model label은 이 간극을 메우지 않는다.

이 reader에는 승인된 WorkPacket→feedback mapping, G1 recipient audience, final feedback
bytes의 release binding이 없다. 별도 publisher가 승인 전 exact feedback codec과 receiver를
결속한다. reader의 inspect는 계속 projection/index 생성·갱신·무효화를 수행하지 않는다.
이 reader의 통과는 source 접근 이외의 권한, G1 execution 또는 publication을 만들지 않는다.

## 검증 및 통합 인계

`node --test guild_hall/secure_work/tests/g2_linear_custody.test.mjs`는 합성 committed
metadata와 custody, 실제 authority parser(합성 OS observer), source 변경·stale·revoked
authority·wrong issue/hash/scope/task/generation·partial collection·변조·hardlink 거부를
확인한다. positive는 custody read까지이며 released projection→issuer end-to-end는 없다.
검증된 임시 설치 사본의 실제 sfx 분기에서 reader까지 실행하는 테스트도 포함한다.
이때 OS observer·runtime/kit 파일은 합성이며 실제 설치나 interpreter 실행은 아니다.
`npm run validate:secure-work`가 이 파일 이름의 테스트를 기존 glob으로 실행한다.

공유 validator/schema/authority/Pack 변경은 없다. parent가 허용한 기존 `sfx.mjs`의
한정 분기만 추가했으며 다른 operation의 의미는 유지한다. sole integrator의 남은 작업은
이 문서의 README link와 CHANGELOG 동기화, 향후 승인된 source-audience mapping 검토다.
현재 reader는 영속 data surface를 만들지 않으므로 새 backup class가 없다. 향후 publisher의
immutable projections, atomic current index, release evidence 및 generation/revocation state는
별도 backup/restore 분류와 synthetic restore gate가 필요하다.
