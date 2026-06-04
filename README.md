# Plataforma de Agentes de IA no WhatsApp

Infraestrutura white-label multi-tenant para agências entregarem agentes no WhatsApp.

## Arquitetura

Monorepo (pnpm + Turborepo):

- `apps/api` — NestJS: webhook, núcleo, motor de IA
- `apps/worker` — consumidores da fila (BullMQ)
- `apps/web` — Next.js: painel white-label (branding por domínio)
- `packages/shared` — tipos compartilhados (EventoNormalizado, contratos)
- `packages/transport` — TransportDriver (Cloud API oficial + Evolution só protótipo)
- `packages/db` — schema, migrations e Row-Level Security multi-tenant

## Rodar local

```bash
cp .env.example .env        # preencha os valores
docker compose up -d        # sobe Postgres + Redis
psql "$DATABASE_URL" -f packages/db/migrations/001_init.sql
pnpm install
pnpm dev
```

## Deploy (Railway)

Crie um projeto no Railway e conecte este repo. Adicione os serviços apontando
para o mesmo repositório com root directories distintos:

- serviço `api`    → root `apps/api`
- serviço `worker` → root `apps/worker`
- serviço `web`    → root `apps/web`
- plugin Postgres + plugin Redis

Cada serviço já tem seu `railway.json`. Configure as variáveis de ambiente
(do `.env.example`) no painel do Railway. **Segredos nunca vão pro repo.**

## Segurança

- `.env` está no `.gitignore`. Chaves de IA dos clientes (BYOK) ficam no cofre, nunca no banco em claro.
- Isolamento entre agências garantido por RLS no Postgres.
