"use client";

import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
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
