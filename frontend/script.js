
function uploadCSV() {
  const fileInput = document.getElementById("csvFile");
  const file = fileInput?.files?.[0];

  if (!file) {
    alert("Please choose a CSV file first.");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  fetch("http://127.0.0.1:5000/upload_enrollments", {
    method: "POST",
    body: formData
  })
    .then(res => res.json())
    .then(data => {
      console.log("Upload response:", data);

      if (data.status !== "success") {
        alert(data.message || "Upload failed");
        return;
      }

      // Fill exams input
      document.getElementById("exams").value = (data.exams || []).join(", ");

      // Fill conflicts textarea
      const conflictLines = (data.conflicts || []).map(pair => `${pair[0]}-${pair[1]}`);
      document.getElementById("conflicts").value = conflictLines.join("\n");

      alert(
        `Loaded ${data.students} students, ` +
        `${(data.exams || []).length} exams, ` +
        `${(data.conflicts || []).length} conflicts.`
      );
    })
    .catch(err => {
      console.error(err);
      alert("Upload error. Is Flask running on port 5000?");
    });
}


// -------------------------------
// Generate schedule using DSATUR + show coloring (grouped by slot)
// -------------------------------
function schedule() {
  // ✅ Exams (comma separated)
  const exams = document
    .getElementById("exams")
    .value
    .split(",")
    .map(e => e.trim())
    .filter(Boolean);

  // ✅ Conflicts (one per line: Exam1-Exam2)
  const conflicts = document.getElementById("conflicts").value
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split("-").map(x => x.trim()))
    .filter(pair => pair.length === 2 && pair[0] && pair[1]);

  fetch("http://127.0.0.1:5000/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exams, conflicts })
  })
    .then(res => res.json())
    .then(data => {
      console.log("Schedule response:", data);

      const outputDiv = document.getElementById("output");

      if (data.status !== "success") {
        outputDiv.innerHTML = `<p style="color:red;"><b>Error:</b> ${data.message || "Unknown error"}</p>`;
        return;
      }

      const scheduled = data.scheduled_exams || {};
      const totalSlots = data.total_time_slots; // ✅ DSATUR (optimized) slot count

      // ✅ (Optional) Baseline comparison (if backend returns it)
      const baselineSlots = data.baseline?.total_time_slots;
      const improvement = data.improvement_percent;

      // ✅ Group exams by slot (this is "coloring")
      const slotGroups = {};
      Object.keys(scheduled).forEach(exam => {
        const slot = scheduled[exam];
        if (!slotGroups[slot]) slotGroups[slot] = [];
        slotGroups[slot].push(exam);
      });

      // Sort slots + exams for nicer display
      const slotsSorted = Object.keys(slotGroups).sort((a, b) => a.localeCompare(b));
      slotsSorted.forEach(slot => slotGroups[slot].sort());

      // Build HTML output
      let html = `<p><b>Total Time Slots (Colors):</b> ${totalSlots}</p>`;

      if (baselineSlots !== undefined && baselineSlots !== null) {
        html += `<p><b>Baseline (Naive) Slots:</b> ${baselineSlots}</p>`;
        html += `<p><b>Improvement:</b> ${improvement}% fewer slots</p>`;
      }

      html += `<hr/><h3>Coloring (Grouped by Slot)</h3>`;

      slotsSorted.forEach(slot => {
        html += `<p><b>${slot}</b>: ${slotGroups[slot].join(", ")}</p>`;
      });

      html += `<hr/><h3>Schedule (Exam → Slot)</h3><ul>`;
      Object.keys(scheduled).sort().forEach(exam => {
        html += `<li>${exam} → ${scheduled[exam]}</li>`;
      });
      html += `</ul>`;

      outputDiv.innerHTML = html;
    })
    .catch(err => {
      console.error(err);
      document.getElementById("output").innerHTML =
        `<p style="color:red;"><b>Error:</b> Cannot connect to backend. Is Flask running on port 5000?</p>`;
    });
}
