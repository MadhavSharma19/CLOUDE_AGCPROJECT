/**
 * CloudTask Lite — Frontend Logic
 * Talks to our Python backend API at http://localhost:8000
 */

// ── Configuration ────────────────────────────────────────────
const API = "http://localhost:8000/tasks";

// ── DOM Elements ─────────────────────────────────────────────
const taskInput   = document.getElementById("taskInput");
const addBtn      = document.getElementById("addBtn");
const taskList    = document.getElementById("taskList");
const emptyState  = document.getElementById("emptyState");
const taskCounter = document.getElementById("taskCounter");
const doneCounter = document.getElementById("doneCounter");
const progressFill = document.getElementById("progressFill");
const modeToggle  = document.getElementById("modeToggle");
const modeIcon    = document.getElementById("modeIcon");

// ── In-memory tasks array (our client-side store) ─────────────
let tasks = [];

// ── Sound Effects (subtle click sounds using Web Audio API) ───
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function playTone(freq, duration, type = "sine") {
  try {
    if (!audioCtx) audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (_) { /* silently skip if audio blocked */ }
}

const sounds = {
  add:    () => playTone(880, 0.12),
  done:   () => playTone(660, 0.15),
  delete: () => playTone(220, 0.12, "sawtooth"),
  toggle: () => playTone(550, 0.1),
};

// ── Theme Toggle ──────────────────────────────────────────────
function applyTheme(isLight) {
  document.body.classList.toggle("light", isLight);
  modeIcon.className = isLight ? "ph-bold ph-moon" : "ph-bold ph-sun";
  localStorage.setItem("theme", isLight ? "light" : "dark");
}

modeToggle.addEventListener("click", () => {
  const isLight = !document.body.classList.contains("light");
  applyTheme(isLight);
  sounds.toggle();
});

// Restore saved theme
applyTheme(localStorage.getItem("theme") === "light");

// ── API Helpers ───────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ── Fetch all tasks from server and render ─────────────────────
async function loadTasks() {
  try {
    tasks = await apiFetch(API);
    renderAll();
  } catch (err) {
    console.error("Could not connect to server. Is server.py running?", err);
    showToast("⚠️ Can't reach server — run server.py first!", "error");
  }
}

// ── Add a new task ─────────────────────────────────────────────
async function addTask() {
  const text = taskInput.value.trim();
  if (!text) {
    // Shake the input to signal empty
    taskInput.classList.add("shake");
    setTimeout(() => taskInput.classList.remove("shake"), 400);
    return;
  }

  taskInput.disabled = true;
  addBtn.disabled = true;

  try {
    const newTask = await apiFetch(API, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    tasks.push(newTask);
    taskInput.value = "";
    renderAll();
    sounds.add();
  } catch (err) {
    showToast("Failed to add task", "error");
  } finally {
    taskInput.disabled = false;
    addBtn.disabled = false;
    taskInput.focus();
  }
}

// ── Toggle task completed status ───────────────────────────────
async function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  const newCompleted = !task.completed;

  // Optimistic update
  task.completed = newCompleted;
  renderAll();
  sounds.done();

  try {
    await apiFetch(`${API}/${id}`, {
      method: "PUT",
      body: JSON.stringify({ completed: newCompleted }),
    });
  } catch (err) {
    // Rollback on failure
    task.completed = !newCompleted;
    renderAll();
    showToast("Update failed", "error");
  }
}

// ── Delete a task ──────────────────────────────────────────────
async function deleteTask(id) {
  const item = document.querySelector(`[data-id="${id}"]`);
  if (item) {
    // Animate out before removing from DOM
    item.classList.add("removing");
    await new Promise(r => setTimeout(r, 280));
  }

  try {
    await apiFetch(`${API}/${id}`, { method: "DELETE" });
    tasks = tasks.filter(t => t.id !== id);
    renderAll();
    sounds.delete();
  } catch (err) {
    showToast("Delete failed", "error");
    if (item) item.classList.remove("removing");
  }
}

// ── Render all tasks to the DOM ────────────────────────────────
function renderAll() {
  // Clear existing list items
  taskList.innerHTML = "";

  tasks.forEach(task => {
    const li = document.createElement("li");
    li.className = `task-item ${task.completed ? "completed" : ""}`;
    li.setAttribute("data-id", task.id);

    li.innerHTML = `
      <input
        type="checkbox"
        class="task-checkbox"
        ${task.completed ? "checked" : ""}
        aria-label="Mark '${escapeHtml(task.text)}' as ${task.completed ? "incomplete" : "complete"}"
      />
      <span class="task-text">${escapeHtml(task.text)}</span>
      <button class="delete-btn" aria-label="Delete task">
        <i class="ph-bold ph-trash"></i>
      </button>
    `;

    // Wire up events
    li.querySelector(".task-checkbox").addEventListener("change", () => toggleTask(task.id));
    li.querySelector(".delete-btn").addEventListener("click", () => deleteTask(task.id));

    taskList.appendChild(li);
  });

  updateStats();
  updateEmptyState();
}

// ── Update counter and progress bar ───────────────────────────
function updateStats() {
  const total = tasks.length;
  const done  = tasks.filter(t => t.completed).length;

  taskCounter.textContent = total === 1 ? "1 task" : `${total} tasks`;
  doneCounter.textContent = `${done} done`;

  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  progressFill.style.width = pct + "%";
}

// ── Show/hide empty state ──────────────────────────────────────
function updateEmptyState() {
  emptyState.classList.toggle("visible", tasks.length === 0);
}

// ── Tiny toast notification ────────────────────────────────────
function showToast(msg, type = "info") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%) translateY(60px);
    background: ${type === "error" ? "#ff5f7e" : "#7c4dff"};
    color: #fff; padding: 10px 22px; border-radius: 99px;
    font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3); z-index: 999;
    transition: transform 0.3s cubic-bezier(0.22,1,0.36,1), opacity 0.3s ease;
    opacity: 0;
  `;
  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.transform = "translateX(-50%) translateY(0)";
    toast.style.opacity = "1";
  });

  // Animate out after 3s
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(16px)";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Sanitize user input to prevent XSS ────────────────────────
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Shake animation for empty input (via CSS keyframe) ─────────
const shakeStyle = document.createElement("style");
shakeStyle.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%       { transform: translateX(-6px); }
    40%       { transform: translateX(6px); }
    60%       { transform: translateX(-4px); }
    80%       { transform: translateX(4px); }
  }
  .shake { animation: shake 0.38s ease; border-color: #ff5f7e !important; box-shadow: 0 0 0 3px rgba(255,95,126,0.35) !important; }
`;
document.head.appendChild(shakeStyle);

// ── Event Listeners ────────────────────────────────────────────
addBtn.addEventListener("click", addTask);

// Enter key to add task
taskInput.addEventListener("keydown", e => {
  if (e.key === "Enter") addTask();
});

// ── Boot ───────────────────────────────────────────────────────
loadTasks();
