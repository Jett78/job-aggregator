export type JobSource =
  | 'remoteok'
  | 'arbeitnow'
  | 'remotive'
  | 'jobicy'
  | 'kumarijob';

export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  url: string;
  source: JobSource;
  sourceUrl: string;
  publishedAt: string;
  tags: string[];
}

export interface SourceStatus {
  source: JobSource;
  count: number;
  ok: boolean;
}

export interface JobsResponse {
  data: JobListing[];
  total: number;
  cachedAt: string;
  sources: SourceStatus[];
}

export const SOURCE_LABELS: Record<JobSource, string> = {
  remoteok: 'RemoteOK',
  arbeitnow: 'Arbeitnow',
  remotive: 'Remotive',
  jobicy: 'Jobicy',
  kumarijob: 'KumariJob',
};

export const NEPAL_BOARDS = [
  {
    name: 'Cari Jobs',
    description: 'Frontend developer listings in Nepal.',
    url: 'https://jobs.carinepal.com/jobs/frontend-developer',
  },
];
