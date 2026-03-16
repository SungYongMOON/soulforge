# runtime

- 무엇을 둔다: unit assembly, execution contract, sandbox boundary template.
- 무엇을 두지 않는다: raw session transcript, project-local run artifact, secret material.
- 왜 이렇게 둔다: runtime 은 active unit 조립 책임이므로 catalog 와 mission site 에서 분리한다.
