// Unified virtual filesystem. Every subsystem (OS, terminal, robots, city,
// network lab, cloud storage, web sites) reads and writes through this one tree.
import { EventBus } from "./bus";
import { uid } from "./rng";

export type FsNodeType = "dir" | "file";

export interface FsNode {
  id: string;
  name: string;
  type: FsNodeType;
  parent: string | null;
  children: string[];
  content: string;
  created: number;
  modified: number;
  /** unix-ish permission triplet, e.g. "rwxr-xr-x" */
  mode: string;
  owner: string;
  /** subsystem tag shown in file-manager columns: os | robot | city | net | web | cloud | user */
  origin: string;
}

export interface Stat {
  id: string;
  name: string;
  path: string;
  type: FsNodeType;
  size: number;
  created: number;
  modified: number;
  mode: string;
  owner: string;
  origin: string;
}

const DEFAULT_DIRS = [
  ["home", "user"],
  ["home/user/Desktop", "os"],
  ["home/user/Documents", "os"],
  ["home/user/Downloads", "os"],
  ["home/user/Pictures", "os"],
  ["system", "os"],
  ["system/kernel", "os"],
  ["system/drivers", "os"],
  ["system/logs", "os"],
  ["documents", "user"],
  ["downloads", "user"],
  ["projects", "user"],
  ["robots", "robot"],
  ["city", "city"],
  ["network", "net"],
  ["websites", "web"],
  ["cloud", "cloud"],
] as const;

export class FileSystem {
  nodes = new Map<string, FsNode>();
  bus = new EventBus();
  /** directories that must never be removed */
  protectedDirs = new Set<string>(["/", "/system", "/home"]);

  constructor() {
    this.reset();
  }

  // ---------------------------------------------------------------- lifecycle

  reset(): void {
    this.nodes.clear();
    const root = this.makeNode("/", "dir", null, "rwxr-xr-x", "root", "os");
    // the root node keeps a fixed id so resolve("/") is a single map lookup
    root.id = "root";
    root.name = "";
    this.nodes.set("root", root);
    for (const [path, origin] of DEFAULT_DIRS) {
      this.mkdir(path, { origin, silent: true });
    }
  }

  private makeNode(
    name: string,
    type: FsNodeType,
    parent: string | null,
    mode: string,
    owner: string,
    origin: string,
  ): FsNode {
    const now = Date.now();
    return {
      id: uid(type === "dir" ? "d" : "f"),
      name,
      type,
      parent,
      children: [],
      content: "",
      created: now,
      modified: now,
      mode,
      owner,
      origin,
    };
  }

  // ------------------------------------------------------------------- paths

  normalize(path: string, cwd = "/"): string {
    let p = path.trim();
    if (p === "") return cwd;
    if (p === "~") p = "/home/user";
    else if (p.startsWith("~/")) p = "/home/user" + p.slice(1);
    const abs = p.startsWith("/") ? p : `${cwd}/${p}`;
    const parts: string[] = [];
    for (const seg of abs.split("/")) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    return "/" + parts.join("/");
  }

  resolve(path: string, cwd = "/"): FsNode | null {
    const norm = this.normalize(path, cwd);
    if (norm === "/") return this.nodes.get("root")!;
    let cur: FsNode | null = this.nodes.get("root")!;
    for (const seg of norm.slice(1).split("/")) {
      if (!cur || cur.type !== "dir") return null;
      const nextId: string | undefined = cur.children.find((id) => this.nodes.get(id)?.name === seg);
      if (!nextId) return null;
      cur = this.nodes.get(nextId) ?? null;
    }
    return cur;
  }

  exists(path: string, cwd?: string): boolean {
    return this.resolve(path, cwd) !== null;
  }

  pathOf(node: FsNode | null | undefined): string {
    if (!node) return "";
    if (node.id === "root") return "/";
    const segs: string[] = [];
    let cur: FsNode | undefined = node;
    while (cur && cur.id !== "root") {
      segs.unshift(cur.name);
      cur = cur.parent ? this.nodes.get(cur.parent) : undefined;
    }
    return "/" + segs.join("/");
  }

  // ------------------------------------------------------------------ queries

  list(path: string, cwd = "/"): FsNode[] {
    const node = this.resolve(path, cwd);
    if (!node || node.type !== "dir") return [];
    return node.children
      .map((id) => this.nodes.get(id))
      .filter((n): n is FsNode => !!n)
      .sort((a, b) =>
        a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1,
      );
  }

  stat(path: string, cwd = "/"): Stat | null {
    const node = this.resolve(path, cwd);
    if (!node) return null;
    return {
      id: node.id,
      name: node.name,
      path: this.pathOf(node),
      type: node.type,
      size: node.type === "dir" ? this.dirSize(node) : byteLength(node.content),
      created: node.created,
      modified: node.modified,
      mode: node.mode,
      owner: node.owner,
      origin: node.origin,
    };
  }

