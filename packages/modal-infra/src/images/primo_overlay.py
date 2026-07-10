"""Primo-specific sandbox image customizations.

Keep deployment-specific additions here so upstream base image changes stay
localized to the smallest possible hook in base.py.
"""

AWS_CLI_VERSION = "2.34.50"
AWS_CLI_SHA256 = "0e6f3d4330a0655e2d08f3791a2ee9503bb55accbac5633b839b8e0b66c0e5b5"

GO_VERSION = "1.25.11"
GO_SHA256 = "34f14304e856893f4ba30c2cacfe93906e9de7915c5f6aaaf3a81cdccd7ba30b"

GOLANGCI_LINT_VERSION = "2.5.0"
SQLC_VERSION = "1.30.0"

POSTGRES_PASSWORD = "mysecretpassword"

PRIMO_CORE_REPOSITORY = ("primo-devs", "core")
PRIMO_CORE_CPU_CORES = 2.0
PRIMO_CORE_MEMORY_MIB = 8192

PRIMO_SANDBOX_VERSION = "primo-v10-go-aws-postgres-tmpfs-ssm-golangci25-sqlc"

PRIMO_SANDBOX_COMMAND = (
    "/bin/sh",
    "-c",
    "if command -v start-postgres >/dev/null 2>&1; then start-postgres; fi\n"
    "exec python -m sandbox_runtime.entrypoint",
)


def primo_sandbox_create_kwargs(repo_owner: str | None, repo_name: str | None) -> dict:
    """Use Modal's VM runtime for Core, where gVisor makes DB-heavy tests timeout."""
    if (repo_owner, repo_name) != PRIMO_CORE_REPOSITORY:
        return {}

    return {
        "cpu": PRIMO_CORE_CPU_CORES,
        "memory": PRIMO_CORE_MEMORY_MIB,
        "experimental_options": {"vm_runtime": True},
    }


def apply_primo_postgres_runtime(image):
    if not hasattr(image, "apt_install"):
        return image

    return (
        image.apt_install("postgresql", "postgresql-client", "locales", "media-types")
        .run_commands(
            "sed -i 's/^# *en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen"
            " && /usr/sbin/locale-gen en_US.UTF-8",
            "cat > /usr/local/bin/start-postgres <<'EOF'\n"
            "#!/bin/sh\n"
            "set -eu\n"
            ': "${POSTGRES_PASSWORD:=mysecretpassword}"\n'
            'PGDATA="${PRIMO_POSTGRES_DATA_DIR:-/dev/shm/primo-postgres}"\n'
            'PG_BINDIR="$(pg_config --bindir)"\n'
            "if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then\n"
            "  exit 0\n"
            "fi\n"
            'rm -rf "$PGDATA"\n'
            'install -d -m 0700 -o postgres -g postgres "$PGDATA"\n'
            "install -d -m 2775 -o postgres -g postgres /var/run/postgresql\n"
            '/usr/sbin/runuser -u postgres -- "$PG_BINDIR/initdb" \\\n'
            '  -D "$PGDATA" \\\n'
            "  --username=postgres \\\n"
            "  --auth-local=trust \\\n"
            "  --auth-host=scram-sha-256 \\\n"
            "  --encoding=UTF8 \\\n"
            "  --locale=en_US.UTF-8 \\\n"
            "  --no-instructions >/dev/null\n"
            "cat >> \"$PGDATA/postgresql.conf\" <<'PGCONFIG'\n"
            "listen_addresses = '127.0.0.1'\n"
            "port = 5432\n"
            "unix_socket_directories = '/var/run/postgresql'\n"
            "fsync = off\n"
            "synchronous_commit = off\n"
            "full_page_writes = off\n"
            "shared_buffers = '512MB'\n"
            "work_mem = '32MB'\n"
            "maintenance_work_mem = '128MB'\n"
            "max_connections = 500\n"
            "PGCONFIG\n"
            'if ! /usr/sbin/runuser -u postgres -- "$PG_BINDIR/pg_ctl" -D "$PGDATA" -l "$PGDATA/postgres.log" -w start >/dev/null; then\n'
            '  cat "$PGDATA/postgres.log" >&2\n'
            "  exit 1\n"
            "fi\n"
            "psql -h /var/run/postgresql -U postgres -v ON_ERROR_STOP=1 -c \"ALTER USER postgres PASSWORD '$POSTGRES_PASSWORD';\" >/dev/null\n"
            "pg_isready -h 127.0.0.1 -p 5432\n"
            "EOF",
            "chmod 0755 /usr/local/bin/start-postgres",
        )
        .env(
            {
                "DATABASE_URL": f"postgres://postgres:{POSTGRES_PASSWORD}@localhost:5432/postgres?sslmode=disable",
                "POSTGRES_ADMIN_DB": "postgres",
                "POSTGRES_HOST": "localhost",
                "POSTGRES_PASSWORD": POSTGRES_PASSWORD,
                "POSTGRES_PORT": "5432",
                "POSTGRES_SSL_MODE": "disable",
                "POSTGRES_USER": "postgres",
                "PRIMO_POSTGRES_DATA_DIR": "/dev/shm/primo-postgres",
                "PRIMO_SANDBOX_VERSION": PRIMO_SANDBOX_VERSION,
            }
        )
    )


def apply_primo_overlay(image):
    image = (
        image.run_commands(
            f"curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-x86_64-{AWS_CLI_VERSION}.zip"
            " -o /tmp/awscliv2.zip",
            f'echo "{AWS_CLI_SHA256}  /tmp/awscliv2.zip" | sha256sum -c -',
            "unzip -q /tmp/awscliv2.zip -d /tmp",
            "/tmp/aws/install",
            "rm -rf /tmp/aws /tmp/awscliv2.zip",
            "aws --version",
        )
        .run_commands(
            "curl -fsSL https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb -o /tmp/smp.deb",
            # The overlay's PATH omits /usr/sbin and /sbin, but dpkg needs
            # ldconfig and start-stop-daemon from there — prepend them for this
            # command so the install doesn't abort with "expected programs not
            # found in PATH".
            "PATH=/usr/local/sbin:/usr/sbin:/sbin:$PATH dpkg -i /tmp/smp.deb",
            "rm -f /tmp/smp.deb",
            "session-manager-plugin --version",
        )
        .run_commands(
            f"curl -fsSL https://go.dev/dl/go{GO_VERSION}.linux-amd64.tar.gz -o /tmp/go.tar.gz",
            f'echo "{GO_SHA256}  /tmp/go.tar.gz" | sha256sum -c -',
            "tar -C /usr/local -xzf /tmp/go.tar.gz",
            "rm /tmp/go.tar.gz",
            "/usr/local/go/bin/go version",
        )
        .run_commands(
            f"curl -fsSL https://golangci-lint.run/install.sh"
            f" | sh -s -- -b /usr/local/bin v{GOLANGCI_LINT_VERSION}",
            "golangci-lint version",
        )
        .run_commands(
            f"/usr/local/go/bin/go install github.com/sqlc-dev/sqlc/cmd/sqlc@v{SQLC_VERSION}",
            "/root/go/bin/sqlc version",
        )
        .env(
            {
                "PATH": "/root/.bun/bin:/root/.local/share/pnpm:/usr/local/go/bin:/root/go/bin:/usr/local/bin:/usr/bin:/bin",
                "PRIMO_CLOUD_AGENT": "1",
            }
        )
    )
    return apply_primo_postgres_runtime(image)
