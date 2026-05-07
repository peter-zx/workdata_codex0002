const uiStorageKey = "daily-log-tool:ui:v2";

const elements = {
  authScreen: document.querySelector("#authScreen"),
  mainApp: document.querySelector("#mainApp"),
  bottomNav: document.querySelector("#bottomNav"),
  loginTab: document.querySelector("#loginTab"),
  registerTab: document.querySelector("#registerTab"),
  username: document.querySelector("#username"),
  password: document.querySelector("#password"),
  authSubmit: document.querySelector("#authSubmit"),
  authHint: document.querySelector("#authHint"),
  authMessage: document.querySelector("#authMessage"),
  pageTitle: document.querySelector("#pageTitle"),
  todayLabel: document.querySelector("#todayLabel"),
  userLine: document.querySelector("#userLine"),
  themeToggle: document.querySelector("#themeToggle"),
  logoutButton: document.querySelector("#logoutButton"),
  workContent: document.querySelector("#workContent"),
  workProgress: document.querySelector("#workProgress"),
  workReview: document.querySelector("#workReview"),
  addEntry: document.querySelector("#addEntry"),
  clearDraft: document.querySelector("#clearDraft"),
  todayEntries: document.querySelector("#todayEntries"),
  todayCount: document.querySelector("#todayCount"),
  buildToday: document.querySelector("#buildToday"),
  summaryOutput: document.querySelector("#summaryOutput"),
  copySummary: document.querySelector("#copySummary"),
  copyStatus: document.querySelector("#copyStatus"),
  targetDate: document.querySelector("#targetDate"),
  timelineMeta: document.querySelector("#timelineMeta"),
  timeline: document.querySelector("#timeline"),
  entryTemplate: document.querySelector("#entryTemplate"),
  pages: [...document.querySelectorAll(".page")],
  navItems: [...document.querySelectorAll(".nav-item")],
  tabs: [...document.querySelectorAll(".tab")],
  authTabs: [...document.querySelectorAll(".auth-tab")]
};

const pageTitles = {
  record: "记录工作",
  log: "今日工作日志",
  timeline: "时间轴"
};

const formatters = {
  date: new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" }),
  monthDay: new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", weekday: "short" })
};

let state = {
  user: null,
  entries: [],
  authMode: "login",
  view: "day",
  page: "record",
  targetDate: toDateKey(new Date()),
  theme: "light",
  loading: false
};

const isFileMode = window.location.protocol === "file:";

function loadUiState() {
  try {
    const raw = localStorage.getItem(uiStorageKey);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state = {
      ...state,
      view: saved.view || state.view,
      page: saved.page || state.page,
      targetDate: saved.targetDate || state.targetDate,
      theme: saved.theme || state.theme
    };
  } catch (error) {
    console.error("Failed to load UI state", error);
  }
}

function saveUiState() {
  try {
    localStorage.setItem(uiStorageKey, JSON.stringify({
      view: state.view,
      page: state.page,
      targetDate: state.targetDate,
      theme: state.theme
    }));
  } catch (error) {
    console.error("Failed to save UI state", error);
  }
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });
  } catch (error) {
    if (isFileMode) {
      throw new Error("当前是 file:// 打开的静态页面，注册登录需要先运行 npm start，并访问 http://localhost:3000");
    }
    throw new Error("连接服务失败，请确认 npm start 已启动，并通过 http://localhost:3000 访问。");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "请求失败");
  }
  return payload;
}

async function bootstrap() {
  loadUiState();
  applyTheme();
  if (isFileMode) {
    state.user = null;
    render();
    setAuthMessage("当前页面地址是 file://，无法注册登录。请先运行 npm start，然后打开 http://localhost:3000");
    return;
  }
  try {
    const { user } = await api("/api/auth/me");
    state.user = user;
    if (user) {
      await loadEntries();
    }
  } catch (error) {
    state.user = null;
  }
  render();
}

async function loadEntries() {
  const { entries } = await api("/api/entries");
  state.entries = Array.isArray(entries) ? entries : [];
}

