"""Primo's sandbox-creation guarantees, kept out of upstream's test modules.

Upstream's `test_build_sandbox.py` and `test_sandbox_resources.py` churn on
nearly every sync, so fork assertions live here instead — a file upstream will
never touch and git will never have to merge.
"""

from unittest.mock import AsyncMock

import pytest

from src.images.primo_overlay import PRIMO_SANDBOX_COMMAND
from src.sandbox.manager import SandboxConfig, SandboxManager


def _fake_create(captured: dict):
    """Fake `Sandbox.create` that records the argv and kwargs it was called with."""

    async def fake_create_aio(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs

        class FakeSandbox:
            object_id = "obj-primo-1"
            stdout = None

        return FakeSandbox()

    fake_create_aio.aio = fake_create_aio
    return fake_create_aio


@pytest.mark.asyncio
async def test_build_sandbox_starts_postgres_before_sandbox_runtime(monkeypatch):
    captured: dict = {}
    monkeypatch.setattr("src.sandbox.manager.modal.Sandbox.create", _fake_create(captured))

    await SandboxManager().create_build_sandbox(repo_owner="acme", repo_name="my-repo")

    assert captured["args"] == PRIMO_SANDBOX_COMMAND


@pytest.mark.asyncio
async def test_build_sandbox_for_core_uses_vm_runtime_with_ci_sized_resources(monkeypatch):
    captured: dict = {}
    monkeypatch.setattr("src.sandbox.manager.modal.Sandbox.create", _fake_create(captured))

    await SandboxManager().create_build_sandbox(repo_owner="primo-devs", repo_name="core")

    assert captured["kwargs"]["cpu"] == 2.0
    assert captured["kwargs"]["memory"] == 8192
    assert captured["kwargs"]["experimental_options"] == {"vm_runtime": True}


@pytest.mark.asyncio
async def test_session_sandbox_starts_postgres_before_sandbox_runtime(monkeypatch):
    captured: dict = {}
    monkeypatch.setattr("src.sandbox.manager.modal.Sandbox.create", _fake_create(captured))
    monkeypatch.setattr(
        SandboxManager,
        "_resolve_and_setup_tunnels",
        AsyncMock(return_value=(None, None, None)),
    )

    await SandboxManager().create_sandbox(SandboxConfig(repo_owner="acme", repo_name="my-repo"))

    assert captured["args"] == PRIMO_SANDBOX_COMMAND


@pytest.mark.asyncio
async def test_session_sandbox_for_core_lets_explicit_resources_override_vm_defaults(monkeypatch):
    captured: dict = {}
    monkeypatch.setattr("src.sandbox.manager.modal.Sandbox.create", _fake_create(captured))
    monkeypatch.setattr(
        SandboxManager,
        "_resolve_and_setup_tunnels",
        AsyncMock(return_value=(None, None, None)),
    )

    await SandboxManager().create_sandbox(
        SandboxConfig(
            repo_owner="primo-devs",
            repo_name="core",
            settings={"cpuCores": 3, "memoryMib": 6144},
        )
    )

    assert captured["kwargs"]["cpu"] == 3.0
    assert captured["kwargs"]["memory"] == 6144
    assert captured["kwargs"]["experimental_options"] == {"vm_runtime": True}
