import { Controller, Get, Query } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobSource } from './job-listing.interface';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  async findAll(
    @Query('q') q?: string,
    @Query('source') source?: string,
    @Query('remote') remote?: string,
  ) {
    const { listings, cachedAt, sources } = await this.jobsService.getJobs();

    let filtered = listings;

    if (source) {
      const wanted = source
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      filtered = filtered.filter((job) =>
        wanted.includes(job.source as string),
      );
    }

    if (remote === 'true') {
      filtered = filtered.filter((job) => job.remote);
    } else if (remote === 'false') {
      filtered = filtered.filter((job) => !job.remote);
    }

    if (q && q.trim()) {
      const needle = q.trim().toLowerCase();
      filtered = filtered.filter((job) =>
        [job.title, job.company, job.location, ...job.tags]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }

    return {
      data: filtered,
      total: filtered.length,
      cachedAt,
      sources,
    };
  }

  @Get('sources')
  async getSources() {
    const { sources, cachedAt } = await this.jobsService.getJobs();
    const labels: Record<JobSource, string> = {
      remoteok: 'RemoteOK',
      arbeitnow: 'Arbeitnow',
      remotive: 'Remotive',
      jobicy: 'Jobicy',
    };
    return {
      data: sources.map((s) => ({ ...s, label: labels[s.source] })),
      cachedAt,
    };
  }
}
