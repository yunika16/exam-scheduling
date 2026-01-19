
let exams = []; // array of exam names
let conflicts = []; // array of [a,b]
let cy = null;
let animTimer = null;
let animIndex = 0;
let animSteps = [];
const COLOR_PALETTE = [
  "#4F46E5", "#10B981", "#EF476F", "#F59E0B", "#06B6D4", "#8B5CF6", "#F97316",
  "#0891B2", "#A3E635", "#EC4899", "#0EA5A4", "#84CC16", "#7C3AED", "#FB7185"
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
    // compute steps
    const graph = buildGraphFromLocal();
    animSteps = dsaturSteps(graph);
    if (animSteps.length === 0) return alert("No steps to animate.");
    $("animateBtn").disabled = true;
    $("stopAnimBtn").disabled = false;
    animIndex = 0;
    await runAnimation(animSteps);
  });

  $("stopAnimBtn").addEventListener("click", stopAnimation);

  $("scheduleBtn").addEventListener("click", schedule); // backend schedule (keeps existing behavior)
  $("downloadBtn").addEventListener("click", downloadScheduleCSV);
  $("copyBtn").addEventListener("click", copyScheduleToClipboard);
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

/* ---------- CSV Upload (backend if available) ---------- */
function uploadCSV() {
  const file = $("csvFile").files[0];
  if (!file) return alert("Select a CSV file first.");
  const status = $("uploadStatus");
  status.textContent = "Uploading...";
  const form = new FormData();
  form.append("file", file);

  fetch("http://127.0.0.1:5000/upload_enrollments", {
    method: "POST",
    body: form
  })
    .then(r => r.json())
    .then(data => {
      if (data.status === "success") {
        if (Array.isArray(data.exams)) {
          data.exams.forEach(e => addExam(e));
        }
        if (Array.isArray(data.conflicts)) {
          data.conflicts.forEach(pair => {
            if (Array.isArray(pair) && pair.length === 2) addConflict(pair[0], pair[1]);
          });
        }
        status.textContent = `Uploaded. Filled ${(data.exams||[]).length} exams, ${(data.conflicts||[]).length} conflicts.`;
      } else {
        status.textContent = `Upload error: ${data.message || "unknown"}`;
      }
    })
    .catch(err => {
      console.error(err);
      status.textContent = "Upload error. Is backend running?";
    })
    .finally(() => {
      setTimeout(()=>{ status.textContent = ""; }, 4000);
    });
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

  // click node to pin details
  cy.on('tap', 'node', evt => {
    const n = evt.target;
    const id = n.id();
    const deg = cy.getElementById(id).degree();
    const neighbors = n.neighborhood('node').map(x => x.id()).join(", ");
    alert(`Exam: ${id}\nDegree: ${deg}\nNeighbors: ${neighbors}`);
  });

  resetNodeStyles();
  updateScheduleText({});
}

/* ---------- DSATUR algorithm steps (JS): records steps for animation ---------- */
function dsaturSteps(graph) {
  // graph: {node: Set(neighbors)}
  const vertices = Object.keys(graph);
  const degrees = {};
  const color = {};
  const satColors = {};
  const uncolored = new Set(vertices);
  vertices.forEach(v => { degrees[v] = graph[v].size; color[v] = 0; satColors[v] = new Set(); });

  const steps = [];

  while (uncolored.size > 0) {
    // choose vertex: highest saturation (size satColors), then highest degree, then lexical
    const candidates = Array.from(uncolored);
    candidates.sort((a,b) => {
      if (satColors[b].size !== satColors[a].size) return satColors[b].size - satColors[a].size;
      if (degrees[b] !== degrees[a]) return degrees[b] - degrees[a];
      return a.localeCompare(b);
    });
    const chosen = candidates[0];

    // used colors among neighbors
    const used = new Set();
    graph[chosen].forEach(n => { if (color[n] && color[n] > 0) used.add(color[n]); });

    let c = 1;
    while (used.has(c)) c++;
    color[chosen] = c;

    // record snapshot BEFORE updating neighbors' saturation for clearer animation:
    const snapshot = {
      chosen,
      colorAssigned: c,
      colorMap: Object.assign({}, color), // shallow copy
      satSnapshot: Object.fromEntries(Object.keys(satColors).map(k => [k, Array.from(satColors[k])]))
    };
    steps.push(snapshot);

    uncolored.delete(chosen);
    // update neighbors sat sets
    graph[chosen].forEach(n => {
      if (uncolored.has(n)) satColors[n].add(c);
    });
  }

  return steps;
}

/* ---------- Animation control ---------- */
async function runAnimation(steps, delay = 800) {
  // reset first
  resetNodeStyles();
  updateScheduleText({});
  for (let i = 0; i < steps.length; i++) {
    animIndex = i;
    const s = steps[i];
    // highlight chosen
    highlightChosenNode(s.chosen);
    updateCurrentStepText(i+1, steps.length, s);
    // wait a bit then assign color
    await sleep(delay * 0.45);
    assignColorToNode(s.chosen, s.colorAssigned);
    updateScheduleText(s.colorMap);
    await sleep(delay * 0.55);
    if (!cy) break;
    if ($("stopAnimBtn").disabled === false && $("animateBtn").disabled === true && animIndex === i && animTimer === "stopRequested") { break; }
  }
  // finished
  $("animateBtn").disabled = false;
  $("stopAnimBtn").disabled = true;
  animTimer = null;
  updateCurrentStepText("finished", steps.length, null);
}

