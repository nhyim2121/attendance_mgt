// Column positions match [전사통합_대시보드]: A 부서, C 주차, E 업무 내용, G 상태
const COL = { dept: 0, week: 2, task: 4, status: 6 };
const ALL = "전체";

const $ = id => document.getElementById(id);
const state = { user: null, header: [], rows: [], departments: [], aiEnabled: false, drafts: [], page: "overview", logView: "board" };
const STATUSES = ["완료", "진행중", "지연"];
const PAGES = {
  overview: { icon: "🏠", title: "주간업무 현황" },
  write: { icon: "✏️" },
  logs: { icon: "🗂️", title: "업무 데이터베이스" },
  weekly: { icon: "📋" },
  stats: { icon: "📈", title: "업무 통계" },
  users: { icon: "👥", title: "직원 계정" },
};
const BOARD_COLUMNS = ["진행중", "지연", "완료"];

async function api(path, method = "GET", body) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("서버에 연결하지 못했습니다. start.bat을 실행한 뒤 http://localhost:3000 으로 접속하세요.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(result.error || "요청을 처리하지 못했습니다."), { status: response.status });
  }
  return result;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function cell(row, index) {
  return (row.cells[index] || "").trim();
}

function percent(part, total) {
  return total ? Math.round(part / total * 100) : 0;
}

function countStatuses(rows) {
  const done = rows.filter(r => cell(r, COL.status) === "완료").length;
  const progress = rows.filter(r => cell(r, COL.status) === "진행중").length;
  const late = rows.filter(r => cell(r, COL.status) === "지연").length;
  return { all: rows.length, done, progress, late, other: rows.length - done - progress - late };
}

function fillSelect(select, values) {
  const previous = select.value;
  select.replaceChildren(...[ALL, ...values].map(value => new Option(value, value)));
  select.value = values.includes(previous) ? previous : ALL;
}

function uniqueValues(index) {
  return [...new Set(state.rows.map(r => cell(r, index)).filter(Boolean))];
}

function renderSummary(rows) {
  const counts = countStatuses(rows);
  $("n-all").textContent = counts.all;
  $("n-done").textContent = counts.done;
  $("n-progress").textContent = counts.progress;
  $("n-late").textContent = counts.late;
  $("n-other").textContent = counts.other ? `상태 미입력·오타 ${counts.other}건` : " ";
  for (const key of ["done", "progress", "late"]) {
    $(`p-${key}`).textContent = `${percent(counts[key], counts.all)}%`;
    $(`b-${key}`).style.width = counts.all ? `${counts[key] / counts.all * 100}%` : "0";
  }
}

function renderDepartments(rows) {
  const names = [...new Set(rows.map(r => cell(r, COL.dept)))];
  $("dept-rows").replaceChildren(...names.map(name => {
    const counts = countStatuses(rows.filter(r => cell(r, COL.dept) === name));
    const share = percent(counts.done, counts.all);
    const tr = el("tr");
    tr.append(
      el("td", "dept", name),
      el("td", "num", counts.all),
      el("td", "num", counts.done),
      el("td", "num", counts.progress),
      el("td", counts.late ? "num has-late" : "num", counts.late),
    );
    const rate = el("td");
    rate.innerHTML = `<div class="rate"><div><i style="width:${share}%"></i></div><span>${share}%</span></div>`;
    tr.append(rate);
    return tr;
  }));
}

function renderDelayed(rows) {
  const delayed = rows.filter(r => cell(r, COL.status) === "지연");
  $("delayed-count").textContent = `${delayed.length}건`;
  $("delayed-box").hidden = delayed.length === 0;
  $("delayed-empty").hidden = delayed.length > 0;

  $("delayed-head").replaceChildren(...state.header.slice(0, 8).map(title => el("th", "", title)));
  $("delayed-rows").replaceChildren(...delayed.map(row => {
    const tr = el("tr");
    for (let i = 0; i < 8; i++) {
      const td = el("td", i === COL.task ? "task" : "");
      if (i === COL.status) td.append(el("span", "pill", cell(row, i)));
      else td.textContent = cell(row, i);
      tr.append(td);
    }
    return tr;
  }));
}

