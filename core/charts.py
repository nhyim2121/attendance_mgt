"""Plotly 차트 생성 함수."""
from __future__ import annotations

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from .config import WorkRule

STATUS_COLORS = {
    "정상": "#4C9F70", "휴일근무": "#7B9ACC", "지각": "#E07A5F", "조퇴": "#F2A65A",
    "지각·조퇴": "#C8553D", "태그 누락": "#B8B8B8", "퇴근 기록 없음": "#B8B8B8", "출근 기록 없음": "#B8B8B8", "기록 없음": "#6D6D6D",
    "연차": "#81B29A", "공가": "#A3C4BC", "출장": "#3D5A80", "교육": "#98C1D9",
}


def _hours(ts: pd.Series) -> pd.Series:
    return ts.dt.hour + ts.dt.minute / 60 + ts.dt.second / 3600


def avg_stay_bar(summary: pd.DataFrame) -> go.Figure:
    df = summary.dropna(subset=["평균체류(h)"]).sort_values("평균체류(h)")
    fig = px.bar(df, x="평균체류(h)", y="직원", orientation="h", color="부서",
                 hover_data=["출근일수", "평균출근", "평균퇴근"])
    fig.update_layout(height=max(320, 26 * len(df)), yaxis_title=None, xaxis_title="평일 평균 체류시간(시간)")
    return fig


def late_bar(summary: pd.DataFrame) -> go.Figure:
    cols = ["지각", "조퇴", "태그 누락", "기록 없음"]
    df = summary[summary[cols].sum(axis=1) > 0]
    long = df.melt(id_vars=["직원"], value_vars=cols, var_name="유형", value_name="횟수")
    long = long[long["횟수"] > 0]
    fig = px.bar(long, x="직원", y="횟수", color="유형", color_discrete_map=STATUS_COLORS)
    fig.update_layout(xaxis_title=None, height=380)
    return fig


def leave_bar(summary: pd.DataFrame) -> go.Figure:
    df = summary[(summary["휴가사용(일)"] > 0) | (summary["출장·교육"] > 0)]
    long = df.melt(id_vars=["직원"], value_vars=["휴가사용(일)", "출장·교육"], var_name="구분", value_name="일수")
    fig = px.bar(long, x="직원", y="일수", color="구분", barmode="group")
    fig.update_layout(xaxis_title=None, height=380)
    return fig


def headcount_line(headcount: pd.DataFrame) -> go.Figure:
    long = headcount.melt(id_vars=["일자"], value_vars=["출근인원", "휴가인원", "지각인원"],
                          var_name="구분", value_name="인원")
    fig = px.line(long, x="일자", y="인원", color="구분", markers=True)
    fig.update_layout(xaxis_title=None, height=360)
    return fig


def status_by_month(table: pd.DataFrame) -> go.Figure:
    fig = px.bar(table, x="월", y="건수", color="상태", color_discrete_map=STATUS_COLORS)
    fig.update_layout(xaxis_title=None, height=360)
    return fig


def hour_weekday_heatmap(table: pd.DataFrame) -> go.Figure:
    fig = px.imshow(table, aspect="auto", color_continuous_scale="Blues",
                    labels={"x": "시간대", "y": "요일", "color": "태그 수"})
    fig.update_layout(height=320)
    return fig


def employee_timeline(days: pd.DataFrame, rule: WorkRule) -> go.Figure:
    """한 직원의 날짜별 출근/퇴근 시각 (휴가·기록 없음 날은 아래쪽 표시)."""
    fig = go.Figure()
    has = days[days["출근"].notna()]
    x = pd.to_datetime(has["일자"])
    fig.add_trace(go.Scatter(x=x, y=_hours(has["출근"]), mode="markers+lines", name="출근",
                             text=has["출근"].dt.strftime("%H:%M") + " " + has["상태"],
                             hovertemplate="%{x|%m-%d} 출근 %{text}<extra></extra>"))
    fig.add_trace(go.Scatter(x=x, y=_hours(has["퇴근"]), mode="markers+lines", name="퇴근",
                             text=has["퇴근"].dt.strftime("%H:%M"),
                             hovertemplate="%{x|%m-%d} 퇴근 %{text}<extra></extra>"))
    off = days[days["출근"].isna()]
    if len(off):
        fig.add_trace(go.Scatter(x=pd.to_datetime(off["일자"]), y=[23] * len(off), mode="markers+text",
                                 name="휴가/기록 없음", text=off["상태"], textposition="top center",
                                 marker={"symbol": "x", "size": 9}))
    fig.add_hline(y=rule.start.hour + (rule.start.minute + rule.grace_min) / 60, line_dash="dot",
                  annotation_text="출근 기준", line_color="red")
    fig.add_hline(y=rule.end.hour + rule.end.minute / 60, line_dash="dot",
                  annotation_text="퇴근 기준", line_color="gray")
    fig.update_yaxes(title="시각", range=[24, 4], dtick=2)  # 위가 이른 시간
    fig.update_layout(height=440, xaxis_title=None)
    return fig


def dept_pie(summary: pd.DataFrame) -> go.Figure:
    df = summary.assign(부서=summary["부서"].replace("", "(미지정)"))
    counts = df.groupby("부서").size().reset_index(name="인원")
    fig = px.pie(counts, names="부서", values="인원", hole=0.45)
    fig.update_layout(height=340)
    return fig
