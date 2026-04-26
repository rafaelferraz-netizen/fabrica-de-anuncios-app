from crewai import Task


def build_pesquisa_mercado_task(
    agent,
    cliente: str,
    produto: str,
    objetivo: str,
    site_url: str = "",
    instagram_handle: str = "",
    link_ref: str = "",
    extra_context: str = "",
) -> Task:
    site_hint = f" Site oficial: {site_url}." if site_url else ""
    insta_hint = f" Instagram ou handle informado: {instagram_handle}." if instagram_handle else ""
    ref_hint = f" Referencia visual inicial: {link_ref}." if link_ref else ""
    briefing_hint = f"\n\nContexto estratégico pré-definido (priorize):\n{extra_context}" if extra_context else ""
    return Task(
        description=(
            f"Faca uma pesquisa de mercado para a marca '{cliente}' e o produto '{produto}'. "
            f"Objetivo de negocio do anuncio: '{objetivo}'.{site_hint}{insta_hint}{ref_hint} "
            "Use as ferramentas de busca e leitura de paginas para identificar: "
            "1) como a marca se apresenta, 2) como o produto e percebido, "
            "3) publico, dores, desejos e objecoes, 4) concorrentes ou alternativas, "
            "5) oportunidades para um anuncio mais humano e crivel. "
            f"Inclua links uteis e observacoes praticas para criacao.{briefing_hint}"
        ),
        expected_output=(
            "JSON com as chaves: brand_summary, product_summary, audience, pains, desires, "
            "objections, competitors, creative_opportunities, source_links."
        ),
        agent=agent,
    )


def build_referencias_cliente_task(
    agent,
    cliente: str,
    site_url: str,
    instagram_handle: str,
    link_ref: str,
    context: list,
) -> Task:
    return Task(
        description=(
            f"Com base na pesquisa previa, encontre referencias visuais da marca '{cliente}'. "
            f"Site informado: '{site_url or 'nao informado'}'. "
            f"Instagram informado: '{instagram_handle or 'nao informado'}'. "
            f"Referencia inicial: '{link_ref or 'nao informada'}'. "
            "Busque sinais de paleta, linguagem fotografica, ambiente, enquadramento, "
            "tom de voz, elementos que geram confianca e o que deve ser evitado. "
            "Se houver uma imagem de referencia, use a ferramenta de analise visual nela."
        ),
        expected_output=(
            "JSON com as chaves: brand_visual_dna, trust_elements, tone_notes, "
            "visual_do, visual_dont, reference_urls."
        ),
        agent=agent,
        context=context,
    )


def build_referencias_produto_task(agent, produto: str, context: list) -> Task:
    lowered = produto.lower()
    is_eyewear = any(token in lowered for token in ["oculos", "óculos", "eyewear", "glasses", "sunglasses", "spy 45", "twist"])
    category_hint = (
        "O produto parece ser eyewear/oculos. Priorize cenas onde o produto continua protagonista, "
        "sem deformar a armação, sem inserir pessoas sem contexto e sem esconder logo/lentes. "
        "Cenas de superficie, editorial realista, close de produto e lifestyle coerente sao preferiveis. "
        if is_eyewear
        else ""
    )
    return Task(
        description=(
            f"Agora faca uma curadoria de referencias para o produto '{produto}' focando em "
            f"{category_hint}"
            "cenas humanizadas e estilos de anuncio que parecam UGC ou criacao social real. "
            "Se existir link de produto ou e-commerce no contexto, use obrigatoriamente a ferramenta "
            "extract_product_assets para baixar a imagem crua real do produto e use essa referencia como fonte principal. "
            "Procure referencias de pessoa segurando o produto, demonstracao casual, "
            "superficies simples do cotidiano e composicoes que transmitam autenticidade. "
            "Evite linguagem futuristica, mockup artificial, rosto de personagem, beleza plastificada "
            "ou vibe excessivamente premium fria."
        ),
        expected_output=(
            "JSON com as chaves: preferred_presentation_style, shoot_scenarios, "
            "ugc_prompt_cues, negative_visual_cues, reference_urls, "
            "primary_product_image_path, primary_product_image_url."
        ),
        agent=agent,
        context=context,
    )


