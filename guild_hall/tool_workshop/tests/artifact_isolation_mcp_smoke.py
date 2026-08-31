"""Direct stdio smoke for the public synthetic artifact-isolation MCP."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


SERVER = Path(__file__).resolve().parents[1] / "fixtures" / "artifact_isolation_mcp.py"


async def main() -> None:
    params = StdioServerParameters(command=sys.executable, args=[str(SERVER)])
    async with stdio_client(params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream, read_timeout_seconds=10) as session:
            await session.initialize()
            tools = await session.list_tools()
            names = sorted(tool.name for tool in tools.tools)
            assert names == [
                "get_artifact_state",
                "submit_candidate_receipt",
                "verify_manifest",
            ]

            state = await session.call_tool(
                "get_artifact_state",
                {"project_ref": "PROJECT-A", "artifact_ref": "ART-A-PPT-001"},
            )
            candidate = await session.call_tool(
                "submit_candidate_receipt",
                {
                    "project_ref": "PROJECT-A",
                    "artifact_ref": "ART-A-PPT-001",
                    "parent_revision": "R0001",
                    "change_request_ref": "CR-A-001",
                },
            )
            verified = await session.call_tool(
                "verify_manifest",
                {
                    "project_ref": "PROJECT-B",
                    "artifact_ref": "ART-B-PPT-001",
                    "parent_revision": "R0001",
                    "observed_marker": "BRAVO-SLIDE",
                },
            )

            payloads = []
            for result in (state, candidate, verified):
                assert result.is_error is False
                text = next(item.text for item in result.content if item.type == "text")
                payloads.append(json.loads(text))

            assert payloads[0]["marker"] == "ALPHA-SLIDE"
            assert payloads[1]["claim"] == "workshop_output_candidate_only"
            assert payloads[2]["verdict"] == "PASS"
            assert all(item["effect_count"] == 0 for item in payloads)
            print(json.dumps({"ok": True, "tools": names, "effects": 0}, sort_keys=True))


if __name__ == "__main__":
    asyncio.run(main())
