import base64
import html
import io
import json
import os
import re
import urllib.parse
import zipfile
from pathlib import Path
from typing import Optional, Type

import requests
from crewai.tools import BaseTool
from openai import OpenAI
from PIL import Image, ImageDraw, ImageFilter
from pydantic import BaseModel, Field

FONTS_DIR = Path("fonts")
FONTS_DIR.mkdir(exist_ok=True)

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    )
}


class GoogleFontInput(BaseModel):
    font_name: str = Field(..., description="Exact Google Fonts family name")


class ImageGenerationInput(BaseModel):
    prompt: str = Field(..., description="Creative description of the product scene")
    produto: str = Field(default="", description="Product name for context")
    presentation_style: str = Field(
        default="product_on_surface",
        description=(
            "How product appears: 'person_holding', 'product_on_surface', "
            "'ugc_creator_demo', or 'simple_realistic_surface'"
        ),
    )
    negative_prompt: str = Field(
        default="",
        description="Visual elements to avoid in the generated image",
    )
    reference_image_path: str = Field(
        default="",
        description="Local path to the real raw product image to preserve in the generation",
    )
    output_path: str = Field(default="output/background.png")
    format_hint: str = Field(
        default="portrait",
        description="Aspect ratio hint: 'portrait' (4:5), 'square' (1:1), 'landscape' (16:9)",
    )


class FinalDesignInput(BaseModel):
    image_path: str = Field(..., description="Path to background image")
    product_reference_path: str = Field(default="", description="Optional original product image to composite on top")
    output_path: str = Field(default="output/final_ad.png")
    output_width: int = Field(default=1080, description="Output image width in pixels")
    output_height: int = Field(default=1350, description="Output image height in pixels")


class AdQualityAuditInput(BaseModel):
    final_ad_path: str = Field(..., description="Path to the clean final image (no text overlay)")
    background_path: str = Field(default="", description="Path to the generated background image")
    reference_product_path: str = Field(default="", description="Path to the original product reference")
    headline: str = Field(default="", description="Copy headline (evaluated separately from image)")
    subheadline: str = Field(default="", description="Copy subheadline (evaluated separately from image)")
    cta: str = Field(default="", description="Copy CTA (evaluated separately from image)")
    brand_name: str = Field(default="", description="Brand name")
    product_name: str = Field(default="", description="Product name")


class VisualAnalysisInput(BaseModel):
    image_url: str = Field(..., description="Reference image URL or local file path")


class WebSearchInput(BaseModel):
    query: str = Field(..., description="Search query")
    max_results: int = Field(default=5, ge=1, le=10, description="Maximum results")


class WebPageInput(BaseModel):
    url: str = Field(..., description="Page URL to summarize")
    max_chars: int = Field(default=5000, ge=500, le=12000, description="Max text length")


class ProductAssetInput(BaseModel):
    page_url: str = Field(..., description="Product or ecommerce page URL")
    output_dir: str = Field(default="output/product_refs", description="Folder to save raw assets")
    max_images: int = Field(default=5, ge=1, le=12, description="Maximum images to download")


