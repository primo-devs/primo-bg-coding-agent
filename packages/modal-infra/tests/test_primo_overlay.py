from src.images.primo_overlay import apply_primo_postgres_runtime, primo_sandbox_create_kwargs


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
