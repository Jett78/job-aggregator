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
  /** Direct link to the original listing (apply link). Sources require link-back attribution. */
  url: string;
  source: JobSource;
  /** Homepage of the source board, shown as "via <source>". */
  sourceUrl: string;
  publishedAt: string;
  tags: string[];
}

export interface SourceStatus {
  source: JobSource;
  count: number;
  ok: boolean;
}

export interface JobsCache {
  listings: JobListing[];
  cachedAt: string;
  expiresAt: number;
  sources: SourceStatus[];
}
