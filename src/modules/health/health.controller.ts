import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly service: HealthService) {}
  @Get()
  @Public()
  async health(@Res() response: Response) {
    const result = await this.service.ready();
    return response.status(result.status === 'ok' ? 200 : 503).json(result);
  }
  @Get('live')
  @Public()
  live() {
    return this.service.live();
  }
  @Get('ready')
  @Public()
  async ready(@Res() response: Response) {
    const result = await this.service.ready();
    return response.status(result.status === 'ok' ? 200 : 503).json(result);
  }
}
