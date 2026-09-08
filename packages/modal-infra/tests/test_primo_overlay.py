import importlib.util

from sandbox_images.configuration import runtime_environment

from src.images.primo_overlay import (
    PRIMO_PATH_ADDITIONS,
    PRIMO_SANDBOX_COMMAND,
    UPSTREAM_SANDBOX_ENTRYPOINT_MODULE,
    apply_primo_overlay,
    apply_primo_postgres_runtime,
    primo_sandbox_command,
)


class FakeImage:
    def __init__(self):
        self.packages = ()
        self.commands = ()
        self.environment = {}

    def apt_install(self, *packages):
        self.packages = packages
        return self

    def run_commands(self, *commands):
        self.commands = commands
        return self

    def env(self, environment):
        self.environment = self.environment | environment
        return self


def test_postgres_runtime_installs_and_configures_core_test_database():
    image = apply_primo_postgres_runtime(FakeImage())
    generated_commands = "\n".join(image.commands)

    assert image.packages == ("postgresql", "postgresql-client", "locales", "media-types")
    assert "/usr/sbin/locale-gen en_US.UTF-8" in generated_commands
    assert 'PGDATA="${PRIMO_POSTGRES_DATA_DIR:-/dev/shm/primo-postgres}"' in generated_commands
    assert "shared_buffers = '512MB'" in generated_commands
    assert "work_mem = '32MB'" in generated_commands
    assert "maintenance_work_mem = '128MB'" in generated_commands
    assert "max_connections = 500" in generated_commands
    assert '"$PG_BINDIR/initdb"' in generated_commands
    assert '"$PG_BINDIR/pg_ctl"' in generated_commands
    assert '"$PGDATA/postgres.log"' in generated_commands
    assert "install -d -m 2775 -o postgres -g postgres /var/run/postgresql" in generated_commands
    assert image.environment["POSTGRES_PORT"] == "5432"
    assert image.environment["POSTGRES_PASSWORD"] == "mysecretpassword"
    assert image.environment["PRIMO_POSTGRES_DATA_DIR"] == "/dev/shm/primo-postgres"


def test_sandbox_command_execs_an_entrypoint_that_still_exists_upstream():
    """Guard the one fork divergence that a clean merge could break silently.

    `PRIMO_SANDBOX_COMMAND` replaces upstream's `python -m` invocation of the
    module referenced by `UPSTREAM_SANDBOX_ENTRYPOINT_MODULE` in `manager.py`
    with a shell wrapper that starts Postgres first. Because our copy of that
    module path lives in a string, an upstream rename merges without conflict
    and every sandbox then fails to boot in production. Fail here instead.
    """
    assert importlib.util.find_spec(UPSTREAM_SANDBOX_ENTRYPOINT_MODULE) is not None, (
        f"{UPSTREAM_SANDBOX_ENTRYPOINT_MODULE} no longer exists — upstream moved or renamed "
        "the sandbox entrypoint. Update UPSTREAM_SANDBOX_ENTRYPOINT_MODULE to match."
    )
    assert PRIMO_SANDBOX_COMMAND[:2] == ("/bin/sh", "-c")
    assert f"exec python -m {UPSTREAM_SANDBOX_ENTRYPOINT_MODULE}" in PRIMO_SANDBOX_COMMAND[2]
    assert primo_sandbox_command("--example") == (*PRIMO_SANDBOX_COMMAND, "--example")


def test_overlay_never_drops_an_entry_from_the_base_image_path():
    """The overlay must extend the base PATH, never replace it.

    The overlay used to set an absolute PATH. When upstream moved the runtime
    interpreter to `/opt/openinspect/python/bin`, that PATH silently stopped
    containing it, `python -m sandbox_runtime.entrypoint` resolved to an
    interpreter without the runtime's dependencies, and every sandbox exited 1
    on `No module named 'pydantic'`.

    This drives the whole overlay chain rather than the PATH helper alone, so a
    future layer that sets its own absolute PATH fails here too.
    """
    base_path = runtime_environment({"home": "/root"})["PATH"]
    base_entries = base_path.split(":")

    image = apply_primo_overlay(FakeImage(), base_path)
    entries = image.environment["PATH"].split(":")

    assert entries[: len(PRIMO_PATH_ADDITIONS)] == list(PRIMO_PATH_ADDITIONS)
    # Deriving the expectation from the base keeps this test correct across an
    # upstream rename of the interpreter directory, instead of pinning a literal.
    assert [entry for entry in entries if entry in base_entries] == base_entries
    assert len(entries) == len(set(entries))
