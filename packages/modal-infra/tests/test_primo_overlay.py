import importlib.util

from src.images.primo_overlay import (
    PRIMO_SANDBOX_COMMAND,
    UPSTREAM_SANDBOX_ENTRYPOINT_MODULE,
    apply_primo_postgres_runtime,
    primo_sandbox_create_kwargs,
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
        self.environment = environment
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


def test_core_uses_vm_runtime_with_ci_sized_resources():
    assert primo_sandbox_create_kwargs("primo-devs", "core") == {
        "cpu": 2.0,
        "memory": 8192,
        "experimental_options": {"vm_runtime": True},
    }


def test_other_repositories_keep_modal_defaults():
    assert primo_sandbox_create_kwargs("acme", "other") == {}


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
    assert PRIMO_SANDBOX_COMMAND[-1].endswith(
        f"exec python -m {UPSTREAM_SANDBOX_ENTRYPOINT_MODULE}"
    )
