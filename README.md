# Plataforma de Agentes de IA no WhatsApp

Infraestrutura white-label multi-tenant para agencias entregarem agentes de IA no WhatsApp usando Evolution API.

## Arquitetura

- `apps/api`: NestJS, autenticacao, webhooks, sessoes, agentes, templates e API publica.
- `apps/worker`: consumidores BullMQ, processamento de mensagens, IA, automacoes e envio.
- `apps/web`: painel Next.js na porta `3001`.
- `packages/db`: migrations, pool Postgres e RLS multi-tenant.
- `packages/transport`: drivers de transporte. O fluxo principal usa Evolution API.
- `packages/bus`: pub/sub Redis para atualizar o inbox em tempo real.

## RAG com Pgvector

O projeto usa `pgvector` quando a extensao esta disponivel. Em ambientes novos,
o `docker-compose.yml` usa a imagem `pgvector/pgvector:pg16`.

Se o banco nao tiver `pgvector`, a migration continua mesmo assim e o sistema usa
fallback com embedding em JSONB + busca textual. Isso evita quebrar deploys antigos,
mas para escala real use Postgres com `vector`.

## Rodar Local

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm --filter @plataforma/db migrate
pnpm --filter @plataforma/api seed
pnpm dev
```

Login demo, se o seed foi aplicado:

```text
admin@demo.com / senha123
dominio: localhost:3001
```

## Login com Google

O login com Google usa OAuth Authorization Code + PKCE no backend e entrega o
mesmo JWT usado pelo login por senha. Isso mantem o painel compatível com o
`localStorage.token` atual.

Configure no `.env`:

```env
GOOGLE_OAUTH_CLIENT_ID=seu-client-id
GOOGLE_OAUTH_CLIENT_SECRET=seu-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/google/callback
WEB_APP_URL=http://localhost:3001
```

No Google Cloud Console, cadastre a redirect URI acima. Em producao, use a URL
publica da API, por exemplo:

```text
https://api.seudominio.com/auth/google/callback
```

Regra importante: a conta Google so entra se o e-mail ja existir na tabela
`usuarios` daquele tenant. No primeiro login valido, o sistema vincula o
`google_sub` ao usuario. Isso evita auto-cadastro indevido em agencias
white-label.

## Fluxo Evolution

Para o QR apenas conectar, `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` bastam.
Para mensagens reais chegarem ao sistema, `API_PUBLIC_URL` precisa apontar para a API publica:

```env
API_PUBLIC_URL=https://sua-api-publica.com
```

O webhook configurado na Evolution sera:

```text
https://sua-api-publica.com/webhook/evolution
```

Sem isso, o WhatsApp pode aparecer como conectado, mas o worker nunca recebe mensagens.

## Subir Servicos Separados

```bash
cd apps/api
pnpm dev

cd apps/web
pnpm dev

cd apps/worker
pnpm dev
```

URLs locais:

- Web: `http://localhost:3001`
- API: `http://localhost:3000`
- Diagnostico de sessoes: `http://localhost:3001/sessoes`

## Checklist Minimo de Producao

- `DATABASE_URL` com Postgres persistente.
- `REDIS_URL` com Redis persistente.
- `JWT_SECRET` forte.
- `SECRETS_MASTER_KEY` forte, com 32+ caracteres.
- `CORS_ORIGINS` com os dominios reais do painel, separados por virgula.
- `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`.
- `API_PUBLIC_URL` publica, HTTPS, acessivel pela Evolution.
- `PUBLIC_API_RATE_LIMIT_MAX` e `PUBLIC_API_RATE_LIMIT_WINDOW_MS` ajustados ao plano comercial.
- `WEBHOOK_OUT_MAX_ATTEMPTS` configurado para retry de webhooks outbound.
- Worker rodando continuamente.
- Chave OpenAI configurada no painel em `/ai-settings`.
- Logs recentes acompanhados em `/sessoes`.

## Providers de IA

`/ai-settings` permite configurar OpenAI, Anthropic e Google Gemini com chave
BYOK criptografada.

- OpenAI: suporta respostas e tools do agente.
- Anthropic/Google: suportam resposta textual. Tools avancadas ainda dependem
  do tradutor de function calling desses providers.

## Agenda

A tool `agendar` salva compromissos na tabela `agendamentos` e eles aparecem em
`/agenda`. Para sincronizar com Google Calendar, n8n ou Make, configure:

```env
CALENDAR_WEBHOOK_URL=https://seu-webhook-de-agenda
```

Sem esse webhook, o compromisso fica salvo como pendente. Isso e melhor do que
fingir integracao com Google Calendar sem OAuth configurado.

## Deploy Railway

Crie tres servicos apontando para o mesmo repositorio:

- `api`: root `apps/api`
- `worker`: root `apps/worker`
- `web`: root `apps/web`

Adicione Postgres e Redis. Configure as variaveis do `.env.example` no painel.
Segredos nunca devem ir para o repositorio.
