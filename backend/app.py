from flask import Flask, request, jsonify
from flask_cors import CORS
import csv
import io
from itertools import combinations
import random
from collections import deque

# -------------------------
# Flask App
# -------------------------
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes


# -------------------------
# Improved DSATUR + Kempe
# -------------------------
def _dsatur_once(graph, rng=None):
    vertices = list(graph.keys())
    degrees = {v: len(graph[v]) for v in vertices}
    color = {v: 0 for v in vertices}
    sat_colors = {v: set() for v in vertices}
    uncolored = set(vertices)

    while uncolored:
        max_sat = max(len(sat_colors[v]) for v in uncolored)
        candidates = [v for v in uncolored if len(sat_colors[v]) == max_sat]
        max_deg = max(degrees[v] for v in candidates)
        best_deg = [v for v in candidates if degrees[v] == max_deg]
        chosen = rng.choice(best_deg) if rng else sorted(best_deg)[0]

        used = {color[n] for n in graph[chosen] if color.get(n, 0) != 0}
        c = 1
        while c in used:
            c += 1

        color[chosen] = c
        uncolored.remove(chosen)

        for n in graph[chosen]:
            if n in uncolored:
                sat_colors[n].add(c)

    return color


def _kempe_reduce(coloring, graph):
    def neighbor_colors(node):
        return {coloring[n] for n in graph[node] if coloring.get(n, 0) != 0}

    changed = False
    while True:
        max_color = max(coloring.values()) if coloring else 0
        if max_color <= 1:
            break
        reduced = False
        nodes_with_max = [v for v, col in coloring.items() if col == max_color]
        for v in nodes_with_max:
            neighbor_used = neighbor_colors(v)
            for target in range(1, max_color):
                if target not in neighbor_used:
                    coloring[v] = target
                    reduced = True
                    break
                neighbor_u = next((nb for nb in graph[v] if coloring.get(nb) == target), None)
                if neighbor_u is None:
                    continue
                chain = set()
                dq = deque([neighbor_u])
                while dq:
                    x = dq.popleft()
                    if x in chain:
                        continue
                    colx = coloring.get(x)
                    if colx not in (target, max_color):
                        continue
                    chain.add(x)
                    for nb in graph[x]:
                        if coloring.get(nb) in (target, max_color) and nb not in chain:
                            dq.append(nb)
                for n in chain:
                    coloring[n] = max_color if coloring[n] == target else target
                if target not in neighbor_colors(v):
                    coloring[v] = target
                    reduced = True
                    break
                else:
                    for n in chain:
                        coloring[n] = max_color if coloring[n] == target else target
            if reduced:
                break
        if not reduced:
            break
        changed = True
    return changed


def dsatur_coloring_improved(graph, attempts=5, randomize=False, seed=None):
    best_coloring = None
    best_colors_used = float("inf")
    rng = random.Random(seed) if seed is not None else None

    for _ in range(max(1, attempts)):
        local_rng = random.Random(rng.randint(0, 2**31-1)) if rng and randomize else None
        coloring = _dsatur_once(graph, rng=local_rng)
        _kempe_reduce(coloring, graph)
        max_color = max(coloring.values()) if coloring else 0
        if max_color < best_colors_used:
            best_colors_used = max_color
            best_coloring = coloring.copy()
    return best_coloring or {v: 0 for v in graph.keys()}


def dsatur_coloring(graph):
    try:
        return dsatur_coloring_improved(graph, attempts=6, randomize=True, seed=42)
    except Exception:
        return _dsatur_once(graph, rng=None)


# -------------------------
# Scheduling Helpers
# -------------------------
def build_graph(exams, conflicts):
    exams_set = set(exams)
    graph = {e: set() for e in exams}
    for a, b in conflicts:
        if a in exams_set and b in exams_set and a != b:
            graph[a].add(b)
            graph[b].add(a)
    return graph


def schedule_with_dsatur(exams, conflicts, slot_labels=None):
    graph = build_graph(exams, conflicts)
    coloring = dsatur_coloring(graph)
    total_slots = max(coloring.values()) if coloring else 0

    if slot_labels is None:
        def label_for(c): return f"Slot-{c}"
    else:
        def label_for(c):
            i = c - 1
            return slot_labels[i] if i < len(slot_labels) else f"Slot-{c}"

    scheduled = {exam: label_for(coloring[exam]) for exam in exams}
    return scheduled, total_slots


