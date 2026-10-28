/** 대시보드 카드·표 조각 (서버·클라이언트 공용). */
import Link from "next/link";

export const COLORS = {
  blue: "#2563c9", red: "#d42a2a", orange: "#e07b00", green: "#1f8a3b", gray: "#4b5563", violet: "#6d28d9",
  amber: "#b45309",
};

export function Kpi({ label, n, color, sub }: { label: string; n: number; color: string; sub?: string }) {
  return (
    <div className="kpi" style={{ "--c": color } as React.CSSProperties}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-num">{n.toLocaleString()}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

export function Metric({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return <div className="metric" title={title}><div className="l">{label}</div><div className="v">{value}</div></div>;
}

export function Msg({ kind = "ok", children }: { kind?: "ok" | "err" | "warn" | "info"; children: React.ReactNode }) {
  return <div className={`msg ${kind}`}>{children}</div>;
}

type CellV = string | number | null | undefined | React.ReactNode;

/** 단순 표. numeric에 든 열은 오른쪽 정렬. */
export function Table({ head, rows, numeric = [], tall = false, rowClass, wrap = [] }: {
  head: string[]; rows: CellV[][]; numeric?: number[]; tall?: boolean; rowClass?: (i: number) => string;
  wrap?: number[];
}) {
  return (
    <div className={`tbl-wrap${tall ? " tall" : ""}`}>
      <table className="tbl">
        <thead><tr>{head.map((h, i) => <th key={i} className={numeric.includes(i) ? "num" : ""}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={rowClass?.(i)}>
              {r.map((c, j) => (
                <td key={j} className={numeric.includes(j) ? "num" : wrap.includes(j) ? "wrap" : ""}>{c ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NoData() {
  return (
    <div className="msg info">
      아직 저장된 캡스 기록이 없습니다. <b>파일 업로드</b>에서 캡스 파일을 올려 주세요.{" "}
      <Link href="/upload">파일 업로드로 이동</Link>
    </div>
  );
}

/** 시간(h) -> '129h 13m' */
export function hm(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return "-";
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60), m = total % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtNum(x: number): string {
  return String(Number(x.toPrecision(6)));
}
