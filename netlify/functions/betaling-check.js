// betaling-check.js
// Controleert bij Mollie of een betaling is afgerond en geeft dan een
// ondertekend toegangsbewijs uit (24 uur geldig).
// Vereiste environment variables in Netlify: MOLLIE_API_KEY, TOKEN_SECRET

const crypto = require('crypto');

const GELDIGHEID_MS = 24 * 60 * 60 * 1000; // 24 uur

function maakToken(product) {
  const exp = Date.now() + GELDIGHEID_MS;
  const handtekening = crypto
    .createHmac('sha256', process.env.TOKEN_SECRET)
    .update(`${product}.${exp}`)
    .digest('hex');
  return `${product}.${exp}.${handtekening}`;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { paymentId } = JSON.parse(event.body || '{}');
    if (!paymentId || !/^tr_[A-Za-z0-9]+$/.test(paymentId)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Ongeldig betalings-ID' }) };
    }

    const response = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MOLLIE_API_KEY}` }
    });

    const betaling = await response.json();

    if (!response.ok) {
      console.error('Mollie fout:', betaling);
      return { statusCode: 502, body: JSON.stringify({ error: 'Betaling ophalen mislukt' }) };
    }

    if (betaling.status !== 'paid') {
      // open, canceled, expired of failed: geen toegang
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: betaling.status, toegang: false })
      };
    }

    const product = betaling.metadata && betaling.metadata.product;
    if (!product) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Product onbekend bij betaling' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'paid',
        toegang: true,
        product,
        token: maakToken(product)
      })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Er ging iets mis' }) };
  }
};
