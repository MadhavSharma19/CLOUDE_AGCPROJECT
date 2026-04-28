"""
CloudTask Lite - Python Backend Server
Uses only Python built-in libraries (no Flask needed!)
Run: python server.py
Then open: http://localhost:8000
"""

import json
import os
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# Path to our JSON database file
TASKS_FILE = "tasks.json"


def load_tasks():
    """Read tasks from the JSON file. Returns an empty list if file doesn't exist."""
    if not os.path.exists(TASKS_FILE):
        return []
    with open(TASKS_FILE, "r") as f:
        return json.load(f)


def save_tasks(tasks):
    """Write tasks list to the JSON file."""
    with open(TASKS_FILE, "w") as f:
        json.dump(tasks, f, indent=2)


class TaskHandler(BaseHTTPRequestHandler):
    """Handles all incoming HTTP requests for our task API."""

    def send_json(self, status_code, data):
        """Helper to send a JSON response back to the browser."""
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        # Allow browser to talk to our server (CORS headers)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, filepath, content_type):
        """Helper to serve static files (HTML, CSS, JS)."""
        try:
            with open(filepath, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        """Handle preflight CORS requests from the browser."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        """Handle GET requests — serve static files or return all tasks."""
        parsed = urlparse(self.path)
        path = parsed.path

        # Serve static files
        if path == "/" or path == "/index.html":
            self.send_file("index.html", "text/html")
        elif path == "/style.css":
            self.send_file("style.css", "text/css")
        elif path == "/script.js":
            self.send_file("script.js", "application/javascript")
        elif path == "/tasks":
            # API: Return all tasks as JSON
            tasks = load_tasks()
            self.send_json(200, tasks)
        else:
            self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        """Handle POST /tasks — add a new task."""
        if self.path == "/tasks":
            # Read the request body
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body)

            # Validate that task text was provided
            if not data.get("text", "").strip():
                self.send_json(400, {"error": "Task text is required"})
                return

            # Create a new task object
            new_task = {
                "id": str(uuid.uuid4()),   # Unique ID
                "text": data["text"].strip(),
                "completed": False
            }

            # Save it
            tasks = load_tasks()
            tasks.append(new_task)
            save_tasks(tasks)

            self.send_json(201, new_task)
        else:
            self.send_json(404, {"error": "Not found"})

    def do_PUT(self):
        """Handle PUT /tasks/<id> — toggle task completed status."""
        # Extract task ID from URL like /tasks/abc-123
        parts = self.path.strip("/").split("/")
        if len(parts) == 2 and parts[0] == "tasks":
            task_id = parts[1]
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body)

            tasks = load_tasks()
            for task in tasks:
                if task["id"] == task_id:
                    task["completed"] = data.get("completed", task["completed"])
                    save_tasks(tasks)
                    self.send_json(200, task)
                    return

            self.send_json(404, {"error": "Task not found"})
        else:
            self.send_json(404, {"error": "Not found"})

    def do_DELETE(self):
        """Handle DELETE /tasks/<id> — remove a task."""
        parts = self.path.strip("/").split("/")
        if len(parts) == 2 and parts[0] == "tasks":
            task_id = parts[1]

            tasks = load_tasks()
            new_tasks = [t for t in tasks if t["id"] != task_id]

            if len(new_tasks) == len(tasks):
                self.send_json(404, {"error": "Task not found"})
                return

            save_tasks(new_tasks)
            self.send_json(200, {"message": "Task deleted"})
        else:
            self.send_json(404, {"error": "Not found"})

    def log_message(self, format, *args):
        """Override to print cleaner server logs."""
        print(f"  → {args[0]} {args[1]}")


if __name__ == "__main__":
    PORT = 8000
    server = HTTPServer(("localhost", PORT), TaskHandler)
    print("=" * 45)
    print("  ☁️  CloudTask Lite Server Running!")
    print(f"  Open: http://localhost:{PORT}")
    print("  Press Ctrl+C to stop")
    print("=" * 45)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped. Goodbye!")
