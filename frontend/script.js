let exams = [];
let conflicts = [];
let holidays = [];
let cy = null;

const COLOR_PALETTE = [
  "#4F46E5","#10B981","#EF476F","#F59E0B","#06B6D4","#8B5CF6",
  "#F97316","#0891B2","#A3E635","#EC4899","#0EA5A4","#84CC16",
  "#7C3AED","#FB7185","#2563EB","#D97706","#DC2626","#059669",
  "#9333EA","#F43F5E","#3B82F6","#FBBF24","#22C55E","#C026D3",
  "#E11D48","#14B8A6","#65A30D","#BE185D","#1D4ED8","#FACC15"
];

document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initButtons();
});

function $(id){ return document.getElementById(id); }

/* ---------- Navigation ---------- */
function initNavigation(){
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      item.classList.add("active");
      $(item.dataset.tab).classList.add("active");
    });
  });
}

/* ---------- Buttons ---------- */
function initButtons(){
  $("uploadBtn").addEventListener("click", uploadCSV);
  $("addHolidayBtn").addEventListener("click", addHoliday);
  $("proceedBtn").addEventListener("click", proceed);

  $("animateBtn").addEventListener("click", animateDSATUR);
  $("clearColorBtn").addEventListener("click", clearColors);
}

/* ---------- RESET ---------- */
function resetAllData() {
  exams = [];
  conflicts = [];
  holidays = [];
  if (cy) cy.destroy();
  cy = null;

  $("uploadStatus").textContent = "";
  $("conflictList").innerHTML = "";
  $("holidayList").innerHTML = "";
  $("scheduleText").textContent = "";
  $("optimization").textContent = "";
  $("scheduleTable").querySelector("tbody").innerHTML = "";
}

/* ---------- CSV Upload ---------- */
function uploadCSV(){
  const file = $("csvFile").files[0];
  if(!file) return alert("Select a CSV file");

  resetAllData(); // RESET after file check

  const reader = new FileReader();
  reader.onload = () => {
    const lines = reader.result.trim().split("\n");
    const enrollments = [];

    lines.forEach((line, idx) => {
      if(idx === 0 && line.toLowerCase().includes("student")) return;
      const parts = line.split(",");
      if(parts.length < 2) return;
      enrollments.push({ student: parts[0].trim(), course: parts[1].trim() });
    });

    // ADD ALL COURSES (even if no conflicts)
    enrollments.forEach(e => addExam(e.course));

    const studentMap = {};
    enrollments.forEach(e => {
      if(!studentMap[e.student]) studentMap[e.student] = [];
      studentMap[e.student].push(e.course);
    });

    Object.values(studentMap).forEach(courses => {
      for(let i=0; i<courses.length; i++){
        for(let j=i+1; j<courses.length; j++){
          addConflict(courses[i], courses[j]);
        }
      }
    });

    $("uploadStatus").textContent = "CSV uploaded successfully!";
    renderConflicts();
    drawGraph();
  };

  reader.readAsText(file);
}

/* ---------- Exam & Conflict ---------- */
function addExam(name){
  if(!exams.includes(name)) exams.push(name);
}

function addConflict(a,b){
  const pair = a < b ? [a,b] : [b,a];
  if(!conflicts.some(x => x[0]==pair[0] && x[1]==pair[1])){
    conflicts.push(pair);
  }
}

function renderConflicts(){
  const list = $("conflictList");
  list.innerHTML = "";

  if(conflicts.length === 0){
    const li = document.createElement("li");
    li.textContent = "No conflict exists.";
    list.appendChild(li);
    return;
  }

  conflicts.forEach((c, i) => {
    const li = document.createElement("li");
    li.textContent = `${c[0]} — ${c[1]}`;
    list.appendChild(li);
  });
}

/* ---------- Holidays ---------- */
function addHoliday(){
  const date = $("holidayDate").value;
  if(!date) return alert("Select a date");
  if(!holidays.includes(date)) holidays.push(date);
  renderHolidays();
}

function renderHolidays(){
  const list = $("holidayList");
  list.innerHTML = "";
  holidays.sort().forEach((d,i) => {
    const li = document.createElement("li");
    li.innerHTML = `${d} <button onclick="removeHoliday(${i})">Remove</button>`;
    list.appendChild(li);
  });
}

function removeHoliday(i){
  holidays.splice(i,1);
  renderHolidays();
}

/* ---------- DSATUR ---------- */
function buildGraph(){
  const graph = {};
  exams.forEach(e => graph[e] = new Set());
  conflicts.forEach(([a,b]) => {
    graph[a].add(b);
    graph[b].add(a);
  });
  return graph;
}

