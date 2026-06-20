.PHONY: install dev build test compose-up compose-down backup restore

install:
	npm install

dev:
	npm run dev

build:
	npm run build

test:
	npm test

compose-up:
	docker compose up -d --build

compose-down:
	docker compose down

backup:
	npm run dr:backup

restore:
	npm run dr:restore
