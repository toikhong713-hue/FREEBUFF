import { useEffect, useId, useMemo, type ReactNode } from "react";

/* ------------------------------------------------------------------ atoms */

export function Panel({
  children,
  className = "",
  pad = 12,
  ...rest
}: { children: ReactNode; className?: string; pad?: number } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`panel ${className}`} style={{ padding: pad, ...rest.style }} {...rest}>
      {children}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  onDoubleClick,
  variant = "default",
  size,
  disabled,
  title,
  className = "",
  type = "button",
  style,
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  variant?: "default" | "primary" | "ghost" | "danger";
  size?: "sm";
  disabled?: boolean;
  title?: string;
  className?: string;
  type?: "button" | "submit";
  style?: React.CSSProperties;
}) {
  const v =
    variant === "primary" ? "btn-primary" : variant === "ghost" ? "btn-ghost" : variant === "danger" ? "btn-danger" : "";
  return (
    <button
      type={type}
      className={`btn ${v} ${size === "sm" ? "btn-sm" : ""} ${className}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      disabled={disabled}
      title={title}
      style={style}
    >
      {children}
    </button>
  );
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-pressed={value === o.value}
          aria-selected={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; badge?: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="row nowrap-scroll" role="tablist" style={{ gap: 2, borderBottom: "1px solid var(--border)" }}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className="btn btn-ghost"
          style={{
            borderRadius: "8px 8px 0 0",
            borderBottom: value === o.value ? "2px solid var(--accent)" : "2px solid transparent",
            color: value === o.value ? "var(--text)" : "var(--text-3)",
            paddingBottom: 6,
          }}
        >
          {o.label}
          {o.badge != null && <span className="dim tiny">{o.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Badge({
  children,
  tone,
  title,
}: {
  children: ReactNode;
  tone?: "ok" | "warn" | "err" | "info";
  title?: string;
}) {
  const cls = tone ? `badge badge-${tone}` : "badge";
  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}

export function Meter({ pct, color }: { pct: number; color?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="meter">
      <i style={{ width: `${p}%`, background: color ?? loadColor(p) }} />
    </div>
  );
}

export function loadColor(p: number): string {
  if (p > 85) return "var(--err)";
  if (p > 65) return "var(--warn)";
  return "var(--accent)";
}

export function KV({ k, v, title }: { k: ReactNode; v: ReactNode; title?: string }) {
  return (
    <div className="kv" title={title}>
      <span>{k}</span>
      <span className="mono">{v}</span>
    </div>
  );
}

export function Empty({ icon = "∅", title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="col center" style={{ gap: 6, padding: "36px 16px", textAlign: "center" }}>
      <div style={{ fontSize: 26, opacity: 0.4 }}>{icon}</div>
      <div className="semi">{title}</div>
      {hint && <div className="small dim" style={{ maxWidth: 380 }}>{hint}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------- charts */

/** Fixed-window ring buffer sparkline. */
export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = "var(--accent)",
  fill = true,
  max,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  max?: number;
}) {
  const d = useMemo(() => {
    if (data.length < 2) return null;
    const hi = max ?? Math.max(...data, 1);
    const step = width / (data.length - 1);
    const pts = data.map((v, i) => [i * step, height - (Math.min(v, hi) / hi) * (height - 2) - 1] as const);
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const area = `${line} L${width},${height} L0,${height} Z`;
    return { line, area };
  }, [data, width, height, max]);

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }} aria-hidden>
      {d && fill && <path d={d.area} fill={color} opacity={0.14} />}
      {d && <path d={d.line} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />}
      {!d && <line x1={0} y1={height - 1} x2={width} y2={height - 1} stroke="var(--border)" />}
    </svg>
  );
}

export function Ring({
  pct,
  size = 76,
  stroke = 7,
  color,
  label,
  sub,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: ReactNode;
  sub?: ReactNode;
}) {
  const p = Math.max(0, Math.min(100, pct));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const c2 = color ?? loadColor(p);
  return (
    <div className="col center" style={{ gap: 2, width: size }}>
      <div className="rel" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={c2}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (p / 100) * c}
            style={{ transition: "stroke-dashoffset 220ms linear" }}
          />
        </svg>
        <div
          className="col center"
          style={{ position: "absolute", inset: 0, justifyContent: "center", gap: 0 }}
        >
          <div style={{ fontSize: size * 0.23, fontWeight: 640, fontVariantNumeric: "tabular-nums" }}>
            {label ?? `${Math.round(p)}`}
            {label == null && <span style={{ fontSize: size * 0.13, opacity: 0.6 }}>%</span>}
          </div>
          {sub != null && <div className="tiny dim">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

export function BarRow({
  label,
  value,
  max,
  color,
  right,
}: {
  label: ReactNode;
  value: number;
  max: number;
  color?: string;
  right?: ReactNode;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="col" style={{ gap: 3 }}>
      <div className="row between tiny">
        <span className="ellipsis">{label}</span>
        <span className="mono dim">{right}</span>
      </div>
      <div className="meter">
        <i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color ?? loadColor(pct) }} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- histogram */

export interface Column<T> {
  key: string;
  label: string;
  width?: number | string;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  onRowClick,
  onRowDoubleClick,
  selectedId,
  height,
  emptyText = "No rows",
  rowClass,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  selectedId?: string;
  height?: number | string;
  emptyText?: string;
  rowClass?: (row: T) => string;
}) {
  if (!rows.length) return <Empty title={emptyText} />;
  const idOf = (r: T): string => String((r as { id?: string | number }).id ?? "");
  return (
    <div className="scroll" style={{ height, minHeight: 0 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  textAlign: c.align ?? "left",
                  width: c.width,
                  padding: "6px 8px",
                  background: "var(--panel-solid)",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text-3)",
                  fontWeight: 560,
                  fontSize: 11,
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr
              key={idOf(r) || ri}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(r) : undefined}
              className={rowClass?.(r) ?? ""}
              style={{
                cursor: onRowClick ? "pointer" : "default",
                background: selectedId === idOf(r) ? "color-mix(in srgb, var(--accent) 14%, transparent)" : undefined,
              }}
              onMouseEnter={(e) => {
                if (selectedId === idOf(r)) return;
                e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 7%, transparent)";
              }}
              onMouseLeave={(e) => {
                if (selectedId === idOf(r)) return;
                e.currentTarget.style.background = "";
              }}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{
                    textAlign: c.align ?? "left",
                    padding: "5px 8px",
                    borderBottom: "1px solid color-mix(in srgb, var(--border) 55%, transparent)",
                    verticalAlign: "middle",
                  }}
                >
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ modal */

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 520,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "rgba(3, 6, 12, 0.6)",
        backdropFilter: "blur(4px)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        className="panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: "100%",
          maxWidth: width,
          maxHeight: "86vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow)",
          animation: "pop 150ms cubic-bezier(0.2,0,0.2,1)",
        }}
      >
        <div
          className="row between"
          style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}
        >
          <strong style={{ fontSize: 13.5 }}>{title}</strong>
          <Btn variant="ghost" size="sm" onClick={onClose} title="Close">
            ✕
          </Btn>
        </div>
        <div className="scroll" style={{ padding: 14, minHeight: 0 }}>
          {children}
        </div>
        {footer && (
          <div className="row end" style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", gap: 8 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- misc */

export function Field({
  label,
  children,
  hint,
  wide,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="col" style={{ gap: 4, gridColumn: wide ? "1 / -1" : undefined }}>
      <span className="tiny dim semi" style={{ letterSpacing: "0.03em" }}>
        {label}
      </span>
      <span id={id}>{children}</span>
      {hint && <span className="tiny dim">{hint}</span>}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="small">{label}</span>
    </label>
  );
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  format?: (v: number) => string;
}) {
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="row between tiny">
        <span className="dim">{label}</span>
        <span className="mono">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  );
}

