// netlify/functions/generate-content.js
//
// Gera copy real (LinkedIn + Instagram) usando a API da Anthropic,
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

  const { type, theme, client } = payload;
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

  const prompt = `Você é o redator de conteúdo da Todo Canto Turismo, uma agência de viagens que faz assessoria de viagem, roteiro personalizado e organização de grupo. Tom de voz: caloroso, próximo, gera vontade de viajar — mas sem exagero nem clichê de "sonho realizado" repetido à exaustão. A frase de marca da agência é "o mundo é grande demais pra ficar só nos planos".

Escreva um post do tipo "${typeLabel}", baseado neste tema/fato central fornecido pelo usuário: "${theme.trim()}"${client ? ` (destino ou cliente relacionado: ${client})` : ''}.

Importante: reescreva e desenvolva a ideia com suas próprias palavras — não apenas repita o texto do tema literalmente. Transforme-o em um post pronto, bem escrito, seguindo a estrutura do tipo escolhido.

Gere DOIS textos:
1. "linkedin": mais longo (6 a 12 linhas), tom levemente mais institucional mas ainda caloroso, com quebras de linha entre parágrafos curtos, terminando com 4 a 5 hashtags relevantes em português.
2. "instagram": mais curto (3 a 6 linhas), tom mais pessoal e envolvente, pode usar 1 a 2 emojis com moderação, terminando com uma linha "." "." "." e depois 5 a 6 hashtags.

Responda SOMENTE com um JSON válido, sem markdown, sem crases, sem texto antes ou depois, exatamente neste formato:
{"linkedin": "texto aqui", "instagram": "texto aqui"}`;

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
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Erro da API Anthropic:', resp.status, errText);
      return { statusCode: resp.status, body: JSON.stringify({ error: 'Erro na API da Anthropic: ' + errText }) };
    }

    const data = await resp.json();
    const raw = (data.content && data.content[0] && data.content[0].text) || '';
    console.log('Resposta bruta da IA:', raw);

    let clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) clean = match[0];

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error('Falha ao interpretar JSON. Texto recebido:', clean);
      return { statusCode: 500, body: JSON.stringify({ error: 'Não consegui interpretar a resposta da IA.', raw: clean }) };
    }

    if (!parsed.linkedin || !parsed.instagram) {
      console.error('JSON incompleto:', parsed);
      return { statusCode: 500, body: JSON.stringify({ error: 'Resposta da IA veio incompleta.', raw: parsed }) };
    }

    console.log('Sucesso! Copy gerada.');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    console.error('Erro inesperado na function:', err);
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
