# Deploy dos dominios Comunora

Dominio comprado: `comunora.com.br`.

Estrutura oficial:

- Site institucional: `https://comunora.com.br`
- Aplicacao: `https://app.comunora.com.br`
- API: `https://api.comunora.com.br`
- Documentacao: `https://docs.comunora.com.br`
- Status: `https://status.comunora.com.br`

## 1. Railway

Crie ou mantenha tres services:

- `web`: app Next.js, root `apps/web`
- `api`: NestJS, root `apps/api`
- `worker`: BullMQ, root `apps/worker`

No Railway, adicione custom domains:

- No service `web`: `app.comunora.com.br`
- No service `api`: `api.comunora.com.br`
- Opcionalmente no service `web`: `comunora.com.br`

O Railway vai exibir os registros DNS exatos. Use esses valores; nao invente CNAME/IP.

## 2. RegistroBR

Escolha uma das estrategias.

### Estrategia recomendada: Cloudflare como DNS

1. Adicione `comunora.com.br` no Cloudflare.
2. Copie os nameservers fornecidos pelo Cloudflare.
3. No RegistroBR, altere os servidores DNS do dominio para os nameservers do Cloudflare.
4. No Cloudflare, crie os registros indicados pelo Railway:
   - `app` apontando para o target do Railway do service `web`
   - `api` apontando para o target do Railway do service `api`
   - raiz `@` apontando para o target do Railway do service `web`, se o Railway permitir CNAME flattening/ALIAS via Cloudflare
5. Deixe o proxy laranja desligado no primeiro teste. Depois que HTTPS funcionar, avalie ativar.

### Estrategia direta no DNS do RegistroBR

Use apenas se o Railway fornecer registros aceitos pelo RegistroBR para cada host.

- `app.comunora.com.br`: CNAME/target informado pelo Railway
- `api.comunora.com.br`: CNAME/target informado pelo Railway
- `comunora.com.br`: use o registro raiz aceito pelo Railway/RegistroBR. Se o RegistroBR nao aceitar CNAME no apex, use Cloudflare.

## 3. Variaveis Railway

Use `.env.production.example` como base.

Valores obrigatorios para dominio:

```env
WEB_APP_URL=https://app.comunora.com.br
API_PUBLIC_URL=https://api.comunora.com.br
CORS_ORIGINS=https://app.comunora.com.br,https://comunora.com.br
NEXT_PUBLIC_SITE_URL=https://comunora.com.br
NEXT_PUBLIC_APP_URL=https://app.comunora.com.br
NEXT_PUBLIC_API_URL=https://api.comunora.com.br
NEXT_PUBLIC_DOCS_URL=https://docs.comunora.com.br
NEXT_PUBLIC_STATUS_URL=https://status.comunora.com.br
NEXT_PUBLIC_BRAND_NAME=Comunora
NEXT_PUBLIC_SUPPORT_EMAIL=suporte@comunora.com.br
GOOGLE_OAUTH_REDIRECT_URI=https://api.comunora.com.br/auth/google/callback
GOOGLE_CALENDAR_OAUTH_REDIRECT_URI=https://api.comunora.com.br/integracoes/google-calendar/callback
EMAIL_FROM=Comunora <no-reply@comunora.com.br>
ASAAS_USER_AGENT=Comunora/1.0
```

## 4. Banco e tenant

Rode as migrations antes de virar o trafego:

```bash
pnpm db:migrate
```

A migration `020_tenant_domain_aliases.sql` cria `tenant_domains`, usada para aceitar mais de um dominio por tenant.

No painel `Marca`, configure:

- Dominio principal: dominio atual do tenant, por exemplo `app.comunora.com.br`.
- Dominios adicionais: coloque aliases que devem abrir o mesmo tenant, um por linha.

Para a Comunora padrao, adicione pelo menos:

```text
app.comunora.com.br
```

Se quiser manter compatibilidade temporaria com a URL antiga do Railway, adicione tambem o host antigo, por exemplo:

```text
web-production-xxxx.up.railway.app
```

Alternativa via SQL, se o painel ainda nao estiver acessivel:

```sql
insert into tenant_domains (tenant_id, domain, kind, verified_at)
select id, 'app.comunora.com.br', 'alias', now()
from tenants
where lower(dominio) in ('localhost:3001', 'app.comunora.com.br')
limit 1
on conflict (domain) do nothing;
```

## 5. Google Cloud

No OAuth Client:

- Authorized JavaScript origins:
  - `https://app.comunora.com.br`
  - `https://comunora.com.br`

- Authorized redirect URIs:
  - `https://api.comunora.com.br/auth/google/callback`
  - `https://api.comunora.com.br/integracoes/google-calendar/callback`

Na OAuth consent screen:

- App name: `Comunora`
- Authorized domain: `comunora.com.br`
- Support email: e-mail real do projeto

Enquanto o app nao estiver verificado/publicado, usuarios fora da lista de testes podem receber `access_denied`.

## 6. Asaas

Configure webhook:

```text
https://api.comunora.com.br/webhook/billing
```

Use o mesmo token de `ASAAS_WEBHOOK_TOKEN`.

## 7. Evolution API

O sistema monta automaticamente:

```text
https://api.comunora.com.br/webhook/evolution
```

Para isso, `API_PUBLIC_URL` precisa estar exatamente:

```env
API_PUBLIC_URL=https://api.comunora.com.br
```

Depois de alterar o dominio, reconecte/sincronize as instancias para garantir que a Evolution recebeu o webhook novo.

## 8. E-mail

Verifique o dominio `comunora.com.br` no provider de e-mail antes de usar:

```env
EMAIL_FROM=Comunora <no-reply@comunora.com.br>
```

Sem DNS de e-mail validado, confirmação de conta, reset de senha e convites podem falhar ou cair em spam.

## 9. Validacao

Depois do DNS propagar:

```bash
curl -I https://app.comunora.com.br/login
curl -I https://app.comunora.com.br/health
curl -I https://api.comunora.com.br/health
curl -I https://api.comunora.com.br/webhook/evolution
```

`/health` deve responder HTTP 200 com JSON simples no web e na API.

No app:

1. Abrir `https://app.comunora.com.br/login`.
2. Login por e-mail.
3. Login Google.
4. Conectar WhatsApp.
5. Confirmar em `/sessoes` que o webhook esperado usa `api.comunora.com.br`.
6. Enviar mensagem real e conferir Inbox.
7. Gerar cobranca Asaas e testar webhook.

## Rollback

Se algo falhar:

1. Reverter as variaveis `WEB_APP_URL`, `API_PUBLIC_URL`, `NEXT_PUBLIC_API_URL` e callbacks para as URLs Railway antigas.
2. Manter os dominios novos cadastrados, mas sem trafego.
3. Nao apagar dados de tenant nem credenciais OAuth.
