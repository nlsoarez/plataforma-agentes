# Runbook de migracao Railway para OCI Always Free

Este procedimento migra somente a Comunora: web, API, worker, PostgreSQL/pgvector, Redis, Evolution API e relay EMBRATEL. Os outros projetos Railway nao fazem parte deste corte.

## 1. Bloqueios externos

O codigo pode ser preparado sem conta, mas a infraestrutura real depende de:

- conta Oracle Cloud com home region `sa-saopaulo-1`, cartao verificado e capacidade `VM.Standard.A1.Flex` disponivel;
- chave SSH, OCI CLI configurado e Terraform 1.9 ou superior;
- token Cloudflare com `Cloudflare Tunnel: Edit` e `Zone DNS: Edit`;
- Customer Secret Key do OCI Object Storage para o Restic;
- possibilidade de reduzir e restaurar replicas no Railway.

Nao execute o corte se qualquer item estiver indisponivel. Oracle Always Free nao possui SLA equivalente ao Railway e pode retomar uma instancia considerada ociosa. Consulte a [documentacao Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

## 2. Provisionar OCI e Cloudflare

Crie os arquivos locais ignorados pelo Git:

```powershell
Copy-Item infra/oci/terraform.tfvars.example infra/oci/terraform.tfvars
Copy-Item infra/cloudflare/terraform.tfvars.example infra/cloudflare/terraform.tfvars
```

Preencha os OCIDs, o CIDR administrativo `/32`, a chave SSH e o token Cloudflare. Depois:

```powershell
terraform -chdir=infra/oci init
terraform -chdir=infra/oci plan -out=oci.tfplan
terraform -chdir=infra/oci apply oci.tfplan

terraform -chdir=infra/cloudflare init
terraform -chdir=infra/cloudflare plan -out=cloudflare.tfplan
terraform -chdir=infra/cloudflare apply cloudflare.tfplan
```

O segundo apply cria o Tunnel e apenas os quatro hostnames `staging-*`. Ele nao altera `app.comunora.com.br` nem `api.comunora.com.br`.

Grave o token do output sensivel em `/etc/comunora/env/cloudflared.env` no formato `TUNNEL_TOKEN=valor`, sem registrá-lo no Git ou no historico do terminal.

## 3. Preparar codigo e segredos

No servidor:

```bash
sudo mkdir -p /srv/comunora/app
sudo chown ubuntu:docker /srv/comunora/app
git clone --branch codex/evolution-zatten-platform https://github.com/nlsoarez/plataforma-agentes.git /srv/comunora/app
cd /srv/comunora/app
sudo ./scripts/oci/provision-server.sh
```

Na maquina Windows autenticada no Railway, exporte os valores sem imprimi-los e para uma pasta fora do repositorio:

```powershell
./scripts/oci/export-railway-secrets.ps1 -OutputDirectory C:\comunora-secrets
```

O script preserva JWT, chave mestra, Evolution, OAuth e Asaas; gera novas senhas internas; e gira o segredo do relay. Preencha os campos restantes de Cloudflare e Object Storage. Envie os arquivos ao servidor e instale-os como root com modo `0600`:

```powershell
scp C:\comunora-secrets\*.env ubuntu@IP_OCI:/tmp/comunora-env/
scp C:\comunora-secrets\compose.env ubuntu@IP_OCI:/tmp/comunora-env/
```

```bash
sudo install -m 0600 -o root -g root /tmp/comunora-env/*.env /etc/comunora/env/
sudo install -m 0644 -o root -g root /tmp/comunora-env/compose.env /etc/comunora/compose.env
sudo rm -rf -- /tmp/comunora-env
./scripts/oci/validate-env.sh
```

O segredo antigo do relay estava dentro da extensao 1.15.0 e esta comprometido. Nao o reutilize.

## 4. Ensaio isolado

O ensaio restaura os quatro armazenamentos, mas nao inicia worker, Evolution ou relay clonados:

```bash
sudo ./scripts/oci/migrate-from-railway.sh \
  --phase rehearsal \
  --confirm TARGET-DATA-WILL-BE-REPLACED
CHECK_PUBLIC=1 sudo -E ./scripts/oci/healthcheck.sh rehearsal
```

Verifique:

- `https://staging-app.comunora.com.br/health`;
- `https://staging-api.comunora.com.br/health`;
- migrations e papel `plataforma_runtime` sem `BYPASSRLS`;
- volumes, uso de disco e logs sem segredos;
- backup e restore real:

```bash
sudo ./scripts/oci/backup.sh
sudo ./scripts/oci/restore-check.sh
sudo ./scripts/oci/smoke-evolution.sh
```

Nao inicie a Evolution com o banco clonado enquanto a instancia Railway estiver conectada ao WhatsApp.

## 5. Preflight do corte

Execute a inspecao Railway; ela nao muda replicas:

```powershell
./scripts/oci/railway-cutover.ps1 -Action Inspect -StateFile C:\comunora-secrets\railway-scale.json
```

Confirme tambem:

- ensaio e restore-check aprovados;
- backup DNS e credenciais de rollback acessiveis;
- janela de ate 60 minutos comunicada;
- operador pronto para reautenticar qualquer uma das 11 sessoes Evolution;
- nenhuma campanha ou tarefa importante em execucao.

## 6. Corte

No OCI, ative manutencao e troque os quatro CNAMEs para o Tunnel:

```bash
sudo ./scripts/oci/maintenance.sh on
sudo ./scripts/oci/cloudflare-dns.sh switch
sleep 300
```

Guarde o caminho do backup DNS impresso. A espera de cinco minutos cobre o TTL anterior e evita que clientes continuem gravando pela rota antiga durante o dump. Pare apenas os writers Railway; PostgreSQL e Redis permanecem online para o dump final:

```powershell
./scripts/oci/railway-cutover.ps1 \
  -Action Stop \
  -StateFile C:\comunora-secrets\railway-scale.json \
  -Server IP_OCI \
  -Confirmation STOP-RAILWAY-WRITERS
```

Execute imediatamente no OCI:

```bash
sudo ./scripts/oci/migrate-from-railway.sh \
  --phase cutover \
  --confirm TARGET-DATA-WILL-BE-REPLACED
CHECK_PUBLIC=1 sudo -E ./scripts/oci/healthcheck.sh production
sudo ./scripts/oci/maintenance.sh off
```

Teste login, isolamento por tenant, exclusao de agente, inbox, agenda, Asaas, OAuth, campanhas, uma mensagem real de entrada e saida, relay e deduplicacao. A troca de issuer/audience JWT exige novo login.

Gere a extensao 1.16.0 com `pnpm build:extension`, redistribua `tools/embratel-rec-extension/dist` e configure nela a nova credencial contida em `extension-relay-secret.txt`.

## 7. Rollback

Rollback antes de liberar a manutencao e antes de novas escritas e seguro:

```bash
sudo ./scripts/oci/maintenance.sh on
sudo ./scripts/oci/cloudflare-dns.sh rollback /srv/comunora/backups/cloudflare-dns-AAAAMMDD-HHMMSS.json
```

```powershell
./scripts/oci/railway-cutover.ps1 -Action Rollback -StateFile C:\comunora-secrets\railway-scale.json -Server IP_OCI
```

Depois que o OCI aceitar novas mensagens ou alteracoes, apontar DNS diretamente ao Railway causa perda dessas escritas. Nesse caso, mantenha manutencao e faca uma migracao reversa/reconciliacao antes do rollback. O ambiente antigo mantido por 72 horas e uma rede de seguranca, nao replicacao continua.

## 8. Operacao apos o corte

- Configure UptimeRobot gratuito, a cada cinco minutos, para app `/health`, API `/health`, Evolution `/` e relay `/health`.
- Verifique `systemctl list-timers 'comunora-*'` e `journalctl -u comunora-healthcheck.service`.
- O backup diario mantem 7 diarios e 2 semanais, com limite preventivo de 15 GiB.
- O restore-check semanal restaura ambos os PostgreSQL em containers descartaveis e valida os dois RDBs.
- Nao exclua Railway antes de 72 horas, backup validado e autorizacao explicita.
