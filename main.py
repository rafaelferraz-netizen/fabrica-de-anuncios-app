import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import appdirs
from PIL import Image, ImageDraw

PROJECT_ROOT = Path(__file__).resolve().parent
CREWAI_DATA_DIR = PROJECT_ROOT / ".crewai_data"
CREWAI_DATA_DIR.mkdir(exist_ok=True)
os.environ["LOCALAPPDATA"] = str(CREWAI_DATA_DIR)
os.environ["APPDATA"] = str(CREWAI_DATA_DIR)
os.environ.setdefault("CREWAI_TRACING_ENABLED", "false")


def _workspace_user_data_dir(appname=None, appauthor=None, version=None, roaming=False):
    return str(CREWAI_DATA_DIR)


appdirs.user_data_dir = _workspace_user_data_dir

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from crewai import Crew, Process
from dotenv import load_dotenv

from agents import (
    build_analista_qc,
    build_curador_referencias,
    build_diretor_arte,
    build_pesquisador_mercado,
    build_redator,
)
from tasks import (
    build_copy_task,
    build_copy_correction_task,
    build_direcao_criativa_task,
    build_pesquisa_mercado_task,
    build_quality_audit_task,
    build_referencias_cliente_task,
    build_referencias_produto_task,
)
from memory_store import (
    build_memory_prompt_context,
    load_client_memory,
    merge_briefing_into_memory,
    record_ad_review,
    save_client_memory,
)
from tools import FinalDesignTool, GoogleFontDownloaderTool, ImageGenerationTool, VisualReferenceAnalysisTool

load_dotenv()


# ---------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------

def _extract_json_candidate(text: str) -> str:
    stripped = text.strip()
    fence_match = re.search(r"```(?:json)?\s*(.*?)```", stripped, re.DOTALL | re.IGNORECASE)
    if fence_match:
        stripped = fence_match.group(1).strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        return stripped
    start_positions = [idx for idx, char in enumerate(stripped) if char == "{"]
    for start in start_positions:
        depth = 0
        for offset, char in enumerate(stripped[start:], start=start):
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return stripped[start : offset + 1]
    return "{}"


def _parse_json(text: str) -> dict:
    candidate = _extract_json_candidate(text)
    try:
        return json.loads(candidate)
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Product / format helpers
# ---------------------------------------------------------------------------

def _infer_product_family(produto: str) -> str:
    lowered = produto.lower()
    if any(token in lowered for token in ["oculos", "óculos", "eyewear", "glasses", "sunglasses", "spy 45", "twist"]):
        return "eyewear"
    return "generic"


def _parse_formato(formato_str: str) -> tuple[int, int]:
    """'1:1 (1080x1080px)' or '4:5 (1080x1350px)' → (width, height)."""
    if not formato_str:
        return 1080, 1350
    match = re.search(r"(\d{3,4})\s*[xX]\s*(\d{3,4})", formato_str)
    if match:
        return int(match.group(1)), int(match.group(2))
    if "1:1" in formato_str:
        return 1080, 1080
    if "9:16" in formato_str:
        return 1080, 1920
    if "16:9" in formato_str:
        return 1920, 1080
    return 1080, 1350


def _format_hint_from_dims(w: int, h: int) -> str:
    ratio = w / max(h, 1)
    if abs(ratio - 1.0) <= 0.05:
        return "square"
    if ratio > 1.05:
        return "landscape"
    return "portrait"


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------

def _resolve_reference_path(raw_value: str) -> str:
    if not raw_value:
        return ""
    candidate = Path(raw_value.strip().strip('"')).expanduser()
    if not candidate.is_absolute():
        candidate = (PROJECT_ROOT / candidate).resolve()
    return str(candidate) if candidate.exists() and candidate.is_file() else ""


def _find_local_product_reference(produto: str) -> str:
    search_dirs = [
        PROJECT_ROOT / "Insumo",
        PROJECT_ROOT / "SPY_Assets",
        PROJECT_ROOT / "output" / "product_refs",
    ]
    tokens = [token for token in re.split(r"[\W_]+", produto.lower()) if len(token) >= 3]
    for folder in search_dirs:
        if not folder.exists():
            continue
        scored: list[tuple[int, Path]] = []
        for item in folder.glob("*"):
            if not item.is_file():
                continue
            name = item.name.lower()
            score = sum(1 for token in tokens if token in name)
            if score > 0:
                scored.append((score, item))
        if scored:
            scored.sort(key=lambda entry: (-entry[0], len(entry[1].name)))
            return str(scored[0][1])
    return ""


def _clean_reference_path(value: str) -> str:
    resolved = _resolve_reference_path(value)
    return resolved if resolved else ""


# ---------------------------------------------------------------------------
# Studio background fallback
# ---------------------------------------------------------------------------

def _create_studio_background(output_path: str, width: int = 1080, height: int = 1350) -> str:
    image = Image.new("RGB", (width, height), "#e6e1da")
    draw = ImageDraw.Draw(image)

    for y in range(height):
        top = (232, 228, 222)
        bottom = (168, 164, 160)
        ratio = y / max(1, height - 1)
        tone = tuple(int(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3))
        draw.line([(0, y), (width, y)], fill=tone)

    for r in range(520, 40, -8):
        alpha = max(0, int(60 * (1 - r / 520)))
        overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        overlay_draw.ellipse(
            [width // 2 - r, 140 - r // 2, width // 2 + r, 140 + r // 2],
            fill=(255, 255, 255, alpha),
        )
        image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")

    floor_overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    floor_draw = ImageDraw.Draw(floor_overlay)
    horizon_y = int(height * 0.73)
    for y in range(horizon_y, height):
        alpha = int(54 * ((y - horizon_y) / max(1, height - horizon_y)))
        floor_draw.line([(0, y), (width, y)], fill=(42, 42, 42, alpha))
    image = Image.alpha_composite(image.convert("RGBA"), floor_overlay).convert("RGB")
    ImageDraw.Draw(image).line(
        [(0, horizon_y), (width, horizon_y)],
        fill=(188, 184, 178),
        width=3,
    )
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, quality=95)
    return output_path


# ---------------------------------------------------------------------------
# Misc helpers
# ---------------------------------------------------------------------------

def _download_font(font_name: str):
    if not font_name:
        return
    print(f"[>] Preparando fonte '{font_name}'...")
    try:
        GoogleFontDownloaderTool().run(font_name=font_name)
    except Exception as exc:
        print(f"[X] Falha ao baixar fonte '{font_name}': {exc}")


def _save_json(path: str, payload: dict):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def _merge_text_blocks(*blocks: str) -> str:
    return "\n".join(block.strip() for block in blocks if block and block.strip())


def _analyze_reference_creative(image_source: str) -> dict:
    if not image_source:
        return {}
    try:
        raw = VisualReferenceAnalysisTool().run(image_url=image_source)
    except Exception:
        return {}
    return _parse_json(str(raw))


