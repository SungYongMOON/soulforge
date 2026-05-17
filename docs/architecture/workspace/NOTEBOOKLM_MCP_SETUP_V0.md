# NOTEBOOKLM_MCP_SETUP_V0

## 목적

- 이 문서는 다른 PC 에서 Soulforge 를 clone 한 뒤 `NotebookLM MCP` 를 다시 붙일 때 필요한 최소 bootstrap 절차를 잠근다.
- NotebookLM 은 tracked code 를 vendoring 하지 않고, 설치/검증/runbook 만 Soulforge 가 들고 간다.

## 핵심 원칙

1. 설치는 대상 PC 에서 다시 한다.
2. 인증 정보는 다른 PC 에서 복사하지 않는다.
3. `~/.codex/config.toml` MCP 등록은 대상 PC 의 실제 binary 경로를 쓴다. Unix shell 에서는 `which`, Windows PowerShell 에서는 `Get-Command` 로 확인한다.

## 기본 절차

```bash
uv tool install --force notebooklm-mcp-cli
which nlm
which notebooklm-mcp
nlm --version
notebooklm-mcp --help
nlm login
```

Windows PowerShell:

```powershell
uv tool install --force notebooklm-mcp-cli
Get-Command nlm
Get-Command notebooklm-mcp
nlm --version
notebooklm-mcp --help
nlm login
```

## Codex MCP 등록

`~/.codex/config.toml`

```toml
[mcp_servers.notebooklm-mcp]
command = "/실제/설치/경로/notebooklm-mcp"
```

## 경계

- tracked source: 이 문서와 multi-PC bootstrap 안내
- local-only: `~/.codex/config.toml`, `~/.notebooklm-mcp-cli/**`, 인증 세션, 브라우저 세션

## authority 경계

- NotebookLM / `nlm` / `notebooklm-mcp` 는 advisory research surface 이며 source authority, validation authority, owner approval, ontology acceptance, canon promotion 권한이 아니다.
- NotebookLM 출력은 source discovery lead 또는 advisory note 로만 기록한다. `source_supported`, `validated_private`, `canon_candidate`, `canon_entry` 같은 더 높은 claim 은 승인된 source ref, Soulforge validator/review evidence, owner decision 으로만 올린다.
- NotebookLM 이 만든 요약, podcast, report, slide, mind map, chat answer 를 public canon 에 복사하려면 먼저 private/raw payload 를 제거하고 public-safe claim ceiling 을 명시한다.

## 관련 경로

- [`MULTI_PC_DEVELOPMENT_V0.md`](../../../docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [`README.md`](../../../README.md)
