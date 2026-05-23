import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { DatabaseService } from '../db/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get()
  async check(): Promise<{ status: 'ok'; checks: { db: 'ok' } }> {
    try {
      await this.databaseService.ping();

      return {
        status: 'ok',
        checks: {
          db: 'ok',
        },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'fail',
        checks: {
          db: 'fail',
        },
      });
    }
  }
}
