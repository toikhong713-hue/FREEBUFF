import { useMemo, useState } from "react";
import { TABLES, type Row } from "../core/db";
import { useKernel } from "../os/hooks";
import { Avatar, Pill, SiteLink, SiteShell, hueOf, siteByHost } from "./shell";
import { timeAgo } from "../core/rng";
import { Btn } from "../ui/primitives";

export function SocialSite({ path }: { path: string }) {
  const n = useKernel();
  const def = siteByHost("nova.social")!;
  const tab = path.startsWith("u/") ? "profile" : path === "notifications" ? "notifications" : path === "explore" ? "explore" : "home";
  const profileHandle = path.startsWith("u/") ? decodeURIComponent(path.slice(2)) : "you";

  const links = [
    { label: "Home", href: "home", active: tab === "home" },
    { label: "Explore", href: "explore", active: tab === "explore" },
    { label: "Notifications", href: "notifications", active: tab === "notifications" },
    { label: "Profile", href: "u/you", active: tab === "profile" && profileHandle === "you" },
  ];

  return (
    <SiteShell
      def={def}
      path={path}
      links={links}
      actions={<span className="tiny dim">@you</span>}
    >
      <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
        <div className="grow col" style={{ gap: 12, minWidth: 0 }}>
          {tab === "home" && <Feed n={n} />}
          {tab === "explore" && <Explore n={n} />}
          {tab === "notifications" && <Notifications n={n} />}
          {tab === "profile" && <Profile n={n} handle={profileHandle} />}
        </div>
        <aside className="col" style={{ gap: 12, width: 268, flex: "none" }}>
          <Trending n={n} />
          <WhoToFollow n={n} />
          <div className="card tiny dim">
            All posts here live in the same NovaDB engine your cloud console reads. Anything you post is
            visible in the terminal with <span className="mono">db posts</span>.
          </div>
        </aside>
      </div>
    </SiteShell>
  );
}

type Nova = ReturnType<typeof useKernel>;

function Feed({ n }: { n: Nova }) {
  const [draft, setDraft] = useState("");
  const posts = useMemo(
    () => [...n.db.all(TABLES.posts)].sort((a, b) => b.ts - a.ts).slice(0, 40),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );
  return (
    <>
      <div className="panel col" style={{ padding: 12, gap: 8 }}>
        <textarea
          className="textarea"
          rows={2}
          placeholder="What's happening in Aurora?"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="row between">
          <span className="tiny dim">{draft.length}/280</span>
          <Btn
            variant="primary"
            size="sm"
            disabled={!draft.trim()}
            onClick={() => {
              n.db.insert(TABLES.posts, {
                author: "you",
                body: draft.trim(),
                topic: "you",
                ts: Date.now(),
                likes: 0,
                reposts: 0,
                comments: 0,
              });
              n.db.insert(TABLES.notifications, { kind: "post", text: "Your post was published to NOVA Social", ts: Date.now() });
              n.markDirty("web");
              setDraft("");
            }}
          >
            Post
          </Btn>
        </div>
      </div>
      {posts.map((p) => (
        <PostCard key={p.id} n={n} post={p} />
      ))}
    </>
  );
}

