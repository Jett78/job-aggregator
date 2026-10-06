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
  merojob: 'https://merojob.com',
  kumarijob: 'https://www.kumarijob.com',
  jobsnepal: 'https://www.jobsnepal.com',
  hamrojobs: 'https://hamrojobs.com.np',
};

// Nepalese boards: no public API, best-effort HTML/JSON scraping. They only
// carry a developer-only filter (see NEPAL_DEV_PATTERN), not INCLUDE_PATTERNS.
const NEPAL_SOURCES: JobSource[] = [
  'merojob',
  'kumarijob',
  'jobsnepal',
  'hamrojobs',
];

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
  // Per-query live results (Nepal boards queried for the user's search term).
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
      this.fetchMerojob(),
      this.fetchKumarijob(),
      this.fetchJobsnepal(),
      this.fetchHamrojobs(),
    ]);

    const sourceNames: JobSource[] = [
      'remoteok',
      'arbeitnow',
      'remotive',
      'jobicy',
      'merojob',
      'kumarijob',
      'jobsnepal',
      'hamrojobs',
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
    // Nepalese listings arrive pre-filtered to developer roles; the
    // frontend-only INCLUDE_PATTERNS apply to the global boards only.
    const relevant = deduped.filter(
      (job) =>
        NEPAL_SOURCES.includes(job.source) ||
        this.isRelevant(job.title, job.tags),
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

  private async fetchJson(url: string): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'job-aggregator/1.0 (personal project)',
          Accept: 'application/json',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchText(url: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml',
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

  // --- Nepalese boards (best-effort scraping; developer roles only) ---

  private async fetchMerojob(): Promise<JobListing[]> {
    const html = await this.fetchText(
      'https://merojob.com/category/it-telecommunication',
    );
    // The page embeds backslash-escaped JSON like {\"title\":\"...\",\"slug\":\"...\"}.
    // Captures exclude backslashes so a match can never span across pairs.
    const re = /\\"title\\":\\"([^\\"]*)\\",\\"slug\\":\\"([^\\"]*)\\"/g;
    const seen = new Set<string>();
    const listings: JobListing[] = [];
    const fetchedAt = new Date().toISOString();
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const title = m[1].trim();
      const slug = m[2].trim();
      if (!title || !slug || seen.has(slug)) continue;
      seen.add(slug);
      if (!NEPAL_DEV_PATTERN.test(title)) continue;
      listings.push({
        id: `merojob:${slug}`,
        title,
        company: '',
        location: 'Nepal',
        remote: false,
        url: `https://merojob.com/${slug}`,
        source: 'merojob',
        sourceUrl: SOURCE_URLS.merojob,
        publishedAt: fetchedAt,
        tags: [],
      });
    }
    return listings;
  }

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
  async searchNepalLive(query: string): Promise<JobListing[]> {
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

  private async fetchJobsnepal(): Promise<JobListing[]> {
    const html = await this.fetchText(
      'https://www.jobsnepal.com/category/information-technology-jobs',
    );
    const $ = cheerio.load(html);
    const listings: JobListing[] = [];
    const fetchedAt = new Date().toISOString();
    // Listings render as h2.job-title (cards) and h5.job-title (media rows).
    const seen = new Set<string>();
    $('h2.job-title > a, h5.job-title > a').each((_, el) => {
      const a = $(el);
      const h = a.closest('h2.job-title, h5.job-title');
      const title = (h.attr('title') || a.text()).trim();
      const href = (a.attr('href') || '').trim();
      if (!title || !href) return;
      if (!NEPAL_DEV_PATTERN.test(title)) return;
      // Company: card layouts keep it in .company-logo (a[title]/img[alt]);
      // media rows use a nearby h4.job-company.
      let company = '';
      const card = a.closest('.card-inner, .card');
      if (card.length) {
        company =
          (card.find('.company-logo a').attr('title') || '').trim() ||
          (card.find('.company-logo img').attr('alt') || '').trim();
      }
      if (!company) {
        const ancestor = a
          .parents()
          .toArray()
          .find((node) => $(node).find('h4.job-company').length > 0);
        if (ancestor) {
          company = $(ancestor).find('h4.job-company').first().text().trim();
        }
      }
      const url = href.startsWith('http')
        ? href
        : `https://www.jobsnepal.com${href.startsWith('/') ? '' : '/'}${href}`;
      if (seen.has(url)) return;
      seen.add(url);
      listings.push({
        id: `jobsnepal:${url}`,
        title,
        company,
        location: 'Nepal',
        remote: false,
        url,
        source: 'jobsnepal',
        sourceUrl: SOURCE_URLS.jobsnepal,
        publishedAt: fetchedAt,
        tags: [],
      });
    });
    return listings;
  }

  private async fetchHamrojobs(): Promise<JobListing[]> {
    const html = await this.fetchText('https://hamrojobs.com.np/');
    const $ = cheerio.load(html);
    const listings: JobListing[] = [];
    const fetchedAt = new Date().toISOString();
    const seen = new Set<string>();
    // Cards: a.card-title[href="/jobpost/{slug}/{id}"]; company in
    // a.card-subtitle and location in span.location-icon nearby.
    $('a.card-title[href^="/jobpost/"]').each((_, el) => {
      const a = $(el);
      const title = a.text().trim();
      const href = (a.attr('href') || '').trim();
      if (!title || !href) return;
      if (!NEPAL_DEV_PATTERN.test(title)) return;
      const meta =
        a.closest('button').next('div').length > 0
          ? a.closest('button').next('div')
          : a.parent().parent();
      const company = meta.find('a.card-subtitle').first().text().trim();
      const location =
        meta.find('span.location-icon').first().text().trim() || 'Nepal';
      const url = `https://hamrojobs.com.np${href}`;
      if (seen.has(url)) return;
      seen.add(url);
      listings.push({
        id: `hamrojobs:${url}`,
        title,
        company,
        location,
        remote: false,
        url,
        source: 'hamrojobs',
        sourceUrl: SOURCE_URLS.hamrojobs,
        publishedAt: fetchedAt,
        tags: [],
      });
    });
    return listings;
  }
}
