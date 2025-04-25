#!/bin/bash

set -e

# Load DB password from Docker secret
DB_PASSWORD=$(<secrets/postgres_password.txt)

echo "⏳ Waiting for Vault container to be ready..."
until curl -s http://localhost:8200/v1/sys/health > /dev/null; do sleep 1; done
echo "✅ Vault is up."

echo "🚀 Running Vault setup inside the container..."

docker exec -e VAULT_ADDR=http://localhost:8200 \
            -e VAULT_TOKEN=root \
            -e DB_PASSWORD="$DB_PASSWORD" \
            vault sh -c '
  echo "🔐 Enabling database secrets engine..."
  vault secrets enable database || true

  echo "🔗 Configuring TimescaleDB connection..."
  vault write database/config/timescale \
    plugin_name=postgresql-database-plugin \
    allowed_roles=timescale-role \
    connection_url="postgresql://{{username}}:{{password}}@timescaledb:5432/logging?sslmode=disable" \
    username="admin" \
    password="$DB_PASSWORD"

  echo "👤 Creating dynamic DB role..."
  vault write database/roles/timescale-role \
    db_name=timescale \
    creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD ''{{password}}'' VALID UNTIL ''{{expiration}}''; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
    default_ttl="1h" \
    max_ttl="24h"

  echo "📜 Writing policy..."
  vault policy write timescale-reader - <<EOF
path \"database/creds/timescale-role\" {
  capabilities = [\"read\"]
}
EOF

  echo "🔑 Creating token for dynamic DB access..."
  vault token create -policy=timescale-reader -ttl=2h
'
