import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { assinar } from '@plataforma/bus';

@Controller('inbox')
@UseGuards(AuthGuard)
export class InboxController {
  // Stream SSE do inbox ao vivo. O painel consome com fetch + Authorization.
  // O tenant vem da SESSAO autenticada — nunca de query param. Sem vazamento entre agencias.
  @Get('stream')
  stream(@Req() req: any, @Res() res: any) {
    const tenantId: string = req.user.tenantId;

    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders?.();
    res.write(`event: ready\ndata: {}\n\n`);

    const cancelar = assinar(tenantId, (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`));
    const ping = setInterval(() => res.write(`: ping\n\n`), 25000);
    req.on('close', () => { clearInterval(ping); cancelar(); });
  }
}