def _strip_html(raw_html: str) -> str:
    cleaned = re.sub(r"(?is)<script.*?>.*?</script>", " ", raw_html)
    cleaned = re.sub(r"(?is)<style.*?>.*?</style>", " ", cleaned)
    cleaned = re.sub(r"(?is)<noscript.*?>.*?</noscript>", " ", cleaned)
    cleaned = re.sub(r"(?s)<[^>]+>", " ", cleaned)
    cleaned = html.unescape(cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def _extract_title(raw_html: str) -> str:
    match = re.search(r"(?is)<title[^>]*>(.*?)</title>", raw_html)
    return _strip_html(match.group(1)) if match else ""


def _resolve_duckduckgo_url(url: str) -> str:
    if "duckduckgo.com/l/?" not in url:
        return url
    parsed = urllib.parse.urlparse(url)
    target = urllib.parse.parse_qs(parsed.query).get("uddg", [""])[0]
    return urllib.parse.unquote(target) if target else url


def _parse_duckduckgo_results(raw_html: str, max_results: int) -> list[dict]:
    pattern = re.compile(
        r'(?is)<a[^>]*class="result__a"[^>]*href="(?P<url>[^"]+)"[^>]*>(?P<title>.*?)</a>'
        r".*?(?:<a[^>]*class=\"result__snippet\"[^>]*>|<div[^>]*class=\"result__snippet\"[^>]*>)"
        r"(?P<snippet>.*?)</(?:a|div)>"
    )
    results = []
    for match in pattern.finditer(raw_html):
        title = _strip_html(match.group("title"))
        url = _resolve_duckduckgo_url(html.unescape(match.group("url")))
        snippet = _strip_html(match.group("snippet"))
        if title and url:
            results.append({"title": title, "url": url, "snippet": snippet})
        if len(results) >= max_results:
            break
    return results


def _normalize_image_candidates(page_url: str, raw_candidates: list[str]) -> list[str]:
    seen = set()
    normalized = []
    for candidate in raw_candidates:
        if not candidate:
            continue
        candidate = html.unescape(candidate.strip())
        if candidate.startswith("data:"):
            continue
        absolute = urllib.parse.urljoin(page_url, candidate)
        parsed = urllib.parse.urlparse(absolute)
        if parsed.scheme not in {"http", "https"}:
            continue
        if absolute in seen:
            continue
        seen.add(absolute)
        normalized.append(absolute)
    return normalized


def _extract_json_images(value) -> list[str]:
    results = []
    if isinstance(value, str):
        if value.startswith("http") or value.startswith("/"):
            results.append(value)
    elif isinstance(value, list):
        for item in value:
            results.extend(_extract_json_images(item))
    elif isinstance(value, dict):
        for key in ("url", "contentUrl", "image", "thumbnailUrl"):
            if key in value:
                results.extend(_extract_json_images(value[key]))
    return results


def _extract_product_image_urls(page_url: str, raw_html: str) -> list[str]:
    candidates = []
    og_patterns = [
        r'(?is)<meta[^>]+property=["\']og:image["\'][^>]+content=["\'](.*?)["\']',
        r'(?is)<meta[^>]+content=["\'](.*?)["\'][^>]+property=["\']og:image["\']',
        r'(?is)<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\'](.*?)["\']',
    ]
    for pattern in og_patterns:
        candidates.extend(re.findall(pattern, raw_html))

    img_matches = re.findall(r'(?is)<img[^>]+src=["\'](.*?)["\']', raw_html)
    candidates.extend(img_matches)

    json_blocks = re.findall(
        r'(?is)<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        raw_html,
    )
    for block in json_blocks:
        try:
            parsed = json.loads(block.strip())
        except Exception:
            continue
        parsed_items = parsed if isinstance(parsed, list) else [parsed]
        for item in parsed_items:
            if isinstance(item, dict):
                for key in ("image", "primaryImageOfPage"):
                    if key in item:
                        candidates.extend(_extract_json_images(item[key]))

        graph_items = []
        for item in parsed_items:
            if isinstance(item, dict) and "@graph" in item and isinstance(item["@graph"], list):
                graph_items.extend(item["@graph"])
        for item in graph_items:
            if isinstance(item, dict):
                for key in ("image", "primaryImageOfPage"):
                    if key in item:
                        candidates.extend(_extract_json_images(item[key]))

    normalized = _normalize_image_candidates(page_url, candidates)
    preferred = []
    secondary = []
    for url in normalized:
        lowered = url.lower()
        if any(token in lowered for token in ["product", "produto", "sku", "gallery", "og-image", "large", "zoom"]):
            preferred.append(url)
        else:
            secondary.append(url)
    return preferred + secondary


def _guess_image_extension(image_url: str, content_type: str) -> str:
    lowered = image_url.lower()
    for ext in [".png", ".webp", ".jpg", ".jpeg"]:
        if ext in lowered:
            return ".jpg" if ext == ".jpeg" else ext
    if "png" in content_type:
        return ".png"
    if "webp" in content_type:
        return ".webp"
    return ".jpg"


def _download_image(image_url: str, destination: Path) -> Optional[Path]:
    try:
        response = requests.get(image_url, headers=DEFAULT_HEADERS, timeout=30)
        response.raise_for_status()
        content_type = response.headers.get("Content-Type", "").lower()
        if not content_type.startswith("image/"):
            return None
        ext = _guess_image_extension(image_url, content_type)
        final_path = destination.with_suffix(ext)
        final_path.write_bytes(response.content)
        return final_path
    except Exception:
        return None


def _encode_local_image_to_data_url(path: str) -> Optional[str]:
    target = Path(path)
    if not target.exists() or not target.is_file():
        return None
    suffix = target.suffix.lower().lstrip(".") or "png"
    mime = "jpeg" if suffix in {"jpg", "jpeg"} else suffix
    try:
        data = base64.b64encode(target.read_bytes()).decode("utf-8")
    except Exception:
        return None
    return f"data:image/{mime};base64,{data}"


def _save_generated_image(response, output: Path) -> None:
    image_data = response.data[0]

    if getattr(image_data, "b64_json", None):
        image_bytes = base64.b64decode(image_data.b64_json)
        Image.open(io.BytesIO(image_bytes)).save(output)
        return

    image_url = getattr(image_data, "url", None)
    if image_url:
        downloaded = _download_image(image_url, output.with_suffix(""))
        if not downloaded:
            raise ValueError("Nao foi possivel baixar a imagem retornada pela API.")
        if downloaded != output:
            Image.open(downloaded).save(output)
            downloaded.unlink(missing_ok=True)
        return

    raise ValueError("A API nao retornou b64_json nem url para a imagem gerada.")


def _remove_near_white_background(image: Image.Image, threshold: int = 245) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if r >= threshold and g >= threshold and b >= threshold:
                pixels[x, y] = (255, 255, 255, 0)
    return rgba


def _composite_reference_product(background: Image.Image, product_reference_path: str) -> Image.Image:
    reference_path = Path(product_reference_path)
    if not reference_path.exists():
        return background

    product = Image.open(reference_path)
    product = _remove_near_white_background(product)
    bbox = product.getbbox()
    if bbox:
        product = product.crop(bbox)

    bg_w, bg_h = background.size
    target_w = int(bg_w * 0.64)
    target_h = int(bg_h * 0.24)
    scale = min(target_w / product.size[0], target_h / product.size[1])
    product = product.resize(
        (max(1, int(product.size[0] * scale)), max(1, int(product.size[1] * scale))),
        Image.LANCZOS,
    )

    shadow = Image.new("RGBA", product.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.ellipse(
        [36, product.size[1] - 18, product.size[0] - 36, product.size[1] + 16],
        fill=(0, 0, 0, 96),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))

    x = (bg_w - product.size[0]) // 2
    y = int(bg_h * 0.56)
    background.alpha_composite(shadow, (x, y + int(product.size[1] * 0.72)))
    background.alpha_composite(product, (x, y))
    return background


class GoogleFontDownloaderTool(BaseTool):
    name: str = "google_font_downloader"
    description: str = "Downloads a Google Font family ZIP and extracts TTF/OTF files."
    args_schema: Type[BaseModel] = GoogleFontInput

    def _run(self, font_name: str) -> str:
        family_dir = FONTS_DIR / font_name.replace(" ", "_")
        family_dir.mkdir(exist_ok=True)
        url = f"https://fonts.google.com/download?family={urllib.parse.quote(font_name)}"
        try:
            response = requests.get(url, timeout=20, headers=DEFAULT_HEADERS)
            response.raise_for_status()
            with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
                for file_name in archive.namelist():
                    if file_name.lower().endswith((".ttf", ".otf")):
                        archive.extract(file_name, family_dir)
            return json.dumps({"success": True, "font": font_name}, ensure_ascii=False)
        except Exception as exc:
            return json.dumps({"error": str(exc)}, ensure_ascii=False)


class WebSearchTool(BaseTool):
    name: str = "web_search"
    description: str = "Searches the web and returns titles, URLs, and snippets."
    args_schema: Type[BaseModel] = WebSearchInput

    def _run(self, query: str, max_results: int = 5) -> str:
        try:
            response = requests.get(
                "https://html.duckduckgo.com/html/",
                params={"q": query},
                headers=DEFAULT_HEADERS,
                timeout=20,
            )
            response.raise_for_status()
            results = _parse_duckduckgo_results(response.text, max_results=max_results)
            return json.dumps({"query": query, "results": results}, ensure_ascii=False)
        except Exception as exc:
            return json.dumps(
                {"query": query, "results": [], "error": str(exc)},
                ensure_ascii=False,
            )


class WebPageExtractorTool(BaseTool):
    name: str = "webpage_reader"
    description: str = "Fetches a page and returns its title and cleaned text."
    args_schema: Type[BaseModel] = WebPageInput

    def _run(self, url: str, max_chars: int = 5000) -> str:
        try:
            response = requests.get(url, headers=DEFAULT_HEADERS, timeout=20)
            response.raise_for_status()
            page_title = _extract_title(response.text)
            page_text = _strip_html(response.text)[:max_chars]
            return json.dumps(
                {"url": url, "title": page_title, "content": page_text},
                ensure_ascii=False,
            )
        except Exception as exc:
            return json.dumps({"url": url, "error": str(exc)}, ensure_ascii=False)


class ProductAssetExtractorTool(BaseTool):
    name: str = "extract_product_assets"
    description: str = (
        "Fetches an ecommerce page, extracts the raw product image URLs, and downloads them locally."
    )
    args_schema: Type[BaseModel] = ProductAssetInput

    def _run(self, page_url: str, output_dir: str = "output/product_refs", max_images: int = 5) -> str:
        try:
            response = requests.get(page_url, headers=DEFAULT_HEADERS, timeout=30)
            response.raise_for_status()
            image_urls = _extract_product_image_urls(page_url, response.text)
            target_dir = Path(output_dir)
            target_dir.mkdir(parents=True, exist_ok=True)

            downloaded = []
            for index, image_url in enumerate(image_urls[:max_images], start=1):
                file_path = _download_image(image_url, target_dir / f"product_ref_{index}")
                if file_path:
                    downloaded.append({"url": image_url, "path": str(file_path)})

            primary = downloaded[0]["path"] if downloaded else ""
            return json.dumps(
                {
                    "page_url": page_url,
                    "product_image_urls": image_urls[:max_images],
                    "downloaded_assets": downloaded,
                    "primary_product_image_path": primary,
                },
                ensure_ascii=False,
            )
        except Exception as exc:
            return json.dumps({"page_url": page_url, "error": str(exc)}, ensure_ascii=False)


class ImageGenerationTool(BaseTool):
    name: str = "image_generation"
    description: str = "Generates realistic ad images using OpenAI image models."
    args_schema: Type[BaseModel] = ImageGenerationInput

    def _run(
        self,
        prompt: str,
        produto: str = "",
        presentation_style: str = "product_on_surface",
        negative_prompt: str = "",
        reference_image_path: str = "",
        output_path: str = "output/background.png",
        format_hint: str = "portrait",
    ) -> str:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return json.dumps({"error": "OPENAI_API_KEY nao encontrada"}, ensure_ascii=False)

        _size_map = {
            "square":    {"edit": "1024x1024",  "gen": "1024x1024",  "dalle3": "1024x1024"},
            "landscape": {"edit": "1536x1024",  "gen": "1536x1024",  "dalle3": "1792x1024"},
            "portrait":  {"edit": "1024x1536",  "gen": "1024x1536",  "dalle3": "1024x1792"},
        }
        sizes = _size_map.get(format_hint, _size_map["portrait"])

        scene_map = {
            "person_holding": (
                f"A real person holding {produto or 'the product'} naturally, "
                "hands visible, product in focus, authentic body language, "
                "simple environment, believable lifestyle photography."
            ),
            "ugc_creator_demo": (
                f"A creator or customer showing {produto or 'the product'} in a UGC style, "
                "authentic home environment, smartphone-era composition, "
                "casual wardrobe, natural imperfections, believable lighting."
            ),
            "simple_realistic_surface": (
                f"{produto or 'The product'} placed on a simple real-world surface such as "
                "a kitchen counter, wooden table, bathroom sink, or shelf, "
                "natural daylight, no futuristic styling, tactile realistic materials."
            ),
            "product_on_surface": (
                f"{produto or 'The product'} displayed on a clean surface with commercial focus, "
                "realistic materials, strong product clarity, tasteful depth of field."
            ),
        }
        scene_context = scene_map.get(presentation_style, scene_map["product_on_surface"])

        negative_clause = (
            negative_prompt
            or "no futuristic render, no sci-fi, no 3D mockup, no text, no watermark"
        )
        full_prompt = (
            f"{prompt}. {scene_context} "
            "Photorealistic advertising photography, premium but believable, "
            "humanized composition, high detail, natural textures, commercially usable image. "
            "Use a real human model with natural skin texture and believable anatomy. "
            "Do not create an illustration, 3D character, beauty render, doll-like face, or synthetic fashion portrait. "
            "Preserve the exact product design, shape, color, and details from the reference image when one is provided. "
            f"Avoid: {negative_clause}."
        )

        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        client = OpenAI(api_key=api_key)

        reference_path = Path(reference_image_path) if reference_image_path else None
        if reference_path and reference_path.exists():
            edit_attempts = [
                ("gpt-image-2", {"size": sizes["edit"], "quality": "high", "n": 1}),
                ("gpt-image-1.5", {"size": sizes["edit"], "quality": "high", "n": 1}),
                ("gpt-image-1", {"size": sizes["edit"], "quality": "high", "n": 1}),
            ]
            for model, kwargs in edit_attempts:
                try:
                    print(f"[>] Editando imagem com referencia real usando {model}...")
                    with open(reference_path, "rb") as image_handle:
                        response = client.images.edit(
                            model=model,
                            image=image_handle,
                            prompt=full_prompt,
                            input_fidelity="high",
                            **kwargs,
                        )
                    _save_generated_image(response, output)
                    print(f"[V] Imagem salva em: {output} (modelo: {model}, com referencia)")
                    return json.dumps(
                        {
                            "path": str(output),
                            "model": model,
                            "prompt": full_prompt,
                            "reference_image_path": str(reference_path),
                            "mode": "edit",
                        },
                        ensure_ascii=False,
                    )
                except Exception as exc:
                    print(f"[X] Edicao com {model} falhou: {exc}")

        model_attempts = [
            ("gpt-image-2", {"size": sizes["gen"], "quality": "high", "n": 1}),
            ("gpt-image-1.5", {"size": sizes["gen"], "quality": "high", "n": 1}),
            ("gpt-image-1", {"size": sizes["gen"], "quality": "high", "n": 1}),
            ("dall-e-3", {"size": sizes["dalle3"], "quality": "hd", "n": 1}),
        ]

        for model, kwargs in model_attempts:
            try:
                print(f"[>] Gerando imagem com {model}...")
                response = client.images.generate(
                    model=model,
                    prompt=full_prompt,
                    **kwargs,
                )
                _save_generated_image(response, output)
                print(f"[V] Imagem salva em: {output} (modelo: {model})")
                return json.dumps(
                    {"path": str(output), "model": model, "prompt": full_prompt},
                    ensure_ascii=False,
                )
            except Exception as exc:
                print(f"[X] {model} falhou: {exc}")

        return json.dumps(
            {"error": "Falha ao gerar imagem com os modelos configurados."},
            ensure_ascii=False,
        )


class FinalDesignTool(BaseTool):
    name: str = "final_design"
    description: str = (
        "Produces a clean final image: resizes the background to 1080x1350 and, "
        "if a product reference is provided, composites it on top. "
        "No text, no logo, no overlay is applied — the image is returned clean."
    )
    args_schema: Type[BaseModel] = FinalDesignInput

    def _run(
        self,
        image_path: str,
        product_reference_path: str = "",
        output_path: str = "output/final_ad.png",
        output_width: int = 1080,
        output_height: int = 1350,
    ) -> str:
        try:
            background = Image.open(image_path).convert("RGBA")
            background = background.resize((output_width, output_height), Image.LANCZOS)
            if product_reference_path:
                background = _composite_reference_product(background, product_reference_path)
                print("[V] Produto de referencia composto na imagem limpa")
            output = Path(output_path)
            output.parent.mkdir(parents=True, exist_ok=True)
            background.convert("RGB").save(output, quality=95)
            return json.dumps(
                {"path": str(output), "width": output_width, "height": output_height},
                ensure_ascii=False,
            )
        except Exception as exc:
            return json.dumps({"error": str(exc)}, ensure_ascii=False)


class VisualReferenceAnalysisTool(BaseTool):
    name: str = "visual_reference_analysis"
    description: str = "Analyzes a reference ad image from a URL or local path and extracts style, composition, and creative cues."
    args_schema: Type[BaseModel] = VisualAnalysisInput

    def _run(self, image_url: str) -> str:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return json.dumps(
                {
                    "primary_font": "Montserrat",
                    "secondary_font": "Inter",
                    "accent_color": "#FF5500",
                },
                ensure_ascii=False,
            )

        image_source = image_url.strip()
        if not image_source:
            return json.dumps(
                {
                    "primary_font": "Montserrat",
                    "secondary_font": "Inter",
                    "accent_color": "#FF5500",
                    "style_summary": "",
                    "composition": "",
                    "ad_structure": "",
                    "mood": "",
                    "do_list": [],
                    "dont_list": [],
                },
                ensure_ascii=False,
            )

        image_payload = _encode_local_image_to_data_url(image_source) or image_source
        client = OpenAI(api_key=api_key)
        try:
            response = client.chat.completions.create(
                model="gpt-5.5",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Return JSON with keys: primary_font, secondary_font, accent_color, "
                            "style_summary, composition, ad_structure, mood, do_list, dont_list. "
                            "ad_structure must be a short normalized label when possible, such as: "
                            "hook_problem_solution_proof_offer, hook_benefit_proof_cta, "
                            "problem_agitation_solution_cta, product_benefit_proof_offer, or unknown."
                        ),
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": (
                                    "Analyze this ad or visual reference. Extract the visual language, composition, "
                                    "creative structure, mood, and practical cues to reuse or avoid in a new ad. "
                                    "If typography is not obvious, infer commercially plausible pairings."
                                ),
                            },
                            {"type": "image_url", "image_url": {"url": image_payload}},
                        ],
                    },
                ],
                response_format={"type": "json_object"},
            )
            return response.choices[0].message.content
        except Exception:
            return json.dumps(
                {
                    "primary_font": "Montserrat",
                    "secondary_font": "Inter",
                    "accent_color": "#FF5500",
                    "style_summary": "",
                    "composition": "",
                    "ad_structure": "",
                    "mood": "",
                    "do_list": [],
                    "dont_list": [],
                },
                ensure_ascii=False,
            )