async function submitAuth() {
  if (isFileMode) {
    setAuthMessage("请通过 http://localhost:3000 使用注册登录功能。");
    return;
  }
  const username = elements.username.value.trim();
  const password = elements.password.value;
  if (!username || !password) {
    setAuthMessage("请输入账号和密码");
    return;
  }

  setLoading(true);
  try {
    const { user } = await api(`/api/auth/${state.authMode}`, {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    state.user = user;
    state.entries = [];
    elements.password.value = "";
    setAuthMessage("");
    await loadEntries();
    render();
  } catch (error) {
    setAuthMessage(error.message);
  } finally {
    setLoading(false);
  }
}

async function logout() {
  await api("/api/auth/logout", { method: "POST", body: "{}" }).catch(() => {});
  state.user = null;
  state.entries = [];
  render();
}

function setAuthMode(mode) {
  state.authMode = mode;
  elements.authSubmit.textContent = mode === "login" ? "登录" : "注册";
  elements.password.setAttribute("autocomplete", mode === "login" ? "current-password" : "new-password");
  setAuthMessage("");
  renderAuthTabs();
}

function setAuthMessage(message) {
  elements.authMessage.textContent = message;
}

function setLoading(loading) {
  state.loading = loading;
  elements.authSubmit.disabled = loading;
  elements.addEntry.disabled = loading;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

async function addEntry() {
  const content = elements.workContent.value.trim();
  const progress = elements.workProgress.value.trim();
  const review = elements.workReview.value.trim();

  if (!content && !progress && !review) {
    elements.workContent.focus();
    return;
  }

  setLoading(true);
  try {
    const { entry } = await api("/api/entries", {
      method: "POST",
      body: JSON.stringify({ content, progress, review })
    });
    state.entries.unshift(entry);
    clearDraft();
    render();
  } catch (error) {
    alert(error.message);
  } finally {
    setLoading(false);
  }
}

function clearDraft() {
  elements.workContent.value = "";
  elements.workProgress.value = "";
  elements.workReview.value = "";
  elements.workContent.focus();
}

async function deleteEntry(id) {
  try {
    await api(`/api/entries/${encodeURIComponent(id)}`, { method: "DELETE" });
    state.entries = state.entries.filter((entry) => entry.id !== id);
    render();
  } catch (error) {
    alert(error.message);
  }
}

function fieldsFor(entry) {
  return [
    ["工作内容", entry.content],
    ["工作进度", entry.progress],
    ["复盘优化", entry.review]
  ].filter(([, value]) => value);
}

function renderEntry(entry, index) {
  const node = elements.entryTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".entry-index").textContent = `${index + 1}`;
  node.querySelector(".delete-entry").addEventListener("click", () => deleteEntry(entry.id));

  const body = node.querySelector(".entry-body");
  const fields = fieldsFor(entry);
  if (fields.length === 0) {
    body.textContent = "空记录";
    return node;
  }

  for (const [label, value] of fields) {
    const line = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = `${label}：`;
    line.append(strong, value);
    body.append(line);
  }

  return node;
}

function renderToday() {
  const today = toDateKey(new Date());
  const entries = state.entries
    .filter((entry) => entry.date === today)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  elements.todayCount.textContent = `${entries.length} 条`;
  elements.todayEntries.replaceChildren();

  if (entries.length === 0) {
    elements.todayEntries.append(emptyState("今天还没有记录。"));
    return;
  }

  entries.forEach((entry, index) => elements.todayEntries.append(renderEntry(entry, index)));
}

function emptyState(text) {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.textContent = text;
  return node;
}

function buildDailySummary(dateKey = toDateKey(new Date())) {
  const entries = state.entries
    .filter((entry) => entry.date === dateKey)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const title = `${dateKey} 今日工作日志`;
  if (entries.length === 0) {
    return `${title}\n\n暂无记录`;
  }

  const lines = [title, ""];
  entries.forEach((entry, index) => {
    const summaryFields = summaryFieldsFor(entry);
    const [firstField, ...restFields] = summaryFields;
    if (firstField) {
      lines.push(`${index + 1}. ${firstField[0]}：${firstField[1]}`);
    } else {
      lines.push(`${index + 1}.`);
    }
    for (const [label, value] of restFields) {
      lines.push(`   ${label}：${value}`);
    }
    if (index < entries.length - 1) lines.push("");
  });

  return lines.join("\n");
}

function summaryFieldsFor(entry) {
  return [
    ["内容", entry.content],
    ["进度", entry.progress],
    ["复盘", entry.review]
  ].filter(([, value]) => value);
}

async function copySummary() {
  const text = elements.summaryOutput.value || buildDailySummary();
  elements.summaryOutput.value = text;

  try {
    await navigator.clipboard.writeText(text);
    elements.copyStatus.textContent = "已复制到剪贴板";
  } catch (error) {
    elements.summaryOutput.select();
    document.execCommand("copy");
    elements.copyStatus.textContent = "已选中文本并尝试复制";
  }

  window.setTimeout(() => {
    elements.copyStatus.textContent = "";
  }, 1800);
}

function getWeekRange(dateKey) {
  const date = fromDateKey(dateKey);
  const day = date.getDay() || 7;
  const start = new Date(date);
  start.setDate(date.getDate() - day + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return [toDateKey(start), toDateKey(end)];
}

function inRange(entryDate, start, end) {
  return entryDate >= start && entryDate <= end;
}

function getVisibleEntries() {
  const target = state.targetDate;
  if (state.view === "day") {
    return state.entries.filter((entry) => entry.date === target);
  }
  if (state.view === "week") {
    const [start, end] = getWeekRange(target);
    return state.entries.filter((entry) => inRange(entry.date, start, end));
  }
  if (state.view === "month") {
    return state.entries.filter((entry) => entry.date.slice(0, 7) === target.slice(0, 7));
  }
  return state.entries.filter((entry) => entry.date.slice(0, 4) === target.slice(0, 4));
}

function viewTitle() {
  const target = state.targetDate;
  if (state.view === "day") return `${target} 日视图`;
  if (state.view === "week") {
    const [start, end] = getWeekRange(target);
    return `${start} 至 ${end} 周视图`;
  }
  if (state.view === "month") return `${target.slice(0, 7)} 月视图`;
  return `${target.slice(0, 4)} 年视图`;
}

function renderTimeline() {
  const entries = getVisibleEntries().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  elements.timelineMeta.textContent = `${viewTitle()}，共 ${entries.length} 条`;
  elements.timeline.replaceChildren();

  if (entries.length === 0) {
    elements.timeline.append(emptyState("这个时间范围还没有记录。"));
    return;
  }

  let lastDate = "";
  let dateIndex = 0;
  for (const entry of entries) {
    if (entry.date !== lastDate) {
      const heading = document.createElement("div");
      heading.className = "timeline-date";
      heading.textContent = formatters.monthDay.format(fromDateKey(entry.date));
      elements.timeline.append(heading);
      lastDate = entry.date;
      dateIndex = 0;
    }
    elements.timeline.append(renderEntry(entry, dateIndex));
    dateIndex += 1;
  }
}

function setPage(page) {
  state.page = page;
  saveUiState();
  render();
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
}

function renderAuthTabs() {
  elements.authTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.authMode === state.authMode);
  });
}

