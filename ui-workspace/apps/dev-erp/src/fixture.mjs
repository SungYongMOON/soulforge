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

  store.appendEvent({
    actor_ref: "fixture", actor_kind: "system", kind: "ingest",
    note: "synthetic fixture loaded", used_refs: ["src/fixture.mjs"], data_label: "synthetic"
  });
  return store.counts();
}
