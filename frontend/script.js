let exams = [];
let conflicts = [];
let cy = null;
let animTimer = null;
let animIndex = 0;
let animSteps = [];
const COLOR_PALETTE = [
  "#4F46E5","#10B981","#EF476F","#F59E0B","#06B6D4","#8B5CF6","#F97316","#0891B2","#A3E635","#EC4899",
  "#0EA5A4","#84CC16","#7C3AED","#FB7185","#2563EB","#D97706","#DC2626","#059669","#9333EA","#F43F5E",
  "#3B82F6","#FBBF24","#22C55E","#C026D3","#E11D48","#14B8A6","#65A30D","#BE185D","#1D4ED8","#FACC15",
  "#16A34A","#7E22CE","#9D174D","#0D9488","#4D7C0F","#DB2777","#1E40AF","#CA8A04","#15803D","#6D28D9",
  "#9F1239","#0F766E","#365314","#F0ABFC","#1E3A8A","#713F12","#14532D","#A78BFA","#881337","#115E59",
  "#3F6212","#DDD6FE","#FCE7F3","#BFDBFE","#FED7AA","#BBF7D0","#E9D5FF","#FBCFE8","#60A5FA","#FEF3C7",
  "#86EFAC","#E0E7FF","#F9A8D4","#C7D2FE","#FDBA74","#99F6E4","#E5E7EB","#F472B6","#818CF8","#F59E0B",
  "#E11D48","#6366F1","#B91C1C","#F97316","#0EA5E9","#9CA3AF","#BE123C","#4338CA","#DC2626","#EA580C"
];

document.addEventListener("DOMContentLoaded", () => {
  initElements();
  renderExamTags();
  renderConflictSelectors();
});

function $(id) { return document.getElementById(id); }

function initElements() {
  const examInput = $("examInput");
  examInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const text = examInput.value.trim().replace(/,$/, "");
      if (text) addExam(text);
      examInput.value = "";
    } else if (e.key === "Backspace" && examInput.value === "") {
      exams.pop();
      renderExamTags();
      renderConflictSelectors();
    }
  });

  $("uploadBtn").addEventListener("click", uploadCSV);
  $("addConflictBtn").addEventListener("click", () => {
    const a = $("conflictA").value;
    const b = $("conflictB").value;
    if (!a || !b || a === b) return alert("Choose two different exams.");
    addConflict(a, b);
  });

  $("drawGraphBtn").addEventListener("click", () => {
    if (exams.length === 0) return alert("Add exams first.");
    drawGraph();
  });

  $("animateBtn").addEventListener("click", async () => {
    if (!cy) {
      if (exams.length === 0) return alert("Add exams first.");
      drawGraph();
    }
    const graph = buildGraphFromLocal();
    animSteps = dsaturSteps(graph);
    if (animSteps.length === 0) return alert("No steps to animate.");
    $("animateBtn").disabled = true;
    $("stopAnimBtn").disabled = false;
    animIndex = 0;
    await runAnimation(animSteps);
  });

  $("stopAnimBtn").addEventListener("click", stopAnimation);

  // IMPORTANT: LOCAL DSATUR scheduling
  $("scheduleBtn").addEventListener("click", scheduleLocal);
}

/* ---------- Exams (tags) ---------- */
function addExam(name) {
  name = String(name).trim();
  if (!name) return;
  if (!exams.includes(name)) {
    exams.push(name);
    exams.sort((a,b) => a.localeCompare(b));
    renderExamTags();
    renderConflictSelectors();
  }
}

function removeExam(name) {
  exams = exams.filter(e => e !== name);
  conflicts = conflicts.filter(([a,b]) => a !== name && b !== name);
  renderExamTags();
  renderConflictSelectors();
  renderConflictList();
}

function renderExamTags() {
  const container = $("examTags");
  container.querySelectorAll(".tag").forEach(n => n.remove());
  const input = $("examInput");
  exams.forEach(name => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = name;
    tag.title = "Click to remove";
    tag.addEventListener("click", () => {
      if (confirm(`Remove exam "${name}"?`)) removeExam(name);
    });
    container.insertBefore(tag, input);
  });
}

