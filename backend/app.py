from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)


def dsatur(graph):
    color = {}
    saturation = {v: set() for v in graph}
    degree = {v: len(graph[v]) for v in graph}
    uncolored = set(graph.keys())

    while uncolored:
        # DSATUR selection: highest saturation, then highest degree
        chosen = max(
            uncolored,
            key=lambda v: (len(saturation[v]), degree[v])
        )

        # find smallest available color
        used_colors = {color[n] for n in graph[chosen] if n in color}
        c = 1
        while c in used_colors:
            c += 1

        color[chosen] = c
        uncolored.remove(chosen)

        # update saturation
        for neighbor in graph[chosen]:
            if neighbor in uncolored:
                saturation[neighbor].add(c)

    return color


def build_graph(exams, conflicts):
    graph = {e: set() for e in exams}
    for a, b in conflicts:
        if a != b:
            graph[a].add(b)
            graph[b].add(a)
    return graph


@app.route("/schedule", methods=["POST"])
def schedule():
    data = request.get_json()

    exams = data.get("exams", [])
    conflicts = data.get("conflicts", [])

    graph = build_graph(exams, conflicts)
    coloring = dsatur(graph)

    # Slot labels (compact & ordered)
    scheduled = {
        exam: f"Slot-{coloring[exam]}"
        for exam in sorted(coloring)
    }

    return jsonify({
        "status": "success",
        "total_exams": len(exams),
        "total_slots": max(coloring.values(), default=0),
        "scheduled_exams": scheduled
    })


if __name__ == "__main__":
    app.run(debug=True)
