import { Controller, Get, Post, Query, Body, Req, Res, HttpStatus } from '@nestjs/common';
import * as crypto from 'crypto';
import { Queue } from 'bullmq';
import { CloudApiDriver } from '@plataforma/transport';
import { resolverSegredo } from '@plataforma/shared';

const fila = new Queue('eventos-whatsapp', { connection: { url: process.env.REDIS_URL } as any });

// A api só PARSEIA o webhook; não envia mensagem. O resolver aqui é placeholder.
const driver = new CloudApiDriver(async () => '');

@Controller('webhook')
export class WebhookController {
  @Get()
  verificar(@Query() q: any, @Res() res: any) {
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === process.env.META_VERIFY_TOKEN) {
      return res.status(HttpStatus.OK).send(q['hub.challenge']);
    }
    return res.sendStatus(HttpStatus.FORBIDDEN);
  }

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
    const esperado = 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET ?? '').update(req.rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperado));
  }
}
