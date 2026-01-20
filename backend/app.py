from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

def build_graph(exams, conflicts):
    graph = {e: set() for e in exams}
    for a, b in conflicts:
        if a != b:
            graph[a].add(b)
            graph[b].add(a)
    return graph

def dsatur(graph):
    color = {}
    saturation = {v: set() for v in graph}
    degree = {v: len(graph[v]) for v in graph}
    uncolored = set(graph.keys())

    while uncolored:
        chosen = max(uncolored, key=lambda v: (len(saturation[v]), degree[v]))
        used_colors = {color[n] for n in graph[chosen] if n in color}
        c = 1
        while c in used_colors:
            c += 1
        color[chosen] = c
        uncolored.remove(chosen)
        for neighbor in graph[chosen]:
            if neighbor in uncolored:
                saturation[neighbor].add(c)
    return color

@app.route("/upload", methods=["POST"])
def upload():
    file = request.files.get("file")
    if not file:
        return jsonify({"status": "error", "message": "No file"}), 400

    text = file.read().decode("utf-8").strip()
    lines = text.split("\n")
    enrollments = []

    for idx, line in enumerate(lines):
        if idx == 0 and "student" in line.lower():
            continue
        parts = [p.strip() for p in line.split(",") if p.strip()]
        if len(parts) < 2:
            continue
        enrollments.append({"student": parts[0], "course": parts[1]})

    return jsonify({"status": "success", "data": enrollments})

@app.route("/schedule", methods=["POST"])
def schedule():
    data = request.get_json()
    exams = data.get("exams", [])
    conflicts = data.get("conflicts", [])
    graph = build_graph(exams, conflicts)
    coloring = dsatur(graph)

    return jsonify({
        "status": "success",
        "scheduled": coloring
    })

if __name__ == "__main__":
    app.run(debug=True)
