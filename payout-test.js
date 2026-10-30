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

async function sendPayout() {
  const token = await getToken();
  const res = await fetch(BASE + '/v1/payments/payouts', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: 'batch_' + Date.now(),
        email_subject: 'Test payout',
      },
      items: [
        {
          recipient_type: 'EMAIL',
          receiver: 'sb-yy4ch53625570@personal.example.com',
          amount: { value: '5.00', currency: 'USD' },
          note: 'Test payout',
          sender_item_id: 'item_1',
        },
      ],
    }),
  });
  console.log(JSON.stringify(await res.json(), null, 2));
}
sendPayout();