function PostCard({ n, post }: { n: Nova; post: Row }) {
  const [liked, setLiked] = useState(false);
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const author = n.db.all(TABLES.users).find((u) => u.handle === post.author);
  const comments = n.db.all(TABLES.comments).filter((c) => c.postId === post.id);
  const hue = hueOf(post.author);

  return (
    <article className="panel" style={{ padding: 12 }}>
      <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
        <SiteLink href={`u/${post.author}`}>
          <Avatar name={author?.name ?? post.author} hue={hue} />
        </SiteLink>
        <div className="grow col" style={{ gap: 2, minWidth: 0 }}>
          <div className="row" style={{ gap: 5 }}>
            <SiteLink href={`u/${post.author}`}>
              <span className="semi small">{author?.name ?? post.author}</span>
            </SiteLink>
            {author?.verified && <span style={{ color: "var(--info)", fontSize: 11 }}>✔</span>}
            <span className="tiny dim">@{post.author}</span>
            <span className="tiny dim">· {timeAgo(post.ts)}</span>
            {post.fromCity && <Pill tone="info">from Aurora</Pill>}
          </div>
          <p className="small" style={{ margin: "2px 0 6px", lineHeight: 1.55 }}>{post.body}</p>
          <div className="row" style={{ gap: 4 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setLiked((l) => !l);
                n.db.update(TABLES.posts, post.id, { likes: (post.likes ?? 0) + (liked ? -1 : 1) });
                n.markDirty("web");
              }}
            >
              {liked ? "❤️" : "🤍"} {post.likes ?? 0}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>
              💬 {post.comments ?? comments.length}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                n.db.update(TABLES.posts, post.id, { reposts: (post.reposts ?? 0) + 1 });
                n.markDirty("web");
              }}
            >
              🔁 {post.reposts ?? 0}
            </button>
            <span className="spacer" />
            <span className="tiny dim">#{String(post.topic ?? "aurora").replace(/\s+/g, "")}</span>
          </div>
          {open && (
            <div className="col" style={{ gap: 6, marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              {comments.map((c) => {
                const cu = n.db.all(TABLES.users).find((u) => u.handle === c.author);
                return (
                  <div key={c.id} className="row" style={{ gap: 7, alignItems: "flex-start" }}>
                    <Avatar name={cu?.name ?? c.author} hue={hueOf(c.author)} size={22} />
                    <div className="col" style={{ gap: 0, minWidth: 0 }}>
                      <span className="tiny">
                        <span className="semi">{cu?.name ?? c.author}</span>{" "}
                        <span className="dim">{timeAgo(c.ts)}</span>
                      </span>
                      <span className="tiny muted">{c.body}</span>
                    </div>
                  </div>
                );
              })}
              <div className="row" style={{ gap: 6 }}>
                <input
                  className="input"
                  placeholder="Add a comment…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && comment.trim()) {
                      n.db.insert(TABLES.comments, { postId: post.id, author: "you", body: comment.trim(), ts: Date.now(), likes: 0 });
                      n.db.update(TABLES.posts, post.id, { comments: (post.comments ?? 0) + 1 });
                      n.markDirty("web");
                      setComment("");
                    }
                  }}
                />
                <Btn
                  size="sm"
                  disabled={!comment.trim()}
                  onClick={() => {
                    n.db.insert(TABLES.comments, { postId: post.id, author: "you", body: comment.trim(), ts: Date.now(), likes: 0 });
                    n.db.update(TABLES.posts, post.id, { comments: (post.comments ?? 0) + 1 });
                    n.markDirty("web");
                    setComment("");
                  }}
                >
                  Reply
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function Explore({ n }: { n: Nova }) {
  const posts = useMemo(
    () => [...n.db.all(TABLES.posts)].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).slice(0, 24),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );
  const topics = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of n.db.all(TABLES.posts)) {
      const t = String(p.topic ?? "aurora");
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n.rev]);
  return (
    <>
      <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
        {topics.map(([t, c]) => (
          <span key={t} className="badge" style={{ padding: "4px 10px" }}>
            #{t.replace(/\s+/g, "")} <span className="dim">{c}</span>
          </span>
        ))}
      </div>
      {posts.map((p) => (
        <PostCard key={p.id} n={n} post={p} />
      ))}
    </>
  );
}

function Notifications({ n }: { n: Nova }) {
  const items = useMemo(
    () => [...n.db.all(TABLES.notifications)].sort((a, b) => b.ts - a.ts).slice(0, 30),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );
  if (!items.length) {
    return <div className="panel small dim" style={{ padding: 20, textAlign: "center" }}>No notifications yet.</div>;
  }
  return (
    <div className="panel col" style={{ padding: 4 }}>
      {items.map((it) => (
        <div key={it.id} className="row card card-hover" style={{ border: 0, background: "transparent" }}>
          <span style={{ fontSize: 16 }}>{it.kind === "like" ? "❤️" : it.kind === "follow" ? "👤" : it.kind === "city" ? "🏙" : "🔔"}</span>
          <span className="grow small">{it.text}</span>
          <span className="tiny dim nowrap">{timeAgo(it.ts)}</span>
        </div>
      ))}
    </div>
  );
}

