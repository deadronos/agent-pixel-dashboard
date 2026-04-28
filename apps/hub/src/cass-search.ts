import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface SessionSearchResult {
  title?: string;
  source_path?: string;
  line_number?: number;
  score?: number;
  content?: string;
}

export interface SessionSearchResponse {
  backend: 'cass';
  query: string;
  results: SessionSearchResult[];
}

const MAX_CASS_QUERY_LENGTH = 256;

export function sanitizeCassQuery(query: string): string {
  const sanitized = query.trim();
  if (sanitized.length > MAX_CASS_QUERY_LENGTH) {
    throw new Error(`CASS search query is too long; max ${MAX_CASS_QUERY_LENGTH} characters`);
  }
  if ([...sanitized].some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  })) {
    throw new Error("CASS search query cannot contain control characters");
  }
  return sanitized;
}

export class CassSearchClient {
  private readonly binary: string;

  constructor(binary = process.env.CASS_BIN ?? 'cass') {
    this.binary = binary;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync(this.binary, ['health', '--json'], { timeout: 6_000 });
      return true;
    } catch {
      return false;
    }
  }

  async search(query: string, limit = 10): Promise<SessionSearchResponse> {
    const safeQuery = sanitizeCassQuery(query);
    const args = ['search', safeQuery, '--robot', '--limit', String(limit), '--fields', 'minimal'];
    const { stdout } = await execFileAsync(this.binary, args, {
      timeout: 12_000,
      maxBuffer: 2_000_000,
    });
    const parsed = JSON.parse(stdout) as { results?: SessionSearchResult[] };
    return {
      backend: 'cass',
      query: safeQuery,
      results: parsed.results ?? [],
    };
  }
}
