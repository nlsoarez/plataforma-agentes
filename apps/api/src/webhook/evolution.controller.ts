import { Controller, Post, Body, Headers, Res, HttpStatus } from '@nestjs/common';
import { Queue } from 'bullmq';
import { EvolutionDriver } from '@plataforma/transport';

const fila = new Queue('eventos-whatsapp', { connection: { url: process.env.REDIS_URL } as any });
const driver = new EvolutionDriver();

@Controller('webhook')
export class EvolutionWebhookController {
  @Post('evolution')
  async receber(@Body() body: any, @Headers('apikey') apikey: string, @Res() res: any) {
    // Se a apikey vier no header, confere; senão segue (Evolution nem sempre envia).
    if (apikey && process.env.EVOLUTION_API_KEY && apikey !== process.env.EVOLUTION_API_KEY) {
      return res.sendStatus(HttpStatus.UNAUTHORIZED);
    }
    const eventos = driver.parseWebhook(body);
    for (const ev of eventos) await fila.add('evento', ev);
    return res.sendStatus(HttpStatus.OK);
  }
}
