# Playbook de suporte Comunora

Use este roteiro para diagnosticar problemas recorrentes sem pular etapas.

## Prioridades de suporte

1. Mensagens nao chegam no Inbox.
2. Agente nao responde.
3. WhatsApp desconectado.
4. Google Calendar nao conecta ou nao cria evento.
5. Lembrete nao enviado.
6. Reativacao nao disparou.
7. Pagamento ou acesso bloqueado.
8. Layout, cadastro ou duvida operacional.

## Mensagens nao chegam no Inbox

Verifique:

1. A conexao esta `open` em **Conexoes WhatsApp**?
2. A instancia existe na Evolution API?
3. O webhook da instancia aponta para a API da Comunora?
4. Eventos recentes mostram `WEBHOOK_RECEIVED`?
5. O evento normalizou pelo menos 1 mensagem?
6. O projeto esta vinculado ao numero correto?

Se `WEBHOOK_RECEIVED` aparece com `normalizados: 0`, o problema provavelmente esta no payload recebido ou no mapeamento da instancia.

## Agente nao responde

Verifique:

1. A mensagem chegou no Inbox?
2. O agente esta ativo?
3. O agente esta pausado?
4. O horario de funcionamento permite resposta naquele momento?
5. A chave de IA foi salva e testada?
6. O modelo configurado existe no provedor?
7. Existe erro recente em **Conexoes WhatsApp**?

Nao culpe a IA antes de confirmar webhook, numero vinculado e status do agente.

## WhatsApp desconectado

Verifique:

1. Estado da instancia na Evolution API.
2. Botao **Verificar** em Conexoes.
3. Se necessario, desconectar e gerar nova conexao.
4. Depois de reconectar, envie mensagem de teste.

## Google Calendar

Verifique:

1. OAuth Google esta aprovado ou usuario esta como testador?
2. A conta conectada e a conta dona da agenda?
3. Escopos configurados:
   - `calendar.events`
   - `calendar.events.freebusy`
4. A integracao aparece conectada em **Integracoes**?
5. O evento foi criado pela tela **Agenda**?

## Lembretes de agenda

Verifique:

1. Configuracao de lembrete esta ativa em **Agenda**.
2. Agendamento esta dentro da janela de antecedencia.
3. Numero do contato esta correto.
4. Projeto tem WhatsApp conectado.
5. Tabela `appointment_reminders` nao tem envio duplicado ou falha.

## Reativacao de leads

Verifique:

1. Reativacao esta ativa em **Leads**.
2. Lead tem ultima interacao antiga o suficiente.
3. Limite diario nao foi atingido.
4. Janela de reenvio nao bloqueia novo disparo.
5. Lead pertence ao projeto correto.

## Respostas padrao para suporte

### WhatsApp

"Vamos validar a conexao do numero, o webhook e se a mensagem chegou normalizada no Inbox. Me envie o numero conectado, projeto e horario aproximado do teste."

### Agente

"Primeiro precisamos confirmar se a mensagem chegou no Inbox. Se chegou, vamos revisar status do agente, horario de funcionamento, numero vinculado e chave de IA."

### Agenda

"Vamos conferir se o Google Calendar esta conectado com a conta certa e se a agenda tem disponibilidade no horario solicitado."

### Pagamento

"Vamos verificar o status da assinatura e a ultima cobranca registrada. Se o pagamento foi feito agora, pode existir atraso de confirmacao do provedor."