function renderShell() {
  const signedIn = Boolean(state.user);
  elements.authScreen.classList.toggle("hidden", signedIn);
  elements.mainApp.classList.toggle("hidden", !signedIn);
  elements.bottomNav.classList.toggle("hidden", !signedIn);
  elements.userLine.textContent = signedIn ? `当前账号：${state.user.displayName || state.user.username}` : "";
  elements.authHint.textContent = isFileMode
    ? "多人数据隔离需要服务端支持。请在终端运行 npm start，然后打开 http://localhost:3000。"
    : "每个账号的数据独立保存，只能查看自己的工作日志。";
}

function renderPages() {
  elements.pageTitle.textContent = pageTitles[state.page] || pageTitles.record;
  elements.pages.forEach((page) => {
    page.classList.toggle("active", page.dataset.page === state.page);
  });
  elements.navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.pageTarget === state.page);
  });
}

function renderTabs() {
  elements.tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === state.view);
  });
}

function render() {
  elements.todayLabel.textContent = formatters.date.format(new Date());
  elements.targetDate.value = state.targetDate;
  applyTheme();
  renderAuthTabs();
  renderShell();
  renderPages();
  renderTabs();

  if (state.user) {
    renderToday();
    renderTimeline();
    elements.summaryOutput.value = buildDailySummary();
  }
}

elements.authSubmit.addEventListener("click", submitAuth);
elements.username.addEventListener("keydown", (event) => {
  if (event.key === "Enter") elements.password.focus();
});
elements.password.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitAuth();
});
elements.authTabs.forEach((tab) => {
  tab.addEventListener("click", () => setAuthMode(tab.dataset.authMode));
});
elements.logoutButton.addEventListener("click", logout);
elements.addEntry.addEventListener("click", addEntry);
elements.clearDraft.addEventListener("click", clearDraft);
elements.buildToday.addEventListener("click", () => {
  elements.summaryOutput.value = buildDailySummary();
});
elements.copySummary.addEventListener("click", copySummary);
elements.targetDate.addEventListener("change", () => {
  state.targetDate = elements.targetDate.value || toDateKey(new Date());
  saveUiState();
  render();
});
elements.themeToggle.addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  saveUiState();
  render();
});
elements.navItems.forEach((item) => {
  item.addEventListener("click", () => setPage(item.dataset.pageTarget));
});
elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.view = tab.dataset.view;
    saveUiState();
    render();
  });
});

for (const textarea of [elements.workContent, elements.workProgress, elements.workReview]) {
  textarea.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      addEntry();
    }
  });
}

bootstrap();
