import { comTenant, resolverProjetoPorNumero } from '@plataforma/db';
import { publicar } from '@plataforma/bus';

export async function tratarStatusEntrega(ev: {
  phoneNumberId: string; metaId: string; status: 'entregue' | 'lida' | 'falha';
}) {
  const rota = await resolverProjetoPorNumero(ev.phoneNumberId);
  if (!rota) return;

  await comTenant(rota.tenant_id, async (q) => {
    const r = await q(
      `update mensagens set status_entrega=$1 where meta_message_id=$2 returning conversa_id`,
      [ev.status, ev.metaId],
    );
    const conversaId = r.rows[0]?.conversa_id;
    if (conversaId) {
      await publicar(rota.tenant_id, { tipo: 'status', conversaId, metaId: ev.metaId, status: ev.status });
    }
  });
}
