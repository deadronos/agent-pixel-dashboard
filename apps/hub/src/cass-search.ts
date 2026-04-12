import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SessionSearchResult {
  title?: string;
  source_path?: string;
  line_number?: number;
  score?: number;
  content?: string;
}

export interface SessionSearchResponse {
  backend: "cass";
  query: string;
  results: SessionSearchResult[];
}

export class CassSearchClient {
  // eslint-disable-next-line no-unused-vars
  constructor(private readonly binary = process.env.CASS_BIN ?? "cass") {}

  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync(this.binary, ["health", "--json"], { timeout: 6_000 });
      return true;
    } catch {
      return false;
    }
  }

  async search(query: string, limit = 10): Promise<SessionSearchResponse> {
    const args = ["search", query, "--robot", "--limit", String(limit), "--fields", "minimal"];
    const { stdout } = await execFileAsync(this.binary, args, { timeout: 12_000, maxBuffer: 2_000_000 });
    const parsed = JSON.parse(stdout) as { results?: SessionSearchResult[] };
    return {
      backend: "cass",
      query,
      results: parsed.results ?? []
    };
  }
}