def _normalize_carousel_structure(structure: str, card_count: int = 5) -> str:
    raw = (structure or "").strip().lower()
    if not raw:
        return "hook_problem_solution_proof_offer" if card_count >= 5 else "hook_benefit_proof_cta"

    normalized = raw.replace("-", "_").replace(" ", "_")
    normalized = re.sub(r"_+", "_", normalized).strip("_")

    known = {
        "hook_problem_solution_proof_offer",
        "hook_benefit_proof_cta",
        "problem_agitation_solution_cta",
        "product_benefit_proof_offer",
    }
    if normalized in known:
        return normalized

    hints = {
        "problem_agitation_solution_cta": ["agitation", "agitacao"],
        "product_benefit_proof_offer": ["product", "produto", "benefit", "beneficio"],
        "hook_benefit_proof_cta": ["benefit", "beneficio", "cta"],
        "hook_problem_solution_proof_offer": ["hook", "problem", "problema", "solution", "solucao", "proof", "prova", "offer"],
    }
    for target, keywords in hints.items():
        if any(keyword in normalized for keyword in keywords):
            return target

    if card_count <= 4:
        return "hook_benefit_proof_cta"
    return "hook_problem_solution_proof_offer"


def _reference_structure_for_briefing(briefing: dict) -> str:
    reference_analysis = briefing.get("_reference_analysis", {})
    ad_structure = reference_analysis.get("ad_structure", "")
    card_count = int(briefing.get("carousel", {}).get("card_count") or 5)
    if not ad_structure or ad_structure == "unknown":
        return _normalize_carousel_structure("", card_count=card_count)
    return _normalize_carousel_structure(ad_structure, card_count=card_count)


def _build_run_summary(
    research: dict,
    brand_refs: dict,
    product_refs: dict,
    creative_direction: dict,
    copy_data: dict,
    qa_report: dict | None = None,
) -> str:
    sections = [
        ("Pesquisa de Mercado", research),
        ("Referencias da Marca", brand_refs),
        ("Referencias do Produto", product_refs),
        ("Direcao Criativa", creative_direction),
        ("Copy Final", copy_data),
    ]
    if qa_report is not None:
        sections.append(("Controle de Qualidade", qa_report))
    lines = ["# Resumo do Run", ""]
    for title, payload in sections:
        lines.append(f"## {title}")
        lines.append(json.dumps(payload, indent=2, ensure_ascii=False))
        lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# QA helpers
# ---------------------------------------------------------------------------

def _should_rewrite_copy(qa_report: dict) -> bool:
    copy_review = qa_report.get("copy_review", {})
    if copy_review and not copy_review.get("approved", True):
        return True
    for issue in copy_review.get("issues", []):
        if issue.get("severity") in {"critical", "major"}:
            return True
    for issue in qa_report.get("issues", []):
        if issue.get("reroute_to") == "copywriting":
            return True
    return False


def _should_regenerate_image(qa_report: dict) -> bool:
    for issue in qa_report.get("issues", []):
        if issue.get("reroute_to") == "image_generation":
            return True
        if issue.get("category") in {
            "image_realism", "background_coherence", "product_integrity",
            "lighting_shadow", "scale_proportion",
        } and issue.get("severity") in {"critical", "major"}:
            return True
    return False


def _build_qa_feedback_text(qa_report: dict) -> str:
    parts = [qa_report.get("summary", "")]
    for issue in qa_report.get("issues", []):
        parts.append(
            f"[{issue.get('severity', 'major')}] {issue.get('category', 'issue')}: "
            f"{issue.get('title', '')} - {issue.get('details', '')}"
        )
    return " | ".join(part for part in parts if part)


def _has_issue(qa_report: dict, category: str, reroute_to: str | None = None) -> bool:
    for issue in qa_report.get("issues", []):
        if issue.get("category") != category:
            continue
        if reroute_to is None or issue.get("reroute_to") == reroute_to:
            return True
    return False


def _derive_image_corrections(qa_report: dict) -> tuple[str, str]:
    feedback = _build_qa_feedback_text(qa_report)
    prompt_extra = []
    negative_extra = []
    if _has_issue(qa_report, "background_coherence") or _has_issue(qa_report, "image_realism"):
        prompt_extra.append(
            "The scene must be fully coherent and realistic. Background elements must support the product and never feel random or disconnected."
        )
        negative_extra.append(
            "no random people in background, no disconnected silhouette, no meaningless human presence, no surreal background"
        )
    if _has_issue(qa_report, "product_integrity"):
        prompt_extra.append(
            "Preserve the exact frame geometry, lens proportion, and physical grounding of the product. No deformation, no second instance."
        )
        negative_extra.append(
            "no warped frame, no distorted temples, no malformed lens, no floating product, no product duplication"
        )
    if _has_issue(qa_report, "lighting_shadow") or _has_issue(qa_report, "scale_proportion"):
        prompt_extra.append(
            "Ensure proper contact shadow and grounding. The product must feel anchored to its surface. "
            "Scale should feel natural with adequate breathing room around the product."
        )
        negative_extra.append(
            "no synthetic reflections, no floating product, no oversized product, no cramped composition, no fake glow"
        )
    if _has_issue(qa_report, "composition"):
        prompt_extra.append(
            "Keep cleaner negative space around the product. Avoid visually busy backgrounds."
        )
    if feedback:
        negative_extra.append(feedback)
    return " ".join(prompt_extra), ". ".join(part for part in negative_extra if part)


def _run_quality_audit(
    *,
    final_ad_path: str,
    background_path: str,
    reference_product_path: str,
    headline: str,
    subheadline: str,
    cta: str,
    brand_name: str,
    product_name: str,
) -> dict:
    qa_agent = build_analista_qc()
    qa_task = build_quality_audit_task(
        qa_agent,
        final_ad_path=final_ad_path,
        background_path=background_path,
        reference_product_path=reference_product_path,
        headline=headline,
        subheadline=subheadline,
        cta=cta,
        brand_name=brand_name,
        product_name=product_name,
    )
    qa_crew = Crew(
        agents=[qa_agent],
        tasks=[qa_task],
        process=Process.sequential,
        verbose=True,
        tracing=False,
    )
    qa_crew.kickoff()
    return _parse_json(str(qa_task.output))


# ---------------------------------------------------------------------------
# Briefing JSON adapter
# ---------------------------------------------------------------------------

def _parse_briefing_visual_restrictions(restricoes: list[str]) -> str:
    """Converts restriction tokens to English negative-prompt clauses."""
    mapping = {
        "sem_texto_na_imagem": "no text in image, no rendered typography",
        "sem_cores_vermelhas": "no red colors, no red elements",
        "sem_pessoas": "no people, no human figures",
        "sem_fundo_branco": "no white background",
        "sem_logotipo_concorrente": "no competitor logos",
        "sem_elementos_artificiais": "no artificial CGI, no synthetic renders",
    }
    clauses = [mapping.get(r, r.replace("_", " ")) for r in restricoes]
    return ", ".join(clauses)


