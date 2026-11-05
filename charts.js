// Stacked in this order from the baseline; the legend above the charts follows it.
const STATUS_SERIES = [
  { key: "done", label: "완료", className: "m-done" },
  { key: "progress", label: "진행중", className: "m-progress" },
  { key: "late", label: "지연", className: "m-late" },
  { key: "other", label: "미입력", className: "m-other" },
];
const MAX_DAYS = 14;
const MAX_CATEGORIES = 8;
const BAR_WIDTH = 24;
const SEGMENT_GAP = 2;
const MIN_CHART_WIDTH = 120;

function svgEl(tag, attributes) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function dailyStats(rows) {
  const byDate = new Map();
  for (const row of rows.filter(r => r.date)) {
    byDate.set(row.date, [...(byDate.get(row.date) || []), row]);
  }
  return [...byDate.keys()].sort().slice(-MAX_DAYS).map(date => ({ date, ...countStatuses(byDate.get(date)) }));
}

function shortDate(date) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
}

function showTip(box, day, x) {
  const tip = $("chart-tip");
  tip.hidden = false;
  tip.replaceChildren(
    el("strong", "", `${shortDate(day.date)} · ${day.all}건`),
    ...STATUS_SERIES.filter(series => day[series.key]).map(series => el("span", "", `${series.label} ${day[series.key]}`)),
  );
  tip.style.left = `${Math.min(x, box.clientWidth - tip.offsetWidth - 4)}px`;
}

function drawDaily(days) {
  const box = $("daily-box");
  $("chart-tip").hidden = true;
  box.querySelector("svg")?.remove();

  const width = box.clientWidth;
  const height = 240;
  const plot = { left: 34, right: width - 8, top: 12, bottom: height - 28 };
  const peak = Math.max(...days.map(day => day.all));
  const step = Math.max(1, Math.ceil(peak / 4));
  const top = Math.ceil(peak / step) * step;
  const y = value => plot.bottom - value / top * (plot.bottom - plot.top);
  const band = (plot.right - plot.left) / days.length;
  const barWidth = Math.min(BAR_WIDTH, band * 0.6);
  const labelEvery = Math.ceil(44 / band);

  const svg = svgEl("svg", { width, height, role: "img", "aria-label": "일별 업무 건수. 같은 내용을 아래 표에서 볼 수 있습니다." });

  for (let value = 0; value <= top; value += step) {
    svg.append(svgEl("line", { class: "grid", x1: plot.left, x2: plot.right, y1: y(value), y2: y(value) }));
    const tick = svgEl("text", { class: "tick", x: plot.left - 8, y: y(value) + 4, "text-anchor": "end" });
    tick.textContent = value;
    svg.append(tick);
  }

  days.forEach((day, index) => {
    const center = plot.left + band * (index + 0.5);
    let total = 0;
    for (const series of STATUS_SERIES) {
      if (!day[series.key]) continue;
      const bottom = y(total);
      total += day[series.key];
      svg.append(svgEl("rect", {
        class: series.className,
        x: center - barWidth / 2,
        y: y(total),
        width: barWidth,
        height: Math.max(1, bottom - y(total) - SEGMENT_GAP),
      }));
    }
    if (index % labelEvery === 0) {
      const label = svgEl("text", { class: "tick", x: center, y: height - 8, "text-anchor": "middle" });
      label.textContent = shortDate(day.date);
      svg.append(label);
    }
    // The hit target covers the whole band so short bars are still easy to hover.
    const hit = svgEl("rect", { class: "hit", x: plot.left + band * index, y: plot.top, width: band, height: plot.bottom - plot.top });
    hit.addEventListener("pointerenter", () => showTip(box, day, Math.max(0, center - 40)));
    hit.addEventListener("pointerleave", () => { $("chart-tip").hidden = true; });
    svg.append(hit);
  });

  box.prepend(svg);
}

function renderDailyTable(days) {
  $("daily-rows").replaceChildren(...[...days].reverse().map(day => {
    const tr = el("tr");
    tr.append(
      el("td", "", day.date),
      el("td", "num", day.all),
      el("td", "num", day.done),
      el("td", "num", day.progress),
      el("td", day.late ? "num has-late" : "num", day.late),
    );
    return tr;
  }));
}

function renderCategories(rows) {
  const counts = new Map();
  for (const row of rows) {
    const name = cell(row, 3) || "미분류";
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const sorted = [...counts].sort((a, b) => b[1] - a[1]).slice(0, MAX_CATEGORIES);
  if (sorted.length === 0) {
    $("category-chart").replaceChildren(el("p", "chart-empty", "아직 업무가 없습니다."));
    return;
  }
  const peak = sorted[0][1];
  $("category-chart").replaceChildren(...sorted.map(([name, count]) => {
    const row = el("div", "cat-row");
    const track = el("div", "cat-track");
    const bar = el("i");
    bar.style.width = `${count / peak * 100}%`;
    track.append(bar);
    row.append(el("span", "cat-name", name), track, el("span", "cat-value", count));
    return row;
  }));
}

let lastDays = [];

function renderCharts(rows) {
  lastDays = dailyStats(rows);
  const hasDays = lastDays.length > 0;
  $("daily-box").hidden = !hasDays;
  $("daily-empty").hidden = hasDays;
  $("daily-table-box").hidden = !hasDays;
  if (hasDays) renderDailyTable(lastDays);
  redrawDaily();
  renderCategories(rows);
}

// The chart measures its box, so it can only be drawn while the stats page is showing.
function redrawDaily() {
  if (lastDays.length && !$("stats-section").hidden && $("daily-box").clientWidth >= MIN_CHART_WIDTH) drawDaily(lastDays);
}

window.addEventListener("resize", redrawDaily);
