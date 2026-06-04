import { Injectable, NotFoundException } from '@nestjs/common';
import { comTenant } from '@plataforma/db';
import { CloudApiDriver } from '@plataforma/transport';
import { resolverSegredo } from '@plataforma/shared';
import { publicar } from '@plataforma/bus';

@Injectable()
export class ConversasService {
  private driver = new CloudApiDriver(async (pid) => {
    try { return await resolverSegredo(`WABA_TOKEN_${pid}`); }
    catch { return await resolverSegredo('META_ACCESS_TOKEN'); }
  });

  listar(tenantId: string, projetoId: string) {
    return comTenant(tenantId, async (q) => {
      const r = await q(
        `select c.id, c.status, c.ia_pausada, c.atualizada_em,
                ct.nome, ct.telefone,
                (select conteudo from mensagens m where m.conversa_id=c.id order by criada_em desc limit 1) as ultima
         from conversas c join contatos ct on ct.id=c.contato_id
         where c.projeto_id=$1 order by c.atualizada_em desc limit 50`,
        [projetoId],
      );
      return r.rows;
    });
  }

  mensagens(tenantId: string, conversaId: string) {
    return comTenant(tenantId, async (q) => {
      const r = await q(
        `select autor, direcao, conteudo, status_entrega, criada_em
         from mensagens where conversa_id=$1 order by criada_em asc`,
        [conversaId],
      );
      return r.rows;
    });
  }

  async responder(tenantId: string, conversaId: string, texto: string) {
    return comTenant(tenantId, async (q) => {
      const rota = await q(
        `select p.phone_number_id, ct.telefone
         from conversas c join projetos p on p.id=c.projeto_id join contatos ct on ct.id=c.contato_id
         where c.id=$1`, [conversaId]);
      if (!rota.rows[0]) throw new NotFoundException('conversa nao encontrada');
      const { phone_number_id, telefone } = rota.rows[0];

      const { messageId } = await this.driver.enviarTexto(phone_number_id, telefone, texto);
      await q(
        `insert into mensagens (tenant_id, conversa_id, direcao, autor, conteudo, meta_message_id)
         values ($1,$2,'outbound','humano',$3,$4)`,
        [tenantId, conversaId, texto, messageId]);
      await q(`update conversas set atualizada_em=now() where id=$1`, [conversaId]);
      await publicar(tenantId, { tipo: 'mensagem', conversaId, autor: 'humano', conteudo: texto });
      return { ok: true };
    });
  }

  // Humano assume (pausa IA) ou devolve (religa IA).
  async definirIa(tenantId: string, conversaId: string, pausar: boolean) {
    return comTenant(tenantId, async (q) => {
      await q(`update conversas set ia_pausada=$2, status=$3 where id=$1`,
        [conversaId, pausar, pausar ? 'aguardando' : 'aberta']);
      return { ok: true, ia_pausada: pausar };
    });
  }
}
