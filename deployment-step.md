# Deployment step

## Preparation

1) git pull latest code

2) backup "postgres_data" to /dentsis

3) backup .env

## Stop & Remove old version api service

4) Stop API with "docker compose -f docker-compose.api.yml down"

5) remove docker images with "docker rmi dentsis-api-api:latest"

## Restart Service

6) Start API Service with "docke compose -f docker-compose.api.yml up -d"

7) Migrate database [Optional] with this "docker exec -it dentsis-api sh -lc 'cd /app && npx prisma migrate deploy && npx prisma migrate status'"
