import { Controller, Get, Query } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobListing, JobSource } from './job-listing.interface';

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

    const needle = q?.trim().toLowerCase() ?? '';

    // Live-query kumarijob's autocomplete API for the user's term. These
    // results are already term-matched, so the q text filter below must
    // not exclude them — but source/remote filters still apply.
    let live: JobListing[] = [];
    if (needle) {
      live = await this.jobsService.searchKumarijobLive(needle);
    }

    const wanted = source
      ? source
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      : null;
    const matchSource = (job: JobListing) =>
      !wanted || wanted.includes(job.source as string);
    const matchRemote = (job: JobListing) =>
      remote === 'true'
        ? job.remote
        : remote === 'false'
          ? !job.remote
          : true;

    let filtered = listings.filter(matchSource).filter(matchRemote);
    const liveFiltered = live.filter(matchSource).filter(matchRemote);

    if (needle) {
      filtered = filtered.filter((job) =>
        [job.title, job.company, job.location, ...job.tags]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }

    // Merge live results first, dedupe by id (a live hit may duplicate a
    // cached kumarijob listing), newest first.
    const seen = new Set<string>();
    const merged = [...liveFiltered, ...filtered].filter((job) => {
      if (seen.has(job.id)) return false;
      seen.add(job.id);
      return true;
    });
    merged.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );

    return {
      data: merged,
      total: merged.length,
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
      kumarijob: 'KumariJob',
    };
    return {
      data: sources.map((s) => ({ ...s, label: labels[s.source] })),
      cachedAt,
    };
  }
}
