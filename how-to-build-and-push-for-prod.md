## Command how to build image and push
```sh
docker buildx build \
  --platform linux/amd64 \
  -t ghcr.io/kantapit123/dentsis-api:1.1.0 \
  --push \
  .
```

After build with new version you should update this file to latest version