function statusClass(status) {
  if (status === "지연") return "pill";
  if (status === "완료") return "pill is-done";
  if (status === "진행중") return "pill is-progress";
  return "pill is-none";
}

function statusSelect(value, onChange) {
  const select = el("select");
  const paint = () => {
    select.className = `tag-select ${{ 완료: "is-done", 진행중: "is-progress", 지연: "is-late" }[select.value] || ""}`;
  };
  select.setAttribute("aria-label", "상태");
  select.append(...STATUSES.map(option => new Option(option, option)));
  select.value = value;
  paint();
  select.addEventListener("change", () => {
    paint();
    onChange(select.value);
  });
  return select;
}

function renderComment(comment) {
  const item = el("li", "comment");
  const meta = el("p", "comment-meta");
  const who = comment.dept ? `${comment.author} · ${comment.dept}` : comment.author;
  const when = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(comment.createdAt));
  meta.append(el("strong", "", who), el("span", "", when));
  if (comment.mine || state.user.role === "admin") {
    const remove = el("button", "link", "삭제");
    remove.type = "button";
    remove.addEventListener("click", () => run(async () => {
      applyReport(await api(`/api/comments/${comment.id}`, "DELETE"));
    }));
    meta.append(remove);
  }
  item.append(meta, el("p", "comment-text", comment.text));
  return item;
}

function renderLogTools(row) {
  const status = cell(row, COL.status);
  const tools = el("div", "log-tools");
  if (!row.mine) {
    tools.append(el("span", statusClass(status), status || "미입력"));
    return tools;
  }
  const select = statusSelect(status, value => run(async () => {
    applyReport(await api(`/api/entries/${row.entryId}`, "PATCH", { status: value }));
  }));
  select.id = `status-${row.id}`;
  const remove = el("button", "link", "삭제");
  remove.type = "button";
  remove.addEventListener("click", () => run(async () => {
    applyReport(await api(`/api/entries/${row.entryId}`, "DELETE"));
  }));
  tools.append(select, remove);
  return tools;
}

function renderLog(row) {
  const article = el("article", "log");
  const top = el("div", "log-top");
  top.append(
    el("span", "log-meta", [row.date || cell(row, COL.week), cell(row, COL.dept), cell(row, 1)].filter(Boolean).join(" · ")),
    renderLogTools(row),
  );
  article.append(top, el("p", "log-task", cell(row, COL.task) || "(업무 내용 없음)"));

  const list = el("ul", "comments");
  list.append(...row.comments.map(renderComment));

  const form = el("form", "comment-form");
  const input = el("input");
  input.id = `comment-${row.id}`;
  input.maxLength = 1000;
  input.required = true;
  input.placeholder = "댓글 입력";
  input.setAttribute("aria-label", `${cell(row, COL.task)} 댓글`);
  const submit = el("button", "btn-ghost", "등록");
  form.append(input, submit);
  form.addEventListener("submit", event => {
    event.preventDefault();
    run(async () => {
      applyReport(await api("/api/comments", "POST", { rowId: row.id, text: input.value }));
    });
  });

  article.append(list, form);
  return article;
}

function renderCard(row) {
  const card = el("article", "card");
  card.append(el("p", "card-task", cell(row, COL.task) || "(업무 내용 없음)"));
  const meta = el("div", "card-meta");
  if (cell(row, 3)) meta.append(el("span", "tag-gray", cell(row, 3)));
  meta.append(el("span", "", [row.date ? shortDate(row.date) : cell(row, COL.week), cell(row, 1)].filter(Boolean).join(" · ")));
  if (cell(row, 5)) meta.append(el("span", "", `~${cell(row, 5)}`));
  if (row.comments.length) meta.append(el("span", "", `💬 ${row.comments.length}`));
  card.append(meta);
  if (row.mine) {
    card.append(statusSelect(cell(row, COL.status), value => run(async () => {
      applyReport(await api(`/api/entries/${row.entryId}`, "PATCH", { status: value }));
    })));
  }
  return card;
}

function renderBoard(rows) {
  const columns = BOARD_COLUMNS.map(status => [status, rows.filter(r => cell(r, COL.status) === status)]);
  const others = rows.filter(r => !BOARD_COLUMNS.includes(cell(r, COL.status)));
  if (others.length) columns.push(["미입력", others]);
  $("board").replaceChildren(...columns.map(([status, items]) => {
    const column = el("section", "board-col");
    const header = el("header");
    header.append(el("span", statusClass(status), status), el("span", "", String(items.length)));
    column.append(header, ...items.map(renderCard));
    return column;
  }));
}

