// netlify/functions/gerar-orcamento.js
//
// Lê informações soltas (prints transcritos, preços, datas, endereços, conversas)
// e monta o conteúdo de uma proposta no padrão Todo Canto Turismo.
// A chave fica só aqui no servidor (ANTHROPIC_API_KEY — a mesma já usada no site).

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY não configurada no Netlify.' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Corpo da requisição inválido.' }) }; }

  const info = (payload.info || '').trim();
  const destino = (payload.destino || '').trim();
  const cliente = (payload.cliente || '').trim();
  if (!info) { return { statusCode: 400, body: JSON.stringify({ error: 'Informações não enviadas.' }) }; }

  const vozMarca = `Você é um consultor de viagens experiente da Todo Canto Turismo, uma agência que faz assessoria de viagem, roteiro personalizado e organização de grupos, pra viajantes 40+. Tom de voz: caloroso, próximo, acolhedor, que gera vontade de viajar — sem exagero nem clichê repetido de "sonho realizado". A frase da marca é "você sonha, a gente cria o caminho".`;

  const prompt = `${vozMarca}

Vou te passar INFORMAÇÕES SOLTAS que o consultor juntou sobre uma viagem — pode ser bagunçado: trechos de conversa de WhatsApp, preços, horários, datas, endereços, nomes de hotéis, voos, passeios, tudo misturado e fora de ordem.

Sua tarefa é LER tudo isso e montar o conteúdo de uma proposta de viagem profissional, no tom da Todo Canto, organizando as informações.

${destino ? `Destino principal: ${destino}\n` : ''}${cliente ? `Cliente: ${cliente}\n` : ''}
INFORMAÇÕES SOLTAS:
"""
${info}
"""

REGRAS IMPORTANTES:
- NÃO invente preços, datas, horários ou nomes que não estejam nas informações. Use só o que foi dado.
- Se uma informação não foi dada, deixe o campo mais genérico ou vazio, não invente.
- O roteiro deve ser organizado em dias (Dia 1, Dia 2...) SE as informações permitirem; senão, descreva de forma corrida.
- As inclusões devem listar o que está incluso conforme as informações (aéreo, hospedagem, passeios, transfers, etc.), uma por linha.
- Escreva em português do Brasil, de forma calorosa mas profissional.
- Preencha os itens estruturados (memoria, hoteis, voos) com o que as informações trouxerem, nos formatos pedidos. Valores sempre em número puro (2500.00), sem "R$" nem pontos de milhar.
- Datas sempre no formato AAAA-MM-DD.
- QUALQUER informação relevante que não couber nos campos estruturados, coloque em "observacoes" — não perca nada.

Use a ferramenta "montar_proposta" para entregar o resultado.`;

  const tool = {
    name: 'montar_proposta',
    description: 'Entrega o conteúdo da proposta de viagem organizado e os itens estruturados.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Título da capa, curto e convidativo. Ex: "Sua viagem dos sonhos pela Europa".' },
        subtitulo: { type: 'string', description: 'Subtítulo da capa, uma linha. Ex: datas e destino resumidos.' },
        apresentacao: { type: 'string', description: 'Mensagem calorosa de boas-vindas ao cliente, 2-4 linhas, personalizada pra viagem.' },
        descricao_destino: { type: 'string', description: 'Parágrafo que apresenta o destino e o que o torna especial.' },
        roteiro: { type: 'string', description: 'Roteiro da viagem, organizado em dias (Dia 1, Dia 2...) quando possível, com quebras de linha.' },
        inclusoes: { type: 'string', description: 'O que está incluso, um item por linha.' },
        observacoes: { type: 'string', description: 'Observações úteis e QUALQUER informação que não coube nos campos estruturados (não perca nada). Vazio se não houver.' },
        memoria: {
          type: 'array',
          description: 'Linhas da memória de cálculo: cada item com seu valor TOTAL. Inclua TODOS os valores identificados (aéreo, hospedagem, passeios, transfers, seguro, etc.). NÃO some o total geral.',
          items: {
            type: 'object',
            properties: {
              desc: { type: 'string', description: 'Descrição do item. Ex: "Aéreo TAP", "Hospedagem Hotel X", "City tour".' },
              valor: { type: 'number', description: 'Valor TOTAL deste item em número puro (ex: 2500.00). Se o valor era por pessoa e você souber o número de pessoas, multiplique; se não souber, use o valor como está e explique em observacoes.' },
              parcelas: { type: 'number', description: 'Número de parcelas se mencionado, senão 1.' }
            },
            required: ['desc', 'valor']
          }
        },
        hoteis: {
          type: 'array',
          description: 'Hotéis identificados, com os dados que aparecerem. Deixe vazio o que não souber.',
          items: {
            type: 'object',
            properties: {
              nome: { type: 'string', description: 'Nome do hotel.' },
              checkin: { type: 'string', description: 'Check-in em AAAA-MM-DD, se houver.' },
              checkout: { type: 'string', description: 'Check-out em AAAA-MM-DD, se houver.' },
              tipo_quarto: { type: 'string', description: 'Tipo de quarto (Duplo, Triplo...), se mencionado.' },
              diaria: { type: 'number', description: 'Diária do quarto em número, se mencionado. Senão 0.' },
              ocupacao: { type: 'number', description: 'Pessoas no quarto, se mencionado. Senão 2.' }
            },
            required: ['nome']
          }
        },
        voos: {
          type: 'array',
          description: 'Voos identificados. Deixe vazio o que não souber.',
          items: {
            type: 'object',
            properties: {
              companhia: { type: 'string', description: 'Companhia aérea.' },
              origem: { type: 'string', description: 'Origem da ida, se houver.' },
              destino: { type: 'string', description: 'Destino da ida, se houver.' },
              valor: { type: 'number', description: 'Valor por adulto em número, se mencionado. Senão 0.' },
              bagagem: { type: 'string', description: 'Info de bagagem, se mencionada.' }
            },
            required: ['companhia']
          }
        }
      },
      required: ['titulo', 'apresentacao', 'descricao_destino', 'roteiro', 'inclusoes', 'memoria']
    }
  };

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 3000,
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
      return { statusCode: 500, body: JSON.stringify({ error: 'Resposta da IA veio incompleta.', raw: data }) };
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toolUse.input) };
  } catch (err) {
    console.error('Erro inesperado na function:', err);
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