/* ---------- Conflicts editor ---------- */
function renderConflictSelectors() {
  const a = $("conflictA");
  const b = $("conflictB");
  a.innerHTML = `<option value="">-- Exam A --</option>`;
  b.innerHTML = `<option value="">-- Exam B --</option>`;
  exams.forEach(name => {
    const opt1 = document.createElement("option");
    opt1.value = name;
    opt1.textContent = name;
    a.appendChild(opt1);
    const opt2 = opt1.cloneNode(true);
    b.appendChild(opt2);
  });
  renderConflictList();
}

function addConflict(a, b) {
  const pair = a < b ? [a,b] : [b,a];
  if (conflicts.some(([x,y]) => x===pair[0] && y===pair[1])) {
    alert("Conflict already exists");
    return;
  }
  conflicts.push(pair);
  renderConflictList();
}

function removeConflict(index) {
  conflicts.splice(index,1);
  renderConflictList();
}

function renderConflictList() {
  const ul = $("conflictList");
  ul.innerHTML = "";
  conflicts.forEach((p, idx) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "pair";
    span.textContent = `${p[0]} — ${p[1]}`;
    const del = document.createElement("button");
    del.textContent = "Remove";
    del.addEventListener("click", () => removeConflict(idx));
    li.appendChild(span);
    li.appendChild(del);
    ul.appendChild(li);
  });
}

/* ---------- CSV Upload (local parsing) ---------- */
function uploadCSV() {
  const file = $("csvFile").files[0];
  if (!file) return alert("Select a CSV file first.");
  const status = $("uploadStatus");
  status.textContent = "Uploading...";

  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    const lines = text.trim().split("\n");
    const enrollments = [];

    lines.forEach((line, idx) => {
      if (idx === 0 && line.toLowerCase().includes("student")) return;
      const parts = line.split(",");
      if (parts.length < 2) return;
      enrollments.push({ student: parts[0].trim(), course: parts[1].trim() });
    });

    // build conflicts automatically
    const studentMap = {};
    enrollments.forEach(e => {
      if (!studentMap[e.student]) studentMap[e.student] = [];
      studentMap[e.student].push(e.course);
    });

    Object.values(studentMap).forEach(courses => {
      for (let i=0; i<courses.length; i++) {
        for (let j=i+1; j<courses.length; j++) {
          addExam(courses[i]);
          addExam(courses[j]);
          addConflict(courses[i], courses[j]);
        }
      }
    });

    status.textContent = "Uploaded successfully.";
    setTimeout(() => status.textContent = "", 3000);
  };

  reader.readAsText(file);
}

/* ---------- Build graph object from current exams/conflicts ---------- */
function buildGraphFromLocal() {
  const graph = {};
  exams.forEach(e => graph[e] = new Set());
  conflicts.forEach(([a,b]) => {
    if (graph[a] && graph[b] && a !== b) {
      graph[a].add(b);
      graph[b].add(a);
    }
  });
  return graph;
}

/* ---------- Draw graph with Cytoscape ---------- */
function drawGraph() {
  const elements = [];
  exams.forEach(e => elements.push({ data: { id: e, label: e } }));
  const seen = new Set();
  conflicts.forEach(([a,b]) => {
    const key = `${a}---${b}`;
    if (!seen.has(key)) {
      elements.push({ data: { id: key, source: a, target: b } });
      seen.add(key);
    }
  });

  if (cy) {
    cy.destroy();
    cy = null;
  }

  cy = cytoscape({
    container: document.getElementById('cy'),
    elements: elements,
    style: [
      { selector: 'node', style: { 'background-color': '#c7d2fe', 'label': 'data(label)', 'width': 38, 'height': 38, 'text-valign': 'center', 'color': '#071233', 'text-wrap': 'wrap', 'font-size': 11, 'overlay-padding': '6px' } },
      { selector: 'edge', style: { 'width': 2, 'line-color': '#e2e8f0', 'curve-style': 'bezier' } },
      { selector: '.chosen', style: { 'overlay-color': '#000', 'overlay-opacity': 0.08, 'border-width': 4, 'border-color': '#111827' } }
    ],
    layout: { name: 'cose', idealEdgeLength: 80, nodeOverlap: 12 }
  });

  resetNodeStyles();
  updateScheduleText({});
}

