// netlify/functions/generate-content.js
//
// Gera conteúdo real (Instagram ou Roteiro de vídeo) usando a API da Anthropic,
// com a voz da Todo Canto Turismo.
// A chave fica só aqui no servidor (variável de ambiente ANTHROPIC_API_KEY).
//
// Configuração necessária no Netlify:
// Site settings → Environment variables → adicionar ANTHROPIC_API_KEY

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY não configurada no Netlify.' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Corpo da requisição inválido.' }) };
  }

  const { type, theme, client, format } = payload;
  if (!theme || !theme.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Tema não informado.' }) };
  }

  const typeLabels = {
    case: 'case de viagem — prova social, uma viagem real que a agência organizou',
    dica: 'dica de viagem — mostra autoridade, ensina algo útil pra quem vai viajar',
    bastidores: 'bastidores — humaniza a marca, mostra o processo real de organizar viagem',
    promocao: 'promoção ou pacote — chamada direta pra ação/venda',
    posicionamento: 'frase de posicionamento — curta, de impacto, expressa a visão da agência'
  };
  const typeLabel = typeLabels[type] || type;
  const isRoteiro = format === 'roteiro';

  const vozMarca = `Você é o redator de conteúdo da Todo Canto Turismo, uma agência de viagens que faz assessoria de viagem, roteiro personalizado e organização de grupo. Tom de voz: caloroso, próximo, gera vontade de viajar — mas sem exagero nem clichê de "sonho realizado" repetido à exaustão. A frase de marca da agência é "o mundo é grande demais pra ficar só nos planos".`;

  let prompt, tool;

  if (isRoteiro) {
    prompt = `${vozMarca}

Escreva um ROTEIRO DE VÍDEO curto (tipo Reels/Stories, 15 a 25 segundos) do tipo "${typeLabel}", baseado neste tema/fato central: "${theme.trim()}"${client ? ` (destino ou cliente relacionado: ${client})` : ''}.

Importante: reescreva e desenvolva a ideia com suas próprias palavras — não repita o tema literalmente.

O roteiro deve ter, em texto corrido com quebras de linha:
- HOOK (0-3s): o que dizer/mostrar nos primeiros segundos pra prender atenção
- 2 a 3 CENAS: cada uma com "Visual:" (sugestão do que filmar/mostrar) e "Fala/texto na tela:" (o que dizer ou escrever)
- CTA FINAL: visual + fala de encerramento chamando pra ação

Formate com títulos em maiúsculo tipo "HOOK (0-3s)", "CENA 1 (3-8s)" etc, cada seção separada por linha em branco.

Gere também uma legenda curta (3 a 5 linhas) pra acompanhar o vídeo no Instagram, terminando com uma linha "." "." "." e depois 5 a 6 hashtags relevantes em português.

Use a ferramenta "gerar_roteiro" para entregar o resultado final.`;

    tool = {
      name: 'gerar_roteiro',
      description: 'Entrega o roteiro de vídeo e a legenda sugerida.',
      input_schema: {
        type: 'object',
        properties: {
          roteiro: { type: 'string', description: 'Roteiro completo do vídeo, com hook, cenas e CTA final, formatado com quebras de linha.' },
          legenda: { type: 'string', description: 'Legenda curta para acompanhar o vídeo no Instagram, com hashtags no final.' }
        },
        required: ['roteiro', 'legenda']
      }
    };
  } else {
    prompt = `${vozMarca}

Escreva uma legenda de Instagram do tipo "${typeLabel}", baseada neste tema/fato central: "${theme.trim()}"${client ? ` (destino ou cliente relacionado: ${client})` : ''}.

Importante: reescreva e desenvolva a ideia com suas próprias palavras — não apenas repita o texto do tema literalmente.

A legenda deve ter de 3 a 6 linhas, tom pessoal e envolvente, podendo usar 1 a 2 emojis com moderação, terminando com uma linha "." "." "." e depois 5 a 6 hashtags relevantes em português.

Use a ferramenta "gerar_legenda" para entregar o resultado final.`;

    tool = {
      name: 'gerar_legenda',
      description: 'Entrega a legenda final para o post do Instagram.',
      input_schema: {
        type: 'object',
        properties: {
          instagram: { type: 'string', description: 'Texto completo da legenda para o Instagram, com quebras de linha entre parágrafos.' },
          destaque: { type: 'string', description: 'Um resumo bem curto (máximo 15 palavras), tipo manchete de impacto, capturando a essência do post. Vai ser usado como destaque grande numa imagem — não é a legenda inteira, é só a frase mais forte.' }
        },
        required: ['instagram', 'destaque']
      }
    };
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1400,
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Erro da API Anthropic:', resp.status, errText);
      return { statusCode: resp.status, body: JSON.stringify({ error: 'Erro na API da Anthropic: ' + errText }) };
    }

    const data = await resp.json();
    const toolUse = (data.content || []).find(b => b.type === 'tool_use');

    if (!toolUse || !toolUse.input) {
      console.error('Resposta sem tool_use válido:', JSON.stringify(data));
      return { statusCode: 500, body: JSON.stringify({ error: 'Resposta da IA veio incompleta.', raw: data }) };
    }

    const result = isRoteiro
      ? { roteiro: toolUse.input.roteiro, legenda: toolUse.input.legenda }
      : { instagram: toolUse.input.instagram, destaque: toolUse.input.destaque };

    if (Object.values(result).some(v => !v)) {
      console.error('Campos faltando na resposta:', toolUse.input);
      return { statusCode: 500, body: JSON.stringify({ error: 'Resposta da IA veio incompleta.', raw: toolUse.input }) };
    }

    console.log('Sucesso! Conteúdo gerado.');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  } catch (err) {
    console.error('Erro inesperado na function:', err);
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
