# Story — Deployment (docker-compose)

**As an** operator, **I want** to run SIFAP with one command, **so that** the app is reproducible outside a dev machine.

Implement this story LAST, after every entity story works.

## Context

Follow `docs/architecture.md` § Deployment. Component directives override any port or image detail written there.

## Acceptance criteria

- [ ] `docker compose up --build` starts every service and the app is usable from a clean checkout plus a filled `.env`.
- [ ] Data survives `docker compose down` + `up` (named database volume).
- [ ] `.env.example` documents every variable the stack reads.
