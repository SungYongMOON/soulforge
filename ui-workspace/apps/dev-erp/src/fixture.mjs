// TEST-001: 합성 fixture (실데이터 0). data_label='synthetic' 고정.
function dateKey(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

export function loadFixture(store) {
  const projects = [
    { id: "PRJ-A", title: "수신부 보드 개량", health: "watch", stage_current: "상세설계" },
    { id: "PRJ-B", title: "신호처리 모듈", health: "ok", stage_current: "시험" },
    { id: "PRJ-C", title: "사내 도구 정비", health: "risk", stage_current: "기획" }
  ];
  const people = [
    { id: "p-kim", name: "김가람", role: "회로" },
    { id: "p-lee", name: "이도윤", role: "펌웨어" },
    { id: "p-park", name: "박서연", role: "검증" },
    { id: "p-choi", name: "최하늘", role: "구매/업체" },
    { id: "p-jung", name: "정유진", role: "체계" },
    { id: "p-ai", name: "AI 유닛(오크 감사관)", role: "ai" }
  ];
  projects.forEach((p) => store.upsertProject(p));
  people.forEach((p) => store.upsertPerson(p));

  projects.forEach((p, pi) => {
    store.upsertStage({ id: `${p.id}-S1`, project_id: p.id, title: "준비", seq: 1, status: "cleared" });
    store.upsertStage({
      id: `${p.id}-S2`, project_id: p.id, title: p.stage_current, seq: 2,
      gate_rule: "필수 산출물 제출 + 검토 승인", status: "open"
    });
  });

  const titles = [
    "BOM 1차 정리", "전원부 검토 회신", "커넥터 선정", "노이즈 측정 계획",
    "업체 견적 비교", "시험 절차서 초안", "케이블 라벨 규칙 적용", "회의록 액션 정리",
    "라이브러리 풋프린트 확인", "발주 수량 확정"
  ];
  let n = 0;
  for (const p of projects) {
    for (let k = 0; k < 10; k += 1) {
      n += 1;
      const status = ["open", "doing", "waiting", "blocked", "done"][n % 5];
      store.upsertItem({
        id: `IT-${String(n).padStart(3, "0")}`,
        project_id: p.id,
        stage_id: `${p.id}-S2`,
        title: `${titles[k]} (${p.id})`,
        origin: ["mail", "schedule", "manual"][n % 3],
        spawn_kind: ["spawned", "fixed", "respawn"][n % 3],
        encounter_role: k === 9 ? "boss" : k % 4 === 3 ? "elite" : "normal",
        difficulty: (n % 5) + 1,
        urgency: n % 4 === 0 ? "high" : "normal",
        automation_level: ["manual", "assisted", "semi"][n % 3],
        assignee_ref: people[n % 5].id,
        status,
        due: status === "done" ? null : dateKey((n % 9) - 2),
        data_label: "synthetic"
      });
    }
  }

  for (let m = 1; m <= 50; m += 1) {
    const p = projects[m % 3];
    store.upsertMail({
      id: `MAIL-${String(m).padStart(3, "0")}`,
      project_id: p.id,
      at: new Date(Date.now() - m * 5400000).toISOString(),
      direction: m % 3 === 0 ? "out" : "in",
      subject: `[${p.id}] ${["견적 회신", "도면 검토 요청", "납기 일정 안내", "회의 일정 조율", "시험 결과 공유"][m % 5]} #${m}`,
      counterpart: ["A상사", "B테크", "C전자", "사내-체계팀"][m % 4],
      pointer_ref: `mailbox://synthetic/${m}`
    });
  }

  const kinds = ["bom", "schematic", "gerber", "report", "note"];
  for (let a = 1; a <= 30; a += 1) {
    const p = projects[a % 3];
    store.upsertArtifact({
      id: `ART-${String(a).padStart(3, "0")}`,
      project_id: p.id,
      kind: kinds[a % 5],
      title: `${p.id} ${kinds[a % 5].toUpperCase()} v${(a % 4) + 1}`,
      pointer: `_workspaces/${p.id}/outputs/sample_${a}`,
      sha256: `synthetic${String(a).padStart(4, "0")}`,
      updated_at: dateKey(-(a % 14))
    });
  }

  // 가이드(산출물 절차) 합성 시드 — 산출물 진행률 위젯/화면용. 진행률 다양화.
  const FLOW = ["snapshot", "sources", "draft", "review", "action", "final", "quality"];
  const guideSeed = [
    { project_id: "PRJ-A", stage_code: "상세설계", name: "체계요구사항명세서(SSRS)", done: 7 },
    { project_id: "PRJ-A", stage_code: "상세설계", name: "인터페이스 정의서(ICD)", done: 3 },
    { project_id: "PRJ-B", stage_code: "시험", name: "시험절차서(STP)", done: 5 },
    { project_id: "PRJ-B", stage_code: "시험", name: "시험결과보고서(STR)", done: 1 },
    { project_id: "PRJ-C", stage_code: "기획", name: "사업수행계획서(PMP)", done: 0 }
  ];
  for (const g of guideSeed) {
    store.addGuideArtifact(g.project_id, g.stage_code, g.name);
    const art = store.db.prepare("SELECT id FROM guide_artifact WHERE project_id=? AND stage_code=? AND name=?")
      .get(g.project_id, g.stage_code, g.name);
    if (art) for (let i = 0; i < g.done; i += 1) store.setGuideStep(art.id, FLOW[i], true, "fixture");
  }

  // 구매/발주 합성 시드 — 거래처 마스터 + 발주 체인(과제 N:N)
  const parties = [
    { id: "vendor-a", name: "A상사", kind: "vendor", contact: "a@ex.com" },
    { id: "vendor-b", name: "B테크", kind: "vendor", contact: "b@ex.com" },
    { id: "vendor-c", name: "C전자", kind: "vendor", contact: "c@ex.com" }
  ];
  parties.forEach((p) => store.upsertParty({ ...p, data_label: "synthetic" }));
  const purchaseSeed = [
    { id: "po-001", party_id: "vendor-a", title: "수신부 커넥터 발주", stage: "order", amount: 1250000, due: dateKey(7), projects: ["PRJ-A"] },
    { id: "po-002", party_id: "vendor-b", title: "신호처리 보드 견적", stage: "quote", amount: 3400000, due: dateKey(14), projects: ["PRJ-B", "PRJ-A"] },
    { id: "po-003", party_id: "vendor-c", title: "케이블 자재 입고", stage: "receive", amount: 480000, due: dateKey(-2), projects: ["PRJ-A"] },
    { id: "po-004", party_id: "vendor-a", title: "측정 장비 검수", stage: "inspect", amount: 9100000, due: dateKey(-5), projects: ["PRJ-B"] }
  ];
  for (const po of purchaseSeed) store.createPurchase({ ...po, created_by: "fixture", data_label: "synthetic" });

  // 연락처 마스터 합성 시드 (거래처/과제 링크)
  const contactSeed = [
    { id: "ct-001", name: "김상무", org: "A상사", role: "영업", email: "kim@a.com", phone: "010-0000-0001", party_id: "vendor-a", projects: ["PRJ-A"] },
    { id: "ct-002", name: "이과장", org: "B테크", role: "기술지원", email: "lee@b.com", party_id: "vendor-b", projects: ["PRJ-B", "PRJ-A"] },
    { id: "ct-003", name: "박책임", org: "사내-체계팀", role: "체계", email: "park@in.co", projects: ["PRJ-A"] }
  ];
  for (const c of contactSeed) store.createContact({ ...c, data_label: "synthetic" });

  // P3 재고/BOM/부품 합성 시드 (공유 마스터)
  const partsSeed = [
    { id: "pt-board", name: "수신부 보드", part_no: "BRD-001", type: "board", grp: "board", min_qty: 2 },
    { id: "pt-r1", name: "저항 10k", part_no: "R-10K", type: "resistor", grp: "passive", uom: "ea", min_qty: 100 },
    { id: "pt-c1", name: "캐패시터 100nF", part_no: "C-100N", type: "capacitor", grp: "passive", uom: "ea", min_qty: 100 },
    { id: "pt-ic1", name: "ADC IC", part_no: "IC-ADC", type: "ic", grp: "active", uom: "ea", min_qty: 10 },
    { id: "pt-conn", name: "커넥터 8핀", part_no: "CN-8", type: "connector", grp: "mech", uom: "ea", min_qty: 20 }
  ];
  partsSeed.forEach((p) => store.upsertPart({ ...p, data_label: "synthetic" }));
  const locs = [
    { id: "loc-wh", name: "본사 창고", kind: "warehouse" },
    { id: "loc-rack1", name: "랙 A", kind: "rack", parent_id: "loc-wh" },
    { id: "loc-bin1", name: "A-1-1", kind: "bin", parent_id: "loc-rack1" },
    { id: "loc-repair", name: "수리중", kind: "virtual", is_virtual: 1 }
  ];
  locs.forEach((l) => store.upsertLocation({ ...l, data_label: "synthetic" }));
  // 재고: 일부는 안전재고 미달(부족) 유도
  store.setStock("pt-board", "loc-bin1", 1);   // min 2 → 부족
  store.setStock("pt-r1", "loc-bin1", 350);    // min 100 → 충분
  store.setStock("pt-c1", "loc-bin1", 40);     // min 100 → 부족
  store.setStock("pt-ic1", "loc-bin1", 12);    // min 10 → 충분
  store.setStock("pt-ic1", "loc-repair", 5);   // 가상(수리중)=가용서 제외
  store.setStock("pt-conn", "loc-bin1", 8);    // min 20 → 부족
  // BOM: 보드 = R1×4, C1×6, IC1×1, CONN×1
  store.addBomEdge("pt-board", "pt-r1", 4, "R1-R4");
  store.addBomEdge("pt-board", "pt-c1", 6, "C1-C6");
  store.addBomEdge("pt-board", "pt-ic1", 1, "U1");
  store.addBomEdge("pt-board", "pt-conn", 1, "J1");
  // 과제 사용 링크
  store.linkPartProject("pt-board", "PRJ-A");
  store.linkPartProject("pt-ic1", "PRJ-A");

  // 챗봇 매뉴얼/FAQ 합성 시드 (로컬 검색용)
  const faqSeed = [
    { id: "faq-gate", topic: "게이트", question: "게이트는 어떻게 통과하나요", answer: "단계의 미완·차단 할 일이 0이고 산출물 절차가 끝나면 통과 가능합니다. 엄격(hard) 모드에서는 미충족 시 통과가 차단되며, 설정에서 경고(soft)로 바꿀 수 있습니다.", pointer: "mod:gates", keywords: "게이트,통과,단계,gate,hard,soft" },
    { id: "faq-widget", topic: "위젯", question: "홈 위젯은 어떻게 추가/정렬하나요", answer: "홈 좌측 ❙❙ 손잡이를 눌러 위젯 서랍을 열고 보드로 끌어다 놓습니다. 헤더를 끌어 이동, 우하단으로 크기 조절, 정렬·초기화 버튼으로 정돈합니다.", pointer: "home", keywords: "위젯,추가,정렬,초기화,드래그" },
    { id: "faq-purchase", topic: "구매", question: "발주는 어떤 단계로 진행되나요", answer: "요청→견적→발주→입고→검수→완료 순서입니다. 발주는 여러 과제에 연결할 수 있고 거래처별 거래이력으로 집계됩니다.", pointer: "mod:purchase", keywords: "발주,구매,견적,입고,검수,거래처" },
    { id: "faq-stock", topic: "재고", question: "재고 부족은 어떻게 판정하나요", answer: "부품의 안전재고(min)보다 가용 재고(가상 위치 제외 합계)가 적으면 부족으로 표시합니다. 외부 공급사 실시간 조회는 사용하지 않습니다.", pointer: "mod:stockwatch", keywords: "재고,부족,안전재고,부품,stock" }
  ];
  faqSeed.forEach((f) => store.upsertFaq({ ...f, data_label: "synthetic" }));

  store.appendEvent({
    actor_ref: "fixture", actor_kind: "system", kind: "ingest",
    note: "synthetic fixture loaded", used_refs: ["src/fixture.mjs"], data_label: "synthetic"
  });
  return store.counts();
}
