.PHONY: install run dev test build docker-up docker-down docker-test

## Local (requires Node.js 20+)
install:
	npm install

dev:
	npm run dev

run:
	npm run build && npm start

test:
	npm test

build:
	npm run build

## Docker
docker-up:
	docker compose up --build

docker-down:
	docker compose down

docker-test:
	docker compose --profile test run --rm test