function dsaturSteps(graph){
  const vertices = Object.keys(graph);
  const degree = {};
  const color = {};
  const sat = {};
  const uncolored = new Set(vertices);

  vertices.forEach(v => {
    degree[v] = graph[v].size;
    color[v] = 0;
    sat[v] = new Set();
  });

  const steps = [];

  while(uncolored.size){
    const chosen = [...uncolored].sort((a,b)=>{
      if(sat[b].size != sat[a].size) return sat[b].size - sat[a].size;
      return degree[b] - degree[a];
    })[0];

    const used = new Set();
    graph[chosen].forEach(n => {
      if(color[n]>0) used.add(color[n]);
    });

    let c=1;
    while(used.has(c)) c++;
    color[chosen] = c;

    steps.push({ chosen, colorAssigned:c, colorMap:{...color} });
    uncolored.delete(chosen);

    graph[chosen].forEach(n => {
      if(uncolored.has(n)) sat[n].add(c);
    });
  }

  return steps;
}

/* ---------- Animation ---------- */
async function animateDSATUR(){
  if(!cy) drawGraph();
  const steps = dsaturSteps(buildGraph());

  for(let i=0; i<steps.length; i++){
    const s = steps[i];
    highlightNode(s.chosen);
    await sleep(600);
    assignColor(s.chosen, s.colorAssigned);
  }
}

function clearColors() {
  if (!cy) return;

  cy.nodes().forEach(node => {
    node.style({
      "background-color": "#3b82f6",
      "border-width": 0
    });
    node.data("slot", "");
  });

  cy.nodes().style("border-width", 0);
}

/* ---------- Graph ---------- */
function drawGraph(){
  const elements = [];

  exams.forEach(e => elements.push({ data:{ id:e, label:e } }));
  conflicts.forEach(([a,b]) => elements.push({ data:{ id:`${a}-${b}`, source:a, target:b } }));

  if(cy) cy.destroy();
  cy = null;

  cy = cytoscape({
    container: document.getElementById("cy"),
    elements,
    style: [
      {
        selector: "node",
        style: {
          "background-color": "#3b82f6",
          "label": "data(label)",
          "text-valign": "center",
          "color": "#fff",
          "width": 60,
          "height": 60,
          "font-size": 12
        }
      },
      {
        selector: "edge",
        style: {
          "width": 2,
          "line-color": "#94a3b8"
        }
      }
    ],
    layout: { name: "cose", idealEdgeLength: 120, nodeOverlap: 12 },
    zoomingEnabled: true,
    userZoomingEnabled: true,
    fit: true
  });

  // If no edges, use grid layout
  if (conflicts.length === 0) {
    cy.layout({
      name: "grid",
      rows: Math.ceil(Math.sqrt(exams.length)),
      cols: Math.ceil(Math.sqrt(exams.length))
    }).run();
  }
}

function highlightNode(id){
  if(!cy) return;
  cy.nodes().style("border-width",0);
  cy.getElementById(id).style({ "border-width":4, "border-color":"#ff5c7a" });
}

function assignColor(id, num){
  if(!cy) return;
  cy.getElementById(id).style("background-color", COLOR_PALETTE[(num-1)%COLOR_PALETTE.length]);
  cy.getElementById(id).data("slot", `Slot ${num}`);
}

/* ---------- Proceed & Schedule ---------- */
function proceed(){
  if(exams.length==0) return alert("Upload CSV first");
  drawGraph();
  const steps = dsaturSteps(buildGraph());
  const final = steps[steps.length-1].colorMap;
  displayResult(final);
}

function displayResult(colorMap){
  let output = "";
  const slots = {};

  Object.keys(colorMap).forEach(e => {
    const c = colorMap[e];
    if(!slots[c]) slots[c] = [];
    slots[c].push(e);
  });

  const start = new Date($("startDate").value);
  if (!start || isNaN(start.getTime())) {
    alert("Please select a valid Start Date!");
    return;
  }

  const gap = parseInt($("gapDays").value) || 2;

  let current = new Date(start);
  const slotDates = {};
  const slotKeys = Object.keys(slots).map(Number).sort((a,b)=>a-b);

  slotKeys.forEach(slot => {
    while(holidays.includes(formatDate(current))) {
      current.setDate(current.getDate() + 1);
    }

    slotDates[slot] = formatDate(current);

    // Add gap days AFTER scheduling exam day
    current.setDate(current.getDate() + gap + 1);
  });

  slotKeys.forEach(slot => {
    output += `Slot ${slot} (${slotDates[slot]}): ${slots[slot].join(", ")}\n`;
  });

  $("scheduleText").textContent = output;
  renderScheduleTable(slotDates, slots);

  const optimized = Math.round((1 - (slotKeys.length / exams.length)) * 100);
  $("optimization").textContent = `Schedule optimized by: ${optimized}%`;
}

function renderScheduleTable(dates, slots){
  const tbody = $("scheduleTable").querySelector("tbody");
  tbody.innerHTML = "";

  const rows = Object.keys(dates).map(slot => ({
    date: dates[slot],
    subjects: slots[slot].join(", ")
  }));

  rows.sort((a,b) => new Date(a.date) - new Date(b.date));

  rows.forEach(row => {
    const tr = document.createElement("tr");
    const tdDate = document.createElement("td");
    const tdSubjects = document.createElement("td");

    tdDate.textContent = row.date;
    tdSubjects.textContent = row.subjects;

    tr.appendChild(tdDate);
    tr.appendChild(tdSubjects);
    tbody.appendChild(tr);
  });
}

/* ---------- Helpers ---------- */
function formatDate(d){
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