def _briefing_to_pipeline_inputs(briefing: dict, client_memory: dict | None = None) -> dict:
    """Maps a structured briefing JSON to the keyword args expected by _run_pipeline."""
    meta = briefing.get("meta", {})
    campanha = briefing.get("campanha", {})
    produto_info = briefing.get("produto", {})
    publico = briefing.get("publico_alvo", {})
    estrategia = briefing.get("estrategia_criativa", {})
    marca = briefing.get("marca", {})
    visual = briefing.get("visual", {})
    oferta = briefing.get("oferta", {})
    reference_analysis = briefing.get("_reference_analysis", {})

    produto = produto_info.get("nome", "")
    cliente = marca.get("nome", produto_info.get("categoria", "Marca"))
    objetivo = campanha.get("objetivo", "")
    briefing_id = meta.get("briefing_id", datetime.now().strftime("%Y%m%d_%H%M%S"))
    plataforma = campanha.get("plataforma") or campanha.get("canal", "")
    funnel_stage = campanha.get("momento_funil", "")
    ad_type = campanha.get("tipo_peca", "static")

    output_width, output_height = _parse_formato(campanha.get("formato", ""))
    format_hint = _format_hint_from_dims(output_width, output_height)

    # --- Pesquisa extra ---
    pesquisa_parts = []
    if publico.get("perfil"):
        pesquisa_parts.append(f"Perfil do público-alvo: {publico['perfil']}")
    if publico.get("dor_principal"):
        pesquisa_parts.append(f"Dor principal: {publico['dor_principal']}")
    if publico.get("desejo"):
        pesquisa_parts.append(f"Desejo principal: {publico['desejo']}")
    if publico.get("interesses"):
        pesquisa_parts.append(f"Interesses do publico: {', '.join(publico['interesses'])}")
    if publico.get("nivel_consciencia"):
        pesquisa_parts.append(f"Nivel de consciencia do publico: {publico['nivel_consciencia']}")
    if funnel_stage:
        pesquisa_parts.append(f"Momento do funil: {funnel_stage}")
    if plataforma:
        pesquisa_parts.append(f"Plataforma de anuncio: {plataforma}")
    if ad_type:
        pesquisa_parts.append(f"Tipo de peca: {ad_type}")
    if campanha.get("carousel_role"):
        pesquisa_parts.append(f"Papel deste card no carrossel: {campanha['carousel_role']}")
    if campanha.get("carousel_objective"):
        pesquisa_parts.append(f"Objetivo especifico deste card: {campanha['carousel_objective']}")
    if briefing.get("meta", {}).get("carousel_structure"):
        pesquisa_parts.append(
            f"Estrutura narrativa do carrossel em uso: {briefing['meta']['carousel_structure']}"
        )
    if campanha.get("temperatura_publico"):
        pesquisa_parts.append(f"Temperatura do público: {campanha['temperatura_publico']}")
    if produto_info.get("preco"):
        pesquisa_parts.append(f"Preço: {produto_info['preco']}")
    if produto_info.get("diferencial"):
        pesquisa_parts.append(f"Diferencial: {produto_info['diferencial']}")
    if oferta.get("headline"):
        pesquisa_parts.append(f"Oferta atual da campanha: {oferta['headline']}")
    if reference_analysis.get("style_summary"):
        pesquisa_parts.append(f"Anuncio de referencia analisado: {reference_analysis['style_summary']}")
    if reference_analysis.get("ad_structure"):
        pesquisa_parts.append(f"Estrutura observada no anuncio de referencia: {reference_analysis['ad_structure']}")

    # --- Direção criativa extra ---
    direcao_parts = []
    if marca.get("cor_primaria"):
        direcao_parts.append(f"Cor primária da marca (use como accent_color): {marca['cor_primaria']}")
    if marca.get("cor_secundaria"):
        direcao_parts.append(f"Cor secundária da marca: {marca['cor_secundaria']}")
    if marca.get("estilo_visual"):
        direcao_parts.append(f"Estilo visual da marca: {marca['estilo_visual']}")
    if plataforma:
        direcao_parts.append(f"Plataforma principal: {plataforma}")
    if funnel_stage:
        direcao_parts.append(f"Momento do funil: {funnel_stage}")
    if ad_type:
        direcao_parts.append(f"Tipo de peca: {ad_type}")
    if visual.get("objetivo_visual"):
        direcao_parts.append(f"Objetivo visual da peca: {visual['objetivo_visual']}")
    if reference_analysis.get("composition"):
        direcao_parts.append(f"Composicao observada no anuncio de referencia: {reference_analysis['composition']}")
    if reference_analysis.get("mood"):
        direcao_parts.append(f"Clima visual observado no anuncio de referencia: {reference_analysis['mood']}")
    if reference_analysis.get("do_list"):
        direcao_parts.append(
            f"Elementos do anuncio de referencia que podem inspirar: {', '.join(reference_analysis['do_list'])}"
        )
    if reference_analysis.get("dont_list"):
        direcao_parts.append(
            f"Elementos do anuncio de referencia para evitar copiar literalmente: {', '.join(reference_analysis['dont_list'])}"
        )
    if campanha.get("carousel_role"):
        direcao_parts.append(f"Papel deste card no carrossel: {campanha['carousel_role']}")
    if briefing.get("meta", {}).get("carousel_structure"):
        direcao_parts.append(
            f"Estrutura narrativa do carrossel em uso: {briefing['meta']['carousel_structure']}"
        )
    elementos = visual.get("elementos_obrigatorios", [])
    if elementos:
        direcao_parts.append(f"Elementos obrigatórios na imagem: {', '.join(elementos)}")
    restricoes = visual.get("restricoes", [])
    if restricoes:
        direcao_parts.append(f"Restrições visuais (adicione ao negative_prompt): {', '.join(restricoes)}")
    espaco = visual.get("espaco_reservado", {})
    if espaco:
        direcao_parts.append(
            f"Espaço reservado para compositor externo: {json.dumps(espaco, ensure_ascii=False)} "
            "(a imagem deve ter respiro suficiente nessas áreas)"
        )
    if campanha.get("canal"):
        direcao_parts.append(f"Canal de veiculação: {campanha['canal']}")
    direcao_parts.append(
        f"Formato do criativo: {campanha.get('formato', '')} → {output_width}x{output_height}px. "
        f"Gere a cena respeitando essa proporção."
    )

    # --- Copy extra ---
    copy_parts = []
    angulo = estrategia.get("angulo_criativo")
    if angulo:
        copy_parts.append(f"Ângulo criativo obrigatório: {angulo}")
    objecao = estrategia.get("objecao_alvo")
    if objecao:
        copy_parts.append(f"Objeção a quebrar na copy: '{objecao}'")
    tons = estrategia.get("tom_emocional", [])
    if tons:
        copy_parts.append(f"Tom emocional: {', '.join(tons)}")
    if publico.get("interesses"):
        copy_parts.append(f"Interesses do publico: {', '.join(publico['interesses'])}")
    if funnel_stage:
        copy_parts.append(f"Momento do funil da campanha: {funnel_stage}")
    if plataforma:
        copy_parts.append(f"Plataforma principal da campanha: {plataforma}")
    if oferta.get("headline"):
        copy_parts.append(f"Oferta a embalar na copy: {oferta['headline']}")
    if campanha.get("carousel_role"):
        copy_parts.append(f"Papel deste card no carrossel: {campanha['carousel_role']}")
    if campanha.get("carousel_objective"):
        copy_parts.append(f"Objetivo especifico deste card: {campanha['carousel_objective']}")
    if briefing.get("meta", {}).get("carousel_structure"):
        copy_parts.append(
            f"Estrutura narrativa do carrossel em uso: {briefing['meta']['carousel_structure']}"
        )
    if reference_analysis.get("ad_structure"):
        copy_parts.append(f"Estrutura persuasiva observada no anuncio de referencia: {reference_analysis['ad_structure']}")
    if publico.get("dor_principal"):
        copy_parts.append(f"Dor do público a abordar: {publico['dor_principal']}")
    if publico.get("desejo"):
        copy_parts.append(f"Desejo a despertar: {publico['desejo']}")
    if produto_info.get("preco"):
        copy_parts.append(f"Preço para mencionar indiretamente se relevante: {produto_info['preco']}")
    if produto_info.get("diferencial"):
        copy_parts.append(f"Diferencial a destacar: {produto_info['diferencial']}")

    # --- Extra fields merged into copy JSON output ---
    copy_extra_fields = {
        "_briefing_id": briefing_id,
        "_client_id": (client_memory or {}).get("client_id", ""),
        "_canal": campanha.get("canal", ""),
        "_plataforma": plataforma,
        "_tipo_peca": ad_type,
        "_momento_funil": funnel_stage,
        "_formato": campanha.get("formato", ""),
        "_output_dimensions": f"{output_width}x{output_height}",
        "_marca_cores": {
            "primaria": marca.get("cor_primaria", ""),
            "secundaria": marca.get("cor_secundaria", ""),
        },
        "_espaco_reservado": espaco,
        "_restricoes_visuais": restricoes,
        "_angulo_criativo": angulo or "",
        "_tom_emocional": tons,
    }

    run_id = f"{briefing_id}_{datetime.now().strftime('%H%M%S')}"

    refs = briefing.get("_referencias", {})
    reference_link = refs.get("existing_ad_reference", "") or refs.get("link_ref", "")
    memory_context = build_memory_prompt_context(client_memory or {}, briefing) if client_memory else {}

    return dict(
        cliente=cliente,
        produto=produto,
        objetivo=objetivo,
        run_id=run_id,
        output_dir=Path("output"),
        site_url=refs.get("site_url", ""),
        instagram_handle=refs.get("instagram_handle", ""),
        link_ref=reference_link,
        product_image_input=refs.get("product_image_input", ""),
        output_width=output_width,
        output_height=output_height,
        format_hint=format_hint,
        pesquisa_extra=_merge_text_blocks("\n".join(pesquisa_parts), memory_context.get("research", "")),
        direcao_extra=_merge_text_blocks("\n".join(direcao_parts), memory_context.get("direction", "")),
        copy_extra=_merge_text_blocks("\n".join(copy_parts), memory_context.get("copy", "")),
        copy_extra_fields=copy_extra_fields,
    )


