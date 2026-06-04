import { Controller, Get, Post, Query, Body, Req, Res, HttpStatus } from '@nestjs/common';
import * as crypto from 'crypto';
import { Queue } from 'bullmq';
import { CloudApiDriver } from '@plataforma/transport';

const fila = new Queue('eventos-whatsapp', {
  connection: { url: process.env.REDIS_URL } as any,
});
const driver = new CloudApiDriver();

@Controller('webhook')
export class WebhookController {
  // Handshake de verificação da Meta (GET).
  @Get()
  verificar(@Query() q: any, @Res() res: any) {
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === process.env.META_VERIFY_TOKEN) {
      return res.status(HttpStatus.OK).send(q['hub.challenge']);
    }
    return res.sendStatus(HttpStatus.FORBIDDEN);
  }

  // Recebe eventos (POST): valida assinatura, normaliza, enfileira. Responde 200 rápido.
  @Post()
  async receber(@Req() req: any, @Body() body: any, @Res() res: any) {
    if (!this.assinaturaValida(req)) return res.sendStatus(HttpStatus.UNAUTHORIZED);
    const eventos = driver.parseWebhook(body);
    for (const ev of eventos) await fila.add('evento', ev);
    return res.sendStatus(HttpStatus.OK);
  }

  private assinaturaValida(req: any): boolean {
    const assinatura = req.headers['x-hub-signature-256'];
    if (!assinatura || !req.rawBody) return false;
    const esperado =
      'sha256=' +
      crypto.createHmac('sha256', process.env.META_APP_SECRET ?? '')
        .update(req.rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado));
  }
}
