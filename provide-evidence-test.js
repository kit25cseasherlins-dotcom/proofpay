require('dotenv').config();

const BASE = 'https://api-m.sandbox.paypal.com';
const DISPUTE_ID = 'PP-R-FUD-10196938';

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

async function main() {
  const token = await getToken();
  const auth = { Authorization: 'Bearer ' + token };
  const url = `${BASE}/v1/customer/disputes/${DISPUTE_ID}`;

  // 1. What evidence does PayPal expect from the seller?
  const detailRes = await fetch(url, {
    headers: { ...auth, 'Content-Type': 'application/json' },
  });
  const detail = await detailRes.json();
  console.log('Status:', detail.status);
  console.log('Evidence requested:', JSON.stringify(detail.evidences, null, 2));

 const body = {
  evidences: [
    {
      evidence_type: 'PROOF_OF_FULFILLMENT',
      evidence_info: {
        tracking_info: [
          { carrier_name: 'FEDEX', tracking_number: 'TEST1234567890' },
        ],
      },
      notes:
        'Test evidence: order was delivered. Bill and PayPal payment record available.',
    },
  ],
};

  // 2. Try a JSON request first
  let res = await fetch(url + '/provide-evidence', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  console.log('JSON attempt:', res.status, await res.text());
  if (res.ok) return;

  // 3. Fallback: multipart with an "input" part
  const form = new FormData();
  form.append(
    'input',
    new Blob([JSON.stringify(body)], { type: 'application/json' }),
    'input.json'
  );
  res = await fetch(url + '/provide-evidence', {
    method: 'POST',
    headers: auth,
    body: form,
  });
  console.log('Multipart attempt:', res.status, await res.text());
}

main();