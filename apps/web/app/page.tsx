'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { API_ROUTES } from '@/config/api-routes';
import {
  JobListing,
  JobSource,
  JobsResponse,
  NEPAL_BOARDS,
  SOURCE_LABELS,
} from '@/types/job';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Search,
  MapPin,
  ExternalLink,
  Clock,
  RefreshCw,
  WifiOff,
  SearchX,
  Globe2,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type RemoteFilter = 'all' | 'remote' | 'onsite';

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? '1 day ago' : `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

function JobCard({ job }: { job: JobListing }) {
  return (
    <Card className="flex flex-col transition-shadow hover:shadow-md">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-base font-semibold leading-snug hover:text-primary hover:underline"
          >
            {job.title}
          </a>
          <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{job.company}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{job.location}</span>
            {job.remote && (
              <Badge variant="secondary" className="ml-1 text-xs">
                Remote
              </Badge>
            )}
          </div>
        </div>

        {job.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {job.tags.slice(0, 5).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex shrink-0 items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(job.publishedAt)}
            </span>
            <span className="truncate">
              via{' '}
              <a
                href={job.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-primary"
              >
                {SOURCE_LABELS[job.source]}
              </a>
            </span>
          </div>
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: 'sm' }), 'shrink-0')}
          >
            Apply
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function JobSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-8 w-20 animate-pulse rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}

const SOURCE_OPTIONS: { value: 'all' | JobSource; label: string }[] = [
  { value: 'all', label: 'All sources' },
  { value: 'remoteok', label: 'RemoteOK' },
  { value: 'arbeitnow', label: 'Arbeitnow' },
  { value: 'remotive', label: 'Remotive' },
  { value: 'jobicy', label: 'Jobicy' },
];

const REMOTE_OPTIONS: { value: RemoteFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'remote', label: 'Remote' },
  { value: 'onsite', label: 'On-site' },
];

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [source, setSource] = useState<'all' | JobSource>('all');
  const [remoteFilter, setRemoteFilter] = useState<RemoteFilter>('all');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const params = useMemo(() => {
    const search = new URLSearchParams();
    if (debouncedQuery) search.set('q', debouncedQuery);
    if (source !== 'all') search.set('source', source);
    if (remoteFilter === 'remote') search.set('remote', 'true');
    if (remoteFilter === 'onsite') search.set('remote', 'false');
    return search.toString();
  }, [debouncedQuery, source, remoteFilter]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['jobs', params],
    queryFn: () =>
      apiClient<JobsResponse>(
        params ? `${API_ROUTES.JOBS}?${params}` : API_ROUTES.JOBS,
      ),
    staleTime: 5 * 60 * 1000,
  });

  const jobs = data?.data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      {/* Header */}
      <header className="py-8 text-center sm:py-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Frontend & Fullstack Jobs
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
          Live remote & global listings, refreshed every 30 minutes — plus quick
          links to Nepal job boards.
        </p>
      </header>

      {/* Search + filters */}
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, company, or tag… (e.g. react, next.js)"
            className="pl-9"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {SOURCE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={source === opt.value ? 'default' : 'outline'}
              onClick={() => setSource(opt.value)}
              className="rounded-full"
            >
              {opt.label}
            </Button>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
          {REMOTE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={remoteFilter === opt.value ? 'secondary' : 'ghost'}
              onClick={() => setRemoteFilter(opt.value)}
              className="rounded-full"
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Results meta */}
      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <p>
          {isLoading ? (
            'Loading jobs…'
          ) : (
            <>
              <span className="font-semibold text-foreground">
                {data?.total ?? 0}
              </span>{' '}
              jobs
              {data?.cachedAt && (
                <> · updated {timeAgo(data.cachedAt)}</>
              )}
            </>
          )}
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={cn('mr-1.5 h-3.5 w-3.5', isFetching && 'animate-spin')}
          />
          Refresh
        </Button>
      </div>

      {/* Results */}
      <main className="mt-4">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <JobSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <WifiOff className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">Couldn’t load jobs</p>
              <p className="text-sm text-muted-foreground">
                The job API might be starting up or a source is down. Try again
                in a moment.
              </p>
              <Button onClick={() => refetch()}>Retry</Button>
            </CardContent>
          </Card>
        ) : jobs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <SearchX className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">No jobs found</p>
              <p className="text-sm text-muted-foreground">
                Try a different keyword or clear the filters.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('');
                  setSource('all');
                  setRemoteFilter('all');
                }}
              >
                Clear filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </main>

      {/* Nepal boards */}
      <section className="mt-12">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Globe2 className="h-5 w-5" />
          Nepal job boards
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These boards don’t offer a public API, so they open in a new tab.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {NEPAL_BOARDS.map((board) => (
            <a
              key={board.name}
              href={board.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <p className="font-semibold">{board.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {board.description}
                    </p>
                  </div>
                  <ExternalLink className="h-5 w-5 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      </section>

      {/* Attribution footer */}
      <footer className="mt-12 border-t pt-6 text-center text-xs text-muted-foreground">
        <p>
          Listings via{' '}
          <a
            href="https://remoteok.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            RemoteOK
          </a>
          {', '}
          <a
            href="https://www.arbeitnow.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Arbeitnow
          </a>
          {', '}
          <a
            href="https://remotive.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Remotive
          </a>
          {' and '}
          <a
            href="https://jobicy.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Jobicy
          </a>
          . Apply links always go to the original posting.
        </p>
      </footer>
    </div>
  );
}
