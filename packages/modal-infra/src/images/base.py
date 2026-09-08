"""Thin Modal adapter for the shared, baked sandbox installation bundle."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import modal

from sandbox_runtime.runtime_manifest import RUNTIME_VERSION

<<<<<<< HEAD
from .primo_overlay import apply_primo_overlay

# Get the path to the sandbox runtime code (provider-agnostic)
SANDBOX_RUNTIME_DIR = Path(sandbox_runtime.__file__).parent

# OpenCode version to install.
#
# OpenCode restored `/event` stream context in 1.14.50 and fixed the remaining
# eager-subscription race in 1.15.5. Keep the CLI and plugin on the same pin.
#
# Never pin below 1.18.15: OpenCode's message-ID counter is a 48-bit truncation
# of `Date.now() * 0x1000`, so it wraps roughly every 795 days (most recently
# 2026-08-14) and IDs minted afterwards sort below every older one. Earlier
# releases order the turn loop by comparing those IDs as strings, which makes
# any session carrying pre-wraparound history exit the loop without calling the
# model. 1.18.15 orders by message creation time instead.
OPENCODE_VERSION = "1.18.18"

# code-server version to install (pinned for reproducible images)
CODE_SERVER_VERSION = "4.109.5"

# agent-browser version to install (pinned for reproducible images)
AGENT_BROWSER_VERSION = "0.21.2"

# ttyd version to install (pinned for reproducible images)
TTYD_VERSION = "1.7.7"
TTYD_SHA256 = "8a217c968aba172e0dbf3f34447218dc015bc4d5e59bf51db2f2cd12b7be4f55"

# Cache buster - change this to force Modal image rebuild.
# The numeric generation is one sequence shared by every image-build provider,
# and MIN_REBUILD_RUNTIME_VERSION gates which prebuilt images get rebuilt onto
# it, so bump every provider's label together.
# v59: OpenCode past the message-ID wraparound (see OPENCODE_VERSION)
# v60: generic provider-account token broker plugin
# v61: account/init helpers and /usr/sbin on PATH
=======
>>>>>>> upstream/main
CACHE_BUSTER = RUNTIME_VERSION
IMAGE_ID_ENV = "OPENINSPECT_MODAL_BASE_IMAGE_ID"


def local_image_plan() -> tuple[Path, dict[str, Any]]:
    """Build-only imports must never execute inside deployed Modal functions."""
    root = Path(__file__).resolve().parents[4]
    sys.path.insert(0, str(root / "packages/sandbox-images/src"))
    from sandbox_images.bundle import pack_bundle

    bundle = pack_bundle(root, "modal", root / ".cache/sandbox-images")
    plan = json.loads((bundle / "build-config.json").read_text())
    return bundle, plan


def image_reference_path() -> Path:
    return Path(__file__).resolve().parents[2] / ".cache/sandbox-image.json"


def deployed_image_environment() -> dict[str, str]:
    """Bridge the eager image build to function deployment; never upload build tools."""
    if not modal.is_local():
        image_id = os.environ.get(IMAGE_ID_ENV)
        if not image_id:
            raise RuntimeError("Deployed Modal function is missing its verified sandbox image ID")
        return {IMAGE_ID_ENV: image_id}
    path = image_reference_path()
    if not path.is_file():
        raise RuntimeError("Build the Modal sandbox image before deploying functions")
    record = json.loads(path.read_text())
    _bundle, plan = local_image_plan()
    if record["buildHash"] != plan["buildHash"]:
        raise RuntimeError("Built Modal image is stale; rebuild before deploying functions")
    image_id = record.get("imageId")
    if not isinstance(image_id, str) or not image_id.strip():
        raise RuntimeError("Built Modal image record is missing its verified sandbox image ID")
    return {IMAGE_ID_ENV: image_id}


def _define_image() -> modal.Image:
    if not modal.is_local():
        image_id = os.environ.get(IMAGE_ID_ENV)
        if not image_id:
            raise RuntimeError("Deployed Modal function is missing its verified sandbox image ID")
        return modal.Image.from_id(image_id)
    bundle, plan = local_image_plan()
    return (
        modal.Image.from_registry(plan["target"]["base"])
        .add_local_dir(str(bundle), "/tmp/openinspect-image", copy=True)
        .run_commands("bash /tmp/openinspect-image/packages/sandbox-images/install/install.sh")
        .env(plan["runtimeEnv"] | {"SANDBOX_VERSION": RUNTIME_VERSION})
        .workdir("/workspace")
    )
<<<<<<< HEAD
    # Install GitHub CLI (for agent-direct GitHub interaction via gh API)
    .run_commands(
        "curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg"
        " | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg",
        "echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg]"
        " https://cli.github.com/packages stable main'"
        " > /etc/apt/sources.list.d/github-cli.list",
        "apt-get update && apt-get install -y gh && rm -rf /var/lib/apt/lists/*",
    )
    # Install Node.js 22 LTS
    .run_commands(
        # Add NodeSource repository for Node.js 22
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y nodejs",
        # Verify installation
        "node --version",
        "npm --version",
    )
    # Install pnpm and Bun
    .run_commands(
        # Install pnpm globally
        "npm install -g pnpm@latest",
        "pnpm --version",
        # Install Bun
        "curl -fsSL https://bun.sh/install | bash",
        # Add Bun to PATH for subsequent commands
        'echo "export BUN_INSTALL="$HOME/.bun"" >> /etc/profile.d/bun.sh',
        'echo "export PATH="$BUN_INSTALL/bin:$PATH"" >> /etc/profile.d/bun.sh',
    )
    # Install Python tools
    .pip_install(
        "uv",
        "httpx",
        "websockets",
        "pydantic>=2.0",  # Required for sandbox types
        "PyJWT[crypto]",  # For GitHub App token generation (includes cryptography)
    )
    # Install OpenCode CLI and plugin for custom tools
    # CACHE_BUSTER is embedded in a no-op echo so Modal invalidates this layer on bump.
    .run_commands(
        f"echo 'cache: {CACHE_BUSTER}' > /dev/null",
        f"npm install -g opencode-ai@{OPENCODE_VERSION}",
        "opencode --version || echo 'OpenCode installed'",
        # Install @opencode-ai/plugin globally for custom tools
        # This ensures tools can import the plugin without needing to run bun add
        f"npm install -g @opencode-ai/plugin@{OPENCODE_VERSION} zod",
    )
    # Pre-build OpenCode plugin deps into a staging directory.
    # At boot, _install_tools() copies these into .opencode/ so that
    # OpenCode's Npm.install() finds package-lock.json in sync and skips
    # the slow arborist reify() call (2-22s) that would otherwise block
    # the first prompt and exceed the bridge's HTTP timeout.
    #
    # Also bake the same tree into OpenCode's GLOBAL config dir. OpenCode installs
    # @opencode-ai/plugin into every config directory it discovers — including the
    # global one (HOME=/root, so ~/.config/opencode), which it creates empty on
    # startup — so without this the runtime _seed_global_opencode_deps() pays a
    # multi-second node_modules copy on every boot. Baking it makes that seed a
    # no-op (it skips when node_modules already exists). See #767 / #790.
    .run_commands(
        "mkdir -p /app/opencode-deps",
        # Pin staged plugin to OPENCODE_VERSION so the pre-staged tree copied
        # into .opencode/ at boot matches the globally installed plugin (#567).
        f'echo \'{{"name":"opencode-tools","type":"module",'
        f'"dependencies":{{"@opencode-ai/plugin":"{OPENCODE_VERSION}"}}}}\''
        " > /app/opencode-deps/package.json",
        "cd /app/opencode-deps && npm install --ignore-scripts --no-audit --no-fund",
        # Bake the in-sync tree into the global config dir so the runtime seed is a no-op.
        "mkdir -p /root/.config/opencode",
        "cp -a /app/opencode-deps/. /root/.config/opencode/",
    )
    # Install code-server for browser-based VS Code editing (direct .deb from GitHub releases)
    .run_commands(
        f"curl -fsSL -o /tmp/code-server.deb"
        f" https://github.com/coder/code-server/releases/download/v{CODE_SERVER_VERSION}"
        f"/code-server_{CODE_SERVER_VERSION}_amd64.deb",
        "dpkg -i /tmp/code-server.deb",
        "rm /tmp/code-server.deb",
        "code-server --version",
    )
    # Install ttyd web terminal (direct binary from GitHub releases)
    .run_commands(
        f"curl -fsSL -o /usr/local/bin/ttyd"
        f" https://github.com/tsl0922/ttyd/releases/download/{TTYD_VERSION}"
        f"/ttyd.x86_64",
        f'echo "{TTYD_SHA256}  /usr/local/bin/ttyd" | sha256sum -c -',
        "chmod +x /usr/local/bin/ttyd",
        "ttyd --version",
    )
    # Install agent-browser CLI and download Chromium
    .run_commands(
        f"npm install -g agent-browser@{AGENT_BROWSER_VERSION}",
        "agent-browser install",
        "agent-browser --version",
    )
    # Create working directories
    .run_commands(
        "mkdir -p /workspace",
        "mkdir -p /app/plugins",
        "mkdir -p /tmp/opencode",
        "echo 'Image rebuilt at: v21-force-rebuild' > /app/image-version.txt",
    )
    # Install the git credential helper shim.
    #
    # Each `git` invocation in the sandbox runs this shim, which delegates to
    # the sandbox-runtime helper module. The helper talks to the control plane
    # to mint fresh per-request credentials, so git operations no longer rely
    # on a 1h-TTL token captured at sandbox creation time. Configured at the
    # system level so it applies before entrypoint.py has a chance to run
    # (e.g. when restoring a snapshot whose first action is a `git fetch`).
    .run_commands(
        "printf '%s\\n'"
        " '#!/bin/sh'"
        " 'exec python3 -m sandbox_runtime.credentials.git_credential_helper \"$@\"'"
        " > /usr/local/bin/oi-git-credentials",
        "chmod 0755 /usr/local/bin/oi-git-credentials",
        "git config --system credential.helper /usr/local/bin/oi-git-credentials",
        # Pass the repo path to the helper so it can scope credentials to the
        # session repo, not just the host.
        "git config --system credential.useHttpPath true",
    )
    # Set environment variables (including cache buster to force rebuild)
    .env(
        {
            "HOME": "/root",
            "NODE_ENV": "development",
            "PNPM_HOME": "/root/.local/share/pnpm",
            # /usr/sbin and /sbin carry useradd, service, and daemons like nginx.
            # Sandbox commands run in non-interactive, non-login shells that never
            # source /etc/profile, so without them on PATH those commands fail with
            # "command not found" rather than anything that names the real problem.
            "PATH": "/root/.bun/bin:/root/.local/share/pnpm:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
            "PYTHONPATH": "/app",
            "SANDBOX_VERSION": CACHE_BUSTER,
            # NODE_PATH for globally installed modules (used by custom tools)
            "NODE_PATH": "/usr/lib/node_modules",
        }
    )
)

base_image = (
    apply_primo_overlay(base_image)
    # Add sandbox runtime code to the image (provider-agnostic bridge, entrypoint, tools, plugins)
    .add_local_dir(
        str(SANDBOX_RUNTIME_DIR),
        remote_path="/app/sandbox_runtime",
    )
)
=======


base_image = _define_image()
>>>>>>> upstream/main