def naive_schedule(exams, slot_labels=None):
    scheduled = {}
    for i, exam in enumerate(exams):
        slot_num = i + 1
        if slot_labels and i < len(slot_labels):
            scheduled[exam] = slot_labels[i]
        else:
            scheduled[exam] = f"Slot-{slot_num}"
    return scheduled, len(exams)


def parse_conflicts(raw_conflicts):
    valid = []
    for c in raw_conflicts:
        if isinstance(c, str):
            parts = [p.strip() for p in c.split("-") if p.strip()]
            if len(parts) == 2:
                valid.append((parts[0], parts[1]))
        elif isinstance(c, (list, tuple)):
            cleaned = [str(x).strip() for x in c if str(x).strip()]
            if len(cleaned) == 2:
                valid.append((cleaned[0], cleaned[1]))
    return valid


def default_real_slot_labels(n=20):
    labels = []
    day = 1
    sessions = ["Morning", "Afternoon"]
    while len(labels) < n:
        for s in sessions:
            labels.append(f"Day {day} – {s}")
            if len(labels) >= n:
                break
        day += 1
    return labels


# -------------------------
# Flask Routes
# -------------------------
@app.route("/", methods=["GET"])
def home():
    return "Exam Scheduler API is running!"


@app.route("/schedule", methods=["POST"])
def schedule_exam():
    try:
        data = request.get_json() or {}
        exams = [str(e).strip() for e in data.get("exams", []) if str(e).strip()]
        conflicts = parse_conflicts(data.get("conflicts", []))

        slot_labels = data.get("slot_labels")
        if not slot_labels:
            slot_labels = default_real_slot_labels(50)

        scheduled_opt, opt_slots = schedule_with_dsatur(exams, conflicts, slot_labels=slot_labels)
        scheduled_naive, naive_slots = naive_schedule(exams, slot_labels=slot_labels)

        improvement = round(((naive_slots - opt_slots) / naive_slots) * 100, 2) if naive_slots > 0 else 0

        return jsonify({
            "status": "success",
            "exams": exams,
            "conflicts": conflicts,
            "scheduled_exams": scheduled_opt,
            "total_time_slots": opt_slots,
            "baseline": {
                "method": "naive_one_exam_per_slot",
                "total_time_slots": naive_slots,
                "scheduled_exams": scheduled_naive
            },
            "improvement_percent": improvement
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/upload_enrollments", methods=["POST"])
def upload_enrollments():
    try:
        if "file" not in request.files:
            return jsonify({"status": "error", "message": "No file uploaded (use key: file)"}), 400

        f = request.files["file"]
        content = f.read().decode("utf-8-sig", errors="ignore")
        reader = csv.DictReader(io.StringIO(content))
        if not reader.fieldnames:
            return jsonify({"status": "error", "message": "Invalid CSV header"}), 400

        fields = [h.strip().lstrip("\ufeff").lower() for h in reader.fieldnames]

        def find_col(wanted):
            for i, name in enumerate(fields):
                if name == wanted:
                    return reader.fieldnames[i]
            return None

        student_col = find_col("student_id") or find_col("student")
        course_col = find_col("course") or find_col("course_name")

        if not student_col or not course_col:
            return jsonify({
                "status": "error",
                "message": "CSV must include columns: student_id, course"
            }), 400

        student_courses = {}
        exams_set = set()
        for row in reader:
            sid = str(row.get(student_col, "")).strip()
            course = str(row.get(course_col, "")).strip()
            if not sid or not course:
                continue
            exams_set.add(course)
            student_courses.setdefault(sid, set()).add(course)

        conflicts_set = set()
        for sid, courses in student_courses.items():
            courses = sorted(courses)
            for a, b in combinations(courses, 2):
                pair = tuple(sorted((a, b)))
                conflicts_set.add(pair)

        exams = sorted(exams_set)
        conflicts = sorted(list(conflicts_set))

        return jsonify({
            "status": "success",
            "exams": exams,
            "conflicts": conflicts,
            "students": len(student_courses)
        })

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# -------------------------
# Run App
# -------------------------
if __name__ == "__main__":
    app.run(debug=True, port=5000)
