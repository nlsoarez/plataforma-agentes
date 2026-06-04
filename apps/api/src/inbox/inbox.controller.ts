import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { assinar } from '@plataforma/bus';

// Stream SSE do inbox ao vivo. O painel consome com EventSource.
@Controller('inbox')
export class InboxController {
  @Get('stream')
  stream(@Query() q: any, @Req() req: any, @Res() res: any) {
    // !!! SEGURANCA: em producao, derive o tenantId da SESSAO AUTENTICADA do usuario.
    // NUNCA confie no query param — senao qualquer um assina o canal de qualquer agencia.
    const tenantId: string | undefined = q.tenantId;
    if (!tenantId) { res.status(400).end('tenantId obrigatorio (placeholder ate ter auth)'); return; }

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders?.();
    res.write(`event: ready\ndata: {}\n\n`);

    const cancelar = assinar(tenantId, (ev) => {
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    });

    const ping = setInterval(() => res.write(`: ping\n\n`), 25000); // mantem a conexao viva
    req.on('close', () => { clearInterval(ping); cancelar(); });
  }
}