class AdQualityAuditTool(BaseTool):
    name: str = "ad_quality_audit"
    description: str = (
        "Audits the clean final image for realism, product integrity, background coherence, "
        "lighting, shadows, scale, and absence of visual artifacts. "
        "Copy is evaluated separately in a copy_review section. "
        "Returns a strict JSON approval report."
    )
    args_schema: Type[BaseModel] = AdQualityAuditInput

    def _run(
        self,
        final_ad_path: str,
        background_path: str = "",
        reference_product_path: str = "",
        headline: str = "",
        subheadline: str = "",
        cta: str = "",
        brand_name: str = "",
        product_name: str = "",
    ) -> str:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return json.dumps(
                {
                    "approved": False,
                    "score": 0,
                    "summary": "OPENAI_API_KEY nao encontrada",
                    "issues": [
                        {
                            "severity": "critical",
                            "category": "system",
                            "title": "Chave ausente",
                            "details": "Nao foi possivel executar a auditoria visual.",
                            "reroute_to": "system",
                        }
                    ],
                    "copy_review": {"approved": False, "score": 0, "issues": []},
                    "recommended_actions": ["Configurar OPENAI_API_KEY antes de auditar."],
                },
                ensure_ascii=False,
            )

        def encode_image(path: str) -> Optional[str]:
            if not path:
                return None
            target = Path(path)
            if not target.exists():
                return None
            suffix = target.suffix.lower().lstrip(".") or "png"
            mime = "jpeg" if suffix in {"jpg", "jpeg"} else suffix
            with open(target, "rb") as handle:
                data = base64.b64encode(handle.read()).decode("utf-8")
            return f"data:image/{mime};base64,{data}"

        content = [
            {
                "type": "text",
                "text": (
                    "You are a brutally rigorous creative QA auditor for performance ads. "
                    "IMPORTANT: The image is a CLEAN VISUAL with NO text overlay. Text copy is handled separately. "
                    "Audit the clean image ONLY for these visual criteria: "
                    "1) Product integrity: exact shape, proportion, geometry, color vs reference image. "
                    "2) Image realism: photorealistic quality, no CGI/render artifacts, believable materials and textures. "
                    "3) Background coherence: background supports product, no random people/silhouettes/disconnected objects. "
                    "4) Lighting and shadows: realistic light source, proper contact shadow/grounding, no synthetic glow or fake reflections. "
                    "5) Scale and proportion: product size feels natural, adequate negative space, no floating product. "
                    "6) Visual artifacts: no product duplication, no warped geometry, no text generated inside the image, no second product instance. "
                    "7) Overall visual coherence as a premium ad background. "
                    "If the product is distorted, floating, duplicated, or the background is incoherent, fail it. "
                    f"Expected brand: '{brand_name}'. Expected product: '{product_name}'. "
                    "SEPARATELY evaluate the copy (do NOT let copy issues affect image approval): "
                    f"Headline: '{headline}'. Subheadline: '{subheadline}'. CTA: '{cta}'. "
                    "Assess copy for clarity, persuasiveness, relevance to product, and CTA strength. "
                    "Return strict JSON with: "
                    "approved (bool, IMAGE quality only — copy issues must NOT affect this), "
                    "score (0-100, image quality score), "
                    "summary (image assessment summary), "
                    "issues (array of IMAGE issues only — do not include copy issues here), "
                    "copy_review (object with: approved bool, score 0-100, issues array), "
                    "recommended_actions (image correction actions only). "
                    "Each image issue must contain: severity (critical/major/minor), category, title, details, reroute_to. "
                    "Valid category: image_realism, product_integrity, background_coherence, lighting_shadow, scale_proportion, composition, system. "
                    "Valid reroute_to: image_generation, copywriting, system. "
                    "DO NOT flag issues for: typography layout, font rendering, logo placement, CTA button position, "
                    "headline/subheadline alignment, badge padding — no text exists in this image. "
                    "Only approve (approved=true) if the image is visually production-ready."
                ),
            }
        ]

        final_ad_b64 = encode_image(final_ad_path)
        background_b64 = encode_image(background_path)
        reference_b64 = encode_image(reference_product_path)

        if reference_b64:
            content.append({"type": "text", "text": "Reference product image:"})
            content.append({"type": "image_url", "image_url": {"url": reference_b64}})
        if background_b64:
            content.append({"type": "text", "text": "Generated background image:"})
            content.append({"type": "image_url", "image_url": {"url": background_b64}})
        if final_ad_b64:
            content.append({"type": "text", "text": "Clean final image to audit (no text overlay):"})
            content.append({"type": "image_url", "image_url": {"url": final_ad_b64}})

        client = OpenAI(api_key=api_key)
        try:
            response = client.chat.completions.create(
                model="gpt-5.5",
                messages=[
                    {
                        "role": "system",
                        "content": "Return only valid JSON.",
                    },
                    {"role": "user", "content": content},
                ],
                response_format={"type": "json_object"},
            )
            return response.choices[0].message.content
        except Exception as exc:
            return json.dumps(
                {
                    "approved": False,
                    "score": 0,
                    "summary": f"Falha na auditoria: {exc}",
                    "issues": [
                        {
                            "severity": "critical",
                            "category": "system",
                            "title": "Erro na auditoria",
                            "details": str(exc),
                            "reroute_to": "system",
                        }
                    ],
                    "copy_review": {"approved": False, "score": 0, "issues": []},
                    "recommended_actions": ["Reexecutar a auditoria ou verificar a configuracao da API."],
                },
                ensure_ascii=False,
            )
