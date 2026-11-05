// 주간업무보고: a Notion-style report page and the company's paper form, both drawn from per-department
// summaries the server writes from the week's 업무일지 (with AI, or tidied by rule when no AI key is set).
const weekly = { monday: null, view: "doc", data: null, loading: false };

function addDays(date, days) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

function mondayOf(date) {
  return addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
}

function weekRange(monday) {
  return `${monday.replaceAll("-", ".")}~${addDays(monday, 4).replaceAll("-", ".")}`;
}

// Same rule as the server's 주차: the week belongs to the month its Thursday falls in.
function weekName(monday) {
  const thursday = addDays(monday, 3);
  return `${Number(thursday.slice(5, 7))}월 ${Math.ceil(Number(thursday.slice(8)) / 7)}주차`;
}

function weeklyTitle() {
  weekly.monday ||= mondayOf(localToday());
  return `${weekName(weekly.monday)} 주간업무보고`;
}

async function loadWeekly(refresh = false) {
  weekly.monday ||= mondayOf(localToday());
  const monday = weekly.monday;
  weekly.loading = true;
  renderWeekly();
  try {
    const data = await api("/api/weekly", "POST", { monday, refresh });
    if (monday === weekly.monday) weekly.data = data;
  } catch (error) {
    if (monday === weekly.monday) weekly.data = null;
    showNotice("보고서를 정리하지 못했습니다.", error.message, true);
  } finally {
    if (monday === weekly.monday) weekly.loading = false;
    renderWeekly();
  }
}

// Called when entries change; the next visit to the page asks the server again.
function invalidateWeekly() {
  weekly.data = null;
  if (state.page === "weekly") loadWeekly();
}

function selectedDepts() {
  const data = weekly.data;
  if (!data) return [];
  const dept = $("dept").value;
  const names = [...new Set([...state.departments, ...Object.keys(data.current), ...Object.keys(data.previous)])];
  return names.filter(name => (data.current[name] || data.previous[name]) && (dept === ALL || dept === name));
}

function sumStatuses(summaries) {
  const counts = { 완료: 0, 진행중: 0, 지연: 0 };
  for (const summary of summaries) {
    for (const person of summary.people) {
      for (const category of person.categories) {
        for (const item of category.items) counts[item.status] += 1;
      }
    }
  }
  return counts;
}

function countTags(counts) {
  return STATUSES.filter(status => counts[status]).map(status => el("span", statusClass(status), `${status} ${counts[status]}`));
}

function renderWeeklyProps(depts) {
  const data = weekly.data;
  $("wr-range").textContent = weekRange(weekly.monday);
  $("wr-this-week").hidden = weekly.monday === mondayOf(localToday());
  const current = depts.map(name => data?.current[name]).filter(Boolean);
  const tags = countTags(sumStatuses(current));
  $("wr-counts").replaceChildren(...(tags.length ? tags : [el("span", "wr-source", "이번 주 업무 없음")]));

  const sources = current.map(summary => summary.source);
  let source = "";
  if (weekly.loading) source = "정리하는 중…";
  else if (!data) source = "";
  else if (!data.aiEnabled) source = "AI 키가 없어 작성한 문구를 규칙대로 묶어 보여 줍니다";
  else if (sources.includes("rule")) source = `일부는 AI 없이 정리했습니다. ${data.error}`;
  else if (sources.length) {
    const latest = current.map(summary => summary.createdAt).sort().pop();
    source = `AI가 업무일지를 읽고 정리함 · ${new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(latest))}`;
  }
  $("wr-source").textContent = source;
  $("wr-refresh").hidden = !data?.aiEnabled;
  $("wr-refresh").disabled = weekly.loading;
}

function itemList(items, withTags) {
  const list = el("ul", "bullets wr-items");
  list.append(...items.map(item => {
    const li = el("li", "", item.text);
    if (withTags) li.append(el("span", statusClass(item.status), item.status));
    return li;
  }));
  return list;
}

function categoryBlocks(person) {
  const box = el("div");
  person.categories.forEach((category, index) => {
    box.append(el("p", "wr-cat-name", `${index + 1}. ${category.name}`), itemList(category.items, true));
  });
  return box;
}

function personToggle(name, current, previous) {
  const toggle = el("details", "toggle wr-person");
  toggle.open = true;
  const summary = el("summary");
  summary.append(el("span", "emoji", "👤"), name);
  const body = el("div", "toggle-body");

  if (current) {
    body.append(el("p", "wr-section-title", "이번 주 한 일"), categoryBlocks(current));
    if (current.issues.length) {
      const callout = el("div", "callout is-warn");
      const text = el("div");
      text.append(el("strong", "", "이슈 · 지연"), itemList(current.issues.map(issue => ({ text: issue }))));
      callout.append(el("span", "emoji", "⚠️"), text);
      body.append(callout);
    }
    if (current.next.length) {
      const todo = el("ul", "todo");
      todo.append(...current.next.map(text => el("li", "", text)));
      body.append(el("p", "wr-section-title", "다음 주 이어갈 일"), todo);
    }
    if (current.notes.length) {
      const quote = el("blockquote", "quote");
      quote.append(...current.notes.map(note => el("div", "", note)));
      body.append(el("p", "wr-section-title", "비고"), quote);
    }
  } else {
    body.append(el("p", "empty", "이번 주에 작성한 업무일지가 없습니다."));
  }

  if (previous) {
    const prev = el("details", "toggle wr-prev");
    const prevSummary = el("summary", "", `지난 주 한 일 (${weekRange(addDays(weekly.monday, -7))})`);
    const prevBody = el("div", "toggle-body");
    prevBody.append(categoryBlocks(previous));
    prev.append(prevSummary, prevBody);
    body.append(prev);
  }
  toggle.append(summary, body);
  return toggle;
}