  private dirSize(node: FsNode): number {
    let total = 0;
    for (const id of node.children) {
      const child = this.nodes.get(id);
      if (!child) continue;
      total += child.type === "dir" ? this.dirSize(child) : byteLength(child.content);
    }
    return total;
  }

  read(path: string, cwd = "/"): string | null {
    const node = this.resolve(path, cwd);
    if (!node || node.type !== "file") return null;
    return node.content;
  }

  /** Total bytes used by the whole tree. */
  usedBytes(): number {
    return this.dirSize(this.nodes.get("root")!);
  }

  count(): { files: number; dirs: number } {
    let files = 0;
    let dirs = 0;
    for (const n of this.nodes.values()) (n.type === "dir" ? dirs++ : files++);
    return { files, dirs };
  }

  // ----------------------------------------------------------------- mutation

  mkdir(
    path: string,
    opts: { cwd?: string; origin?: string; mode?: string; owner?: string; silent?: boolean } = {},
  ): FsNode | null {
    const cwd = opts.cwd ?? "/";
    const norm = this.normalize(path, cwd);
    if (norm === "/") return this.nodes.get("root")!;
    if (this.resolve(norm)) return null;
    const parentPath = norm.slice(0, norm.lastIndexOf("/")) || "/";
    const parent = this.resolve(parentPath);
    if (!parent || parent.type !== "dir") return null;
    const name = norm.slice(norm.lastIndexOf("/") + 1);
    const node = this.makeNode(
      name,
      "dir",
      parent.id,
      opts.mode ?? "rwxr-xr-x",
      opts.owner ?? "user",
      opts.origin ?? "user",
    );
    this.nodes.set(node.id, node);
    parent.children.push(node.id);
    parent.modified = Date.now();
    if (!opts.silent) this.bus.emit("change", { path: norm, kind: "mkdir" });
    return node;
  }

  /** mkdir -p */
  mkdirp(path: string, opts: { cwd?: string; origin?: string } = {}): FsNode | null {
    const norm = this.normalize(path, opts.cwd ?? "/");
    const segs = norm.slice(1).split("/").filter(Boolean);
    let cur = "/";
    for (const seg of segs) {
      const next = `${cur === "/" ? "" : cur}/${seg}`;
      let node = this.resolve(next);
      if (!node) node = this.mkdir(next, { origin: opts.origin ?? "user" });
      if (!node) return null;
      cur = next;
    }
    return this.resolve(norm);
  }

  write(
    path: string,
    content: string,
    opts: { cwd?: string; origin?: string; append?: boolean; silent?: boolean } = {},
  ): FsNode | null {
    const cwd = opts.cwd ?? "/";
    const norm = this.normalize(path, cwd);
    const existing = this.resolve(norm);
    if (existing && existing.type === "dir") return null;
    if (existing) {
      existing.content = opts.append ? existing.content + content : content;
      existing.modified = Date.now();
      if (!opts.silent) this.bus.emit("change", { path: norm, kind: "write" });
      return existing;
    }
    const parentPath = norm.slice(0, norm.lastIndexOf("/")) || "/";
    const parent = this.resolve(parentPath);
    if (!parent || parent.type !== "dir") return null;
    const name = norm.slice(norm.lastIndexOf("/") + 1);
    const node = this.makeNode(
      name,
      "file",
      parent.id,
      "rw-r--r--",
      "user",
      opts.origin ?? "user",
    );
    node.content = content;
    this.nodes.set(node.id, node);
    parent.children.push(node.id);
    parent.modified = Date.now();
    if (!opts.silent) this.bus.emit("change", { path: norm, kind: "create" });
    return node;
  }

  append(path: string, content: string, opts: { cwd?: string; origin?: string } = {}): FsNode | null {
    return this.write(path, content, { ...opts, append: true });
  }

  cp(src: string, dest: string, cwd = "/"): FsNode | null {
    const from = this.resolve(src, cwd);
    if (!from) return null;
    let toNorm = this.normalize(dest, cwd);
    let to = this.resolve(toNorm);
    // copying into an existing directory keeps the basename
    if (to && to.type === "dir") {
      toNorm = `${toNorm === "/" ? "" : toNorm}/${from.name}`;
      to = this.resolve(toNorm);
    }
    if (to) return null;
    return this.cloneInto(from, toNorm);
  }

