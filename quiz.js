/* global questions */
"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const allIds = questions.map((_, id) => id);
const letters = "ABCDEFGH";
const storageKey = "vnr202.on-tap.v1";
const emptyState = { mode: "study", studyId: 0, reviewId: null, answers: {}, mastered: {} };
let state = structuredClone(emptyState);
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) state = { ...state, ...JSON.parse(saved) };
} catch {
  $("#save-status").textContent = "Không đọc được tiến độ đã lưu.";
}

const stage = $("#stage");
const grid = $("#question-grid");
const studyButton = $("#study-mode");
const reviewButton = $("#review-mode");
const map = $("#question-map");
const compact = matchMedia("(max-width: 760px)");
map.open = !compact.matches;

let selection = new Set();
let reviewAttempt = null;
let showingSummary = false;
let card;
let gridMode;
let gridIds = [];
let gridButtons = new Map();

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    $("#save-status").textContent = "Trình duyệt không lưu được tiến độ sau khi đóng trang.";
  }
}

function isCorrect(id, response) {
  const expected = questions[id].correct;
  return response.length === expected.length && expected.every(answer => response.includes(answer));
}

function wrongIds() {
  return allIds.filter(id => state.answers[id] && !questions[id].ungraded && !isCorrect(id, state.answers[id]));
}

function pendingIds() {
  return wrongIds().filter(id => !state.mastered[id]);
}

function activeId() {
  return state.mode === "study" ? state.studyId : state.reviewId;
}

function sessionIds() {
  if (state.mode === "study") return allIds;
  const ids = pendingIds();
  if (reviewAttempt && !ids.includes(state.reviewId)) ids.push(state.reviewId);
  return ids.sort((a, b) => a - b);
}

function setMode(mode) {
  if (mode === state.mode && !showingSummary) return;
  state.mode = mode;
  if (mode === "review" && !pendingIds().includes(state.reviewId)) {
    state.reviewId = pendingIds()[0] ?? null;
  }
  navigate(activeId());
}

function navigate(id, { focus = true, summary = false } = {}) {
  if (state.mode === "study") state.studyId = id;
  else state.reviewId = id;
  selection = new Set();
  reviewAttempt = null;
  showingSummary = summary;
  save();
  render();
  if (focus) {
    const heading = $(".prompt", stage);
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: "nearest" });
  }
}

function statusFor(id) {
  if (!state.answers[id]) return ["", "Chưa trả lời"];
  if (questions[id].ungraded) return ["neutral", "Đã làm"];
  if (isCorrect(id, state.answers[id])) return ["done", "Đúng"];
  if (state.mastered[id]) return ["cleared", "Đã ôn"];
  return ["missed", "Sai"];
}

function renderSidebar() {
  const wrong = wrongIds();
  const pending = wrong.filter(id => !state.mastered[id]);
  const done = allIds.filter(id => state.answers[id]);
  const reviewing = state.mode === "review";
  const count = reviewing ? wrong.length - pending.length : done.length;
  const total = reviewing ? wrong.length : allIds.length;
  const id = activeId();
  const ids = sessionIds();

  $("#review-count").textContent = pending.length;
  $("#progress-title").textContent = reviewing ? "Tiến độ ôn câu sai" : "Tiến độ học";
  $("#progress-value").textContent = count;
  $("#progress-total").textContent = `/ ${total}`;
  $("#progress-caption").textContent = reviewing ? "Câu sai đã sửa đúng" : "Câu đã trả lời";
  const bar = $("#progress-bar");
  bar.max = Math.max(1, total);
  bar.value = count;
  bar.setAttribute("aria-label", $("#progress-caption").textContent);
  $("#correct-count").textContent = done.filter(item => statusFor(item)[0] === "done").length;
  $("#wrong-count").textContent = wrong.length;
  $("#map-count").textContent = ids.length;
  if (gridMode !== state.mode || ids.length !== gridIds.length || ids.some((item, index) => item !== gridIds[index])) {
    gridMode = state.mode;
    gridIds = [...ids];
    gridButtons = new Map();
    const fragment = document.createDocumentFragment();
    for (const item of ids) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item + 1;
      button.addEventListener("click", () => {
        if (item === activeId() && !showingSummary) return;
        if (compact.matches) map.open = false;
        navigate(item);
      });
      gridButtons.set(item, button);
      fragment.append(button);
    }
    if (!ids.length) {
      const message = document.createElement("span");
      message.textContent = "Không có câu cần ôn.";
      fragment.append(message);
    }
    grid.replaceChildren(fragment);
    grid.scrollTop = 0;
  }
  $("#legend").hidden = !ids.length;
  for (const [item, button] of gridButtons) {
    const [style, label] = statusFor(item);
    button.className = style;
    button.setAttribute("aria-label", `Câu ${item + 1}, ${label}`);
    if (!showingSummary && item === id) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  }
  const current = gridButtons.get(id);
  if (!showingSummary && current && grid.clientHeight) {
    const viewport = grid.getBoundingClientRect();
    const row = current.getBoundingClientRect();
    if (row.bottom > viewport.bottom) grid.scrollTop += row.bottom - viewport.bottom + 5;
    if (row.top < viewport.top) grid.scrollTop += row.top - viewport.top - 5;
  }
}

