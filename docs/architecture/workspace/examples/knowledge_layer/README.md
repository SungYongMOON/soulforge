# 지식 층 공개 합성 자료

두 가상 과제 SYN-A/SYN-B의 메일·회의 전사·문서 6개와 질문 6개다.
실제 업무 원문·신원·경로를 포함하지 않는다. K0의 제목만 읽는 baseline과
원문 전체를 읽는 reference는 평가 배선 확인용이며 실제 봇 성능이 아니다.
정답 키는 개발 평가 전용이다. 생성 모델/운영 모듈에 전달하지 않는다.

`model_roles.json`은 기본(전 과제 전송 금지) placeholder다. `model_roles.
offhost_example.json`은 가상 과제 `PROJECT_PLACEHOLDER` 하나에 `wiki_draft`
off-host 전송을 명시적으로 허가한 변형이며, `harness/knowledge_layer_real_wiki.mjs`의
`--model-roles` 계약(모델/엔드포인트/과제 코드 전부 placeholder)을 보여주는 예시일
뿐 실제 모델 endpoint(`.invalid` 예약 도메인)나 실제 과제가 아니다.