  private cloneInto(from: FsNode, toNorm: string): FsNode | null {
    const parentPath = toNorm.slice(0, toNorm.lastIndexOf("/")) || "/";
    const parent = this.resolve(parentPath);
    if (!parent || parent.type !== "dir") return null;
    const name = toNorm.slice(toNorm.lastIndexOf("/") + 1);
    const copy = this.makeNode(name, from.type, parent.id, from.mode, from.owner, from.origin);
    copy.content = from.content;
    this.nodes.set(copy.id, copy);
    parent.children.push(copy.id);
    for (const childId of from.children) {
      const child = this.nodes.get(childId);
      if (!child) continue;
      this.cloneInto(child, `${toNorm}/${child.name}`);
    }
    this.bus.emit("change", { path: toNorm, kind: "copy" });
    return copy;
  }

  mv(src: string, dest: string, cwd = "/"): FsNode | null {
    const from = this.resolve(src, cwd);
    if (!from || from.id === "root") return null;
    let toNorm = this.normalize(dest, cwd);
    const to = this.resolve(toNorm);
    if (to && to.type === "dir") {
      toNorm = `${toNorm === "/" ? "" : toNorm}/${from.name}`;
    } else if (to) {
      // overwrite target
      this.rm(toNorm, { silent: true, force: true });
    }
    if (toNorm === this.pathOf(from)) return from;
    // refuse to move a directory into itself
    if (this.pathOf(from) !== "/" && toNorm.startsWith(this.pathOf(from) + "/")) return null;
    const oldParent = from.parent ? this.nodes.get(from.parent) : null;
    if (oldParent) oldParent.children = oldParent.children.filter((id) => id !== from.id);
    const newParent = this.resolve(toNorm.slice(0, toNorm.lastIndexOf("/")) || "/");
    if (!newParent) return null;
    from.name = toNorm.slice(toNorm.lastIndexOf("/") + 1);
    from.parent = newParent.id;
    from.modified = Date.now();
    newParent.children.push(from.id);
    this.bus.emit("change", { path: toNorm, kind: "move" });
    return from;
  }

  rm(
    path: string,
    opts: { cwd?: string; recursive?: boolean; force?: boolean; silent?: boolean } = {},
  ): boolean {
    const norm = this.normalize(path, opts.cwd ?? "/");
    const node = this.resolve(norm);
    if (!node) return false;
    if (node.id === "root") return false;
    if (this.protectedDirs.has(norm)) return false;
    if (node.type === "dir" && node.children.length > 0 && !opts.recursive && !opts.force) {
      return false;
    }
    const purge = (n: FsNode) => {
      for (const id of n.children) {
        const child = this.nodes.get(id);
        if (child) purge(child);
      }
      this.nodes.delete(n.id);
    };
    const parent = node.parent ? this.nodes.get(node.parent) : null;
    if (parent) parent.children = parent.children.filter((id) => id !== node.id);
    purge(node);
    if (!opts.silent) this.bus.emit("change", { path: norm, kind: "rm" });
    return true;
  }

  chmod(path: string, mode: string, cwd = "/"): boolean {
    const node = this.resolve(path, cwd);
    if (!node) return false;
    node.mode = mode;
    node.modified = Date.now();
    this.bus.emit("change", { path: this.pathOf(node), kind: "chmod" });
    return true;
  }

  /** Depth-first walk used by search, sync and the file manager's tree view. */
  walk(start = "/", cb: (node: FsNode, path: string) => void): void {
    const stack: string[] = [start];
    while (stack.length) {
      const p = stack.pop()!;
      const node = this.resolve(p);
      if (!node) continue;
      cb(node, p);
      if (node.type === "dir") {
        const kids = node.children
          .map((id) => this.nodes.get(id))
          .filter((n): n is FsNode => !!n)
          .map((n) => `${p === "/" ? "" : p}/${n.name}`);
        for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
      }
    }
  }

  find(query: string, start = "/"): FsNode[] {
    const q = query.toLowerCase();
    const out: FsNode[] = [];
    this.walk(start, (node) => {
      if (node.name.toLowerCase().includes(q)) out.push(node);
    });
    return out;
  }

  // -------------------------------------------------------------- persistence

  serialize(): unknown {
    return Array.from(this.nodes.values());
  }

  load(data: unknown): void {
    if (!Array.isArray(data)) return;
    this.nodes.clear();
    for (const raw of data as FsNode[]) {
      if (!raw || typeof raw.id !== "string") continue;
      this.nodes.set(raw.id, {
        ...raw,
        children: Array.isArray(raw.children) ? raw.children : [],
        content: typeof raw.content === "string" ? raw.content : "",
      });
    }
    if (!this.nodes.has("root")) this.reset();
    const root = this.nodes.get("root")!;
    root.type = "dir";
    root.parent = null;
    root.children = root.children.filter((id) => this.nodes.has(id));
  }
}

export function byteLength(s: string): number {
  return s.length;
}