function stopAnimation() {
  // simple approach: disable animate button and mark stop; actual loop checks a flag
  animTimer = "stopRequested";
  $("animateBtn").disabled = false;
  $("stopAnimBtn").disabled = true;
  resetHighlights();
}

/* ---------- Node styling helpers ---------- */
function resetNodeStyles() {
  if (!cy) return;
  cy.nodes().forEach(n => {
    n.style({ 'background-color': '#c7d2fe', 'border-width': 0, 'border-color': '' });
    n.removeClass('chosen');
  });
  cy.edges().style({ 'line-color': '#e2e8f0' });
}

function highlightChosenNode(id) {
  if (!cy) return;
  resetNodeStyles();
  const node = cy.getElementById(id);
  if (node && node.nonempty()) {
    node.addClass('chosen');
    // pulse effect
    node.animate({ style: { 'border-width': 6 } }, { duration: 250 });
  }
}

function assignColorToNode(id, colorNum) {
  if (!cy) return;
  const node = cy.getElementById(id);
  if (node && node.nonempty()) {
    const col = colorFor(colorNum);
    node.style({ 'background-color': col, 'color': '#fff' });
    node.data('slot', `Slot-${colorNum}`);
  }
}

function resetHighlights() {
  if (!cy) return;
  cy.nodes().forEach(n => n.removeClass('chosen'));
  animIndex = 0;
  animSteps = [];
  updateCurrentStepText('stopped', 0, null);
}

/* ---------- Schedule text update ---------- */
function updateScheduleText(colorMap) {
  // colorMap might be partial or full mapping exam -> color number (0/undefined for uncolored)
  const mapping = {};
  if (colorMap && typeof colorMap === 'object') {
    Object.keys(colorMap).forEach(k => {
      const c = colorMap[k];
      if (c && c > 0) mapping[k] = `Slot-${c}`;
    });
  } else if (cy) {
    cy.nodes().forEach(n => {
      const slot = n.data('slot');
      if (slot) mapping[n.id()] = slot;
    });
  }
  const keys = Object.keys(mapping).sort((a,b)=>a.localeCompare(b));
  let text = "";
  keys.forEach(k=> text += `${k} → ${mapping[k]}\n`);
  $("scheduleText").textContent = text;
}

function updateCurrentStepText(step, total, stepObj) {
  if (step === "finished") $("currentStep").textContent = `finished`;
  else if (step === "stopped") $("currentStep").textContent = `stopped`;
  else $("currentStep").textContent = `Step ${step} / ${total}` + (stepObj ? ` — ${stepObj.chosen} → Slot-${stepObj.colorAssigned}` : '');
}

/* ---------- Utilities ---------- */
function colorFor(n) {
  return COLOR_PALETTE[(n - 1) % COLOR_PALETTE.length] || '#444';
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

/* ---------- Backend scheduling (keeps existing behavior) ---------- */
function schedule() {
  if (exams.length === 0) return alert("Add at least one exam.");
  const payload = {
    exams,
    conflicts: conflicts
  };

  $("scheduleBtn").disabled = true;
  $("spinner").classList.remove("hidden");

  fetch("http://127.0.0.1:5000/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(r=>r.json())
  .then(data=>{
    if (data.status !== "success") throw new Error(data.message || "Scheduling failed");
    // apply backend coloring to cy nodes (if graph present)
    if (!cy) drawGraph();
    const scheduled = data.scheduled_exams || {};
    // scheduled contains exam -> slot label (like "Day 1 – Morning"), backend maps colors to slot_labels internally.
    // We'll color nodes by grouping identical slot labels to the same color.
    const slotMap = {};
    let nextColor = 1;
    Object.keys(scheduled).forEach(exam => {
      const slot = scheduled[exam];
      if (!slotMap[slot]) {
        slotMap[slot] = nextColor++;
      }
    });
    // assign color numbers
    Object.keys(scheduled).forEach(exam=>{
      const slot = scheduled[exam];
      const cnum = slotMap[slot];
      assignColorToNode(exam, cnum);
    });
    updateScheduleText();
  })
  .catch(err=>{
    console.error(err);
    alert("Error generating schedule: " + (err.message || ""));
  })
  .finally(()=>{
    $("scheduleBtn").disabled = false;
    $("spinner").classList.add("hidden");
  });
}

/* ---------- Export / clipboard (simple implementations) ---------- */
function downloadScheduleCSV() {
  const txt = $("scheduleText").textContent;
  if (!txt) return alert("No schedule to download.");
  const blob = new Blob([txt], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'schedule.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function copyScheduleToClipboard() {
  const txt = $("scheduleText").textContent;
  if (!txt) return alert("No schedule to copy.");
  navigator.clipboard.writeText(txt).then(()=> alert("Copied schedule to clipboard"));
}
