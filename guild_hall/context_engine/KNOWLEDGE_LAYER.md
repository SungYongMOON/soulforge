# 자동 정리본 지식 층

Owner 방향에 따라 Neo4j와 주입식 보존 파일을 사용하는 자동 정리본 모듈을 단계적으로 만든다.
기존 처리 경로에 자동 연결하지 않는다. Rune와 정본 승격은 후속 별도 소비 경로다.

현재 K0: 공개 합성 2과제·3원천·6질문을 기존 answer_eval로 평가한다.
`node guild_hall/context_engine/harness/knowledge_layer_eval.mjs`는 제목 baseline과 원문 reference의
배선 점수를 출력한다. 실제 모델 품질·그래프 기여·운영 완료를 뜻하지 않는다.
검사: `npm run validate:knowledge-layer`. 새 시험은 done:check 양쪽 목록에 포함된다.

## K1 승인 근거 연결

`linkApprovedUnits({project_ref,units,grant,now})`는 caller가 이미 승인한 목록만 처리한다.
grant는 project_ref/grant_id/epoch/expires_at/units를 가지며 각 허용 unit은 unit_id,
exact source_revision_ref 4필드, locator, text_sha256으로 고정한다. unit에는 source_kind
(mail/voice/document), 원문 text와 해시, occurred_at/known_at을 보존한다. 시각은 UTC 밀리초 ISO다.
완전한 목록만 받으며 일부 생략·중복·과제 혼입·판본/해시/locator 변조·만료는 전체 거부한다.
결과는 불변 source_digest·span binding·원문 단위·coverage다. 빈 목록은 삭제 지시가 아니다.
파일/네트워크/DB를 읽거나 source 승인을 발급하지 않는다. grant는 신뢰된 caller의 승인 증언이다.
전체 source bytes hash는 보존만 하며 실제 검사하는 것은 제공된 unit text의 UTF-8 hash다.