# ---------------------------------------------------------------------------
# Core pipeline (shared by interactive and briefing modes)
# ---------------------------------------------------------------------------

def _run_pipeline(
    *,
    cliente: str,
    produto: str,
    objetivo: str,
    run_id: str,
    output_dir: Path,
    site_url: str = "",
    instagram_handle: str = "",
    link_ref: str = "",
    product_image_input: str = "",
    output_width: int = 1080,
    output_height: int = 1350,
    format_hint: str = "portrait",
    pesquisa_extra: str = "",
    direcao_extra: str = "",
    copy_extra: str = "",
    copy_extra_fields: dict | None = None,
) -> dict:
    output_dir.mkdir(exist_ok=True)

    bg_path = str(output_dir / f"background_{run_id}.png")
    ad_path = str(output_dir / f"final_ad_{run_id}.png")
    research_path = str(output_dir / f"market_research_{run_id}.json")
    brand_refs_path = str(output_dir / f"brand_refs_{run_id}.json")
    product_refs_path = str(output_dir / f"product_refs_{run_id}.json")
    creative_path = str(output_dir / f"creative_direction_{run_id}.json")
    copy_path = str(output_dir / f"copy_{run_id}.json")
    qa_path = str(output_dir / f"quality_audit_{run_id}.json")
    summary_path = str(output_dir / f"run_summary_{run_id}.md")

    print(f"[>] Run ID: {run_id}  |  Dimensões: {output_width}x{output_height} ({format_hint})")

    product_family = _infer_product_family(produto)
    direct_product_reference = _clean_reference_path(product_image_input) or _clean_reference_path(link_ref)
    if not direct_product_reference:
        direct_product_reference = _find_local_product_reference(produto)
    if direct_product_reference:
        print(f"[>] Referencia local do produto detectada: {direct_product_reference}")

    # ------------------------------------------------------------------
    # Stage 1 — Research, references, creative direction, copy
    # ------------------------------------------------------------------
    print("\n[Stage 1] Pesquisa, referencias e estrategia...")
    pesquisador = build_pesquisador_mercado()
    curador = build_curador_referencias()
    diretor = build_diretor_arte()
    redator = build_redator()

    t_pesquisa = build_pesquisa_mercado_task(
        pesquisador,
        cliente=cliente,
        produto=produto,
        objetivo=objetivo,
        site_url=site_url,
        instagram_handle=instagram_handle,
        link_ref=link_ref,
        extra_context=pesquisa_extra,
    )
    t_brand_refs = build_referencias_cliente_task(
        curador,
        cliente=cliente,
        site_url=site_url,
        instagram_handle=instagram_handle,
        link_ref=link_ref,
        context=[t_pesquisa],
    )
    t_product_refs = build_referencias_produto_task(
        curador,
        produto=produto,
        context=[t_pesquisa, t_brand_refs],
    )
    t_direcao = build_direcao_criativa_task(
        diretor,
        context=[t_pesquisa, t_brand_refs, t_product_refs],
        extra_context=direcao_extra,
    )
    t_copy = build_copy_task(
        redator,
        context=[t_pesquisa, t_brand_refs, t_product_refs, t_direcao],
        extra_context=copy_extra,
    )

    ideation_crew = Crew(
        agents=[pesquisador, curador, diretor, redator],
        tasks=[t_pesquisa, t_brand_refs, t_product_refs, t_direcao, t_copy],
        process=Process.sequential,
        verbose=True,
    )
    ideation_crew.kickoff()

    research_data = _parse_json(str(t_pesquisa.output))
    brand_refs_data = _parse_json(str(t_brand_refs.output))
    product_refs_data = _parse_json(str(t_product_refs.output))
    creative_direction = _parse_json(str(t_direcao.output))
    copy_data = _parse_json(str(t_copy.output))

    if copy_extra_fields:
        copy_data.update(copy_extra_fields)

    _save_json(research_path, research_data)
    _save_json(brand_refs_path, brand_refs_data)
    _save_json(product_refs_path, product_refs_data)
    _save_json(creative_path, creative_direction)
    _save_json(copy_path, copy_data)

    primary_font = creative_direction.get("primary_font", "Montserrat")
    secondary_font = creative_direction.get("secondary_font", "Inter")
    accent_color = creative_direction.get("accent_color", "#FF5500")
    print(f"\n[V] Direcao: {primary_font} + {secondary_font} ({accent_color})")

    # ------------------------------------------------------------------
    # Stage 2 — Fonts (metadata for external compositor)
    # ------------------------------------------------------------------
    print("\n[Stage 2] Preparando fontes...")
    _download_font(primary_font)
    _download_font(secondary_font)

    # ------------------------------------------------------------------
    # Stage 3 — Image generation loop
    # ------------------------------------------------------------------
    print(f"\n[Stage 3] Gerando imagem limpa ({output_width}x{output_height})...")
    product_reference_path = (
        direct_product_reference
        or _clean_reference_path(product_refs_data.get("primary_product_image_path", ""))
    )
    if product_family == "eyewear" and not product_reference_path:
        raise RuntimeError(
            "Produtos de eyewear exigem uma imagem real de referencia do produto. "
            "Informe o caminho da imagem do produto ou coloque o arquivo em 'Insumo'."
        )
    if product_reference_path:
        product_refs_data["primary_product_image_path"] = product_reference_path
        _save_json(product_refs_path, product_refs_data)

    presentation_style = creative_direction.get("presentation_style", "ugc_creator_demo")
    visual_style = creative_direction.get("visual_style", "realistic social ad photography")
    scene_prompt = creative_direction.get(
        "scene_prompt",
        f"Create a believable ad image for {produto} with a human and authentic setting.",
    )
    negative_prompt = creative_direction.get(
        "negative_prompt",
        "no futuristic render, no sci-fi, no artificial mockup, no fake glossy CGI",
    )

    # Decide whether to use the "clean background + composite real product" strategy.
    # This applies to any product when: a real reference image exists AND the creative
    # direction chose a surface-based style (not UGC / person-holding).
    # Eyewear always uses this strategy when a reference exists, regardless of style.
    _surface_styles = {"simple_realistic_surface", "product_on_surface"}
    use_composite_product = bool(product_reference_path) and (
        product_family == "eyewear"
        or presentation_style in _surface_styles
    )

    if use_composite_product:
        if product_family == "eyewear":
            presentation_style = "simple_realistic_surface"
            scene_prompt = (
                "Create only the realistic scene/background for a premium eyewear ad. "
                "Use a clean believable surface with soft editorial lighting and adequate negative space. "
                "Do not include the product itself in the generated background — the real product photo will be composited later. "
                "No people, no hands, no additional objects competing with the product."
            )
            negative_prompt = (
                f"{negative_prompt}. no random person in background, no human silhouette, no oversized hand, "
                "no warped frame, no broken temple, no hidden logo, no product deformation, no second glasses, "
                "no ad copy in scene, no words in background, no banner, no printed slogan, no extra brand card, "
                "no button graphic, no sunglasses in the generated image, no eyewear object in scene"
            )
        else:
            scene_prompt = (
                f"Create a clean, realistic background scene for a '{produto}' advertisement. "
                "Do not include the actual product — a real product photograph will be composited on top later. "
                "Focus on a coherent, premium environment or surface that suits this product's category. "
                "Soft natural lighting, tasteful depth of field, adequate negative space in the center of the frame."
            )
            negative_prompt = (
                f"{negative_prompt}. no product in scene, no packaging in image, "
                "no random props competing with the product, no cluttered background"
            )

    max_qc_rounds = 3
    qa_report: dict = {}

    for attempt in range(1, max_qc_rounds + 1):
        print(f"\n[Stage 3.{attempt}] Gerando imagem limpa...")
        use_studio_fallback = (
            use_composite_product
            and attempt >= 2
            and (
                _has_issue(qa_report, "product_integrity")
                or _has_issue(qa_report, "background_coherence")
            )
        )
        if use_studio_fallback:
            print("[>] Ativando fundo de estudio seguro para preservar integridade do produto...")
            _create_studio_background(bg_path, width=output_width, height=output_height)
            image_result: dict = {"path": bg_path, "mode": "studio_fallback"}
        else:
            image_result = _parse_json(
                ImageGenerationTool().run(
                    prompt=f"{scene_prompt}. Estilo geral: {visual_style}.",
                    produto=produto,
                    presentation_style=presentation_style,
                    negative_prompt=negative_prompt,
                    reference_image_path=product_reference_path,
                    output_path=bg_path,
                    format_hint=format_hint,
                )
            )
            if image_result.get("error"):
                raise RuntimeError(f"Falha na geracao da imagem base: {image_result['error']}")

        design_result = _parse_json(
            FinalDesignTool().run(
                image_path=bg_path,
                product_reference_path=product_reference_path if use_composite_product else "",
                output_path=ad_path,
                output_width=output_width,
                output_height=output_height,
            )
        )
        if design_result.get("error"):
            raise RuntimeError(f"Falha na composicao final: {design_result['error']}")

        print(f"\n[Stage 4.{attempt}] Auditoria visual da imagem...")
        qa_report = _run_quality_audit(
            final_ad_path=ad_path,
            background_path=bg_path,
            reference_product_path=product_reference_path,
            headline=copy_data.get("headline", ""),
            subheadline=copy_data.get("subheadline", ""),
            cta=copy_data.get("cta", ""),
            brand_name=cliente,
            product_name=produto,
        )
        _save_json(qa_path, qa_report)

        if qa_report.get("approved"):
            print(
                f"[V] Imagem aprovada no QA (score {qa_report.get('score', 'n/a')}): "
                f"{qa_report.get('summary', '')}"
            )
            break

        print(
            f"[X] QA reprovou a imagem (tentativa {attempt}/{max_qc_rounds}): "
            f"{qa_report.get('summary', '')}"
        )

        if _should_regenerate_image(qa_report):
            print("[>] QA pediu nova imagem. Ajustando prompt visual...")
            prompt_extra, negative_extra = _derive_image_corrections(qa_report)
            scene_prompt = f"{scene_prompt}. {prompt_extra}".strip()
            negative_prompt = f"{negative_prompt}. {negative_extra}".strip()

        if attempt < max_qc_rounds:
            print("[>] Tentando nova geracao de imagem...")
            continue

    if not qa_report.get("approved"):
        raise RuntimeError(
            "A imagem falhou no controle de qualidade apos as tentativas configuradas. "
            f"Resumo QA: {qa_report.get('summary', '')}"
        )

    # ------------------------------------------------------------------
    # Stage 5 — Copy correction (independent of image loop)
    # ------------------------------------------------------------------
    if _should_rewrite_copy(qa_report):
        print("\n[Stage 5] QA sinalizou revisao de copy. Refazendo textos...")
        redator_correcao = build_redator()
        t_copy_fix = build_copy_correction_task(
            redator_correcao,
            qa_feedback=qa_report,
            context=[t_pesquisa, t_brand_refs, t_product_refs, t_direcao],
        )
        copy_fix_crew = Crew(
            agents=[redator_correcao],
            tasks=[t_copy_fix],
            process=Process.sequential,
            verbose=True,
            tracing=False,
        )
        copy_fix_crew.kickoff()
        revised_copy = _parse_json(str(t_copy_fix.output))
        if revised_copy:
            if copy_extra_fields:
                revised_copy.update(copy_extra_fields)
            copy_data = revised_copy
            _save_json(copy_path, copy_data)
            print("[V] Copy revisada e salva.")

    summary_text = _build_run_summary(
        research=research_data,
        brand_refs=brand_refs_data,
        product_refs=product_refs_data,
        creative_direction=creative_direction,
        copy_data=copy_data,
        qa_report=qa_report,
    )
    Path(summary_path).write_text(summary_text, encoding="utf-8")

    print("\n" + "=" * 64)
    print("=== ARTEFATOS GERADOS ===")
    print(f"1. IMAGEM LIMPA (image_output):  {ad_path}")
    print(f"2. COPY JSON   (copy_output):    {copy_path}")
    print(f"3. QA VISUAL   (qa_output):      {qa_path}")
    print("")
    print("=== INTERMEDIARIOS ===")
    print(f"BACKGROUND:          {bg_path}")
    print(f"PESQUISA:            {research_path}")
    print(f"REFERENCIAS MARCA:   {brand_refs_path}")
    print(f"REFERENCIAS PRODUTO: {product_refs_path}")
    print(f"DIRECAO CRIATIVA:    {creative_path}")
    print(f"RESUMO:              {summary_path}")
    print("=" * 64 + "\n")

    return {
        "run_id": run_id,
        "client_name": cliente,
        "product_name": produto,
        "creative_direction": creative_direction,
        "copy_data": copy_data,
        "qa_report": qa_report,
        "research_data": research_data,
        "brand_refs_data": brand_refs_data,
        "product_refs_data": product_refs_data,
        "artifacts": {
            "background_path": bg_path,
            "final_ad_path": ad_path,
            "research_path": research_path,
            "brand_refs_path": brand_refs_path,
            "product_refs_path": product_refs_path,
            "creative_path": creative_path,
            "copy_path": copy_path,
            "qa_path": qa_path,
            "summary_path": summary_path,
            "product_reference_path": product_reference_path,
        },
    }


