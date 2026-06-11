// reflectie.js — BIJGEWERKTE VERSIE (vervangt het huidige bestand)
// Nieuw: vereist een geldig toegangsbewijs (uitgegeven door betaling-check.js)
// vóór de Anthropic API wordt aangeroepen. Zonder geldig bewijs: 402 Payment Required.
// Vereiste environment variables: ANTHROPIC_API_KEY, TOKEN_SECRET

const crypto = require('crypto');

function verifieerToken(token) {
  if (!token || typeof token !== 'string') return null;
  const delen = token.split('.');
  if (delen.length !== 3) return null;
  const [product, exp, handtekening] = delen;
  const verwacht = crypto
    .createHmac('sha256', process.env.TOKEN_SECRET)
    .update(`${product}.${exp}`)
    .digest('hex');
  const a = Buffer.from(handtekening);
  const b = Buffer.from(verwacht);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Date.now() > Number(exp)) return null;
  return { product, exp: Number(exp) };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prompt, toegang } = JSON.parse(event.body);

    // Betaalmuur: alleen met geldig toegangsbewijs door
    const bewijs = verifieerToken(toegang);
    if (!bewijs || (bewijs.product !== 'reflectie' && bewijs.product !== 'blueprint')) {
      return {
        statusCode: 402,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Geen geldige toegang. Rond eerst de betaling af.' })
      };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      // Echte Anthropic-fout doorgeven en loggen, niet verstoppen achter status 200
      console.error('Anthropic API fout:', response.status, JSON.stringify(data));
      return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
