export type JobSource =
  | 'remoteok'
  | 'arbeitnow'
  | 'remotive'
  | 'jobicy'
  | 'merojob'
  | 'kumarijob'
  | 'jobsnepal'
  | 'hamrojobs';

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
  merojob: 'MeroJob',
  kumarijob: 'KumariJob',
  jobsnepal: 'JobsNepal',
  hamrojobs: 'HamroJobs',
};

export const NEPAL_BOARDS = [
  {
    name: 'merojob',
    description: 'Nepal’s largest job portal — search frontend & IT roles.',
    url: 'https://merojob.com',
  },
  {
    name: 'Cari Jobs',
    description: 'Frontend developer listings in Nepal.',
    url: 'https://jobs.carinepal.com/jobs/frontend-developer',
  },
];
