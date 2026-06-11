// betaling-start.js
// Maakt een Mollie-betaling aan voor de Reflectietool (€9) of Maslow Blueprint (€19 / €14 na Reflectietool).
// Vereiste environment variables in Netlify: MOLLIE_API_KEY, TOKEN_SECRET

const crypto = require('crypto');

const PRODUCTEN = {
  reflectie: {
    prijs: '9.00',
    omschrijving: 'B&B Mind Coaching - Reflectietool',
    pagina: '/reflectie-tool.html'
  },
  blueprint: {
    prijs: '19.00',
    prijsMetKorting: '14.00',
    omschrijving: 'B&B Mind Coaching - Maslow Blueprint',
    pagina: '/maslow-blueprint.html'
  }
};

// Controleert een toegangsbewijs: "product.vervaltijd.handtekening"
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
    const { product, kortingToken } = JSON.parse(event.body || '{}');
    const config = PRODUCTEN[product];
    if (!config) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Onbekend product' }) };
    }

    // Korting: Blueprint voor €14 als er een geldig Reflectietool-toegangsbewijs is
    let prijs = config.prijs;
    let metKorting = false;
    if (product === 'blueprint' && kortingToken) {
      const geldig = verifieerToken(kortingToken);
      if (geldig && geldig.product === 'reflectie') {
        prijs = config.prijsMetKorting;
        metKorting = true;
      }
    }

    const siteUrl = process.env.URL || 'https://bbmindcoaching.nl';

    const response = await fetch('https://api.mollie.com/v2/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.MOLLIE_API_KEY}`
      },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: prijs },
        description: config.omschrijving,
        redirectUrl: `${siteUrl}${config.pagina}?betaald=1`,
        metadata: { product, metKorting }
      })
    });

    const betaling = await response.json();

    if (!response.ok) {
      console.error('Mollie fout:', betaling);
      return { statusCode: 502, body: JSON.stringify({ error: 'Betaling aanmaken mislukt' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentId: betaling.id,
        checkoutUrl: betaling._links.checkout.href,
        prijs,
        metKorting
      })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Er ging iets mis' }) };
  }
};
