# Deployment step

## Preparation

1) git pull latest code

2) backup "postgres_data" to /dentsis

3) backup .env

3.1) Migrate database [If have to]


## Stop & Remove old version api service

4) Stop API with "docker compose -f docker-compose.api.yml down"

5) remove docker images with "docker rmi dentsis-api-api:latest"

## Restart Service

6) Start API Service with "docke compose -f docker-compose.api.yml up -d"
