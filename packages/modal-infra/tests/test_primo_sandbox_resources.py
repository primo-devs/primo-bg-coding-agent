"""Primo regression: Core sandboxes keep Modal's default runtime and resources."""

from unittest.mock import AsyncMock

import pytest

from src.sandbox.manager import SandboxConfig, SandboxManager
from src.sandbox.tunnels import SandboxTunnels, TunnelUrls


def _fake_create(captured: dict):
    async def fake_create_aio(*args, **kwargs):
        captured["kwargs"] = kwargs

        class FakeSandbox:
            object_id = "obj-1"
            stdout = None

        return FakeSandbox()

    fake_create_aio.aio = fake_create_aio
    return fake_create_aio


@pytest.mark.asyncio
async def test_core_keeps_modal_defaults_unless_settings_ask_otherwise(monkeypatch):
    captured: dict = {}
    monkeypatch.setattr("src.sandbox.launch.modal.Sandbox.create", _fake_create(captured))
    monkeypatch.setattr(
        SandboxTunnels,
        "resolve",
        AsyncMock(return_value=TunnelUrls(None, None, None, None)),
    )

    manager = SandboxManager()
    await manager.create_sandbox(
        SandboxConfig(
            clone_host="github.com",
            clone_username="x-access-token",
            repo_owner="primo-devs",
            repo_name="core",
            settings={"cpuCores": 3, "memoryMib": 6144},
        )
    )

    assert captured["kwargs"]["cpu"] == 3.0
    assert captured["kwargs"]["memory"] == 6144
    assert "experimental_options" not in captured["kwargs"]
