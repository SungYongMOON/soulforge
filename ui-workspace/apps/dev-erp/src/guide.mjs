// 가이드형 워크플로우 (run13): "폴더트리가 곧 위저드"
// 출처: .registry/skills/se_foldertree_generate SE_FolderTree_Guide v0.7
//   - 1원칙 "폴더 순서 = 업무 순서"
//   - 산출물 내부: 템플릿스냅샷 → 원자료 → Work → Review → Action → Out(완료판정) → Quality
export const SE_STAGES = [
  { code: "030", id: "SRR", b: "체계요구사항검토 (SRR)", f: "1층 관문 (SRR)" },
  { code: "060", id: "SFR", b: "체계기능검토 (SFR)", f: "2층 관문 (SFR)" },
  { code: "090", id: "PDR", b: "기본설계검토 (PDR)", f: "3층 관문 (PDR)" },
  { code: "120", id: "CDR", b: "상세설계검토 (CDR)", f: "4층 관문 (CDR)" },
  { code: "150", id: "TRR_DT", b: "시험준비검토 (TRR/DT)", f: "5층 관문 (TRR)" },
  { code: "180", id: "FCA_OT", b: "기능형상확인 (FCA/OT)", f: "6층 관문 (FCA)" },
  { code: "210", id: "PCA", b: "물리형상확인 (PCA)", f: "7층 관문 (PCA)" },
  { code: "240", id: "LL", b: "교훈정리 (LL)", f: "원정 회고 (LL)" }
];

// 산출물 표준 절차 — SE 폴더 규칙의 역할 폴더 순서 그대로
export const ARTIFACT_FLOW = [
  { key: "snapshot", b: "템플릿 스냅샷 확보", f: "지도 사본 확보", hint: "00_Temp/template_snapshot — 라이브러리 양식을 과제로 고정" },
  { key: "sources", b: "원자료 수집", f: "재료 수집", hint: "원자료/ — 받은 파일을 모은다 (원본 변형 금지)" },
  { key: "draft", b: "초안 작성 (Work)", f: "초벌 제작", hint: "Work/ — 초안·진행본. 파생자료는 파생자료/ 에" },
  { key: "review", b: "검토와 근거 (Review)", f: "심사", hint: "Review/ — 검토 요청, 코멘트, 근거를 남긴다" },
  { key: "action", b: "조치 반영 (Action)", f: "벼리기", hint: "조치/ — 검토 지적을 반영하고 기록" },
  { key: "final", b: "최종본 확정 (Out)", f: "완성품 봉인", hint: "Out/ — 완료판정 기준. 최종/승인본만" },
  { key: "quality", b: "품질 증빙 (Quality)", f: "인장 날인", hint: "Quality/ — 품질 증빙을 둔다" }
];

export function guideTemplates(mode = "business") {
  const k = mode === "fantasy" ? "f" : "b";
  return {
    stages: SE_STAGES.map((s) => ({ code: s.code, id: s.id, name: s[k] })),
    flow: ARTIFACT_FLOW.map((s) => ({ key: s.key, name: s[k], hint: s.hint }))
  };
}

// P-13 작성법 위저드 — 문서 종류별 '작성 방법(절차)'. ARTIFACT_FLOW 7스텝 재사용, 읽기 전용 안내.
export const DOC_RECIPES = [
  {
    key: "meeting_minutes", b: "회의록", f: "원탁 기록",
    required_input: [{ b: "안건", f: "안건" }, { b: "참석자", f: "참석자" }, { b: "결정사항", f: "결의" }],
    steps: ARTIFACT_FLOW.map((s) => ({ flow_key: s.key, name_b: s.b, name_f: s.f, tip_b: s.hint, tip_f: s.hint }))
  }
];
export function docRecipes(mode = "business") {
  const k = mode === "fantasy" ? "f" : "b";
  return DOC_RECIPES.map((r) => ({
    key: r.key, name: r[k],
    required_input: r.required_input.map((x) => x[k]),
    steps: r.steps.map((s) => ({ flow_key: s.flow_key, name: k === "f" ? s.name_f : s.name_b, tip: k === "f" ? s.tip_f : s.tip_b }))
  }));
}