function dayLabel(date) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${date}T00:00:00`));
}

function renderList(rows) {
  const groups = new Map();
  for (const row of [...rows].sort((a, b) => (b.date || "").localeCompare(a.date || ""))) {
    groups.set(row.date || "", [...(groups.get(row.date || "") || []), row]);
  }
  $("logs").replaceChildren(...[...groups].map(([date, items]) => {
    const group = el("section", "day-group");
    group.append(el("h3", "", date ? dayLabel(date) : "날짜 없음 (CSV)"), ...items.map(renderLog));
    return group;
  }));
}

function renderLogs(rows) {
  for (const tab of document.querySelectorAll("[data-logview]")) tab.setAttribute("aria-selected", String(tab.dataset.logview === state.logView));
  $("log-count").textContent = rows.length ? `${rows.length}건` : "";
  $("board").hidden = state.logView !== "board" || !rows.length;
  $("logs").hidden = state.logView !== "list" || !rows.length;
  $("logs-empty").hidden = rows.length > 0;
  if (state.logView === "board") renderBoard(rows);
  else renderList(rows);
}

function render() {
  const week = $("week").value;
  const dept = $("dept").value;
  const rows = state.rows.filter(r =>
    (week === ALL || cell(r, COL.week) === week) &&
    (dept === ALL || cell(r, COL.dept) === dept));
  renderSummary(rows);
  renderDepartments(rows);
  renderDelayed(rows);
  renderLogs(rows);
  renderCharts(rows);
  renderWeekly();
}

function applyReport(report) {
  Object.assign(state, report);
  fillSelect($("week"), uniqueValues(COL.week));
  fillSelect($("dept"), uniqueValues(COL.dept));
  render();
  $("write-form").hidden = !state.aiEnabled;
  showNotice("", "");
  invalidateWeekly();
}

function showNotice(strong, text, isError) {
  const notice = $("notice");
  notice.hidden = !strong && !text;
  notice.classList.toggle("error", Boolean(isError));
  notice.replaceChildren(el("strong", "", strong), ` ${text}`);
}

async function run(task) {
  try {
    await task();
  } catch (error) {
    if (error.status === 401) {
      showView("login");
      $("login-error").textContent = "로그인이 만료되었습니다. 다시 로그인하세요.";
      return;
    }
    showNotice("처리하지 못했습니다.", error.message, true);
  }
}

function showView(view) {
  $("login").hidden = view !== "login";
  $("password").hidden = view !== "password";
  $("shell").hidden = view !== "app";
}

function writeTitle() {
  const [, month, day] = $("write-date").value.split("-").map(Number);
  return month ? `${month}월 ${day}일 업무일지` : "업무일지";
}

function updateTitle() {
  const page = state.page;
  const title = page === "write" ? writeTitle() : page === "weekly" ? weeklyTitle() : PAGES[page].title;
  $("page-icon").textContent = PAGES[page].icon;
  $("page-title").textContent = title;
  $("crumb-page").textContent = title;
}

function showPage(page) {
  state.page = page;
  for (const section of document.querySelectorAll(".page")) section.hidden = section.dataset.page !== page;
  for (const button of document.querySelectorAll(".nav button")) {
    if (button.dataset.page === page) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  $("filters").hidden = page === "users" || page === "write";
  $("week-field").hidden = page === "weekly";
  updateTitle();
  window.scrollTo(0, 0);
  redrawDaily();
  if (page === "weekly" && !weekly.data && !weekly.loading) loadWeekly();
}

async function enter(user) {
  state.user = user;
  const isAdmin = user.role === "admin";
  $("user-label").textContent = user.dept ? `${user.name} · ${user.dept}` : user.name;
  $("dept-field").hidden = !isAdmin;
  $("dept-locked-field").hidden = isAdmin;
  $("dept-locked").textContent = user.dept || "";
  $("load").hidden = !isAdmin;
  $("dept-section").hidden = !isAdmin;
  $("nav-write").hidden = isAdmin;
  $("nav-users").hidden = !isAdmin;
  $("go-write").hidden = isAdmin;
  $("write-author").textContent = user.name;
  $("write-dept").textContent = user.dept || "";
  $("write-date").value = localToday();
  renderWriteTitle();
  renderDrafts();

  if (user.mustChange) {
    $("password-intro").textContent = "임시 비밀번호를 쓰고 있습니다. 새 비밀번호로 바꾸면 시작할 수 있습니다.";
    $("password-cancel").hidden = true;
    showView("password");
    return;
  }
  showView("app");
  showPage("overview");
  applyReport(await api("/api/report"));
  if (isAdmin) {
    $("user-dept").replaceChildren(...state.departments.map(value => new Option(value, value)));
    await loadUsers();
  }
}

function renderDeptCell(user) {
  const td = el("td");
  if (user.role === "admin") {
    td.textContent = "전체(관리자)";
    return td;
  }
  const select = el("select", "dept-select");
  select.id = `dept-${user.id}`;
  select.setAttribute("aria-label", `${user.name} 부서`);
  select.append(...[...new Set([...state.departments, user.dept])].map(value => new Option(value, value)));
  select.value = user.dept;
  select.addEventListener("change", () => run(async () => {
    await api(`/api/users/${user.id}`, "PATCH", { dept: select.value });
    await loadUsers();
  }));
  td.append(select);
  return td;
}

async function loadUsers() {
  const users = await api("/api/users");
  $("user-rows").replaceChildren(...users.map(user => {
    const tr = el("tr");
    tr.append(
      el("td", "", user.id),
      el("td", "", user.name),
      renderDeptCell(user),
      el("td", "", user.mustChange ? "임시 비밀번호" : "사용 중"),
    );
    return tr;
  }));
}

function localToday() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function renderWriteTitle() {
  if (state.page === "write") updateTitle();
}

function blankDraft() {
  return { category: "", task: "", status: "진행중", due: "", note: "" };
}

function draftInput(item, field, label) {
  const input = el("textarea", "block-input");
  input.rows = 1;
  input.value = item[field];
  input.setAttribute("aria-label", label);
  input.addEventListener("input", () => { item[field] = input.value; });
  const td = el("td");
  td.append(input);
  return td;
}

function renderDrafts() {
  if (state.drafts.length === 0) state.drafts.push(blankDraft());
  $("draft-list").replaceChildren(...state.drafts.map(item => {
    const row = el("tr");
    const status = el("td", "status-cell");
    status.append(statusSelect(item.status, value => { item.status = value; }));
    const remove = el("button", "draft-remove", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", "이 항목 빼기");
    remove.addEventListener("click", () => {
      state.drafts = state.drafts.filter(candidate => candidate !== item);
      renderDrafts();
    });
    const removeCell = el("td");
    removeCell.append(remove);
    const task = draftInput(item, "task", "업무 내용");
    task.firstChild.classList.add("draft-task");
    row.append(
      draftInput(item, "category", "구분"),
      task,
      status,
      draftInput(item, "due", "마감일"),
      draftInput(item, "note", "비고"),
      removeCell,
    );
    return row;
  }));
}

function addRow() {
  state.drafts.push(blankDraft());
  renderDrafts();
  [...document.querySelectorAll(".draft-task")].pop().focus();
}

function addDrafts(items) {
  state.drafts = state.drafts.filter(item => item.task.trim() || item.category.trim() || item.due.trim() || item.note.trim());
  state.drafts.push(...items);
  renderDrafts();
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Sheets exports UTF-8; Excel's Korean CSV is usually EUC-KR.
function decode(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("euc-kr").decode(buffer);
  }
}

async function loadFile(file) {
  const [header, ...body] = parseCsv(decode(await file.arrayBuffer()));
  const rows = body.filter(r => r.some(value => value.trim() !== ""));
  if (!header || header.length < 7 || rows.length === 0) {
    showNotice("이 파일을 읽지 못했습니다.", "[전사통합_대시보드] 시트를 1행 헤더를 포함해 A~H열 CSV로 저장한 뒤 다시 올리세요.", true);
    return;
  }
  await api("/api/report", "POST", { header, rows });
  applyReport(await api("/api/report"));
  showNotice(`${rows.length}건을 저장했습니다.`, "모든 부서 화면에 바로 반영됩니다.");
}

$("today").textContent = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(new Date());
$("week").addEventListener("change", render);
$("dept").addEventListener("change", render);
$("load").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (file) run(() => loadFile(file));
});

for (const button of document.querySelectorAll(".nav button")) {
  button.addEventListener("click", () => showPage(button.dataset.page));
}
for (const button of document.querySelectorAll("[data-goto]")) {
  button.addEventListener("click", () => showPage(button.dataset.goto));
}
for (const tab of document.querySelectorAll("[data-logview]")) {
  tab.addEventListener("click", () => {
    state.logView = tab.dataset.logview;
    render();
  });
}

$("write-date").addEventListener("change", renderWriteTitle);
$("add-manual").addEventListener("click", addRow);

// As in Notion, Enter starts a new row. isComposing keeps Korean IME input from triggering it.
$("draft-list").addEventListener("input", () => { $("write-status").textContent = ""; });
$("draft-list").addEventListener("keydown", event => {
  if (event.key !== "Enter" || event.isComposing || event.target.tagName !== "TEXTAREA") return;
  event.preventDefault();
  addRow();
});

$("write-form").addEventListener("submit", async event => {
  event.preventDefault();
  const status = $("write-status");
  if (!$("write-note").value.trim()) {
    status.textContent = "메모를 입력하세요.";
    return;
  }
  $("ai-draft").disabled = true;
  status.textContent = "AI가 정리하고 있습니다.";
  try {
    const { items } = await api("/api/ai/draft", "POST", { note: $("write-note").value, date: $("write-date").value });
    addDrafts(items);
    $("write-note").value = "";
    status.textContent = items.length ? `${items.length}건으로 정리했습니다.` : "정리할 업무를 찾지 못했습니다.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    $("ai-draft").disabled = false;
  }
});

$("draft-form").addEventListener("submit", event => {
  event.preventDefault();
  if (!state.drafts.some(item => item.task.trim())) {
    $("write-status").textContent = "업무 내용을 입력하세요.";
    return;
  }
  run(async () => {
    const report = await api("/api/entries", "POST", { date: $("write-date").value, items: state.drafts });
    state.drafts = [];
    renderDrafts();
    $("write-status").textContent = "저장했습니다.";
    applyReport(report);
  });
});

$("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  $("login-error").textContent = "";
  try {
    const user = await api("/api/login", "POST", { id: $("login-id").value, password: $("login-password").value });
    $("login-password").value = "";
    await enter(user);
  } catch (error) {
    $("login-error").textContent = error.message;
  }
});

$("password-form").addEventListener("submit", async event => {
  event.preventDefault();
  $("password-error").textContent = "";
  if ($("password-next").value !== $("password-confirm").value) {
    $("password-error").textContent = "새 비밀번호가 서로 다릅니다.";
    return;
  }
  try {
    const user = await api("/api/password", "POST", { current: $("password-current").value, next: $("password-next").value });
    event.target.reset();
    await enter(user);
  } catch (error) {
    $("password-error").textContent = error.message;
  }
});

$("change-password").addEventListener("click", () => {
  $("password-intro").textContent = "새 비밀번호는 8자 이상으로 입력하세요.";
  $("password-cancel").hidden = false;
  showView("password");
});

$("password-cancel").addEventListener("click", () => {
  $("password-form").reset();
  $("password-error").textContent = "";
  showView("app");
});

$("logout").addEventListener("click", () => run(async () => {
  await api("/api/logout", "POST");
  state.user = null;
  showView("login");
}));

$("user-form").addEventListener("submit", event => {
  event.preventDefault();
  run(async () => {
    const result = await api("/api/users", "POST", {
      id: $("user-id").value, name: $("user-name").value, dept: $("user-dept").value,
    });
    event.target.reset();
    $("user-result").textContent = `${result.id} 계정의 임시 비밀번호: ${result.temporaryPassword} (이 화면을 벗어나면 다시 볼 수 없습니다)`;
    await loadUsers();
  });
});

(async () => {
  try {
    await enter(await api("/api/me"));
  } catch (error) {
    showView("login");
    if (error.status !== 401) $("login-error").textContent = error.message;
  }
})();
