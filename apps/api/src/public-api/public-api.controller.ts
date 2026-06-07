import { Body, Controller, Get, Headers, HttpException, HttpStatus, NotFoundException, Param, Patch, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { criarDriver } from '@plataforma/transport';
import { autenticarApiKey } from './api-key-auth';
import { checkRateLimit } from './rate-limit';

const driver = criarDriver();

@Controller('api/v1')
export class PublicApiController {
  private async ctx(headers: Record<string, any>, req?: any) {
    const auth = await autenticarApiKey(headers['x-api-key']);
    if (!auth) throw new UnauthorizedException('x-api-key invalida');
    const ip = String(headers['x-forwarded-for'] ?? req?.ip ?? req?.socket?.remoteAddress ?? 'unknown').split(',')[0].trim();
    const decision = checkRateLimit(`${auth.keyId}:${ip}`);
    req?.res?.setHeader?.('x-ratelimit-limit', String(decision.limit));
    req?.res?.setHeader?.('x-ratelimit-remaining', String(decision.remaining));
    req?.res?.setHeader?.('x-ratelimit-reset', String(Math.ceil(decision.resetAt / 1000)));
    if (!decision.allowed) {
      throw new HttpException('rate limit excedido', HttpStatus.TOO_MANY_REQUESTS);
    }
    return auth;
  }

  private async projetoPadrao(q: any, projetoId?: string) {
    const r = await q(
      `select id, phone_number_id from projetos
       where ($1::uuid is null or id=$1) and status='ativo'
       order by criado_em desc limit 1`,
      [projetoId || null],
    );
    if (!r.rows[0]) throw new NotFoundException('Projeto ativo nao encontrado');
    return r.rows[0];
  }

  @Get('leads')
  async listarLeads(@Headers() headers: any, @Req() req: any, @Query('projetoId') projetoId?: string) {
    const auth = await this.ctx(headers, req);
    return comTenant(auth.tenantId, async (q) => {
      const r = await q(
        `select c.id, c.nome, c.telefone as wa_id, c.tags, c.notes, c.metadata,
                c.unread_messages, c.ai_response_block_until, c.ultima_interacao,
                c.criado_em, e.id as column_id, e.nome as column_name
         from contatos c
         left join etapas_pipeline e on e.id=c.etapa_pipeline
         where ($1::uuid is null or c.projeto_id=$1)
         order by coalesce(c.ultima_interacao, c.criado_em) desc
         limit 200`,
        [projetoId || null],
      );
      return r.rows;
    });
  }

  @Patch('leads/:leadNumber/notes')
  async atualizarNotas(@Headers() headers: any, @Req() req: any, @Param('leadNumber') leadNumber: string, @Body() body: { notes: string }) {
    const auth = await this.ctx(headers, req);
    return comTenant(auth.tenantId, async (q) => {
      await q(`update contatos set notes=$2 where telefone=$1`, [leadNumber, body.notes ?? null]);
      return { message: 'Notes updated successfully' };
    });
  }

  @Patch('leads/:leadNumber/properties')
  async atualizarPropriedade(@Headers() headers: any, @Req() req: any, @Param('leadNumber') leadNumber: string, @Body() body: { prop_name: string; prop_value: any }) {
    const auth = await this.ctx(headers, req);
    return comTenant(auth.tenantId, async (q) => {
      await q(
        `update contatos
         set metadata = metadata || jsonb_build_object($2::text, $3::text)
         where telefone=$1`,
        [leadNumber, body.prop_name, String(body.prop_value ?? '')],
      );
      return { message: 'Property updated successfully' };
    });
  }

  @Patch('leads/:leadNumber/kanban')
  async moverKanban(@Headers() headers: any, @Req() req: any, @Param('leadNumber') leadNumber: string, @Body() body: { column_id: string }) {
    const auth = await this.ctx(headers, req);
    return comTenant(auth.tenantId, async (q) => {
      await q(`update contatos set etapa_pipeline=$2 where telefone=$1`, [leadNumber, body.column_id]);
      return { message: 'Update kanban successfully' };
    });
  }

  @Patch('leads/:leadNumber/toggle-attendant-response')
  async toggleIa(@Headers() headers: any, @Req() req: any, @Param('leadNumber') leadNumber: string, @Body() body: { enabled: boolean }) {
    const auth = await this.ctx(headers, req);
    return comTenant(auth.tenantId, async (q) => {
      const r = await q(
        `update conversas c
         set ia_pausada=$2
         from contatos ct
         where ct.id=c.contato_id and ct.telefone=$1
         returning c.id`,
        [leadNumber, !body.enabled],
      );
      return { message: 'AI response updated', updated: r.rowCount };
    });
  }

  @Post('leads/:leadNumber/tags')
  async adicionarTag(@Headers() headers: any, @Req() req: any, @Param('leadNumber') leadNumber: string, @Body() body: { tag: string }) {
    const auth = await this.ctx(headers, req);
    return comTenant(auth.tenantId, async (q) => {
      await q(
        `update contatos set tags = array(select distinct unnest(tags || array[$2]::text[])) where telefone=$1`,
        [leadNumber, body.tag],
      );
      return { message: 'Tag added successfully' };
    });
  }

  @Patch('leads/:leadNumber/tags/remove')
  async removerTag(@Headers() headers: any, @Req() req: any, @Param('leadNumber') leadNumber: string, @Body() body: { tag: string }) {
    const auth = await this.ctx(headers, req);
    return comTenant(auth.tenantId, async (q) => {
      await q(`update contatos set tags = array_remove(tags, $2) where telefone=$1`, [leadNumber, body.tag]);
      return { message: 'Tag removed successfully' };
    });
  }

  @Get('messages/history')
  async historico(@Headers() headers: any, @Req() req: any, @Query('leadNumber') leadNumber: string, @Query('llm_format') llm = 'true') {
    const auth = await this.ctx(headers, req);
    return comTenant(auth.tenantId, async (q) => {
      const lead = (await q(`select * from contatos where telefone=$1 limit 1`, [leadNumber])).rows[0];
      if (!lead) throw new NotFoundException('Lead nao encontrado');
      const msgs = (await q(
        `select m.autor, m.direcao, m.conteudo, m.criada_em
         from mensagens m
         join conversas c on c.id=m.conversa_id
         where c.contato_id=$1
         order by m.criada_em asc
         limit 100`,
        [lead.id],
      )).rows;
      if (llm !== 'false') {
        return {
          context: [
            `Lead: ${lead.nome || 'sem nome'} (${lead.telefone})`,
            `Tags: ${(lead.tags || []).join(', ') || 'nenhuma'}`,
            `Notas: ${lead.notes || 'nenhuma'}`,
            'Historico:',
            ...msgs.map((m: any) => `${m.autor}: ${m.conteudo}`),
          ].join('\n'),
        };
      }
      return { lead, messages: msgs };
    });
  }

  @Post('messages/text')
  async enviarTexto(@Headers() headers: any, @Req() req: any, @Body() body: { leadNumber: string; text: string; projetoId?: string; nome?: string }) {
    const auth = await this.ctx(headers, req);
    return comTenant(auth.tenantId, async (q) => {
      const projeto = await this.projetoPadrao(q, body.projetoId);
      const contato = await q(
        `insert into contatos (tenant_id, projeto_id, telefone, nome)
         values ($1,$2,$3,$4)
         on conflict (projeto_id, telefone) do update set nome=coalesce(excluded.nome, contatos.nome)
         returning id`,
        [auth.tenantId, projeto.id, body.leadNumber, body.nome || null],
      );
      const { messageId } = await driver.enviarTexto(projeto.phone_number_id, body.leadNumber, body.text);
      let conversa = (await q(`select id from conversas where contato_id=$1 and status='aberta' limit 1`, [contato.rows[0].id])).rows[0];
      if (!conversa) {
        conversa = (await q(`insert into conversas (tenant_id, projeto_id, contato_id) values ($1,$2,$3) returning id`, [auth.tenantId, projeto.id, contato.rows[0].id])).rows[0];
      }
      await q(
        `insert into mensagens (tenant_id, conversa_id, direcao, autor, conteudo, meta_message_id)
         values ($1,$2,'outbound','humano',$3,$4)`,
        [auth.tenantId, conversa.id, body.text, messageId],
      );
      return { message: 'Message sent successfully', messageId };
    });
  }

  @Post('messages/media')
  async enviarMidia(@Headers() headers: any, @Req() req: any, @Body() body: { leadNumber: string; mediaUrl: string; mediaType: 'image' | 'document' | 'audio' | 'video'; caption?: string; projetoId?: string }) {
    const auth = await this.ctx(headers, req);
    return comTenant(auth.tenantId, async (q) => {
      const projeto = await this.projetoPadrao(q, body.projetoId);
      const sent = await driver.enviarMidia(projeto.phone_number_id, body.leadNumber, {
        tipo: body.mediaType,
        url: body.mediaUrl,
        legenda: body.caption,
      });
      return { message: 'Media sent successfully', messageId: sent.messageId };
    });
  }
}