/* ---------- DSATUR algorithm steps (JS): records steps for animation ---------- */
function dsaturSteps(graph) {
  const vertices = Object.keys(graph);
  const degrees = {};
  const color = {};
  const satColors = {};
  const uncolored = new Set(vertices);

  vertices.forEach(v => {
    degrees[v] = graph[v].size;
    color[v] = 0;
    satColors[v] = new Set();
  });

  const steps = [];

  while (uncolored.size > 0) {
    const candidates = Array.from(uncolored);
    candidates.sort((a,b) => {
      if (satColors[b].size !== satColors[a].size)
        return satColors[b].size - satColors[a].size;
      if (degrees[b] !== degrees[a])
        return degrees[b] - degrees[a];
      return a.localeCompare(b);
    });

    const chosen = candidates[0];
    const used = new Set();
    graph[chosen].forEach(n => {
      if (color[n] > 0) used.add(color[n]);
    });

    let c = 1;
    while (used.has(c)) c++;
    color[chosen] = c;

    const snapshot = {
      chosen,
      colorAssigned: c,
      colorMap: Object.assign({}, color)
    };
    steps.push(snapshot);

    uncolored.delete(chosen);
    graph[chosen].forEach(n => {
      if (uncolored.has(n)) satColors[n].add(c);
    });
  }

  return steps;
}

/* ---------- Animation ---------- */
async function runAnimation(steps, delay = 800) {
  resetNodeStyles();
  updateScheduleText({});

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    highlightChosenNode(s.chosen);
    updateCurrentStepText(i+1, steps.length, s);
    await sleep(delay * 0.45);
    assignColorToNode(s.chosen, s.colorAssigned);
    updateScheduleText(s.colorMap);
    await sleep(delay * 0.55);
  }

  $("animateBtn").disabled = false;
  $("stopAnimBtn").disabled = true;
  updateCurrentStepText("finished", steps.length, null);
}

function stopAnimation() {
  animTimer = "stopRequested";
  $("animateBtn").disabled = false;
  $("stopAnimBtn").disabled = true;
}

/* ---------- Node styling ---------- */
function resetNodeStyles() {
  if (!cy) return;
  cy.nodes().forEach(n => {
    n.style({ 'background-color': '#c7d2fe', 'border-width': 0, 'border-color': '' });
    n.removeClass('chosen');
  });
}

function highlightChosenNode(id) {
  if (!cy) return;
  resetNodeStyles();
  const node = cy.getElementById(id);
  node.addClass('chosen');
}

function assignColorToNode(id, colorNum) {
  if (!cy) return;
  const node = cy.getElementById(id);
  const col = colorFor(colorNum);
  node.style({ 'background-color': col, 'color': '#fff' });
  node.data('slot', `Slot-${colorNum}`);
}

/* ---------- Schedule output ---------- */
function updateScheduleText(colorMap) {
  const slotGroups = {};
  if (colorMap && typeof colorMap === 'object') {
    Object.keys(colorMap).forEach(k => {
      const c = colorMap[k];
      if (c > 0) {
        if (!slotGroups[c]) slotGroups[c] = [];
        slotGroups[c].push(k);
      }
    });
  } else if (cy) {
    cy.nodes().forEach(n => {
      const slot = n.data('slot');
      if (slot) {
        const slotNum = parseInt(slot.replace('Slot-', ''));
        if (!slotGroups[slotNum]) slotGroups[slotNum] = [];
        slotGroups[slotNum].push(n.id());
      }
    });
  }

  const sortedSlots = Object.keys(slotGroups).sort((a,b) => parseInt(a) - parseInt(b));
  let text = "";
  sortedSlots.forEach(slot => {
    const subjects = slotGroups[slot].sort((a,b) => a.localeCompare(b));
    text += `Slot ${slot}: ${subjects.join(', ')}\n`;
  });
  $("scheduleText").textContent = text;
}

function updateCurrentStepText(step, total, stepObj) {
  if (step === "finished") $("currentStep").textContent = `finished`;
  else $("currentStep").textContent = `Step ${step} / ${total}` + (stepObj ? ` — ${stepObj.chosen} → Slot-${stepObj.colorAssigned}` : '');
}

function colorFor(n) {
  return COLOR_PALETTE[(n - 1) % COLOR_PALETTE.length] || '#444';
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

/* ---------- LOCAL DSATUR scheduling ---------- */
function scheduleLocal() {
  if (exams.length === 0) return alert("Add exams first.");

  const graph = buildGraphFromLocal();
  const steps = dsaturSteps(graph);
  const final = steps[steps.length - 1]?.colorMap || {};
  updateScheduleText(final);

  if (!cy) drawGraph();
  Object.keys(final).forEach(exam => {
    const c = final[exam];
    if (c) assignColorToNode(exam, c);
  });
}