# ---------------------------------------------------------------------------
# Entry points
# ---------------------------------------------------------------------------

def _prepare_client_memory(briefing: dict) -> dict:
    marca = briefing.get("marca", {})
    produto = briefing.get("produto", {})
    client_name = marca.get("nome") or produto.get("categoria", "Cliente")
    memory = load_client_memory(client_name)
    merge_briefing_into_memory(memory, briefing)
    save_client_memory(memory)
    return memory


def _enrich_briefing_with_reference_analysis(briefing: dict) -> dict:
    refs = briefing.get("_referencias", {})
    existing_ad_reference = refs.get("existing_ad_reference", "")
    if not existing_ad_reference:
        briefing["_reference_analysis"] = {}
        return briefing
    analysis = _analyze_reference_creative(existing_ad_reference)
    briefing["_reference_analysis"] = analysis
    return briefing


def _build_carousel_roles(card_count: int, structure: str) -> list[dict]:
    templates = {
        "hook_problem_solution_proof_offer": [
            ("hook", "Parar o scroll com uma cena de impacto e curiosidade"),
            ("problem", "Mostrar a dor ou friccao principal do publico"),
            ("solution", "Apresentar a solucao em uso real e crivel"),
            ("proof", "Trazer prova visual, detalhe ou beneficio tangivel"),
            ("offer", "Fechar com resultado percebido e oferta visual"),
        ],
        "hook_benefit_proof_cta": [
            ("hook", "Parar o scroll com um visual forte"),
            ("benefit", "Mostrar o beneficio principal de forma clara"),
            ("proof", "Trazer prova visual ou detalhe que gere confianca"),
            ("cta", "Fechar com cena de conversao e intencao de clique"),
        ],
        "problem_agitation_solution_cta": [
            ("problem", "Apresentar a dor de forma nitida e reconhecivel"),
            ("agitation", "Intensificar a urgencia ou desconforto do problema"),
            ("solution", "Mostrar a solucao em acao com clareza"),
            ("cta", "Fechar com intencao de clique ou proximo passo"),
        ],
        "product_benefit_proof_offer": [
            ("product", "Apresentar o produto de forma protagonista e clara"),
            ("benefit", "Mostrar o beneficio principal do produto"),
            ("proof", "Trazer prova visual, detalhe tecnico ou resultado"),
            ("offer", "Fechar com oferta ou resultado percebido"),
        ],
        "default": [
            ("hook", "Abrir com impacto visual"),
            ("problem", "Contextualizar a dor"),
            ("solution", "Mostrar a solucao"),
            ("proof", "Adicionar prova"),
            ("cta", "Fechar com acao"),
        ],
    }
    base = templates.get(structure, templates["default"])
    roles = []
    for index in range(card_count):
        role, objective = base[index] if index < len(base) else (f"card_{index+1}", "Variacao complementar")
        roles.append(
            {
                "position": index + 1,
                "role": role,
                "objective": objective,
            }
        )
    return roles


