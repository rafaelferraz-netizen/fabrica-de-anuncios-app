import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from main import run_from_briefing  # noqa: E402


def _build_summary(run_result: dict) -> str:
    if run_result.get("type") == "carousel":
        cards = run_result.get("cards", [])
        return f"Carrossel gerado com {len(cards)} cards. Revise os cards e aprove ou reprove no painel."

    copy_data = run_result.get("copy_data", {})
    headline = copy_data.get("headline", "")
    proof_point = copy_data.get("proof_point", "")
    parts = ["Geração concluída."]
    if headline:
        parts.append(f"Headline: {headline}.")
    if proof_point:
        parts.append(f"Prova: {proof_point}.")
    parts.append("Revise o job no painel.")
    return " ".join(parts)


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length).decode("utf-8") if content_length else "{}"
            payload = json.loads(raw_body or "{}")
            briefing = payload.get("briefing")

            if not briefing:
                self._send_json(400, {"error": "Briefing ausente no corpo da requisição."})
                return

            run_result = run_from_briefing(briefing)
            artifacts = run_result.get("artifacts", {})
            response_payload = {
                "jobId": payload.get("jobId", ""),
                "type": run_result.get("type", "static"),
                "summary": _build_summary(run_result),
                "artifacts": artifacts,
                "copy_data": run_result.get("copy_data", {}),
            }

            if run_result.get("type") == "carousel":
                response_payload["cards"] = [
                    {
                        "position": card.get("briefing", {}).get("campanha", {}).get("carousel_position", ""),
                        "role": card.get("briefing", {}).get("campanha", {}).get("carousel_role", ""),
                        "artifacts": card.get("artifacts", {}),
                        "copy_data": card.get("copy_data", {}),
                    }
                    for card in run_result.get("cards", [])
                ]

            self._send_json(200, response_payload)
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})