def build_direcao_criativa_task(agent, context: list, extra_context: str = "") -> Task:
    briefing_hint = f"\n\nDiretrizes visuais pré-definidas (aplique obrigatoriamente):\n{extra_context}" if extra_context else ""
    return Task(
        description=(
            "Transforme toda a pesquisa em uma direcao criativa pronta para geracao de imagem e layout. "
            "Defina o melhor font pairing, uma accent color, o estilo visual principal, "
            "um scene_prompt objetivo, um negative_prompt, e notas de composicao para o anuncio. "
            "A direcao precisa priorizar um resultado realista, humano, crivel, estilo UGC/premium-real, "
            "e nao uma imagem futuristica. Se houver uma imagem crua real do produto no contexto, "
            "trate isso como item obrigatorio a ser preservado visualmente. "
            "Se o produto for eyewear/oculos, priorize produto hero, close realista, superficie ou editorial coerente, "
            "espaco limpo para copy e proibicao de pessoas desconexas no fundo."
            f"{briefing_hint}"
        ),
        expected_output=(
            "JSON com as chaves: primary_font, secondary_font, accent_color, visual_style, "
            "presentation_style, scene_prompt, negative_prompt, composition_notes, "
            "must_preserve_product_reference."
        ),
        agent=agent,
        context=context,
    )


def build_copy_task(agent, context: list, extra_context: str = "") -> Task:
    briefing_hint = f"\n\nDiretrizes de copy pré-definidas (aplique obrigatoriamente):\n{extra_context}" if extra_context else ""
    return Task(
        description=(
            "Crie a copy final do anuncio com base na pesquisa, dores, desejos e direcao visual. "
            "O texto precisa parecer anuncio de performance para feed. "
            "Headline com no maximo 5 palavras, subheadline curta e CTA simples. "
            f"Use clareza e beneficio concreto, sem frases genericas.{briefing_hint}"
        ),
        expected_output=(
            "JSON com as chaves: headline, subheadline, cta, angle, proof_point."
        ),
        agent=agent,
        context=context,
    )


def build_copy_correction_task(agent, qa_feedback: dict, context: list) -> Task:
    return Task(
        description=(
            "O anuncio foi reprovado no controle de qualidade. "
            f"Feedback do QA: {qa_feedback}. "
            "Revise apenas a copy para corrigir clareza, hierarquia, plausibilidade, excesso de texto, "
            "falta de aderencia ao visual ou qualquer problema de titulo, subtitulo e CTA. "
            "Headline com no maximo 5 palavras, subheadline curta e CTA simples."
        ),
        expected_output="JSON com as chaves: headline, subheadline, cta, angle, proof_point.",
        agent=agent,
        context=context,
    )


def build_quality_audit_task(
    agent,
    *,
    final_ad_path: str,
    background_path: str,
    reference_product_path: str,
    headline: str,
    subheadline: str,
    cta: str,
    brand_name: str,
    product_name: str,
) -> Task:
    return Task(
        description=(
            "Faça a auditoria visual da imagem limpa usando obrigatoriamente a ferramenta "
            f"ad_quality_audit com final_ad_path='{final_ad_path}', "
            f"background_path='{background_path}', reference_product_path='{reference_product_path}', "
            f"headline='{headline}', subheadline='{subheadline}', cta='{cta}', "
            f"brand_name='{brand_name}', product_name='{product_name}'. "
            "ATENÇÃO: a imagem final é limpa, sem nenhum texto aplicado. "
            "Avalie exclusivamente critérios visuais da imagem: "
            "realismo fotográfico, integridade do produto (forma, proporção, geometria), "
            "coerência do fundo, iluminação, sombra/grounding, escala, "
            "ausência de artefatos, ausência de texto gerado na imagem, "
            "ausência de elementos aleatórios no fundo. "
            "NÃO reprove por: tipografia, posicionamento de logo, CTA, badge ou alinhamento de texto — "
            "esses elementos não existem na imagem. "
            "A copy (headline, subheadline, cta) deve ser avaliada separadamente no campo copy_review. "
            "Seja rigoroso nos critérios de imagem."
        ),
        expected_output=(
            "JSON com as chaves: approved, score, summary, issues, copy_review, recommended_actions."
        ),
        agent=agent,
    )