function submit(response) {
  const id = activeId();
  if (state.mode === "study") {
    if (state.answers[id]) return;
    state.answers[id] = response;
  } else {
    if (reviewAttempt) return;
    reviewAttempt = response;
    if (isCorrect(id, response)) state.mastered[id] = true;
  }
  save();
  updateCard();
  renderSidebar();
  $(".feedback", card).scrollIntoView({ block: "nearest" });
}

function choose(index) {
  const id = activeId();
  const question = questions[id];
  if (!question?.options[index] || (state.mode === "study" ? state.answers[id] : reviewAttempt)) return;
  if (question.correct.length === 1) {
    submit([index]);
    return;
  }
  if (selection.has(index)) selection.delete(index);
  else selection.add(index);
  if (selection.size === question.correct.length) submit([...selection]);
  else updateCard();
}

function next() {
  const id = activeId();
  const reviewing = state.mode === "review";
  const response = reviewing ? reviewAttempt : state.answers[id];
  if (!response) return;
  const ids = reviewing ? pendingIds() : allIds.filter(item => !state.answers[item]);
  if (!ids.length) {
    navigate(id, { summary: true });
    return;
  }
  if (reviewing) navigate(ids.find(item => item > id) ?? ids[0]);
  else navigate(id + 1 < allIds.length ? id + 1 : ids[0]);
}

function updateCard() {
  const id = activeId();
  const question = questions[id];
  const reviewing = state.mode === "review";
  const response = reviewing ? reviewAttempt : state.answers[id];
  const multi = question.correct.length > 1;
  const options = card.querySelectorAll(".option");

  options.forEach((button, index) => {
    const picked = response ? response.includes(index) : selection.has(index);
    const good = Boolean(response && question.correct.includes(index));
    const bad = Boolean(picked && response && !good && !question.ungraded);
    button.classList.toggle("good", good && !question.ungraded);
    button.classList.toggle("bad", bad);
    button.classList.toggle("picked", picked && (!response || question.ungraded));
    button.setAttribute("aria-pressed", picked);
    button.setAttribute("aria-disabled", Boolean(response));
    $(".option-state", button).textContent = good && !question.ungraded ? "✓" : bad ? "×" : picked ? "✓" : "";
  });

  const feedback = $(".feedback", card);
  if (response) {
    const correct = isCorrect(id, response);
    const key = question.correct.map(index => letters[index]).join(", ");
    const title = document.createElement("strong");
    const detail = document.createElement("p");
    feedback.dataset.result = question.ungraded ? "ungraded" : correct ? "correct" : "wrong";
    if (question.ungraded) title.textContent = "Câu này cần đối chiếu thêm";
    else if (correct) title.textContent = `Chính xác! Đáp án đúng là ${key}.`;
    else title.textContent = `Chưa đúng. Đáp án đúng là ${key}.`;
    detail.textContent = question.note ?? (correct || question.ungraded ? "" : reviewing
      ? "Câu này sẽ xuất hiện lại trong lượt ôn."
      : "Bạn có thể làm lại câu này trong mục Ôn câu sai.");
    feedback.replaceChildren(title);
    if (detail.textContent) feedback.append(detail);
  }

  const button = $(".next", card);
  button.disabled = !response;
  if (!response) {
    button.textContent = "Câu tiếp →";
    if (multi) $(".question-type", card).textContent = `Chọn ${question.correct.length} đáp án · Đã chọn ${selection.size}`;
  } else if (reviewing) {
    const pending = pendingIds();
    button.textContent = !pending.length ? "Xem kết quả →"
      : pending.length === 1 && pending[0] === id ? "Thử lại câu này ↻" : "Câu ôn tiếp →";
  } else if (allIds.every(item => state.answers[item])) {
    button.textContent = "Xem kết quả →";
  } else {
    button.textContent = id === allIds.length - 1 ? "Đến câu chưa làm →" : "Câu tiếp →";
  }
  if (response && multi) $(".question-type", card).textContent = `Chọn ${question.correct.length} đáp án`;
}

