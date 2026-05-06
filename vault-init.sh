#!/bin/bash

set -e

# Load DB passwords from Docker secrets
DB_PASSWORD=$(<secrets/postgres_password.txt)
MONGO_PASSWORD=$(<secrets/mongo_password.txt)

echo "⏳ Waiting for Vault container to be ready..."
until curl -s http://localhost:8200/v1/sys/health > /dev/null; do sleep 1; done
echo "✅ Vault is up."

echo "🚀 Running Vault setup inside the container..."
docker exec -e VAULT_ADDR=http://localhost:8200 \
            -e VAULT_TOKEN=root \
            -e DB_PASSWORD="$DB_PASSWORD" \
            vault sh -c 'vault secrets enable database || true'

echo "🔗 Configuring TimescaleDB connection..."
docker exec -e VAULT_ADDR=http://localhost:8200 \
            -e VAULT_TOKEN=root \
            -e DB_PASSWORD="$DB_PASSWORD" \
            vault sh -c "vault write database/config/timescale \
              plugin_name=postgresql-database-plugin \
              allowed_roles=timescale-role \
              connection_url='postgresql://{{username}}:{{password}}@timescaledb:5432/logging?sslmode=disable' \
              username=\"admin\" password=\"$DB_PASSWORD\""

echo "👤 Creating dynamic DB role..."
docker exec -i -e VAULT_ADDR=http://localhost:8200 \
            -e VAULT_TOKEN=root \
            -e DB_PASSWORD="$DB_PASSWORD" \
            vault sh -s <<'SH'
#!/bin/sh
# Create the role with properly quoted SQL using an inner heredoc
vault write database/roles/timescale-role db_name=timescale creation_statements="$(cat <<'SQL'
CREATE ROLE "{{name}}" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "{{name}}";
SQL
)"
default_ttl="1h" max_ttl="24h"
SH

echo "📜 Writing policy..."
# Send the policy via stdin to avoid shell quoting issues
docker exec -i -e VAULT_ADDR=http://localhost:8200 -e VAULT_TOKEN=root vault sh -c 'vault policy write timescale-reader -' <<'EOF'
path "database/creds/timescale-role" {
  capabilities = ["read"]
}
EOF

echo "� Running MongoDB setup inside Vault..."
docker exec -e VAULT_ADDR=http://localhost:8200 \
            -e VAULT_TOKEN=root \
            -e MONGO_PASSWORD="$MONGO_PASSWORD" \
            vault sh -c 'vault secrets enable database || true'

echo "🔗 Configuring MongoDB connection..."
docker exec -e VAULT_ADDR=http://localhost:8200 \
            -e VAULT_TOKEN=root \
            -e MONGO_PASSWORD="$MONGO_PASSWORD" \
            vault sh -c "vault write database/config/mongodb \
              plugin_name=mongodb-database-plugin \
              allowed_roles=mongodb-role \
              connection_url='mongodb://{{username}}:{{password}}@mongodb:27017' \
              username=\"admin\" password=\"$MONGO_PASSWORD\""

echo "👤 Creating dynamic MongoDB role..."
docker exec -i -e VAULT_ADDR=http://localhost:8200 \
            -e VAULT_TOKEN=root \
            vault sh -c 'vault write database/roles/mongodb-role db_name=mongodb creation_statements='\''{"db":"project-lex","roles":[{"role":"readWrite"}]}'\'', default_ttl="1h" max_ttl="24h"'

echo "📜 Writing MongoDB policy..."
docker exec -i -e VAULT_ADDR=http://localhost:8200 -e VAULT_TOKEN=root vault sh -c 'vault policy write mongodb-reader -' <<'EOFMONGO'
path "database/creds/mongodb-role" {
  capabilities = ["read"]
}
EOFMONGO

echo "🔑 Creating token for dynamic MongoDB access..."
docker exec -e VAULT_ADDR=http://localhost:8200 -e VAULT_TOKEN=root vault sh -c 'vault token create -policy=mongodb-reader -ttl=2h'
