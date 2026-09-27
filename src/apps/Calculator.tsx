import { useEffect, useState } from "react";

type Mode = "std" | "sci";

export function CalculatorApp(_props: { args: Record<string, unknown> }) {
  const [mode, setMode] = useState<Mode>("std");
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);
  const [mem, setMem] = useState(0);
  const [hist, setHist] = useState<string[]>([]);

  const num = parseFloat(display.replace(/,/g, "")) || 0;

  const digit = (d: string) => {
    if (fresh) {
      setDisplay(d === "." ? "0." : d);
      setFresh(false);
    } else {
      if (d === "." && display.includes(".")) return;
      if (display === "0" && d !== ".") setDisplay(d);
      else if (display.replace(/[^\d]/g, "").length < 15) setDisplay(display + d);
    }
  };

  const compute = (a: number, b: number, o: string): number => {
    switch (o) {
      case "+": return a + b;
      case "−": return a - b;
      case "×": return a * b;
      case "÷": return b === 0 ? NaN : a / b;
      case "^": return Math.pow(a, b);
      case "mod": return b === 0 ? NaN : a % b;
      default: return b;
    }
  };

  const push = (line: string) => {
    setHist((h) => [line, ...h].slice(0, 30));
  };

  const setOperator = (o: string) => {
    const v = num;
    if (acc !== null && op && !fresh) {
      const r = compute(acc, v, op);
      push(`${fmt(acc)} ${op} ${fmt(v)} = ${fmt(r)}`);
      setAcc(r);
      setDisplay(fmt(r));
    } else {
      setAcc(v);
    }
    setOp(o);
    setFresh(true);
  };

  const equals = () => {
    if (acc === null || !op) {
      setFresh(true);
      return;
    }
    const v = num;
    const r = compute(acc, v, op);
    push(`${fmt(acc)} ${op} ${fmt(v)} = ${fmt(r)}`);
    setDisplay(fmt(r));
    setAcc(null);
    setOp(null);
    setFresh(true);
  };

  const unary = (fn: (x: number) => number, label: string) => {
    const r = fn(num);
    push(`${label}(${fmt(num)}) = ${fmt(r)}`);
    setDisplay(fmt(r));
    setFresh(true);
  };

  const clearAll = () => {
    setDisplay("0");
    setAcc(null);
    setOp(null);
    setFresh(true);
  };

  const back = () => {
    if (fresh) return;
    setDisplay((d) => (d.length > 1 ? d.slice(0, -1) : "0"));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) digit(e.key);
      else if (e.key === ".") digit(".");
      else if (e.key === "+") setOperator("+");
      else if (e.key === "-") setOperator("−");
      else if (e.key === "*") setOperator("×");
      else if (e.key === "/") {
        e.preventDefault();
        setOperator("÷");
      }
      else if (e.key === "Enter" || e.key === "=") equals();
      else if (e.key === "Backspace") back();
      else if (e.key === "Escape") clearAll();
      else if (e.key === "%") unary((x) => x / 100, "%");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const std = [
    ["C", "fn"], ["⌫", "fn"], ["%", "fn"], ["÷", "op"],
    ["7", "d"], ["8", "d"], ["9", "d"], ["×", "op"],
    ["4", "d"], ["5", "d"], ["6", "d"], ["−", "op"],
    ["1", "d"], ["2", "d"], ["3", "d"], ["+", "op"],
    ["±", "fn"], ["0", "d"], [".", "d"], ["=", "eq"],
  ];

  const sci = [
    ["sin", "f"], ["cos", "f"], ["tan", "f"], ["C", "fn"], ["⌫", "fn"],
    ["ln", "f"], ["log", "f"], ["√", "f"], ["÷", "op"], ["x²", "f"],
    ["7", "d"], ["8", "d"], ["9", "d"], ["×", "op"], ["^", "op"],
    ["4", "d"], ["5", "d"], ["6", "d"], ["−", "op"], ["mod", "op"],
    ["1", "d"], ["2", "d"], ["3", "d"], ["+", "op"], ["π", "f"],
    ["±", "fn"], ["0", "d"], [".", "d"], ["=", "eq"], ["e", "f"],
  ];

  const keys = mode === "std" ? std : sci;

  return (
    <div className="col grow" style={{ minHeight: 0 }}>
      <div className="row" style={{ padding: 8, gap: 6 }}>
        <div className="seg">
          <button aria-pressed={mode === "std"} onClick={() => setMode("std")}>Standard</button>
          <button aria-pressed={mode === "sci"} onClick={() => setMode("sci")}>Scientific</button>
        </div>
        <span className="spacer" />
        <span className="tiny dim mono">M {fmt(mem)}</span>
      </div>

      <div
        className="col end"
        style={{ padding: "10px 14px 12px", gap: 2, minHeight: 76, justifyContent: "flex-end" }}
      >
        <div className="tiny dim mono ellipsis" style={{ maxWidth: "100%" }}>
          {acc !== null ? `${fmt(acc)} ${op ?? ""}` : ""}
        </div>
        <div
          className="mono"
          style={{ fontSize: 30, fontWeight: 300, lineHeight: 1.1, wordBreak: "break-all", textAlign: "right" }}
        >
          {display}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 4,
          padding: "0 8px 8px",
          flex: "1 1 auto",
          minHeight: 0,
        }}
      >
        {keys.map(([label, kind], i) => (
          <button
            key={i}
            className="btn"
            onClick={() => {
              if (kind === "d") digit(label);
              else if (kind === "op") setOperator(label);
              else if (kind === "eq") equals();
              else if (label === "C") clearAll();
              else if (label === "⌫") back();
              else if (label === "±") unary((x) => -x, "neg");
              else if (label === "%") unary((x) => x / 100, "%");
              else if (label === "π") { setDisplay(String(Math.PI).slice(0, 12)); setFresh(true); }
              else if (label === "e") { setDisplay(String(Math.E).slice(0, 10)); setFresh(true); }
              else if (label === "sin") unary(Math.sin, "sin");
              else if (label === "cos") unary(Math.cos, "cos");
              else if (label === "tan") unary(Math.tan, "tan");
              else if (label === "ln") unary(Math.log, "ln");
              else if (label === "log") unary(Math.log10, "log");
              else if (label === "√") unary(Math.sqrt, "√");
              else if (label === "x²") unary((x) => x * x, "sqr");
              else if (label === "M") { /* handled below */ }
            }}
            style={{
              justifyContent: "center",
              fontSize: 14,
              padding: 0,
              minHeight: 38,
              ...(kind === "op" || kind === "eq"
                ? { background: "color-mix(in srgb, var(--accent) 18%, var(--panel-2))", color: "var(--text)" }
                : kind === "fn"
                ? { color: "var(--text-2)" }
                : {}),
              ...(label === "=" ? { background: "var(--accent)", color: "#04121c", fontWeight: 700 } : {}),
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="row" style={{ gap: 4, padding: "0 8px 8px" }}>
        <Btn2 onClick={() => setMem((m) => m + num)}>M+</Btn2>
        <Btn2 onClick={() => setMem(num)}>MS</Btn2>
        <Btn2 onClick={() => { setDisplay(fmt(mem)); setFresh(true); }}>MR</Btn2>
        <Btn2 onClick={() => setMem(0)}>MC</Btn2>
      </div>

      {hist.length > 0 && (
        <div className="scroll" style={{ maxHeight: 92, padding: "0 10px 10px", fontSize: 11.5 }}>
          {hist.slice(0, 6).map((h, i) => (
            <div key={i} className="mono dim ellipsis">{h}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function Btn2({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button className="btn btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={onClick}>
      {children}
    </button>
  );
}

function fmt(n: number): string {
  if (!isFinite(n)) return "Error";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-6 || abs >= 1e12)) return n.toExponential(6);
  return Number(n.toPrecision(12)).toString();
}
