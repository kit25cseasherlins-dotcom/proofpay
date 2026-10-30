require('dotenv').config();

const BASE = 'https://api-m.sandbox.paypal.com';

async function getToken() {
  const auth = Buffer.from(
    process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_CLIENT_SECRET
  ).toString('base64');
  const res = await fetch(BASE + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  return (await res.json()).access_token;
}

async function createOrder() {
  const token = await getToken();
  const res = await fetch(BASE + '/v2/checkout/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: 'USD', value: '10.00' } }],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: 'https://example.com/success',
            cancel_url: 'https://example.com/cancel',
            user_action: 'PAY_NOW',
          },
        },
      },
    }),
  });
  const data = await res.json();
  console.log('ORDER ID:', data.id);
  console.log('Status:', data.status);
  console.log('Links:', data.links);
}
createOrder();