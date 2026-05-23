#!/usr/bin/env python3
import hashlib
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "0.0.0.0"
PORT = 8088
WORKER_NAME = "ai-millbrook-chunker"
ALLOWED_CLIENTS = {
    item.strip()
    for item in os.environ.get("CHUNKER_ALLOWED_CLIENTS", "127.0.0.1,192.168.1.32").split(",")
    if item.strip()
}


def normalize_text(value):
    return (
        str(value or "")
        .replace("\r\n", "\n")
        .replace("\x00", "")
    )


def normalize_chunk_text(value):
    text = normalize_text(value)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def clamp_int(value, fallback, minimum, maximum):
    try:
        parsed = int(value)
    except Exception:
        return fallback
    return max(minimum, min(maximum, parsed))


def tokenize(value):
    seen = set()
    tokens = []
    for token in re.split(r"[^a-z0-9]+", str(value or "").lower()):
        token = token.strip()
        if len(token) >= 2 and token not in seen:
            seen.add(token)
            tokens.append(token)
    return tokens


def get_line_offsets(text):
    offsets = [0]
    for index, char in enumerate(text):
        if char == "\n":
            offsets.append(index + 1)
    return offsets


def offset_to_line_number(line_offsets, offset):
    low = 0
    high = len(line_offsets) - 1
    while low <= high:
        mid = (low + high) // 2
        if line_offsets[mid] <= offset:
            low = mid + 1
        else:
            high = mid - 1
    return max(1, high + 1)


def chunk_knowledge_text(text, options):
    normalized = normalize_chunk_text(text)
    chunk_size = clamp_int(options.get("chunkSize"), 1200, 300, 5000)
    chunk_overlap = clamp_int(options.get("chunkOverlap"), 120, 0, int(chunk_size * 0.75))
    if not normalized:
        return []

    line_offsets = get_line_offsets(normalized)
    segments = []
    cursor = 0
    index = 0

    while cursor < len(normalized):
        end = min(len(normalized), cursor + chunk_size)
        chunk_text = normalized[cursor:end].strip()
        if chunk_text:
            chunk_hash = hashlib.sha256(chunk_text.encode("utf-8")).hexdigest()
            segments.append({
                "chunk_index": index,
                "chunk_hash": chunk_hash,
                "chunk_text": chunk_text,
                "keyword_text": " ".join(tokenize(chunk_text)),
                "start_offset": cursor,
                "end_offset": end,
                "line_start": offset_to_line_number(line_offsets, cursor),
                "line_end": offset_to_line_number(line_offsets, max(cursor, end - 1)),
                "section_path": str(options.get("sectionPath") or ""),
            })
            index += 1

        if end >= len(normalized):
            break

        cursor = max(0, end - chunk_overlap)

    return segments


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not self.is_allowed_client():
            self.write_json(403, {"error": "forbidden"})
            return
        if self.path == "/health":
            self.write_json(200, {"ok": True, "worker": WORKER_NAME})
            return
        self.write_json(404, {"error": "not_found"})

    def do_POST(self):
        if not self.is_allowed_client():
            self.write_json(403, {"error": "forbidden"})
            return
        if self.path != "/chunk":
            self.write_json(404, {"error": "not_found"})
            return

        try:
            length = int(self.headers.get("content-length") or "0")
            if length > 25 * 1024 * 1024:
                self.write_json(413, {"error": "payload_too_large"})
                return

            body = json.loads(self.rfile.read(length).decode("utf-8"))
            chunks = chunk_knowledge_text(body.get("text") or "", body)
            self.write_json(200, {
                "worker": WORKER_NAME,
                "chunks": chunks,
            })
        except Exception as error:
            self.write_json(500, {"error": str(error)})

    def log_message(self, fmt, *args):
        return

    def is_allowed_client(self):
        return not ALLOWED_CLIENTS or self.client_address[0] in ALLOWED_CLIENTS

    def write_json(self, status, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.serve_forever()
