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

async function main() {
  const token = await getToken();
  const headers = {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
  };

  const listRes = await fetch(BASE + '/v1/customer/disputes', { headers });
  const list = await listRes.json();
  console.log('LIST STATUS:', listRes.status);
  console.log(JSON.stringify(list, null, 2));

  const first = list.items && list.items[0];
  if (!first) {
    console.log('No disputes found yet. Wait a few minutes and run again.');
    return;
  }

  const detailRes = await fetch(
    BASE + '/v1/customer/disputes/' + first.dispute_id,
    { headers }
  );
  const detail = await detailRes.json();
  console.log('DETAIL STATUS:', detailRes.status);
  console.log(
    JSON.stringify(
      {
        id: detail.dispute_id,
        status: detail.status,
        reason: detail.reason,
        stage: detail.dispute_life_cycle_stage,
        amount: detail.dispute_amount,
        sellerResponseDue: detail.seller_response_due_date,
        availableActions: (detail.links || []).map((l) => l.rel),
      },
      null,
      2
    )
  );
}

main();