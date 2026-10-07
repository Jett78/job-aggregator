import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as cheerio from 'cheerio';
import {
  JobListing,
  JobSource,
  JobsCache,
  SourceStatus,
} from './job-listing.interface';

// Upstream job boards return schemaless JSON; fields are picked defensively
// in the mappers below, so the payloads stay untyped by design.
/* eslint-disable @typescript-eslint/no-explicit-any */

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const LIVE_QUERY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 15_000;

const SOURCE_URLS: Record<JobSource, string> = {
  remoteok: 'https://remoteok.com',
  arbeitnow: 'https://www.arbeitnow.com',
  remotive: 'https://remotive.com',
  jobicy: 'https://jobicy.com',
  kumarijob: 'https://www.kumarijob.com',
  themuse: 'https://www.themuse.com',
  weworkremotely: 'https://weworkremotely.com',
  workingnomads: 'https://www.workingnomads.com',
  jobsbylevel: 'https://jobsbylevel.com',
  hnhiring: 'https://news.ycombinator.com',
};

// Keep any developer role from the Nepalese boards (broader than the
// frontend-only filter used for the global boards).
const NEPAL_DEV_PATTERN =
  /developer|software engineer|front[\s-]?end|full[\s-]?stack|\breact\b|next\.?js|\bweb\b/i;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Keep only frontend / fullstack-relevant roles.
