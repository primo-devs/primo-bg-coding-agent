from src.images.primo_overlay import apply_primo_postgres_runtime


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
    assert "pg_conftool set max_connections 500" in generated_commands
    assert "/usr/sbin/service postgresql start" in generated_commands
    assert image.environment["POSTGRES_PORT"] == "5432"
    assert image.environment["POSTGRES_PASSWORD"] == "mysecretpassword"
