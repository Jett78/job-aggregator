'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  Search,
  MapPin,
  ArrowUpRight,
  Clock,
  RefreshCw,
  WifiOff,
  SearchX,
  Globe2,
  Briefcase,
  Sparkles,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ---------------------------------- utils --------------------------------- */

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

const MONOGRAM_GRADIENTS = [
  'from-violet-500 to-fuchsia-500',
  'from-sky-500 to-indigo-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-cyan-500 to-blue-500',
  'from-lime-500 to-emerald-600',
  'from-purple-500 to-indigo-600',
];

function monogramGradient(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return MONOGRAM_GRADIENTS[h % MONOGRAM_GRADIENTS.length] ?? MONOGRAM_GRADIENTS[0]!;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]).join('').toUpperCase() || '?';
}

/* --------------------------------- pieces --------------------------------- */

function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-[#07080b]" />
      <div className="absolute inset-0 bg-grid mask-fade-b opacity-70" />
      <div className="absolute -top-40 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-lime-400/[0.07] blur-[140px]" />
      <div className="absolute top-1/3 -left-40 h-[420px] w-[420px] rounded-full bg-indigo-500/[0.08] blur-[130px]" />
      <div className="absolute -right-40 bottom-0 h-[420px] w-[420px] rounded-full bg-emerald-500/[0.06] blur-[130px]" />
    </div>
  );
}

function Header({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#07080b]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime-400 shadow-[0_0_24px_rgb(163_230_53/0.35)]">
            <Briefcase className="h-4.5 w-4.5 text-black" strokeWidth={2.25} />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">
            Job<span className="text-gradient">Board</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400 sm:inline-flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-lime-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-400" />
            </span>
            Live
          </span>
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-sm font-medium text-zinc-300 transition hover:border-lime-300/30 hover:text-white"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function JobCard({ job, index }: { job: JobListing; index: number }) {
  return (
    <article
      className="group animate-fade-up relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-lime-300/25 hover:bg-white/[0.05] hover:shadow-[0_20px_60px_-20px_rgb(163_230_53/0.15)]"
      style={{ animationDelay: `${Math.min(index, 11) * 45}ms` }}
    >
      <div className="flex items-start gap-3.5">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br font-display text-sm font-bold text-white shadow-lg',
            monogramGradient(job.company),
          )}
        >
          {initials(job.company)}
        </div>
        <div className="min-w-0 flex-1">
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate font-display text-[15px] font-semibold leading-snug text-zinc-100 transition-colors group-hover:text-lime-200"
          >
            {job.title}
          </a>
          <p className="mt-0.5 truncate text-sm text-zinc-400">{job.company}</p>
        </div>
        {job.remote ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-lime-300/25 bg-lime-300/10 px-2.5 py-1 text-[11px] font-semibold text-lime-200">
            <Zap className="h-3 w-3" />
            Remote
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-zinc-400">
            <MapPin className="h-3 w-3" />
            <span className="max-w-[90px] truncate">{job.location}</span>
          </span>
        )}
      </div>

      {job.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {job.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-white/[0.05] px-2 py-1 font-mono text-[11px] text-zinc-400 transition-colors group-hover:text-zinc-300"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4">
        <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-zinc-500">
          <span className="inline-flex shrink-0 items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeAgo(job.publishedAt)}
          </span>
          <span className="text-zinc-700">·</span>
          <span className="truncate">
            via{' '}
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-lime-300"
            >
              {SOURCE_LABELS[job.source]}
            </a>
          </span>
        </div>
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-lime-400 px-4 py-2 text-[13px] font-bold text-black transition-all hover:bg-lime-300 hover:shadow-[0_0_20px_rgb(163_230_53/0.4)]"
        >
          Apply
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </a>
      </div>
    </article>
  );
}

function JobSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-start gap-3.5">
        <div className="h-11 w-11 shrink-0 animate-shimmer rounded-xl bg-[linear-gradient(110deg,rgba(255,255,255,0.04)_40%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.04)_60%)] bg-[length:200%_100%]" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-4/5 animate-shimmer rounded bg-[linear-gradient(110deg,rgba(255,255,255,0.04)_40%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.04)_60%)] bg-[length:200%_100%]" />
          <div className="h-3 w-2/5 animate-shimmer rounded bg-[linear-gradient(110deg,rgba(255,255,255,0.04)_40%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.04)_60%)] bg-[length:200%_100%]" />
        </div>
      </div>
      <div className="mt-4 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-6 w-16 animate-shimmer rounded-md bg-[linear-gradient(110deg,rgba(255,255,255,0.04)_40%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.04)_60%)] bg-[length:200%_100%]"
          />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4">
        <div className="h-3 w-28 animate-shimmer rounded bg-[linear-gradient(110deg,rgba(255,255,255,0.04)_40%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.04)_60%)] bg-[length:200%_100%]" />
        <div className="h-8 w-20 animate-shimmer rounded-full bg-[linear-gradient(110deg,rgba(255,255,255,0.04)_40%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.04)_60%)] bg-[length:200%_100%]" />
      </div>
    </div>
  );
}

/* ---------------------------------- page ---------------------------------- */

const SOURCE_OPTIONS: { value: 'all' | JobSource; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'remoteok', label: 'RemoteOK' },
  { value: 'arbeitnow', label: 'Arbeitnow' },
  { value: 'remotive', label: 'Remotive' },
  { value: 'jobicy', label: 'Jobicy' },
  { value: 'kumarijob', label: 'KumariJob' },
  { value: 'themuse', label: 'TheMuse' },
  { value: 'weworkremotely', label: 'We Work Remotely' },
  { value: 'workingnomads', label: 'Working Nomads' },
  { value: 'jobsbylevel', label: 'Jobs by Level' },
  { value: 'hnhiring', label: 'HN Hiring' },
];

const REMOTE_OPTIONS: { value: RemoteFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'remote', label: 'Remote' },
  { value: 'onsite', label: 'On-site' },
];

