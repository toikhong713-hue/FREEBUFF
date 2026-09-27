// Simulated database service. Backs the cloud "database" product and every
// simulated website (social, mail, news, shop, forum) with one shared store.
import { EventBus } from "./bus";
import { uid } from "./rng";

export type Row = Record<string, any> & { id: string };

export class Database {
  tables = new Map<string, Row[]>();
  bus = new EventBus();

  create(table: string, seed: Row[] = []): void {
    if (!this.tables.has(table)) {
      this.tables.set(table, []);
      this.bus.emit("table", table);
    }
    for (const r of seed) this.insert(table, r, true);
  }

  insert(table: string, data: Partial<Row>, silent = false): Row {
    let t = this.tables.get(table);
    if (!t) {
      t = [];
      this.tables.set(table, t);
      this.bus.emit("table", table);
    }
    const row: Row = { ...data, id: data.id ?? uid(table.slice(0, 3)) };
    t.push(row);
    if (!silent) this.bus.emit("change", { table, kind: "insert", id: row.id });
    return row;
  }

  insertMany(table: string, rows: Partial<Row>[]): Row[] {
    return rows.map((r) => this.insert(table, r, true));
  }

  update(table: string, id: string, patch: Partial<Row>): Row | null {
    const t = this.tables.get(table);
    if (!t) return null;
    const row = t.find((r) => r.id === id);
    if (!row) return null;
    Object.assign(row, patch, { id });
    this.bus.emit("change", { table, kind: "update", id });
    return row;
  }

  remove(table: string, id: string): boolean {
    const t = this.tables.get(table);
    if (!t) return false;
    const i = t.findIndex((r) => r.id === id);
    if (i < 0) return false;
    t.splice(i, 1);
    this.bus.emit("change", { table, kind: "remove", id });
    return true;
  }

  removeWhere(table: string, pred: (r: Row) => boolean): number {
    const t = this.tables.get(table);
    if (!t) return 0;
    let n = 0;
    for (let i = t.length - 1; i >= 0; i--) {
      if (pred(t[i])) {
        t.splice(i, 1);
        n++;
      }
    }
    if (n) this.bus.emit("change", { table, kind: "removeMany" });
    return n;
  }

  all(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }

  find(table: string, id: string): Row | null {
    return (this.tables.get(table) ?? []).find((r) => r.id === id) ?? null;
  }

  where(table: string, pred: (r: Row) => boolean): Row[] {
    return (this.tables.get(table) ?? []).filter(pred);
  }

  first(table: string, pred: (r: Row) => boolean): Row | null {
    return (this.tables.get(table) ?? []).find(pred) ?? null;
  }

  count(table: string, pred?: (r: Row) => boolean): number {
    const t = this.tables.get(table) ?? [];
    return pred ? t.filter(pred).length : t.length;
  }

  /** Free-text search across a set of string fields. */
  search(table: string, query: string, fields: string[], limit = 40): Row[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/).filter(Boolean);
    const scored: { row: Row; score: number }[] = [];
    for (const row of this.all(table)) {
      let score = 0;
      for (const f of fields) {
        const v = row[f];
        if (typeof v !== "string") continue;
        const hay = v.toLowerCase();
        for (const term of terms) {
          if (hay.includes(term)) score += hay.startsWith(term) ? 3 : 1;
        }
      }
      if (score > 0) scored.push({ row, score });
    }
    scored.sort((a, b) => b.score - a.score || (b.row.ts ?? 0) - (a.row.ts ?? 0));
    return scored.slice(0, limit).map((s) => s.row);
  }

  tableNames(): string[] {
    return Array.from(this.tables.keys()).sort();
  }

  rowCount(): { table: string; rows: number; bytes: number }[] {
    return this.tableNames().map((table) => {
      const t = this.all(table);
      let bytes = 0;
      for (const r of t) bytes += JSON.stringify(r).length;
      return { table, rows: t.length, bytes };
    });
  }

  serialize(): unknown {
    return Array.from(this.tables.entries());
  }

  load(data: unknown): void {
    if (!Array.isArray(data)) return;
    this.tables.clear();
    for (const [name, rows] of data as [string, Row[]][]) {
      if (typeof name !== "string" || !Array.isArray(rows)) continue;
      this.tables.set(
        name,
        rows.filter((r) => r && typeof r.id === "string"),
      );
    }
  }
}

/** Table names used across the whole PC. */
export const TABLES = {
  users: "users",
  posts: "posts",
  comments: "comments",
  likes: "likes",
  follows: "follows",
  notifications: "notifications",
  messages: "messages",
  mail: "mail",
  news: "news",
  sources: "news_sources",
  products: "products",
  orders: "orders",
  threads: "threads",
  sites: "sites",
  bookmarks: "bookmarks",
  history: "browsing_history",
  downloads: "downloads",
  cloudAccounts: "cloud_accounts",
  cloudServers: "cloud_servers",
  cityBuildings: "city_buildings",
  cityBiz: "city_businesses",
  cityNews: "city_news",
  robotConfigs: "robot_configs",
  telemetry: "robot_telemetry",
  searchHistory: "search_history",
  trends: "search_trends",
  netHosts: "net_hosts",
  appStoreApps: "appstore_apps",
} as const;
