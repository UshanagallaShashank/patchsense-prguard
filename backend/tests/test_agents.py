"""Unit tests for all specialist agents and the orchestrator."""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

SAMPLE_DIFF = """\
diff --git a/app/auth.py b/app/auth.py
index 1234567..abcdefg 100644
--- a/app/auth.py
+++ b/app/auth.py
@@ -10,6 +10,8 @@ import os
+SECRET_KEY = "hardcoded_secret_123"
+cursor.execute("SELECT * FROM users WHERE name='" + username + "'")
"""

PERF_DIFF = """\
diff --git a/app/reports.py b/app/reports.py
@@ -5,4 +5,6 @@
+for user in users:
+    orders = db.query(Order).filter_by(user_id=user.id).all()
"""

STYLE_DIFF = """\
diff --git a/app/utils.py b/app/utils.py
@@ -1,3 +1,6 @@
+def p(x, y, z):
+    if x:
+        if y:
+            return x + y + z
"""


def _make_llm_response(findings: list[dict]) -> MagicMock:
    mock = MagicMock()
    mock.content = json.dumps(findings)
    return mock


# ── security agent ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_security_agent_returns_findings():
    expected = [{"file_path": "app/auth.py", "line_number": 11, "severity": "critical",
                 "message": "Hardcoded secret", "suggestion": "Use env var"}]
    with patch("app.agents.security_agent._llm") as mock_llm:
        mock_llm.ainvoke = AsyncMock(return_value=_make_llm_response(expected))
        from app.agents.security_agent import run_security_agent
        result = await run_security_agent(SAMPLE_DIFF)
    assert len(result) == 1
    assert result[0]["agent"] == "security"
    assert result[0]["severity"] == "critical"


@pytest.mark.asyncio
async def test_security_agent_empty_diff_returns_empty():
    with patch("app.agents.security_agent._llm") as mock_llm:
        mock_llm.ainvoke = AsyncMock(return_value=_make_llm_response([]))
        from app.agents.security_agent import run_security_agent
        result = await run_security_agent("")
    assert result == []


@pytest.mark.asyncio
async def test_security_agent_invalid_json_returns_empty():
    mock_resp = MagicMock()
    mock_resp.content = "No issues found in this diff."
    with patch("app.agents.security_agent._llm") as mock_llm:
        mock_llm.ainvoke = AsyncMock(return_value=mock_resp)
        from app.agents.security_agent import run_security_agent
        result = await run_security_agent(SAMPLE_DIFF)
    assert result == []


# ── performance agent ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_performance_agent_returns_findings():
    expected = [{"file_path": "app/reports.py", "line_number": 6, "severity": "high",
                 "message": "N+1 query in loop", "suggestion": "Use joinedload"}]
    with patch("app.agents.performance_agent._llm") as mock_llm:
        mock_llm.ainvoke = AsyncMock(return_value=_make_llm_response(expected))
        from app.agents.performance_agent import run_performance_agent
        result = await run_performance_agent(PERF_DIFF)
    assert result[0]["agent"] == "performance"
    assert result[0]["severity"] == "high"


@pytest.mark.asyncio
async def test_performance_agent_empty_returns_empty():
    with patch("app.agents.performance_agent._llm") as mock_llm:
        mock_llm.ainvoke = AsyncMock(return_value=_make_llm_response([]))
        from app.agents.performance_agent import run_performance_agent
        result = await run_performance_agent("")
    assert result == []


# ── style agent ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_style_agent_returns_findings():
    expected = [{"file_path": "app/utils.py", "line_number": 1, "severity": "medium",
                 "message": "Function 'p' is not descriptive", "suggestion": "Rename"}]
    with patch("app.agents.style_agent._llm") as mock_llm:
        mock_llm.ainvoke = AsyncMock(return_value=_make_llm_response(expected))
        from app.agents.style_agent import run_style_agent
        result = await run_style_agent(STYLE_DIFF)
    assert result[0]["agent"] == "style"
    assert result[0]["severity"] == "medium"


# ── orchestrator ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_orchestrator_fans_out_to_all_agents():
    sec = [{"file_path": "a.py", "line_number": 1, "severity": "critical", "message": "sec", "suggestion": "fix", "agent": "security"}]
    perf = [{"file_path": "b.py", "line_number": 2, "severity": "high", "message": "perf", "suggestion": "fix", "agent": "performance"}]
    style = [{"file_path": "c.py", "line_number": 3, "severity": "medium", "message": "style", "suggestion": "fix", "agent": "style"}]

    with (
        patch("app.agents.orchestrator.run_security_agent", AsyncMock(return_value=sec)),
        patch("app.agents.orchestrator.run_performance_agent", AsyncMock(return_value=perf)),
        patch("app.agents.orchestrator.run_style_agent", AsyncMock(return_value=style)),
    ):
        from app.agents.orchestrator import run_all_agents
        result = await run_all_agents("any diff")

    assert len(result) == 3
    severities = [r["severity"] for r in result]
    assert severities == sorted(severities, key=lambda s: ["critical", "high", "medium", "info"].index(s))


@pytest.mark.asyncio
async def test_orchestrator_handles_agent_exception():
    with (
        patch("app.agents.orchestrator.run_security_agent", AsyncMock(side_effect=RuntimeError("LLM down"))),
        patch("app.agents.orchestrator.run_performance_agent", AsyncMock(return_value=[])),
        patch("app.agents.orchestrator.run_style_agent", AsyncMock(return_value=[])),
    ):
        from app.agents.orchestrator import run_all_agents
        result = await run_all_agents("diff")
    assert result == []


# ── deduplicator ──────────────────────────────────────────────────────────────

def test_deduplicator_removes_exact_duplicates():
    from app.agents.deduplicator import deduplicate_findings
    findings = [
        {"file_path": "a.py", "line_number": 1, "message": "same", "severity": "high", "agent": "security", "suggestion": "fix"},
        {"file_path": "a.py", "line_number": 1, "message": "same", "severity": "high", "agent": "performance", "suggestion": "fix"},
    ]
    result = deduplicate_findings(findings)
    assert len(result) == 1


def test_rank_findings_orders_by_severity():
    from app.agents.deduplicator import rank_findings
    findings = [
        {"severity": "info", "file_path": "a.py", "line_number": 1, "message": "x", "agent": "style", "suggestion": ""},
        {"severity": "critical", "file_path": "b.py", "line_number": 2, "message": "y", "agent": "security", "suggestion": ""},
        {"severity": "medium", "file_path": "c.py", "line_number": 3, "message": "z", "agent": "style", "suggestion": ""},
    ]
    ranked = rank_findings(findings)
    assert ranked[0]["severity"] == "critical"
    assert ranked[-1]["severity"] == "info"
