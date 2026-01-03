# Variables
REGISTRY ?= localhost:5000
IMAGE_NAME ?= dentsis-api
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "latest")
FULL_IMAGE_NAME = $(REGISTRY)/$(IMAGE_NAME):$(VERSION)
LATEST_IMAGE_NAME = $(REGISTRY)/$(IMAGE_NAME):latest

# Docker build arguments
DOCKER_BUILD_ARGS ?=

.PHONY: help build tag push all clean pull

# Default target
help:
	@echo "Available targets:"
	@echo "  make build          - Build Docker image"
	@echo "  make tag            - Tag image for registry"
	@echo "  make push           - Push image to registry"
	@echo "  make all            - Build, tag, and push (default)"
	@echo "  make pull           - Pull image from registry"
	@echo "  make clean          - Remove local images"
	@echo ""
	@echo "Variables:"
	@echo "  REGISTRY=$(REGISTRY)"
	@echo "  IMAGE_NAME=$(IMAGE_NAME)"
	@echo "  VERSION=$(VERSION)"
	@echo ""
	@echo "Examples:"
	@echo "  make all                           # Build and push with default settings"
	@echo "  make build VERSION=1.0.0           # Build with specific version"
	@echo "  make push REGISTRY=registry:5000   # Push to different registry"

# Build Docker image
build:
	@echo "Building Docker image: $(IMAGE_NAME):$(VERSION)"
	docker build $(DOCKER_BUILD_ARGS) -t $(IMAGE_NAME):$(VERSION) -t $(IMAGE_NAME):latest .
	@echo "Build completed: $(IMAGE_NAME):$(VERSION)"

# Tag image for registry
tag: build
	@echo "Tagging image for registry: $(FULL_IMAGE_NAME)"
	docker tag $(IMAGE_NAME):$(VERSION) $(FULL_IMAGE_NAME)
	docker tag $(IMAGE_NAME):latest $(LATEST_IMAGE_NAME)
	@echo "Tagged: $(FULL_IMAGE_NAME) and $(LATEST_IMAGE_NAME)"

# Push image to registry
push: tag
	@echo "Pushing image to registry: $(REGISTRY)"
	docker push $(FULL_IMAGE_NAME)
	docker push $(LATEST_IMAGE_NAME)
	@echo "Pushed: $(FULL_IMAGE_NAME) and $(LATEST_IMAGE_NAME)"

# Build, tag, and push
all: push

# Pull image from registry
pull:
	@echo "Pulling image from registry: $(FULL_IMAGE_NAME)"
	docker pull $(FULL_IMAGE_NAME)
	docker tag $(FULL_IMAGE_NAME) $(IMAGE_NAME):$(VERSION)
	docker tag $(FULL_IMAGE_NAME) $(IMAGE_NAME):latest
	@echo "Pulled and tagged: $(IMAGE_NAME):$(VERSION)"

# Clean local images
clean:
	@echo "Removing local images..."
	-docker rmi $(IMAGE_NAME):$(VERSION) 2>/dev/null || true
	-docker rmi $(IMAGE_NAME):latest 2>/dev/null || true
	-docker rmi $(FULL_IMAGE_NAME) 2>/dev/null || true
	-docker rmi $(LATEST_IMAGE_NAME) 2>/dev/null || true
	@echo "Clean completed"

