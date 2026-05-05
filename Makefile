.PHONY: clone dry-run install-deps docker-build cm

# Image name (override when calling make: `make IMAGE_NAME=your/name build`)
IMAGE_NAME ?= project-lex/clone:latest
DOCKERFILE ?= scripts/Dockerfile.clone

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
	@cd ./ && docker compose up -d


up:
	docker compose up -d

down:
	docker compose down


