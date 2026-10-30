require('dotenv').config();

const BASE = 'https://api-m.sandbox.paypal.com';
const ORDER_ID = process.argv[2];

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

async function capture() {
  const token = await getToken();
  const res = await fetch(`${BASE}/v2/checkout/orders/${ORDER_ID}/capture`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
  });
  console.log(JSON.stringify(await res.json(), null, 2));
}
capture();