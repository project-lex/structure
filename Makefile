.PHONY: clone dry-run install-deps docker-build cm up down dns-setup vault-setup up-build build

# Image name (override when calling make: `make IMAGE_NAME=your/name build`)
IMAGE_NAME ?= project-lex/clone:latest
DOCKERFILE ?= scripts/Dockerfile.clone

DNS_IMAGE      := alpine:3.20
COMPOSE_PROJECT := $(notdir $(abspath .))
DOCKER_NETWORK  := $(COMPOSE_PROJECT)_project-lex

# Build the small container image used to run the clone script.
docker-build:
	docker build -f $(DOCKERFILE) -t $(IMAGE_NAME) .

# Run the clone script inside a container. Mount parent dir as /out so
# cloned repositories appear in the host's `../` directory.
clone: docker-build
	@docker run --rm -it \
		-v "$(abspath ..)":/out \
		-v "$(abspath .)":/workspace \
		-v "$(HOME)/.ssh":/root/.ssh:ro \
		-e SSH_AUTH_SOCK=$(SSH_AUTH_SOCK) \
		$(IMAGE_NAME) --config /workspace/config/repos.yaml --dest /out


# Build and run the `config-management` service from the sibling folder.
# Usage: `make cm` — builds image `project-lex/config-management:dev-local` from `../config-management`
# and runs `docker compose up -d` in that directory.
cm:
	@if [ ! -d "$(abspath ../config-management)" ]; then \
		echo "Directory ../config-management not found"; exit 1; \
	fi
	@echo "Building project-lex/config-management:dev-local from ../config-management"
	@cd ../config-management && docker build -t project-lex/config-management:dev-local .
#	@cd ./ && docker compose --env-file docker/.env up -d

cv:
	@if [ ! -d "$(abspath ../config-validator)" ]; then \
		echo "Directory ../config-validator not found"; exit 1; \
	fi
	@echo "Building project-lex/config-validator:dev-local from ../config-validator"
	@cd ../config-validator && docker build -t project-lex/config-validator:dev-local .

scheduler:
	@if [ ! -d "$(abspath ../scheduler)" ]; then \
		echo "Directory ../scheduler not found"; exit 1; \
	fi
	@echo "Building project-lex/scheduler:dev-local from ../scheduler"
	@cd ../scheduler && docker build -t project-lex/scheduler:dev-local .

qm:
	@if [ ! -d "$(abspath ../queue-management)" ]; then \
		echo "Directory ../queue-management not found"; exit 1; \
	fi
	@echo "Building project-lex/queue-management:dev-local from ../queue-management"
	@cd ../queue-management && docker build -t project-lex/queue-management:dev-local .

up:
	docker compose --env-file docker/.env up -d

down:
	docker compose --env-file docker/.env down

up-build: 
	build 
	up 
	vault-setup

build: cm cv scheduler qm

# Writes project-lex hostnames into the system hosts file via a temporary Docker container.
# Windows: run Git Bash as Administrator. Linux/macOS: sudo prompt will appear.
dns-setup:
	@HOSTS_FILE=$$(bash scripts/setup_local_dns.sh) && \
	docker run --rm \
		-v "$$HOSTS_FILE:/host/hosts:ro" \
		-v "$(abspath scripts/dns_patch_hosts.sh):/dns_patch.sh:ro" \
		-v "$(abspath docker/Corefile):/Corefile:ro" \
		$(DNS_IMAGE) sh /dns_patch.sh \
	| sudo tee "$$HOSTS_FILE" > /dev/null && \
	echo "Updated $$HOSTS_FILE"

vault-setup:
	@docker run --rm -it \
		-v /var/run/docker.sock:/var/run/docker.sock \
		-v "$(abspath .)":/workspace \
		-w /workspace \
		--network $(DOCKER_NETWORK) \
		-e VAULT_HOST=vault \
		docker:cli sh -c "apk add --no-cache bash curl > /dev/null 2>&1 && bash vault-init.sh"

setup: clone dns-setup up-build
