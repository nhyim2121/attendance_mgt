"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";

// 검증한 계열 색 (흰 배경, 색각 이상 구분 통과). 3번째(청록)는 대비가 낮아 표를 함께 둔다.
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"];
const AXIS = { fontSize: 12, fill: "#6b7280" };
const GRID = "#eef0f4";

const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const clock = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

/** 날짜별 출근·휴가·지각 인원 */
export function HeadcountChart({ data }: { data: { day: string; present: number; onLeave: number; late: number }[] }) {
  return (
    <div className="chart short">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: -10 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tickFormatter={md} tick={AXIS} stroke="#d1d5db" />
          <YAxis allowDecimals={false} tick={AXIS} stroke="#d1d5db" />
          <Tooltip labelFormatter={(d) => md(String(d))} />
          <Legend />
          <Line dataKey="present" name="출근인원" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4 }} />
          <Line dataKey="onLeave" name="휴가인원" stroke={SERIES[1]} strokeWidth={2} dot={{ r: 4 }} />
          <Line dataKey="late" name="지각인원" stroke={SERIES[2]} strokeWidth={2} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface TimelinePoint {
  day: string;
  in: number | null; // 시각(시간 단위, 8.5 = 08:30)
  out: number | null;
  status: string;
}

/** 한 직원의 날짜별 출근/퇴근 시각 (위가 이른 시간) */
export function TimelineChart({ data, start, end }: { data: TimelinePoint[]; start: number; end: number }) {
  return (
    <div className="chart">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 60, bottom: 0, left: -10 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tickFormatter={md} tick={AXIS} stroke="#d1d5db" />
          <YAxis reversed domain={[4, 24]} ticks={[4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]} tickFormatter={(h) => `${h}시`}
            tick={AXIS} stroke="#d1d5db" />
          <Tooltip
            labelFormatter={(d, p) => `${md(String(d))} ${(p?.[0]?.payload as TimelinePoint | undefined)?.status ?? ""}`}
            formatter={(v, name) => [typeof v === "number" ? clock(v) : "-", name]} />
          <Legend />
          <ReferenceLine y={start} stroke="#d42a2a" strokeDasharray="4 4" label={{ value: "출근 기준", position: "right", fontSize: 11, fill: "#6b7280" }} />
          <ReferenceLine y={end} stroke="#9aa3af" strokeDasharray="4 4" label={{ value: "퇴근 기준", position: "right", fontSize: 11, fill: "#6b7280" }} />
          <Line dataKey="in" name="출근" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4 }} connectNulls />
          <Line dataKey="out" name="퇴근" stroke={SERIES[1]} strokeWidth={2} dot={{ r: 4 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const hrs = (v: unknown) => [`${typeof v === "number" ? v.toFixed(1) : v}시간`, ""] as [string, string];

/** 한 계열 영역 차트 (요일별·월별 1인 평균 근무시간). 제목이 계열을 말하므로 범례 없음. */
export function HoursArea({ data, x, color = SERIES[0], height = 220 }: {
  data: { hours: number }[]; x: string; color?: string; height?: number;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={x} tick={AXIS} stroke="#d1d5db" />
          <YAxis tick={AXIS} stroke="#d1d5db" tickFormatter={(h) => `${h}h`} />
          <Tooltip formatter={hrs} />
          <Area dataKey="hours" type="monotone" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.14}
            dot={{ r: 4, fill: color }} activeDot={{ r: 6 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 한 계열 막대 (부서별 평균 연장근로). 값은 막대 위에 표시. */
export function HoursBars({ data, x, height = 240 }: { data: { hours: number }[]; x: string; height?: number }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 18, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={x} tick={AXIS} stroke="#d1d5db" interval={0} />
          <YAxis tick={AXIS} stroke="#d1d5db" tickFormatter={(h) => `${h}h`} />
          <Tooltip formatter={hrs} cursor={{ fill: "#f3f5f9" }} />
          <Bar dataKey="hours" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
            <LabelList dataKey="hours" position="top" fontSize={11} fill="#4b5563"
              formatter={(v: unknown) => (typeof v === "number" && v > 0 ? `${v.toFixed(1)}h` : "")} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 월별 입사·퇴사 인원 */
export function JoinLeaveBars({ data }: { data: { month: string; join: number; leave: number }[] }) {
  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -24 }} barGap={2}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={AXIS} stroke="#d1d5db" interval={0} />
          <YAxis allowDecimals={false} tick={AXIS} stroke="#d1d5db" />
          <Tooltip formatter={(v, n) => [`${v}명`, n]} cursor={{ fill: "#f3f5f9" }} />
          <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="join" name="입사" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
          <Bar dataKey="leave" name="퇴사" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------- 홈 대시보드 (로고 남색·빨강 두 계열)
export const HOME = { navy: "#0c3994", red: "#e84340" }; // 에쓰엔 로고 색

/** 부서별 재직·오늘 출근 인원 (막대 위에 숫자) */
export function DeptHeadBars({ data, height = 230 }: { data: { dept: string; staff: number; present: number }[]; height?: number }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: -24 }} barGap={3}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="dept" tick={AXIS} stroke="#d1d5db" interval={0} />
          <YAxis allowDecimals={false} tick={AXIS} stroke="#d1d5db" />
          <Tooltip formatter={(v, n) => [`${v}명`, n]} cursor={{ fill: "#eef2fa" }} />
          <Legend verticalAlign="top" align="right" iconType="square" wrapperStyle={{ fontSize: 12, top: -4 }} />
          {([["staff", "재직", HOME.navy], ["present", "오늘 출근", HOME.red]] as const).map(([k, n, c]) => (
            <Bar key={k} dataKey={k} name={n} fill={c} radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false}>
              <LabelList dataKey={k} position="top" fontSize={11} fontWeight={700} fill="#374151" />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 오늘 근태 분포: 가로 막대 (전체 재직 대비 길이), 오른쪽에 인원·비율 */
export function StatusBars({ data, total, unit = "명" }: { data: { label: string; n: number; color: string }[]; total: number; unit?: string }) {
  return (
    <div className="sbars">
      {data.map((d) => (
        <div key={d.label} className="sbar">
          <span className="sbar-l">{d.label}</span>
          <div className="sbar-track">
            <div className="sbar-fill" style={{ width: `${total ? Math.max(d.n ? 4 : 0, (d.n / total) * 100) : 0}%`, background: d.color }}>
              {d.n > 0 && <b>{d.n}</b>}
            </div>
          </div>
          <span className="sbar-v">{d.n}{unit} <small>{total ? Math.round((d.n / total) * 100) : 0}%</small></span>
        </div>
      ))}
    </div>
  );
}

/** 월별 1인 평균 근무시간(영역) + 연장근무시간(선) */
export function MonthlyCombo({ data, height = 230 }: { data: { label: string; hours: number; overtime: number }[]; height?: number }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="homeNavy" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={HOME.navy} stopOpacity={0.55} />
              <stop offset="100%" stopColor={HOME.navy} stopOpacity={0.08} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} stroke="#d1d5db" />
          <YAxis tick={AXIS} stroke="#d1d5db" tickFormatter={(h) => `${h}h`} />
          <Tooltip formatter={(v, n) => [`${typeof v === "number" ? v.toFixed(1) : v}시간`, n]} />
          <Legend verticalAlign="top" align="right" iconType="square" wrapperStyle={{ fontSize: 12, top: -4 }} />
          <Area dataKey="hours" name="근무시간" type="monotone" stroke={HOME.navy} strokeWidth={2} fill="url(#homeNavy)"
            isAnimationActive={false} />
          <Area dataKey="overtime" name="연장·휴일" type="monotone" stroke={HOME.red} strokeWidth={2.5} fill="none"
            dot={{ r: 3, fill: HOME.red }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 두 계열 막대 (예: 부서별 부여·사용 일수). 막대 위에 숫자. */
export function TwoBars({ data, x, a, b, unit = "", height = 230 }: {
  data: Record<string, string | number>[]; x: string; a: [string, string]; b: [string, string]; unit?: string; height?: number;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: -22 }} barGap={3}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={x} tick={AXIS} stroke="#d1d5db" interval={0} />
          <YAxis allowDecimals={false} tick={AXIS} stroke="#d1d5db" />
          <Tooltip formatter={(v, n) => [`${v}${unit}`, n]} cursor={{ fill: "#eef2fa" }} />
          <Legend verticalAlign="top" align="right" iconType="square" wrapperStyle={{ fontSize: 12, top: -4 }} />
          {([[a, HOME.navy], [b, HOME.red]] as const).map(([[k, n], c]) => (
            <Bar key={k} dataKey={k} name={n} fill={c} radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false}>
              <LabelList dataKey={k} position="top" fontSize={11} fontWeight={700} fill="#374151"
                formatter={(v: unknown) => (typeof v === "number" && v > 0 ? String(Math.round(v * 10) / 10) : "")} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 월별 휴가 사용 일수 (사용 + 예정 쌓기) */
export function MonthlyLeaveBars({ data, height = 230 }: { data: { label: string; used: number; planned: number }[]; height?: number }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: -22 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} stroke="#d1d5db" interval={0} />
          <YAxis allowDecimals={false} tick={AXIS} stroke="#d1d5db" />
          <Tooltip formatter={(v, n) => [`${v}일`, n]} cursor={{ fill: "#eef2fa" }} />
          <Legend verticalAlign="top" align="right" iconType="square" wrapperStyle={{ fontSize: 12, top: -4 }} />
          <Bar dataKey="used" name="사용" stackId="s" fill={HOME.navy} maxBarSize={30} isAnimationActive={false} />
          <Bar dataKey="planned" name="예정" stackId="s" fill="#f4a29f" radius={[3, 3, 0, 0]} maxBarSize={30} isAnimationActive={false}>
            <LabelList position="top" fontSize={11} fontWeight={700} fill="#374151"
              valueAccessor={(e: { payload?: { used: number; planned: number } }) => {
                const t = (e.payload?.used ?? 0) + (e.payload?.planned ?? 0);
                return t > 0 ? String(Math.round(t * 10) / 10) : "";
              }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
