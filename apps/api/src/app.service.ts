import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return {
      message: 'Job Aggregator API',
      endpoints: {
        jobs: 'GET /jobs?q=&source=&remote=',
        sources: 'GET /jobs/sources',
        health: 'GET /health',
      },
    };
  }

  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