function renderDeptDoc(name) {
  const current = weekly.data.current[name];
  const previous = weekly.data.previous[name];
  const section = el("section", "wr-dept");
  const head = el("div", "wr-dept-head");
  head.append(el("h2", "", name), ...(current ? countTags(sumStatuses([current])) : []));

  const callout = el("div", "callout is-blue");
  callout.append(el("span", "emoji", "💡"), el("p", "", current?.overview || "이번 주에 작성된 업무일지가 없습니다."));
  section.append(head, callout);

  const authors = [...new Set([...(current?.people || []), ...(previous?.people || [])].map(person => person.author))];
  section.append(...authors.map(author => personToggle(
    author,
    current?.people.find(person => person.author === author),
    previous?.people.find(person => person.author === author),
  )));
  return section;
}

function renderFormColumn(person) {
  const td = el("td");
  if (!person) {
    td.append(el("p", "wr-none", "작성된 업무 없음"));
    return td;
  }
  person.categories.forEach((category, index) => {
    const block = el("div", "wr-cat");
    block.append(el("p", "wr-cat-title", `${index + 1}. ${category.name}`));
    for (const [label, test] of [["진행", status => status !== "완료"], ["완료", status => status === "완료"]]) {
      const items = category.items.filter(item => test(item.status));
      if (!items.length) continue;
      const list = el("ul");
      list.append(...items.map(item => {
        const li = el("li", "", item.text);
        if (item.status === "지연") li.append(" ", el("span", "wr-late", "지연"));
        return li;
      }));
      block.append(el("p", "wr-group", `□ ${label}`), list);
    }
    td.append(block);
  });
  return td;
}

function renderDeptSheet(name, index) {
  const current = weekly.data.current[name];
  const previous = weekly.data.previous[name];
  const authors = [...new Set([...(previous?.people || []), ...(current?.people || [])].map(person => person.author))];
  const sheet = el("article", "wr-sheet");
  const band = el("header", "wr-band");
  const logo = el("img");
  logo.src = "assets/logo.png";
  logo.alt = "주식회사 에쓰엔";
  band.append(el("h2", "", `${index}. 주간업무보고_${name}`), logo);

  const table = el("table", "wr-table");
  table.innerHTML = `<colgroup><col class="wr-col-who"><col><col><col class="wr-col-note"></colgroup>
    <thead>
      <tr><th rowspan="2">구분</th><th>전주 주요 업무</th><th>금주 주요 업무</th><th rowspan="2">비고</th></tr>
      <tr class="wr-dates"><th>${weekRange(addDays(weekly.monday, -7))}</th><th>${weekRange(weekly.monday)}</th></tr>
    </thead>`;
  const body = el("tbody");
  body.append(...authors.map(author => {
    const now = current?.people.find(person => person.author === author);
    const who = el("td", "wr-who");
    who.append(el("span", "wr-who-dept", name.replace(/팀$/, "")), el("strong", "", author));
    const notes = el("td", "wr-notes");
    const list = el("ul");
    list.append(...[...(now?.notes || []), ...(now?.issues || [])].map(note => el("li", "", note)));
    notes.append(list);
    const tr = el("tr");
    tr.append(who, renderFormColumn(previous?.people.find(person => person.author === author)), renderFormColumn(now), notes);
    return tr;
  }));
  table.append(body);

  const box = el("div", "table-box");
  box.append(table);
  sheet.append(band, box);
  return sheet;
}

function renderWeekly() {
  weekly.monday ||= mondayOf(localToday());
  if (state.page === "weekly") updateTitle();
  document.body.dataset.wrview = weekly.view;
  for (const tab of document.querySelectorAll("[data-wrview]")) tab.setAttribute("aria-selected", String(tab.dataset.wrview === weekly.view));

  const depts = selectedDepts();
  renderWeeklyProps(depts);
  const showLoading = weekly.loading && !weekly.data;
  $("wr-loading").hidden = !showLoading;
  $("wr-doc").hidden = weekly.view !== "doc";
  $("wr-sheets").hidden = weekly.view !== "form";
  $("wr-doc").replaceChildren(...(weekly.data ? depts.map(renderDeptDoc) : []));
  $("wr-sheets").replaceChildren(...(weekly.data ? depts.map((name, i) => renderDeptSheet(name, i + 1)) : []));
  $("wr-empty").hidden = showLoading || !weekly.data || depts.length > 0;
}

function moveReportWeek(days) {
  weekly.monday = days ? addDays(weekly.monday, days) : mondayOf(localToday());
  weekly.data = null;
  loadWeekly();
}

$("wr-prev").addEventListener("click", () => moveReportWeek(-7));
$("wr-next").addEventListener("click", () => moveReportWeek(7));
$("wr-this-week").addEventListener("click", () => moveReportWeek(0));
$("wr-refresh").addEventListener("click", () => loadWeekly(true));
$("wr-print").addEventListener("click", () => window.print());

// A closed toggle would print as a bare heading, so open them all for printing and close them again after.
let closedForPrint = [];
window.addEventListener("beforeprint", () => {
  closedForPrint = [...document.querySelectorAll("details:not([open])")];
  for (const toggle of closedForPrint) toggle.open = true;
});
window.addEventListener("afterprint", () => {
  for (const toggle of closedForPrint) toggle.open = false;
  closedForPrint = [];
});
for (const tab of document.querySelectorAll("[data-wrview]")) {
  tab.addEventListener("click", () => {
    weekly.view = tab.dataset.wrview;
    renderWeekly();
  });
}