function makeAction(label, className, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function renderSummary() {
  const article = document.createElement("article");
  article.className = "card summary-card appear";
  const heading = document.createElement("h2");
  heading.className = "prompt";
  heading.tabIndex = -1;
  const message = document.createElement("p");
  const actions = document.createElement("div");
  actions.className = "actions";
  const pending = pendingIds().length;

  if (state.mode === "review") {
    heading.textContent = wrongIds().length ? "Bạn đã sửa đúng mọi câu sai" : "Chưa có câu sai cần ôn";
    message.textContent = allIds.every(id => state.answers[id])
      ? "Bạn đã hoàn thành toàn bộ câu hỏi."
      : "Tiếp tục học toàn bộ để làm các câu còn lại.";
    actions.append(makeAction("Quay về học toàn bộ", "primary", () => setMode("study")));
  } else {
    heading.textContent = "Bạn đã hoàn thành lượt học";
    message.textContent = pending
      ? `Còn ${pending} câu sai cần ôn. Các câu đó sẽ xuất hiện lại cho tới khi bạn trả lời đúng.`
      : "Bạn đã trả lời toàn bộ câu hỏi và không còn câu sai cần ôn.";
    if (pending) actions.append(makeAction(`Ôn ${pending} câu sai →`, "primary", () => setMode("review")));
    actions.append(makeAction("Xem lại câu hỏi", "secondary", () => navigate(0)));
  }
  article.append(heading, message, actions);
  stage.replaceChildren(article);
  card = null;
}

function render() {
  const reviewing = state.mode === "review";
  studyButton.setAttribute("aria-pressed", !reviewing);
  reviewButton.setAttribute("aria-pressed", reviewing);
  $("#page-title").textContent = reviewing ? "Ôn lại câu sai" : "Ôn tập trắc nghiệm";
  $("#page-description").textContent = reviewing
    ? "Câu trả lời sai sẽ xuất hiện lại cho đến khi bạn làm đúng."
    : `Học liền mạch ${questions.length} câu hỏi theo thứ tự tài liệu.`;
  renderSidebar();

  const id = activeId();
  if (showingSummary || id === null) {
    renderSummary();
    return;
  }
  const question = questions[id];
  const multi = question.correct.length > 1;
  card = $("#question-template").content.firstElementChild.cloneNode(true);
  $(".question-number", card).textContent = `Câu ${id + 1} / ${questions.length}`;
  $(".question-type", card).textContent = multi ? `Chọn ${question.correct.length} đáp án` : "Chọn 1 đáp án";
  $(".prompt", card).textContent = question.prompt;
  const options = $(".options", card);
  question.options.forEach((text, index) => {
    const button = makeAction("", "option", () => choose(index));
    for (const [className, value] of [["option-key", letters[index]], ["option-text", text], ["option-state", ""]]) {
      const span = document.createElement("span");
      span.className = className;
      span.textContent = value;
      if (className === "option-state") span.setAttribute("aria-hidden", "true");
      button.append(span);
    }
    options.append(button);
  });
  const previous = $(".previous", card);
  const previousId = sessionIds().findLast(item => item < id);
  previous.disabled = previousId === undefined;
  previous.addEventListener("click", () => navigate(previousId));
  $(".next", card).addEventListener("click", next);
  stage.replaceChildren(card);
  updateCard();
}

studyButton.addEventListener("click", () => setMode("study"));
reviewButton.addEventListener("click", () => setMode("review"));
document.addEventListener("keydown", event => {
  if (!card || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.target.closest("input, textarea, select, [contenteditable]")) return;
  if (/^[1-8]$/.test(event.key)) {
    const index = Number(event.key) - 1;
    const option = card.querySelectorAll(".option")[index];
    if (!option || option.getAttribute("aria-disabled") === "true") return;
    event.preventDefault();
    choose(index);
    return;
  }
  if (event.key !== "Enter") return;
  const nextButton = $(".next", card);
  const control = event.target.closest("button, summary, a");
  if (control && !(control.classList.contains("option") && control.getAttribute("aria-disabled") === "true")) return;
  if (nextButton.disabled) return;
  event.preventDefault();
  next();
});

if (state.mode === "review" && !pendingIds().includes(state.reviewId)) {
  state.reviewId = pendingIds()[0] ?? null;
}
render();