function Profile({ n, handle }: { n: Nova; handle: string }) {
  const [following, setFollowing] = useState(false);
  const user = n.db.all(TABLES.users).find((u) => u.handle === handle) ?? n.db.all(TABLES.users)[0];
  const posts = n.db.all(TABLES.posts).filter((p) => p.author === user?.handle);
  const follows = n.db.all(TABLES.follows).filter((f) => f.from === user?.handle);
  const followers = n.db.all(TABLES.follows).filter((f) => f.to === user?.handle);
  if (!user) return <div className="panel small dim" style={{ padding: 20 }}>No such profile.</div>;

  return (
    <>
      <div className="panel col" style={{ padding: 16, gap: 12 }}>
        <div className="row" style={{ gap: 14 }}>
          <Avatar name={user.name} hue={hueOf(user.handle)} size={62} />
          <div className="grow col" style={{ gap: 3, minWidth: 0 }}>
            <div className="row" style={{ gap: 6 }}>
              <strong style={{ fontSize: 17 }}>{user.name}</strong>
              {user.verified && <span style={{ color: "var(--info)" }}>✔</span>}
              {user.online && <span className="dot dot-live" title="online" />}
            </div>
            <span className="tiny dim">@{user.handle} · {user.district} · {user.occupation}</span>
            <span className="small muted" style={{ maxWidth: 520 }}>{user.bio}</span>
          </div>
          {user.handle !== "you" && (
            <Btn variant={following ? "default" : "primary"} onClick={() => { setFollowing((f) => !f); n.markDirty("web"); }}>
              {following ? "Following" : "Follow"}
            </Btn>
          )}
        </div>
        <div className="row" style={{ gap: 20 }}>
          <Stat label="Posts" value={posts.length} />
          <Stat label="Followers" value={followers.length} />
          <Stat label="Following" value={follows.length} />
          <Stat label="Age" value={user.age} />
        </div>
      </div>
      {posts.length === 0 && <div className="panel small dim" style={{ padding: 20, textAlign: "center" }}>No posts yet.</div>}
      {posts.map((p) => (
        <PostCard key={p.id} n={n} post={p} />
      ))}
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="col" style={{ gap: 0 }}>
      <strong>{value}</strong>
      <span className="tiny dim">{label}</span>
    </div>
  );
}

function Trending({ n }: { n: Nova }) {
  const trends = useMemo(
    () => [...n.db.all(TABLES.trends)].sort((a, b) => b.volume - a.volume).slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );
  return (
    <div className="panel col" style={{ padding: 12, gap: 8 }}>
      <strong className="small">Trending in Aurora</strong>
      {trends.map((t, i) => (
        <div key={t.id} className="col" style={{ gap: 0 }}>
          <span className="tiny dim">#{i + 1} in NOVA</span>
          <SiteLink href={`novasearch.net/search?q=${encodeURIComponent(t.term)}`}>
            <span className="small semi">{t.term}</span>
          </SiteLink>
          <span className="tiny dim">{formatVolume(t.volume)} posts</span>
        </div>
      ))}
    </div>
  );
}

function WhoToFollow({ n }: { n: Nova }) {
  const people = useMemo(
    () => n.db.all(TABLES.users).filter((u) => u.handle !== "you").sort((a, b) => b.followers - a.followers).slice(0, 4),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n.rev],
  );
  return (
    <div className="panel col" style={{ padding: 12, gap: 10 }}>
      <strong className="small">Suggested for you</strong>
      {people.map((u) => (
        <div key={u.id} className="row" style={{ gap: 8 }}>
          <Avatar name={u.name} hue={hueOf(u.handle)} size={28} />
          <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
            <span className="small ellipsis">{u.name}</span>
            <span className="tiny dim ellipsis">{u.occupation}</span>
          </div>
          <FollowButton n={n} handle={u.handle} />
        </div>
      ))}
    </div>
  );
}

export function FollowButton({ n, handle }: { n: Nova; handle: string }) {
  const following = n.db.all(TABLES.follows).some((f) => f.from === "you" && f.to === handle);
  return (
    <Btn
      size="sm"
      variant={following ? "ghost" : "primary"}
      onClick={() => {
        if (following) n.db.removeWhere(TABLES.follows, (f) => f.from === "you" && f.to === handle);
        else {
          n.db.insert(TABLES.follows, { from: "you", to: handle });
          n.db.insert(TABLES.notifications, { kind: "follow", text: `You followed @${handle}`, ts: Date.now() });
        }
        n.markDirty("web");
      }}
    >
      {following ? "Following" : "Follow"}
    </Btn>
  );
}

function formatVolume(v: number): string {
  if (v > 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v > 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(v);
}