def _build_carousel_card_briefings(briefing: dict) -> list[dict]:
    campanha = briefing.get("campanha", {})
    carousel = briefing.get("carousel", {})
    if campanha.get("tipo_peca", "static") != "carousel":
        return [briefing]

    card_count = int(carousel.get("card_count") or 5)
    explicit_structure = (carousel.get("structure") or "").strip()
    structure = (
        _normalize_carousel_structure(explicit_structure, card_count=card_count)
        if explicit_structure
        else _reference_structure_for_briefing(briefing)
    )
    custom_cards = carousel.get("cards", [])
    roles = _build_carousel_roles(card_count, structure)
    card_briefings = []
    base_id = briefing.get("meta", {}).get("briefing_id", datetime.now().strftime("%Y%m%d_%H%M%S"))

    for index in range(card_count):
        card_data = custom_cards[index] if index < len(custom_cards) else {}
        role_data = roles[index]
        card_briefing = json.loads(json.dumps(briefing, ensure_ascii=False))
        card_briefing.setdefault("meta", {})
        card_briefing["meta"]["briefing_id"] = f"{base_id}_C{index + 1:02d}"
        card_briefing["meta"]["parent_briefing_id"] = base_id
        card_briefing["meta"]["carousel_structure"] = structure
        card_briefing.setdefault("campanha", {})
        card_briefing["campanha"]["carousel_position"] = index + 1
        card_briefing["campanha"]["carousel_role"] = card_data.get("role") or role_data["role"]
        card_briefing["campanha"]["carousel_objective"] = card_data.get("objective") or role_data["objective"]
        card_briefing.setdefault("visual", {})
        inherited_goal = card_briefing["visual"].get("objetivo_visual", "")
        card_specific_goal = card_data.get("objective") or role_data["objective"]
        card_briefing["visual"]["objetivo_visual"] = _merge_text_blocks(inherited_goal, card_specific_goal)
        card_briefing["visual"]["card_title_hint"] = card_data.get("title", "")
        card_briefing.setdefault("estrategia_criativa", {})
        card_briefing["estrategia_criativa"]["card_role"] = card_briefing["campanha"]["carousel_role"]
        card_briefing["estrategia_criativa"]["card_objective"] = card_briefing["campanha"]["carousel_objective"]
        card_briefings.append(card_briefing)
    return card_briefings


def _run_carousel_from_briefing(briefing: dict, client_memory: dict) -> dict:
    card_briefings = _build_carousel_card_briefings(briefing)
    cards = []
    for card_briefing in card_briefings:
        position = card_briefing.get("campanha", {}).get("carousel_position", len(cards) + 1)
        role = card_briefing.get("campanha", {}).get("carousel_role", "")
        print(f"[Carousel] Gerando card {position} ({role})...")
        merge_briefing_into_memory(client_memory, card_briefing)
        save_client_memory(client_memory)
        inputs = _briefing_to_pipeline_inputs(card_briefing, client_memory=client_memory)
        card_result = _run_pipeline(**inputs)
        card_result["type"] = "carousel_card"
        card_result["briefing"] = card_briefing
        cards.append(card_result)
    return _build_carousel_manifest(briefing, client_memory, cards)


