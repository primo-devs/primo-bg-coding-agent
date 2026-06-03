"""Primo-specific sandbox image customizations.

Keep deployment-specific additions here so upstream base image changes stay
localized to the smallest possible hook in base.py.
"""

AWS_CLI_VERSION = "2.34.50"
AWS_CLI_SHA256 = "0e6f3d4330a0655e2d08f3791a2ee9503bb55accbac5633b839b8e0b66c0e5b5"

GO_VERSION = "1.26.3"
GO_SHA256 = "2b2cfc7148493da5e73981bffbf3353af381d5f93e789c82c79aff64962eb556"

GOLANGCI_LINT_VERSION = "2.5.0"
SQLC_VERSION = "1.30.0"
POSTGRES_PASSWORD = "mysecretpassword"

PRIMO_SANDBOX_VERSION = "primo-v3-go-test-postgres-golangci25-sqlc"


def apply_primo_overlay(image):
    return (
        image.apt_install("postgresql", "postgresql-client")
        .run_commands(
            f"curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-x86_64-{AWS_CLI_VERSION}.zip"
            " -o /tmp/awscliv2.zip",
            f'echo "{AWS_CLI_SHA256}  /tmp/awscliv2.zip" | sha256sum -c -',
            "unzip -q /tmp/awscliv2.zip -d /tmp",
            "/tmp/aws/install",
            "rm -rf /tmp/aws /tmp/awscliv2.zip",
            "aws --version",
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
        .run_commands(
            "service postgresql start",
            f'su - postgres -c "psql -v ON_ERROR_STOP=1 -c \\"ALTER USER postgres PASSWORD \'{POSTGRES_PASSWORD}\';\\""',
            "pg_isready -h 127.0.0.1 -p 5432",
        )
        .run_commands(
            "printf '%s\\n'"
            " '#!/bin/sh'"
            ' \'if [ "${1:-}" = "test" ]; then\''
            " '  service postgresql start >/dev/null'"
            " '  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do'"
            " '    pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 && break'"
            " '    sleep 1'"
            " '  done'"
            " '  pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 || exit 1'"
            " 'fi'"
            " 'exec /usr/local/go/bin/go \"$@\"'"
            " > /usr/local/bin/go",
            "chmod 0755 /usr/local/bin/go",
        )
        .env(
            {
                "PATH": "/root/.bun/bin:/root/.local/share/pnpm:/usr/local/bin:/usr/local/go/bin:/root/go/bin:/usr/bin:/bin",
                "PRIMO_SANDBOX_VERSION": PRIMO_SANDBOX_VERSION,
            }
        )
    )
