import json
import re
import sqlite3
from collections import Counter
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent
MEMORY_DIR = PROJECT_ROOT / "memory"
CLIENT_JSON_DIR = MEMORY_DIR / "clients"
DB_PATH = MEMORY_DIR / "memory.db"

MEMORY_DIR.mkdir(parents=True, exist_ok=True)
CLIENT_JSON_DIR.mkdir(parents=True, exist_ok=True)


def _slugify(value: str) -> str:
    normalized = (value or "cliente").strip().lower()
    normalized = re.sub(r"[^a-z0-9]+", "_", normalized)
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    return normalized or "cliente"


def _utc_now() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _json_dumps(payload) -> str:
    return json.dumps(payload, ensure_ascii=False)


def _json_loads(raw: str, fallback):
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except Exception:
        return fallback


def _dedupe_list(values: list[str]) -> list[str]:
    seen = set()
    deduped = []
    for value in values:
        cleaned = (value or "").strip()
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(cleaned)
    return deduped


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def _ensure_schema() -> None:
    with _connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS clients (
                client_id TEXT PRIMARY KEY,
                client_name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                brand_json TEXT NOT NULL,
                campaign_defaults_json TEXT NOT NULL,
                products_json TEXT NOT NULL,
                learning_summary_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ad_reviews (
                review_id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id TEXT NOT NULL,
                ad_id TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                campaign_context_json TEXT NOT NULL,
                briefing_snapshot_json TEXT NOT NULL,
                creative_direction_json TEXT NOT NULL,
                copy_data_json TEXT NOT NULL,
                qa_report_json TEXT NOT NULL,
                artifacts_json TEXT NOT NULL,
                review_json TEXT NOT NULL,
                FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_ad_reviews_client_status
            ON ad_reviews(client_id, status, created_at DESC);
            """
        )


def _default_memory(client_name: str, client_id: str) -> dict:
    now = _utc_now()
    return {
        "client_id": client_id,
        "client_name": client_name,
        "created_at": now,
        "updated_at": now,
        "brand": {
            "segment": "",
            "tone": [],
            "primary_color": "",
            "secondary_color": "",
            "visual_style": "",
            "restrictions": [],
        },
        "products": [],
        "campaign_defaults": {
            "platform": "",
            "format": "",
            "ad_type": "static",
            "funnel_stage": "",
        },
        "ads_history": [],
        "learning_summary": {
            "approved_patterns": [],
            "rejected_patterns": [],
            "top_positive_feedback": [],
            "top_negative_feedback": [],
        },
    }


def _legacy_json_path(client_id: str) -> Path:
    return CLIENT_JSON_DIR / f"{client_id}.json"


def _write_legacy_json(memory: dict) -> None:
    _legacy_json_path(memory["client_id"]).write_text(
        json.dumps(memory, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _row_to_memory(row: sqlite3.Row | None, history: list[dict], fallback_name: str) -> dict:
    if row is None:
        return _default_memory(fallback_name, _slugify(fallback_name))
    return {
        "client_id": row["client_id"],
        "client_name": row["client_name"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "brand": _json_loads(row["brand_json"], {}),
        "products": _json_loads(row["products_json"], []),
        "campaign_defaults": _json_loads(row["campaign_defaults_json"], {}),
        "ads_history": history,
        "learning_summary": _json_loads(row["learning_summary_json"], {}),
    }


def _load_history(connection: sqlite3.Connection, client_id: str) -> list[dict]:
    rows = connection.execute(
        """
        SELECT ad_id, status, created_at, campaign_context_json, briefing_snapshot_json,
               creative_direction_json, copy_data_json, qa_report_json,
               artifacts_json, review_json
        FROM ad_reviews
        WHERE client_id = ?
        ORDER BY review_id ASC
        """,
        (client_id,),
    ).fetchall()
    history = []
    for row in rows:
        history.append(
            {
                "ad_id": row["ad_id"],
                "status": row["status"],
                "created_at": row["created_at"],
                "campaign_context": _json_loads(row["campaign_context_json"], {}),
                "briefing_snapshot": _json_loads(row["briefing_snapshot_json"], {}),
                "creative_direction": _json_loads(row["creative_direction_json"], {}),
                "copy_data": _json_loads(row["copy_data_json"], {}),
                "qa_report": _json_loads(row["qa_report_json"], {}),
                "artifacts": _json_loads(row["artifacts_json"], {}),
                "review": _json_loads(row["review_json"], {}),
            }
        )
    return history


def _upsert_client(connection: sqlite3.Connection, memory: dict) -> None:
    connection.execute(
        """
        INSERT INTO clients (
            client_id, client_name, created_at, updated_at,
            brand_json, campaign_defaults_json, products_json, learning_summary_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(client_id) DO UPDATE SET
            client_name = excluded.client_name,
            updated_at = excluded.updated_at,
            brand_json = excluded.brand_json,
            campaign_defaults_json = excluded.campaign_defaults_json,
            products_json = excluded.products_json,
            learning_summary_json = excluded.learning_summary_json
        """,
        (
            memory["client_id"],
            memory["client_name"],
            memory["created_at"],
            memory["updated_at"],
            _json_dumps(memory.get("brand", {})),
            _json_dumps(memory.get("campaign_defaults", {})),
            _json_dumps(memory.get("products", [])),
            _json_dumps(memory.get("learning_summary", {})),
        ),
    )


def _import_legacy_json_if_needed(client_name: str, client_id: str) -> dict | None:
    legacy_path = _legacy_json_path(client_id)
    if not legacy_path.exists():
        return None
    try:
        payload = json.loads(legacy_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    payload["client_id"] = payload.get("client_id") or client_id
    payload["client_name"] = payload.get("client_name") or client_name
    payload.setdefault("ads_history", [])
    payload.setdefault("learning_summary", {})
    payload.setdefault("brand", {})
    payload.setdefault("products", [])
    payload.setdefault("campaign_defaults", {})
    save_client_memory(payload)
    return payload


def load_client_memory(client_name: str, client_id: str | None = None) -> dict:
    _ensure_schema()
    resolved_id = client_id or _slugify(client_name)
    with _connect() as connection:
        row = connection.execute(
            "SELECT * FROM clients WHERE client_id = ?",
            (resolved_id,),
        ).fetchone()
        if row is None:
            imported = _import_legacy_json_if_needed(client_name, resolved_id)
            if imported is not None:
                return imported
            memory = _default_memory(client_name, resolved_id)
            _upsert_client(connection, memory)
            connection.commit()
            _write_legacy_json(memory)
            return memory
        history = _load_history(connection, resolved_id)
        return _row_to_memory(row, history, client_name)


def save_client_memory(memory: dict) -> Path:
    _ensure_schema()
    memory["updated_at"] = _utc_now()
    with _connect() as connection:
        _upsert_client(connection, memory)
        connection.commit()
    _write_legacy_json(memory)
    return DB_PATH


def _campaign_context_from_briefing(briefing: dict) -> dict:
    campanha = briefing.get("campanha", {})
    produto = briefing.get("produto", {})
    publico = briefing.get("publico_alvo", {})
    oferta = briefing.get("oferta", {})
    return {
        "product_name": produto.get("nome", ""),
        "product_category": produto.get("categoria", ""),
        "platform": campanha.get("plataforma") or campanha.get("canal", ""),
        "format": campanha.get("formato", ""),
        "objective": campanha.get("objetivo", ""),
        "ad_type": campanha.get("tipo_peca", "static"),
        "funnel_stage": campanha.get("momento_funil", ""),
        "audience_profile": publico.get("perfil", ""),
        "pain_point": publico.get("dor_principal", ""),
        "desire": publico.get("desejo", ""),
        "offer": oferta.get("headline") or oferta.get("nome") or "",
        "carousel_position": campanha.get("carousel_position", ""),
        "carousel_role": campanha.get("carousel_role", ""),
    }


def merge_briefing_into_memory(memory: dict, briefing: dict) -> dict:
    produto = briefing.get("produto", {})
    marca = briefing.get("marca", {})
    campanha = briefing.get("campanha", {})
    visual = briefing.get("visual", {})
    estrategia = briefing.get("estrategia_criativa", {})

    brand = memory.setdefault("brand", {})
    brand["segment"] = marca.get("segmento") or produto.get("categoria", "") or brand.get("segment", "")
    brand["primary_color"] = marca.get("cor_primaria", "") or brand.get("primary_color", "")
    brand["secondary_color"] = marca.get("cor_secundaria", "") or brand.get("secondary_color", "")
    brand["visual_style"] = marca.get("estilo_visual", "") or brand.get("visual_style", "")
    brand["tone"] = _dedupe_list(brand.get("tone", []) + estrategia.get("tom_emocional", []))
    brand["restrictions"] = _dedupe_list(
        brand.get("restrictions", []) + visual.get("restricoes", [])
    )

    defaults = memory.setdefault("campaign_defaults", {})
    defaults["platform"] = campanha.get("plataforma") or campanha.get("canal", "") or defaults.get("platform", "")
    defaults["format"] = campanha.get("formato", "") or defaults.get("format", "")
    defaults["ad_type"] = campanha.get("tipo_peca", "") or defaults.get("ad_type", "static")
    defaults["funnel_stage"] = campanha.get("momento_funil", "") or defaults.get("funnel_stage", "")

    products = memory.setdefault("products", [])
    product_name = produto.get("nome", "").strip()
    if product_name:
        existing = next((item for item in products if item.get("name", "").lower() == product_name.lower()), None)
        if existing is None:
            existing = {
                "name": product_name,
                "category": produto.get("categoria", ""),
                "price": produto.get("preco", ""),
                "differential": produto.get("diferencial", ""),
            }
            products.append(existing)
        else:
            existing["category"] = produto.get("categoria", "") or existing.get("category", "")
            existing["price"] = produto.get("preco", "") or existing.get("price", "")
            existing["differential"] = produto.get("diferencial", "") or existing.get("differential", "")
    return memory


def _extract_visual_patterns(run_result: dict) -> list[str]:
    creative = run_result.get("creative_direction", {})
    patterns = []
    for key in ("visual_style", "presentation_style", "accent_color"):
        value = creative.get(key)
        if value:
            patterns.append(str(value))
    composition = creative.get("composition_notes")
    if isinstance(composition, list):
        patterns.extend(str(item) for item in composition if item)
    elif composition:
        patterns.append(str(composition))
    scene = creative.get("scene_prompt")
    if scene:
        patterns.append(str(scene))
    return _dedupe_list(patterns)


def _extract_feedback_tokens(entries: list[dict]) -> list[str]:
    tokens = []
    for entry in entries:
        feedback = (entry.get("review", {}) or {}).get("feedback", "")
        reason_tags = (entry.get("review", {}) or {}).get("reason_tags", [])
        if feedback:
            tokens.append(feedback)
        tokens.extend(reason_tags)
    return _dedupe_list(tokens)


def _recompute_learning_summary(memory: dict) -> None:
    history = memory.get("ads_history", [])
    approved = [entry for entry in history if entry.get("status") == "approved"]
    rejected = [entry for entry in history if entry.get("status") == "rejected"]

    approved_counter = Counter()
    rejected_counter = Counter()

    for entry in approved:
        approved_counter.update(_extract_visual_patterns(entry))
        approved_counter.update((entry.get("review", {}) or {}).get("reason_tags", []))
    for entry in rejected:
        rejected_counter.update(_extract_visual_patterns(entry))
        rejected_counter.update((entry.get("review", {}) or {}).get("reason_tags", []))

    memory["learning_summary"] = {
        "approved_patterns": [item for item, _ in approved_counter.most_common(8)],
        "rejected_patterns": [item for item, _ in rejected_counter.most_common(8)],
        "top_positive_feedback": _extract_feedback_tokens(approved)[:6],
        "top_negative_feedback": _extract_feedback_tokens(rejected)[:6],
    }


def record_ad_review(
    memory: dict,
    *,
    briefing: dict,
    run_result: dict,
    status: str,
    feedback: str = "",
    reason_tags: list[str] | None = None,
) -> dict:
    review_entry = {
        "ad_id": run_result.get("run_id", ""),
        "status": status,
        "created_at": _utc_now(),
        "campaign_context": _campaign_context_from_briefing(briefing),
        "briefing_snapshot": briefing,
        "creative_direction": run_result.get("creative_direction", {}),
        "copy_data": run_result.get("copy_data", {}),
        "qa_report": run_result.get("qa_report", {}),
        "artifacts": run_result.get("artifacts", {}),
        "review": {
            "feedback": feedback.strip(),
            "reason_tags": _dedupe_list(reason_tags or []),
        },
    }

    memory.setdefault("ads_history", []).append(review_entry)
    _recompute_learning_summary(memory)
    memory["updated_at"] = _utc_now()

    _ensure_schema()
    with _connect() as connection:
        _upsert_client(connection, memory)
        connection.execute(
            """
            INSERT INTO ad_reviews (
                client_id, ad_id, status, created_at, campaign_context_json,
                briefing_snapshot_json, creative_direction_json, copy_data_json,
                qa_report_json, artifacts_json, review_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                memory["client_id"],
                review_entry["ad_id"],
                status,
                review_entry["created_at"],
                _json_dumps(review_entry["campaign_context"]),
                _json_dumps(review_entry["briefing_snapshot"]),
                _json_dumps(review_entry["creative_direction"]),
                _json_dumps(review_entry["copy_data"]),
                _json_dumps(review_entry["qa_report"]),
                _json_dumps(review_entry["artifacts"]),
                _json_dumps(review_entry["review"]),
            ),
        )
        connection.commit()
    _write_legacy_json(memory)
    return review_entry


def _score_entry(entry: dict, briefing: dict) -> int:
    score = 0
    context = entry.get("campaign_context", {})
    current = _campaign_context_from_briefing(briefing)
    for field in (
        "product_name",
        "platform",
        "objective",
        "ad_type",
        "funnel_stage",
        "format",
        "carousel_role",
    ):
        left = (context.get(field) or "").strip().lower()
        right = (current.get(field) or "").strip().lower()
        if left and right and left == right:
            score += 3
    if context.get("product_category") and current.get("product_category"):
        if context["product_category"].strip().lower() == current["product_category"].strip().lower():
            score += 2
    return score


def _select_examples(memory: dict, briefing: dict, status: str, limit: int = 3) -> list[dict]:
    candidates = [entry for entry in memory.get("ads_history", []) if entry.get("status") == status]
    ranked = sorted(
        candidates,
        key=lambda entry: (_score_entry(entry, briefing), entry.get("created_at", "")),
        reverse=True,
    )
    return ranked[:limit]


def build_memory_prompt_context(memory: dict, briefing: dict) -> dict:
    learning = memory.get("learning_summary", {})
    approved_examples = _select_examples(memory, briefing, "approved")
    rejected_examples = _select_examples(memory, briefing, "rejected")

    common_lines = []
    approved_patterns = learning.get("approved_patterns", [])
    rejected_patterns = learning.get("rejected_patterns", [])
    if approved_patterns:
        common_lines.append(
            "Padroes aprovados historicamente pelo cliente: " + "; ".join(approved_patterns[:5])
        )
    if rejected_patterns:
        common_lines.append(
            "Padroes reprovados historicamente pelo cliente: " + "; ".join(rejected_patterns[:5])
        )

    def summarize_examples(items: list[dict], prefix: str) -> list[str]:
        lines = []
        for item in items:
            creative = item.get("creative_direction", {})
            review = item.get("review", {})
            parts = []
            if creative.get("visual_style"):
                parts.append(f"visual_style={creative['visual_style']}")
            if creative.get("presentation_style"):
                parts.append(f"presentation_style={creative['presentation_style']}")
            if creative.get("scene_prompt"):
                parts.append(f"scene={creative['scene_prompt']}")
            if review.get("feedback"):
                parts.append(f"feedback={review['feedback']}")
            if parts:
                lines.append(f"{prefix}: " + " | ".join(parts))
        return lines

    research_lines = common_lines + summarize_examples(approved_examples, "Referencia positiva")
    direction_lines = common_lines + summarize_examples(approved_examples, "Replicar o raciocinio, nao a peca")
    direction_lines += summarize_examples(rejected_examples, "Evitar nesta nova geracao")
    copy_lines = []
    if learning.get("top_positive_feedback"):
        copy_lines.append(
            "Linguagens aprovadas pelo cliente: " + "; ".join(learning["top_positive_feedback"][:4])
        )
    if learning.get("top_negative_feedback"):
        copy_lines.append(
            "Evite repetir na proposta: " + "; ".join(learning["top_negative_feedback"][:4])
        )

    return {
        "research": "\n".join(research_lines).strip(),
        "direction": "\n".join(direction_lines).strip(),
        "copy": "\n".join(copy_lines).strip(),
    }