def _build_carousel_manifest(briefing: dict, client_memory: dict, cards: list[dict]) -> dict:
    manifest = {
        "type": "carousel",
        "run_id": briefing.get("meta", {}).get("briefing_id", ""),
        "client_memory": client_memory,
        "briefing": briefing,
        "cards": cards,
        "artifacts": {
            "card_paths": [card.get("artifacts", {}).get("final_ad_path", "") for card in cards],
            "summary_paths": [card.get("artifacts", {}).get("summary_path", "") for card in cards],
        },
    }
    manifest_path = Path("output") / f"carousel_manifest_{manifest['run_id']}.json"
    manifest_path.write_text(
        json.dumps(
            {
                "run_id": manifest["run_id"],
                "card_paths": manifest["artifacts"]["card_paths"],
                "summary_paths": manifest["artifacts"]["summary_paths"],
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    manifest["artifacts"]["manifest_path"] = str(manifest_path)
    return manifest


def _rerun_rejected_carousel_cards(run_result: dict, rejected_positions: list[int]) -> dict:
    client_memory = run_result.get("client_memory", {})
    updated_cards = []
    rejected_set = set(rejected_positions)
    for card in run_result.get("cards", []):
        card_briefing = card.get("briefing", {})
        position = card_briefing.get("campanha", {}).get("carousel_position", 0)
        if position in rejected_set:
            role = card_briefing.get("campanha", {}).get("carousel_role", "")
            print(f"[Carousel] Regenerando apenas o card {position} ({role})...")
            merge_briefing_into_memory(client_memory, card_briefing)
            save_client_memory(client_memory)
            inputs = _briefing_to_pipeline_inputs(card_briefing, client_memory=client_memory)
            new_card = _run_pipeline(**inputs)
            new_card["type"] = "carousel_card"
            new_card["briefing"] = card_briefing
            updated_cards.append(new_card)
        else:
            updated_cards.append(card)
    return _build_carousel_manifest(run_result.get("briefing", {}), client_memory, updated_cards)


def _parse_reason_tags(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


def _review_generated_ad_interactively(briefing: dict, run_result: dict, client_memory: dict) -> dict:
    if run_result.get("type") == "carousel":
        print("Revisao do usuario - Carrossel")
        rejected_positions = []
        for card in run_result.get("cards", []):
            artifacts = card.get("artifacts", {})
            card_briefing = card.get("briefing", briefing)
            card_position = card_briefing.get("campanha", {}).get("carousel_position", 0)
            print(
                f"Card {card_position}: "
                f"{artifacts.get('final_ad_path', '')}"
            )
            decision = input("  Aprovar este card? [a=aprovar / r=reprovar / p=pular]: ").strip().lower() or "p"
            if decision not in {"a", "r"}:
                continue
            feedback = input("  Feedback (opcional): ").strip()
            reason_tags = _parse_reason_tags(
                input("  Tags (opcional, separadas por virgula): ").strip()
            )
            record_ad_review(
                client_memory,
                briefing=card_briefing,
                run_result=card,
                status="approved" if decision == "a" else "rejected",
                feedback=feedback,
                reason_tags=reason_tags,
            )
            if decision == "r" and card_position:
                rejected_positions.append(card_position)

        overall = input("Aprovar o carrossel inteiro? [a=aprovar / r=reprovar / s=sair]: ").strip().lower() or "s"
        if overall == "a":
            print("[V] Revisao do carrossel concluida.")
            return {"action": "finish", "rejected_positions": rejected_positions}
        if overall == "r":
            retry = input("Regenerar apenas os cards reprovados? [S/n]: ").strip().lower()
            if retry in {"", "s", "sim", "y", "yes"} and rejected_positions:
                return {"action": "rerun_rejected_cards", "rejected_positions": rejected_positions}
            rerun_all = input("Gerar uma nova variacao do carrossel inteiro? [s/N]: ").strip().lower()
            if rerun_all in {"s", "sim", "y", "yes"}:
                return {"action": "rerun_all", "rejected_positions": rejected_positions}
            return {"action": "finish", "rejected_positions": rejected_positions}
        return {"action": "finish", "rejected_positions": rejected_positions}

    artifacts = run_result.get("artifacts", {})
    print("Revisao do usuario")
    print(f"Imagem final: {artifacts.get('final_ad_path', '')}")
    print(f"Resumo do run: {artifacts.get('summary_path', '')}")
    decision = input("Aprovar anuncio? [a=aprovar / r=reprovar / s=sair]: ").strip().lower() or "s"

    if decision == "a":
        feedback = input("Feedback de aprovacao (opcional): ").strip()
        reason_tags = _parse_reason_tags(
            input("Tags de aprovacao (opcional, separadas por virgula): ").strip()
        )
        record_ad_review(
            client_memory,
            briefing=briefing,
            run_result=run_result,
            status="approved",
            feedback=feedback,
            reason_tags=reason_tags,
        )
        print("[V] Anuncio aprovado e salvo na memoria do cliente.")
        return {"action": "finish"}

    if decision == "r":
        feedback = input("Motivo da reprovacao: ").strip()
        reason_tags = _parse_reason_tags(
            input("Tags de reprovacao (opcional, separadas por virgula): ").strip()
        )
        record_ad_review(
            client_memory,
            briefing=briefing,
            run_result=run_result,
            status="rejected",
            feedback=feedback,
            reason_tags=reason_tags,
        )
        print("[!] Anuncio reprovado e salvo na memoria para evitar repeticao.")
        retry = input("Gerar uma nova variacao com base nesse feedback? [S/n]: ").strip().lower()
        if retry in {"", "s", "sim", "y", "yes"}:
            return {"action": "rerun_all"}
        return {"action": "finish"}

    print("[i] Encerrando sem registrar aprovacao ou reprovacao.")
    return {"action": "finish"}


def run_from_briefing(briefing: dict) -> dict:
    """Runs the full pipeline from a structured briefing JSON dict."""
    briefing = _enrich_briefing_with_reference_analysis(briefing)
    print("\n" + "=" * 64)
    print("   FABRICA DE ANUNCIOS - Modo Briefing")
    bid = briefing.get("meta", {}).get("briefing_id", "—")
    print(f"   Briefing: {bid}")
    print("=" * 64 + "\n")
    client_memory = _prepare_client_memory(briefing)
    if briefing.get("campanha", {}).get("tipo_peca", "static") == "carousel":
        return _run_carousel_from_briefing(briefing, client_memory)

    inputs = _briefing_to_pipeline_inputs(briefing, client_memory=client_memory)
    run_result = _run_pipeline(**inputs)
    run_result["type"] = "static"
    run_result["client_memory"] = client_memory
    run_result["briefing"] = briefing
    return run_result


def run_premium_agency() -> None:
    """Runs the pipeline collecting a full structured briefing interactively."""
    print("\n" + "=" * 64)
    print("   FABRICA DE ANUNCIOS - Briefing Interativo")
    print("=" * 64)

    def ask(label: str, default: str = "") -> str:
        suffix = f" [{default}]" if default else ""
        value = input(f"  {label}{suffix}: ").strip()
        return value or default

    def ask_list(label: str) -> list:
        raw = input(f"  {label} (separados por virgula, ou Enter para pular): ").strip()
        if not raw:
            return []
        return [item.strip() for item in raw.split(",") if item.strip()]

    print("\n--- CLIENTE ---")
    cliente_nome = ask("Nome do cliente / marca")
    client_memory = load_client_memory(cliente_nome)
    brand_memory = client_memory.get("brand", {})
    product_memory = client_memory.get("products", [])
    last_product = product_memory[-1] if product_memory else {}
    campaign_defaults = client_memory.get("campaign_defaults", {})

    print("\n--- PRODUTO ---")
    produto_nome = ask("Nome do produto", default=last_product.get("name", ""))
    produto_categoria = ask("Categoria (ex: moda, saude, tech, beleza)", default=last_product.get("category", ""))
    produto_preco = ask("Preco (ex: R$ 299)", default=last_product.get("price", ""))
    produto_diferencial = ask("Diferencial principal", default=last_product.get("differential", ""))

    print("\n--- MARCA ---")
    marca_nome = ask("Nome da marca", default=cliente_nome or produto_categoria)
    marca_cor1 = ask("Cor primaria (hex, ex: #FF5500)", default=brand_memory.get("primary_color", ""))
    marca_cor2 = ask("Cor secundaria (opcional)", default=brand_memory.get("secondary_color", ""))
    marca_estilo = ask("Estilo visual (ex: minimalista, bold, premium, UGC)", default=brand_memory.get("visual_style", ""))

    print("\n--- CAMPANHA ---")
    objetivo = ask("Objetivo do anuncio (ex: gerar vendas, leads, awareness)")
    print("  Formato:")
    print("    1) 1:1  (1080x1080px) - Quadrado")
    print("    2) 4:5  (1080x1350px) - Feed vertical  [padrao]")
    print("    3) 9:16 (1080x1920px) - Stories/Reels")
    formato_choice = ask("Escolha 1, 2 ou 3", default="2")
    formato_map = {
        "1": "1:1 (1080x1080px)",
        "2": "4:5 (1080x1350px)",
        "3": "9:16 (1080x1920px)",
    }
    formato = formato_map.get(formato_choice, "4:5 (1080x1350px)")
    canal = ask(
        "Canal de veiculacao (ex: Instagram, Facebook, TikTok)",
        default=campaign_defaults.get("platform", "Instagram"),
    )
    temperatura = ask("Temperatura do publico (frio/morno/quente)", default="morno")
    tipo_peca = ask("Tipo de peca (static/carousel)", default=campaign_defaults.get("ad_type", "static"))
    momento_funil = ask("Momento do funil (topo/meio/fundo)", default=campaign_defaults.get("funnel_stage", ""))
    carousel_count = "1"
    carousel_structure = "hook_problem_solution_proof_offer"
    if tipo_peca == "carousel":
        carousel_count = ask("Quantidade de cards", default="5")
        carousel_structure = ask(
            "Estrutura do carrossel (opcional; deixe vazio para aprender da referencia quando houver)",
            default="",
        )

    print("\n--- PUBLICO-ALVO ---")
    publico_perfil = ask("Perfil do publico (ex: mulheres 25-45, classe B)")
    publico_dor = ask("Dor principal")
    publico_desejo = ask("Desejo principal")
    publico_interesses = ask_list("Interesses do publico")
    nivel_consciencia = ask(
        "Nivel de consciencia (problema, solucao, produto, pronto_para_comprar)",
        default="",
    )

    print("\n--- ESTRATEGIA CRIATIVA ---")
    angulo = ask("Angulo criativo (ex: transformacao, prova social, escassez, autoridade)")
    objecao = ask("Objecao a quebrar (ex: e caro, nao funciona pra mim)")
    tons = ask_list("Tom emocional (ex: inspirador, urgente, descontraido)")

    print("\n--- OFERTA ---")
    oferta_headline = ask("Oferta principal da campanha (opcional)")

    print("\n--- REFERENCIAS ---")
    site_url = ask("Site oficial (opcional)")
    instagram_handle = ask("Instagram / @handle (opcional)")
    product_image_input = ask("Foto/imagem do produto (opcional, caminho local)")
    existing_ad_reference = ask(
        "Referencia de anuncio existente (opcional, link ou caminho local de anuncio do cliente/concorrente)"
    )
    link_ref = ask("Referencia visual complementar (opcional)")

    print("\n--- VISUAL ---")
    elementos = ask_list("Elementos obrigatorios na imagem (ex: produto, fundo branco)")
    restricoes = ask_list("Restricoes visuais (ex: sem_pessoas, sem_fundo_branco, sem_texto_na_imagem)")
    objetivo_visual = ask("Objetivo visual da peca (opcional)")

    briefing_id = f"INT-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    briefing = {
        "meta": {"briefing_id": briefing_id},
        "campanha": {
            "objetivo": objetivo,
            "formato": formato,
            "canal": canal,
            "plataforma": canal,
            "temperatura_publico": temperatura,
            "tipo_peca": tipo_peca,
            "momento_funil": momento_funil,
        },
        "produto": {
            "nome": produto_nome,
            "categoria": produto_categoria,
            "preco": produto_preco,
            "diferencial": produto_diferencial,
        },
        "marca": {
            "nome": marca_nome,
            "cor_primaria": marca_cor1,
            "cor_secundaria": marca_cor2,
            "estilo_visual": marca_estilo,
        },
        "publico_alvo": {
            "perfil": publico_perfil,
            "dor_principal": publico_dor,
            "desejo": publico_desejo,
            "interesses": publico_interesses,
            "nivel_consciencia": nivel_consciencia,
        },
        "estrategia_criativa": {
            "angulo_criativo": angulo,
            "objecao_alvo": objecao,
            "tom_emocional": tons,
        },
        "oferta": {
            "headline": oferta_headline,
        },
        "visual": {
            "elementos_obrigatorios": elementos,
            "restricoes": restricoes,
            "objetivo_visual": objetivo_visual,
            "espaco_reservado": {},
        },
        "carousel": {
            "card_count": int(carousel_count) if str(carousel_count).isdigit() else 5,
            "structure": carousel_structure,
        },
        "_referencias": {
            "site_url": site_url,
            "instagram_handle": instagram_handle,
            "existing_ad_reference": existing_ad_reference,
            "link_ref": link_ref,
            "product_image_input": product_image_input,
        },
    }

    print("\n" + "=" * 64)
    print(f"   Briefing ID : {briefing_id}")
    print(f"   Produto     : {produto_nome}  |  Formato: {formato}  |  Canal: {canal}  |  Tipo: {tipo_peca}")
    print("=" * 64 + "\n")

    while True:
        run_result = run_from_briefing(briefing)
        review_result = _review_generated_ad_interactively(
            briefing,
            run_result,
            run_result.get("client_memory", client_memory),
        )
        action = review_result.get("action", "finish")
        if action == "rerun_rejected_cards" and run_result.get("type") == "carousel":
            rerun_result = _rerun_rejected_carousel_cards(
                run_result,
                review_result.get("rejected_positions", []),
            )
            second_review = _review_generated_ad_interactively(
                briefing,
                rerun_result,
                rerun_result.get("client_memory", client_memory),
            )
            if second_review.get("action", "finish") == "rerun_all":
                continue
            break
        if action == "rerun_all":
            continue
        break


if __name__ == "__main__":
    if len(sys.argv) > 1:
        briefing_path = Path(sys.argv[1])
        if not briefing_path.exists():
            print(f"[ERRO] Arquivo de briefing não encontrado: {briefing_path}")
            sys.exit(1)
        briefing_data = json.loads(briefing_path.read_text(encoding="utf-8"))
        run_from_briefing(briefing_data)
    else:
        run_premium_agency()
