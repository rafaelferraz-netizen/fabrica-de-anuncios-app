import json
from pathlib import Path

from tools import FinalDesignTool, GoogleFontDownloaderTool, ImageGenerationTool

COPY = {
    "headline": "SPY 45 - Twist",
    "subheadline": "Depois de tudo, ele continua",
    "cta": "Feito para durar",
    "angle": "durabilidade premium eyewear",
    "proof_point": "armação que resiste ao tempo",
}


def main():
    output_dir = Path("output")
    output_dir.mkdir(exist_ok=True)

    bg_path = output_dir / "spy45_ad5_background.png"
    ad_path = output_dir / "spy45_ad5_final.png"
    copy_path = output_dir / "spy45_ad5_copy.json"
    product_path = Path(r"Insumo\spy 45.png")

    GoogleFontDownloaderTool().run(font_name="Montserrat")
    GoogleFontDownloaderTool().run(font_name="Lato")

    image_result = ImageGenerationTool().run(
        prompt=(
            "Close-up product advertising scene inspired by urban performance eyewear campaigns. "
            "The exact SPY 45 Twist sunglasses must be preserved from the reference image. "
            "Place the sunglasses on rough asphalt at golden hour with a dramatic sunset reflected in the lens. "
            "Low camera angle, shallow depth of field, cinematic but believable streetwear campaign mood, "
            "warm orange sunlight, strong realism, premium editorial feel"
        ),
        produto="SPY 45 Twist sunglasses",
        presentation_style="product_on_surface",
        negative_prompt=(
            "no extra accessories, no second product, no altered frame shape, no fake logos, "
            "no unrealistic CGI, no text in image, no floating product, no character face"
        ),
        reference_image_path=str(product_path),
        output_path=str(bg_path),
    )
    print(image_result)

    design_result = FinalDesignTool().run(
        image_path=str(bg_path),
        product_reference_path=str(product_path),
        output_path=str(ad_path),
    )
    print(design_result)

    copy_path.write_text(json.dumps(COPY, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n=== ARTEFATOS ===")
    print(f"1. IMAGEM LIMPA: {ad_path}")
    print(f"2. COPY JSON:    {copy_path}")


if __name__ == "__main__":
    main()