const POPULAR = ['react', 'next.js', 'fullstack', 'typescript'];

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [source, setSource] = useState<'all' | JobSource>('all');
  const [remoteFilter, setRemoteFilter] = useState<RemoteFilter>('all');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 400);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    <div className="relative min-h-screen">
      <AmbientBackground />
      <Header onRefresh={() => refetch()} refreshing={isFetching} />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Hero */}
        <section className="pb-8 pt-12 text-center sm:pt-16">
          <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/[0.07] px-4 py-1.5 text-[13px] font-medium text-lime-200">
            <Sparkles className="h-3.5 w-3.5" />
            Frontend & fullstack · Nepal + remote
          </div>
          <h1
            className="animate-fade-up mx-auto mt-6 max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl"
            style={{ animationDelay: '80ms' }}
          >
            Stop tab-hopping.
            <br />
            <span className="text-gradient">Start applying.</span>
          </h1>
          <p
            className="animate-fade-up mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-zinc-400 sm:text-base"
            style={{ animationDelay: '160ms' }}
          >
            Every frontend and fullstack opening — remote, global, and Nepal —
            pulled live from ten job boards into one board.
          </p>

          {/* Search */}
          <div
            className="animate-fade-up mx-auto mt-8 max-w-2xl"
            style={{ animationDelay: '240ms' }}
          >
            <div className="group relative">
              <div className="absolute -inset-0.5 rounded-[20px] bg-gradient-to-r from-lime-400/30 via-emerald-400/10 to-indigo-500/20 opacity-60 blur-md transition-opacity group-focus-within:opacity-100" />
              <div className="relative flex items-center rounded-2xl border border-white/10 bg-[#0c0e12]/90 backdrop-blur-xl transition-colors focus-within:border-lime-300/40">
                <Search className="ml-5 h-5 w-5 shrink-0 text-zinc-500" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search title, company, or stack…"
                  className="h-14 w-full bg-transparent px-4 text-[15px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                />
                <kbd className="mr-4 hidden shrink-0 rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 font-mono text-[11px] text-zinc-500 sm:block">
                  /
                </kbd>
              </div>
            </div>
            <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-600">
                Popular
              </span>
              {POPULAR.map((p) => (
                <button
                  key={p}
                  onClick={() => setQuery(p)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-xs text-zinc-400 transition hover:border-lime-300/30 hover:text-lime-200"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Filter bar */}
        <div className="sticky top-16 z-30 -mx-4 px-4 py-3 sm:-mx-6 sm:px-6">
          <div className="glass mx-auto flex max-w-6xl flex-wrap items-center gap-2 rounded-2xl p-2 shadow-[0_8px_40px_-12px_rgb(0_0_0/0.6)]">
            <div className="flex rounded-full bg-white/[0.05] p-1">
              {REMOTE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRemoteFilter(opt.value)}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-[13px] font-medium transition-all',
                    remoteFilter === opt.value
                      ? 'bg-lime-400 font-bold text-black shadow-[0_0_16px_rgb(163_230_53/0.35)]'
                      : 'text-zinc-400 hover:text-zinc-100',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />
            <div className="flex flex-wrap items-center gap-1.5">
              {SOURCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSource(opt.value)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all',
                    source === opt.value
                      ? 'border-lime-300/40 bg-lime-300/10 text-lime-200'
                      : 'border-transparent text-zinc-500 hover:border-white/10 hover:text-zinc-200',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-3 pr-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-600">
                {isLoading ? (
                  'loading…'
                ) : (
                  <>
                    <span className="text-lime-300">{data?.total ?? 0}</span>{' '}
                    roles
                    {data?.cachedAt && (
                      <span className="text-zinc-600">
                        {' '}
                        · {timeAgo(data.cachedAt)}
                      </span>
                    )}
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Results */}
        <section className="mt-6 pb-4">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <JobSkeleton key={i} />
              ))}
            </div>
          ) : isError ? (
            <div className="animate-fade-up mx-auto max-w-md rounded-2xl border border-white/[0.07] bg-white/[0.03] p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <WifiOff className="h-6 w-6 text-zinc-500" />
              </div>
              <p className="mt-4 font-display text-lg font-semibold text-white">
                Couldn’t load jobs
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
                The API might be waking up or a source is down. Give it a
                moment and retry.
              </p>
              <button
                onClick={() => refetch()}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-lime-400 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-lime-300"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          ) : jobs.length === 0 ? (
            <div className="animate-fade-up mx-auto max-w-md rounded-2xl border border-white/[0.07] bg-white/[0.03] p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <SearchX className="h-6 w-6 text-zinc-500" />
              </div>
              <p className="mt-4 font-display text-lg font-semibold text-white">
                No roles match
              </p>
              <p className="mt-1.5 text-sm text-zinc-500">
                Try a different keyword or clear the filters.
              </p>
              <button
                onClick={() => {
                  setQuery('');
                  setSource('all');
                  setRemoteFilter('all');
                }}
                className="mt-5 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-lime-300/40 hover:text-lime-200"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {jobs.map((job, i) => (
                <JobCard key={job.id} job={job} index={i} />
              ))}
            </div>
          )}
        </section>

        {/* Nepal boards */}
        <section className="mt-10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
              <Globe2 className="h-4.5 w-4.5 text-lime-300" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight text-white">
                Nepal job boards
              </h2>
              <p className="text-[13px] text-zinc-500">
                No public API here — these open in a new tab.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {NEPAL_BOARDS.map((board, i) => (
              <a
                key={board.name}
                href={board.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group animate-fade-up relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-lime-300/25 hover:bg-white/[0.05]"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-lime-400/[0.06] blur-3xl transition-opacity opacity-0 group-hover:opacity-100" />
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-display text-lg font-bold text-white">
                      {board.name}
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
                      {board.description}
                    </p>
                  </div>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] transition-all group-hover:border-lime-300/40 group-hover:bg-lime-400">
                    <ArrowUpRight className="h-5 w-5 text-zinc-300 transition-all group-hover:text-black" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-10 border-t border-white/[0.06] py-8 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-600">
            Listings via
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
            {[
              ['RemoteOK', 'https://remoteok.com'],
              ['Arbeitnow', 'https://www.arbeitnow.com'],
              ['Remotive', 'https://remotive.com'],
              ['Jobicy', 'https://jobicy.com'],
            ].map(([name, url]) => (
              <a
                key={name}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 underline decoration-zinc-800 underline-offset-4 transition-colors hover:text-lime-300"
              >
                {name}
              </a>
            ))}
          </div>
          <p className="mt-4 text-xs text-zinc-600">
            Apply links always go to the original posting.
          </p>
        </footer>
      </main>
    </div>
  );
}
