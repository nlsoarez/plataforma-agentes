# Checklist de virada Comunora

Use este checklist quando o RegistroBR liberar a zona DNS e os registros ja estiverem cadastrados.

## 1. Validar DNS

```bash
pnpm check:prod -- --soft
```

Enquanto o DNS propaga, falhas de CNAME/TXT sao esperadas. Nao altere variaveis finais antes de `app` e `api` resolverem corretamente.

Registros esperados:

```text
app.comunora.com.br CNAME ltqiq8fh.up.railway.app
api.comunora.com.br CNAME 3z7xvypo.up.railway.app
_railway-verify.app.comunora.com.br TXT railway-verify=8c41d452f1b2c975a1a5a4ab307116caadc9a64a0acaa2159f87feb7de5b6991
_railway-verify.api.comunora.com.br TXT railway-verify=0f44e0a3c60e76f30d9b540df7720a779ba09f98c8ccb35aae2b70788e3ad701
```

## 2. Confirmar no Railway

No Railway, cada dominio deve aparecer como verificado:

- `app.comunora.com.br` no service `web`.
- `api.comunora.com.br` no service `api`.

Nao avance se algum estiver pendente.

## 3. Trocar variaveis finais

```bash
railway variable set --service web --environment production --skip-deploys \
  NEXT_PUBLIC_API_URL=https://api.comunora.com.br \
  NEXT_PUBLIC_APP_URL=https://app.comunora.com.br

railway variable set --service api --environment production --skip-deploys \
  WEB_APP_URL=https://app.comunora.com.br \
  API_PUBLIC_URL=https://api.comunora.com.br \
  CORS_ORIGINS=https://app.comunora.com.br,https://comunora.com.br,https://web-production-7720e1.up.railway.app \
  GOOGLE_OAUTH_REDIRECT_URI=https://api.comunora.com.br/auth/google/callback \
  GOOGLE_CALENDAR_OAUTH_REDIRECT_URI=https://api.comunora.com.br/integracoes/google-calendar/callback

railway variable set --service worker --environment production --skip-deploys \
  WEB_APP_URL=https://app.comunora.com.br \
  API_PUBLIC_URL=https://api.comunora.com.br \
  CORS_ORIGINS=https://app.comunora.com.br,https://comunora.com.br,https://web-production-7720e1.up.railway.app
```

## 4. Redeploy

```bash
railway up --service web --environment production --detach --message "Switch to Comunora domains"
railway restart --service api --environment production --yes
railway restart --service worker --environment production --yes
```

## 5. Testes obrigatorios

```bash
pnpm check:prod
```

No navegador:

1. Abrir `https://app.comunora.com.br/login`.
2. Entrar por e-mail.
3. Entrar pelo Google.
4. Abrir `/sessoes` e confirmar webhook esperado com `api.comunora.com.br`.
5. Enviar mensagem real no WhatsApp e conferir Inbox.
6. Gerar cobranca Asaas e confirmar retorno do webhook.

## 6. Atualizacoes externas

Google Cloud:

```text
https://api.comunora.com.br/auth/google/callback
https://api.comunora.com.br/integracoes/google-calendar/callback
```

Asaas:

```text
https://api.comunora.com.br/webhook/billing
```

Evolution API:

```text
https://api.comunora.com.br/webhook/evolution
```

## 7. Rollback rapido

Se o dominio novo falhar, volte temporariamente:

```bash
railway variable set --service web --environment production --skip-deploys \
  NEXT_PUBLIC_API_URL=https://api-production-4930.up.railway.app \
  NEXT_PUBLIC_APP_URL=https://web-production-7720e1.up.railway.app

railway variable set --service api --environment production --skip-deploys \
  WEB_APP_URL=https://web-production-7720e1.up.railway.app \
  API_PUBLIC_URL=https://api-production-4930.up.railway.app \
  GOOGLE_OAUTH_REDIRECT_URI=https://api-production-4930.up.railway.app/auth/google/callback \
  GOOGLE_CALENDAR_OAUTH_REDIRECT_URI=https://api-production-4930.up.railway.app/integracoes/google-calendar/callback
```

Depois faça redeploy do web e restart da API.
