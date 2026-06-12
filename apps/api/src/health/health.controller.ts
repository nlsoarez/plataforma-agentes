import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  status() {
    return {
      ok: true,
      service: 'api',
      brand: process.env.PUBLIC_BRAND_NAME || 'Comunora',
      timestamp: new Date().toISOString(),
    };
  }
}
