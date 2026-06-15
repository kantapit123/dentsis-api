## Command how to build image and push
```sh
docker buildx build \
  --platform linux/amd64 \
  -t ghcr.io/kantapit123/dentsis-api:1.3.1 \
  --push \
  .
```

After build with new version you should update this file to latest version