const INCLUDE_PATTERNS = [
  /front[\s-]?end/i,
  /full[\s-]?stack/i,
  /\breact\b/i,
  /next\.?js/i,
  /\bui\b[\s-]?engineer/i,
  /\bui\b[\s-]?developer/i,
];
// Drop backend-only titles (unless they are also frontend/fullstack, e.g. "Frontend/Backend").
const BACKEND_PATTERN = /back[\s-]?end/i;
const FRONTEND_PATTERN = /front[\s-]?end|full[\s-]?stack/i;

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private cache: JobsCache | null = null;
  private refreshing: Promise<JobsCache> | null = null;
  // Per-query live kumarijob results for the user's search term.
  private liveCache = new Map<
    string,
    { listings: JobListing[]; expiresAt: number }
  >();
  private liveInflight = new Map<string, Promise<JobListing[]>>();

  async getJobs(): Promise<JobsCache> {
    const now = Date.now();
    if (this.cache && now < this.cache.expiresAt) {
      return this.cache;
    }
    // Coalesce concurrent refreshes into a single upstream fetch round.
    if (!this.refreshing) {
      this.refreshing = this.refresh().finally(() => {
        this.refreshing = null;
      });
    }
    try {
      return await this.refreshing;
    } catch (err) {
      if (this.cache) {
        this.logger.warn('Upstream refresh failed, serving stale cache');
        return this.cache;
      }
      throw err;
    }
  }

  private async refresh(): Promise<JobsCache> {
    const results = await Promise.allSettled([
      this.fetchRemoteOk(),
      this.fetchArbeitnow(),
      this.fetchRemotive(),
      this.fetchJobicy(),
      this.fetchKumarijob(),
      this.fetchTheMuse(),
      this.fetchWeWorkRemotely(),
      this.fetchWorkingNomads(),
      this.fetchJobsByLevel(),
      this.fetchHnHiring(),
    ]);

    const sourceNames: JobSource[] = [
      'remoteok',
      'arbeitnow',
      'remotive',
      'jobicy',
      'kumarijob',
      'themuse',
      'weworkremotely',
      'workingnomads',
      'jobsbylevel',
      'hnhiring',
    ];
    const listings: JobListing[] = [];
    const sources: SourceStatus[] = [];

    results.forEach((result, i) => {
      const source = sourceNames[i];
      if (result.status === 'fulfilled') {
        listings.push(...result.value);
        sources.push({ source, count: result.value.length, ok: true });
      } else {
        this.logger.error(`Failed to fetch ${source}: ${result.reason}`);
        sources.push({ source, count: 0, ok: false });
      }
    });

    if (listings.length === 0) {
      throw new ServiceUnavailableException(
        'All job sources are unreachable right now. Please try again later.',
      );
    }

    const deduped = this.dedupe(listings);
    // Kumarijob listings arrive pre-filtered to developer roles; the
    // frontend-only INCLUDE_PATTERNS apply to the global boards only.
    const relevant = deduped.filter(
      (job) =>
        job.source === 'kumarijob' || this.isRelevant(job.title, job.tags),
    );
    relevant.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );

    this.cache = {
      listings: relevant,
      cachedAt: new Date().toISOString(),
      expiresAt: Date.now() + CACHE_TTL_MS,
      sources,
    };
    this.logger.log(
      `Refreshed ${relevant.length} relevant jobs from ${
        sources.filter((s) => s.ok).length
      }/${sourceNames.length} sources`,
    );
    return this.cache;
  }

  private isRelevant(title: string, tags: string[]): boolean {
    const haystack = `${title} ${tags.join(' ')}`;
    if (!INCLUDE_PATTERNS.some((re) => re.test(haystack))) return false;
    if (BACKEND_PATTERN.test(title) && !FRONTEND_PATTERN.test(title)) {
      return false;
    }
    return true;
  }

  private dedupe(listings: JobListing[]): JobListing[] {
    const seen = new Set<string>();
    return listings.filter((job) => {
      const key = `${job.title.toLowerCase()}|${job.company.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async fetchJson(
    url: string,
    extraHeaders?: Record<string, string>,
  ): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'job-aggregator/1.0 (personal project)',
          Accept: 'application/json',
          ...extraHeaders,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchText(url: string, accept?: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: accept ?? 'text/html,application/xhtml+xml',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  private toIso(value: unknown): string {
    if (typeof value === 'number') {
      // Unix seconds -> ms heuristic
      const ms = value < 1e12 ? value * 1000 : value;
      return new Date(ms).toISOString();
    }
    if (typeof value === 'string' && value) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return new Date().toISOString();
  }

  private async fetchRemoteOk(): Promise<JobListing[]> {
    const data = await this.fetchJson('https://remoteok.com/api');
    // First array element is a legal notice, not a job.
    const items: any[] = Array.isArray(data) ? data.slice(1) : [];
    return items
      .map(
        (j: any): JobListing => ({
          id: `remoteok-${j.id}`,
          title: String(j.position || '').trim(),
          company: j.company || 'Unknown',
          location: j.location || 'Remote',
          remote: true, // RemoteOK is a remote-only board
          url:
            j.url || j.apply_url || `https://remoteok.com/remote-jobs/${j.id}`,
          source: 'remoteok',
          sourceUrl: SOURCE_URLS.remoteok,
          publishedAt: this.toIso(j.date || j.epoch),
          tags: Array.isArray(j.tags) ? j.tags : [],
        }),
      )
      .filter((j) => j.title.length > 0);
  }

  private async fetchArbeitnow(): Promise<JobListing[]> {
    const data = await this.fetchJson(
      'https://www.arbeitnow.com/api/job-board-api',
    );
    const items: any[] = Array.isArray(data?.data) ? data.data : [];
    return items
      .map(
        (j: any): JobListing => ({
          id: `arbeitnow-${j.slug}`,
          title: String(j.title || '').trim(),
          company: j.company_name || 'Unknown',
          location: j.location || 'Remote',
          remote: j.remote === true,
          url: j.url,
          source: 'arbeitnow',
          sourceUrl: SOURCE_URLS.arbeitnow,
          publishedAt: this.toIso(j.created_at),
          tags: Array.isArray(j.tags) ? j.tags : [],
        }),
      )
      .filter((j) => j.title.length > 0 && j.url);
  }

  private async fetchRemotive(): Promise<JobListing[]> {
    const data = await this.fetchJson('https://remotive.com/api/remote-jobs');
    const items: any[] = Array.isArray(data?.jobs) ? data.jobs : [];
    return items
      .map(
        (j: any): JobListing => ({
          id: `remotive-${j.id}`,
          title: String(j.title || '').trim(),
          company: j.company_name || 'Unknown',
          location: j.candidate_required_location || 'Remote',
          remote: true, // Remotive is a remote-only board
          url: j.url,
          source: 'remotive',
          sourceUrl: SOURCE_URLS.remotive,
          publishedAt: this.toIso(j.publication_date),
          tags: Array.isArray(j.tags) ? j.tags : [],
        }),
      )
      .filter((j) => j.title.length > 0 && j.url);
  }

  private async fetchJobicy(): Promise<JobListing[]> {
    const data = await this.fetchJson('https://jobicy.com/api/v2/remote-jobs');
    const items: any[] = Array.isArray(data?.jobs) ? data.jobs : [];
    return items
      .map(
        (j: any): JobListing => ({
          id: `jobicy-${j.id}`,
          title: String(j.jobTitle || '').trim(),
          company: j.companyName || 'Unknown',
          location: j.jobGeo || 'Remote',
          remote: true, // Jobicy is a remote-only board
          url: j.url,
          source: 'jobicy',
          sourceUrl: SOURCE_URLS.jobicy,
          publishedAt: this.toIso(j.pubDate),
          tags: [j.jobIndustry, j.jobLevel].filter(
            (t): t is string => typeof t === 'string' && t.length > 0,
          ),
        }),
      )
      .filter((j) => j.title.length > 0 && j.url);
  }

  // --- KumariJob (best-effort scraping; developer roles only on refresh) ---

  private async fetchKumarijob(): Promise<JobListing[]> {
    // Scheduled refresh: developer-flavored terms only (see NEPAL_DEV_PATTERN).
    return this.fetchKumarijobTerms(
      ['developer', 'software developer', 'frontend developer', 'web developer'],
      true,
    );
  }

  /**
   * Live-query kumarijob's autocomplete API for an arbitrary search term.
   * Results skip the developer-only filter (the user explicitly searched for
   * this term) and are cached per query for a few minutes.
   */
  async searchKumarijobLive(query: string): Promise<JobListing[]> {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    const now = Date.now();
    const cached = this.liveCache.get(term);
    if (cached && now < cached.expiresAt) return cached.listings;
    const inflight = this.liveInflight.get(term);
    if (inflight) return inflight;
    // Prune stale entries opportunistically.
    for (const [key, entry] of this.liveCache) {
      if (now >= entry.expiresAt) this.liveCache.delete(key);
    }
    const promise = this.fetchKumarijobTerms([query.trim()], false)
      .then((listings) => {
        this.liveCache.set(term, {
          listings,
          expiresAt: Date.now() + LIVE_QUERY_CACHE_TTL_MS,
        });
        return listings;
      })
      .catch((err) => {
        this.logger.warn(`Live kumarijob query failed for "${term}": ${err}`);
        return [] as JobListing[];
      })
      .finally(() => {
        this.liveInflight.delete(term);
      });
    this.liveInflight.set(term, promise);
    return promise;
  }

  private async fetchKumarijobTerms(
    terms: string[],
    applyDevFilter: boolean,
  ): Promise<JobListing[]> {
    const perTerm = await Promise.all(
      terms.map(async (term): Promise<any[]> => {
        try {
          const data = await this.fetchJson(
            `https://www.kumarijob.com/autocomplete-search?job_title=${encodeURIComponent(term)}`,
          );
          return Array.isArray(data) ? data : [];
        } catch (err) {
          this.logger.warn(`kumarijob autocomplete failed for "${term}": ${err}`);
          return [];
        }
      }),
    );
    const seen = new Set<string>();
    const listings: JobListing[] = [];
    const fetchedAt = new Date().toISOString();
    for (const items of perTerm) {
      for (const j of items) {
        const id = String(j?.id ?? '').trim();
        const title = String(j?.job_title ?? '').trim();
        const route = String(j?.route ?? '').trim();
        if (!id || !title || !route || seen.has(id)) continue;
        seen.add(id);
        if (applyDevFilter && !NEPAL_DEV_PATTERN.test(title)) continue;
        listings.push({
          id: `kumarijob:${id}`,
          title,
          company: '',
          location: 'Nepal',
          remote: false,
          url: route,
          source: 'kumarijob',
          sourceUrl: SOURCE_URLS.kumarijob,
          publishedAt: fetchedAt,
          tags: [],
        });
      }
    }
    return listings;
  }

  // --- TheMuse (documented public API; 403s non-browser UAs) ---

  private async fetchTheMuse(): Promise<JobListing[]> {
    const listings: JobListing[] = [];
    for (let page = 0; page < 3; page++) {
      try {
        const data = await this.fetchJson(
          `https://www.themuse.com/api/public/jobs?category=${encodeURIComponent(
            'Software Engineering',
          )}&page=${page}`,
          { 'User-Agent': BROWSER_UA },
        );
        const items: any[] = Array.isArray(data?.results) ? data.results : [];
        for (const j of items) {
          const title = String(j?.name ?? '').trim();
          const url = String(j?.refs?.landing_page ?? '').trim();
          if (!title || !url) continue;
          const locations: string[] = Array.isArray(j?.locations)
            ? j.locations
                .map((l: any) => String(l?.name ?? '').trim())
                .filter((l: string) => l.length > 0)
            : [];
          listings.push({
            id: `themuse:${j?.id ?? url}`,
            title,
            company: String(j?.company?.name ?? 'Unknown').trim() || 'Unknown',
            location: locations.join(', ') || 'Unknown',
            remote: locations.some((l) => /remote/i.test(l)),
            url,
            source: 'themuse',
            sourceUrl: SOURCE_URLS.themuse,
            publishedAt: this.toIso(j?.publication_date),
            tags: Array.isArray(j?.tags)
              ? j.tags.filter((t: any) => typeof t === 'string')
              : [],
          });
        }
      } catch (err) {
        this.logger.warn(`themuse page ${page} failed: ${err}`);
      }
    }
    return listings;
  }

  // --- We Work Remotely (category feed served as RSS/XML) ---

  private async fetchWeWorkRemotely(): Promise<JobListing[]> {
    // NOTE: keep Accept as */* — requesting RSS/XML explicitly 302s to an
    // HTML page, and text/html returns the HTML category page.
    const xml = await this.fetchText(
      'https://weworkremotely.com/categories/remote-programming-jobs',
      '*/*',
    );
    const $ = cheerio.load(xml, { xmlMode: true });
    const listings: JobListing[] = [];
    $('item').each((_, el) => {
      const rawTitle = $(el).find('title').text().trim();
      const url = $(el).find('link').text().trim();
      if (!rawTitle || !url) return;
      // Titles follow the "Company: Role" convention.
      const sep = rawTitle.indexOf(':');
      const company = sep > 0 ? rawTitle.slice(0, sep).trim() : 'Unknown';
      const title = (sep > 0 ? rawTitle.slice(sep + 1) : rawTitle).trim();
      if (!title) return;
      listings.push({
        id: `weworkremotely:${url}`,
        title,
        company,
        location: $(el).find('region').text().trim() || 'Remote',
        remote: true, // WWR is a remote-only board
        url,
        source: 'weworkremotely',
        sourceUrl: SOURCE_URLS.weworkremotely,
        publishedAt: this.toIso($(el).find('pubDate').text().trim()),
        tags: [$(el).find('category').text().trim()].filter(
          (t) => t.length > 0,
        ),
      });
    });
    return listings;
  }

  // --- Working Nomads (public /api/exposed_jobs/ JSON) ---

  private async fetchWorkingNomads(): Promise<JobListing[]> {
    const data = await this.fetchJson(
      'https://www.workingnomads.com/api/exposed_jobs/',
    );
    const items: any[] = Array.isArray(data) ? data : [];
    return items
      .map((j: any): JobListing | null => {
        const title = String(j?.title ?? '').trim();
        const url = String(j?.url ?? '').trim();
        if (!title || !url) return null;
        return {
          id: `workingnomads:${url}`,
          title,
          company: String(j?.company_name ?? 'Unknown').trim() || 'Unknown',
          location: String(j?.location ?? 'Remote').trim() || 'Remote',
          remote: true, // Working Nomads is a remote-only board
          url,
          source: 'workingnomads',
          sourceUrl: SOURCE_URLS.workingnomads,
          publishedAt: this.toIso(j?.pub_date),
          tags: [
            ...(Array.isArray(j?.tags) ? j.tags : []),
            String(j?.category_name ?? ''),
          ].filter((t) => typeof t === 'string' && t.length > 0),
        };
      })
      .filter((j): j is JobListing => j !== null);
  }

  // --- Jobs by Level (keyless public API; keep canonical URLs per their ask) ---

  private async fetchJobsByLevel(): Promise<JobListing[]> {
    const listings: JobListing[] = [];
    for (let page = 1; page <= 3; page++) {
      try {
        const data = await this.fetchJson(
          `https://jobsbylevel.com/api/v1/jobs?remote=1&page=${page}`,
        );
        const items: any[] = Array.isArray(data?.items) ? data.items : [];
        for (const j of items) {
          const title = String(j?.title ?? '').trim();
          const url = String(j?.url ?? '').trim();
          if (!title || !url) continue;
          listings.push({
            id: `jobsbylevel:${j?.id ?? url}`,
            title,
            company: String(j?.company ?? 'Unknown').trim() || 'Unknown',
            location: String(j?.location ?? 'Remote').trim() || 'Remote',
            remote: j?.remote !== false,
            url,
            source: 'jobsbylevel',
            sourceUrl: SOURCE_URLS.jobsbylevel,
            publishedAt: this.toIso(j?.posted_at),
            tags: [String(j?.category ?? ''), String(j?.seniority ?? '')].filter(
              (t) => t.length > 0,
            ),
          });
        }
      } catch (err) {
        this.logger.warn(`jobsbylevel page ${page} failed: ${err}`);
      }
    }
    return listings;
  }

  // --- HN "Who is hiring?" (Algolia API; latest monthly thread, best-effort parse) ---

  private async fetchHnHiring(): Promise<JobListing[]> {
    // Find the latest monthly hiring thread so this stays fresh.
    const search = await this.fetchJson(
      'https://hn.algolia.com/api/v1/search_by_date?tags=story&query=Ask%20HN%3A%20Who%20is%20hiring',
    );
    const hits: any[] = Array.isArray(search?.hits) ? search.hits : [];
    const thread = hits.find((h) =>
      String(h?.title ?? '').startsWith('Ask HN: Who is hiring?'),
    );
    if (!thread?.objectID) throw new Error('HN hiring thread not found');
    const data = await this.fetchJson(
      `https://hn.algolia.com/api/v1/items/${thread.objectID}`,
    );
    const comments: any[] = Array.isArray(data?.children)
      ? data.children.slice(0, 200)
      : [];
    const listings: JobListing[] = [];
    for (const c of comments) {
      // First line usually follows "Company | Role | location" convention.
      const text = cheerio.load(String(c?.text ?? '')).text();
      const firstLine =
        text
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.length > 0) ?? '';
      if (firstLine.length < 8 || firstLine.length > 160) continue;
      const parts = firstLine
        .split(/\s*\|\s*|\s+[—–-]\s+/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length < 2) continue;
      const company = parts[0];
      // The role is not always the second segment (some posts put the
      // location second), so pick the first segment that reads like a role.
      const role = parts
        .slice(1)
        .find(
          (p) =>
            p.length <= 100 &&
            /engineer|developer|designer|front[\s-]?end|full[\s-]?stack|back[\s-]?end|manager|scientist|analyst|architect|\bdev\b|devops|\bsre\b|product|marketing|sales|support|writer|researcher|intern|founder/i.test(
              p,
            ),
        );
      const title = role ?? parts[1];
      if (!company || !title || company.length > 80) continue;
      const isRemote = /remote/i.test(firstLine);
      listings.push({
        id: `hnhiring:${c?.id ?? `${thread.objectID}-${listings.length}`}`,
        title,
        company,
        location: isRemote ? 'Remote' : 'See post',
        remote: isRemote,
        url: `https://news.ycombinator.com/item?id=${c?.id}`,
        source: 'hnhiring',
        sourceUrl: SOURCE_URLS.hnhiring,
        publishedAt: this.toIso(c?.created_at),
        tags: ['hn'],
      });
    }
    return listings;
  }
}
