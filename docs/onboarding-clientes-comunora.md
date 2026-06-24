# Onboarding de clientes Comunora

Este documento define o fluxo padrao para colocar um novo cliente em operacao.

## Objetivo

Fazer o cliente sair do cadastro com:

- WhatsApp conectado.
- Provedor de IA validado.
- Agente criado e vinculado a um numero.
- Google Calendar conectado quando houver agenda.
- Lembretes e reativacao configurados.
- Primeiro teste controlado realizado com numero interno.

## Primeiros 15 minutos

1. Criar conta ou confirmar acesso do cliente.
2. Confirmar assinatura ativa.
3. Abrir **Conectar WhatsApp**.
4. Escolher segmento:
   - Nutricionista.
   - Cabeleireiro ou salao.
   - Advogado.
   - Corretor de imoveis.
   - Atendimento comercial generico.
5. Aplicar template do segmento.
6. Gerar QR Code e conectar o WhatsApp.
7. Abrir **IA e Custos** e cadastrar a chave do provedor.
8. Testar a chave.
9. Abrir **Agentes** e revisar:
   - numero vinculado;
   - provider;
   - modelo;
   - horario de funcionamento;
   - prompt;
   - status ativo/pausado.
10. Abrir **Integracoes** e conectar Google Calendar, se o cliente agenda horarios.
11. Abrir **Agenda** e configurar lembrete.
12. Abrir **Leads** e configurar reativacao.

## Teste controlado obrigatorio

Antes de liberar para clientes reais, use um numero interno.

Fluxos minimos:

- Mensagem entra no Inbox.
- Agente responde.
- Atendente consegue assumir conversa.
- Agendamento e criado.
- Evento aparece no Google Calendar.
- Lembrete chega no WhatsApp.
- Resposta `1` confirma.
- Resposta `2` marca remarcacao.
- Resposta `3` cancela.

## Templates por segmento

### Nutricionista

Foco:

- objetivo do paciente;
- restricoes alimentares;
- disponibilidade;
- agendamento;
- lembrete 24h antes;
- reativacao de pacientes sem retorno.

### Cabeleireiro e salao

Foco:

- servico desejado;
- profissional;
- data e horario;
- confirmacao;
- lista de espera;
- reativacao de clientes antigos.

### Advogado

Foco:

- triagem inicial;
- coleta de dados objetivos;
- area do caso;
- agendamento de reuniao;
- sem parecer juridico automatico.

### Corretor de imoveis

Foco:

- tipo de imovel;
- regiao;
- faixa de preco;
- urgencia;
- agendamento de visita;
- follow-up de leads frios.

## Regra de corte

Nao libere o cliente como "implantado" se qualquer item abaixo estiver pendente:

- WhatsApp conectado.
- Chave de IA testada.
- Agente vinculado ao numero certo.
- Prompt revisado.
- Fluxo de agenda validado quando o cliente depende de agenda.
- Atendimento humano testado.

