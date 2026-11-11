const crypto = require('crypto');

const BASE = 'https://api-m.sandbox.paypal.com';
let cached = { token: null, expiresAt: 0 };

async function getToken() {
  if (cached.token && Date.now() < cached.expiresAt) return cached.token;
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error('PayPal auth failed');
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cached.token;
}

async function paypal(pathname, { method = 'GET', body } = {}) {
  const token = await getToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (method === 'POST') headers['PayPal-Request-Id'] = crypto.randomUUID();
  const res = await fetch(BASE + pathname, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const issue = data.details?.[0]?.issue || data.message || text.slice(0, 200);
    const err = new Error(`PayPal ${res.status}: ${issue}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function listDisputes() {
  const data = await paypal('/v1/customer/disputes');
  return data.items || [];
}

function getDispute(id) {
  return paypal(`/v1/customer/disputes/${encodeURIComponent(id)}`);
}

// what PayPal currently allows for this dispute (from the HATEOAS links)
function actionsOf(dispute) {
  return (dispute.links || []).map((l) => l.rel);
}

function provideEvidence(id, { carrier, trackingNumber, notes }) {
  return paypal(`/v1/customer/disputes/${encodeURIComponent(id)}/provide-evidence`, {
    method: 'POST',
    body: {
      evidences: [
        {
          evidence_type: 'PROOF_OF_FULFILLMENT',
          evidence_info: {
            tracking_info: [{ carrier_name: carrier, tracking_number: trackingNumber }],
          },
          notes,
        },
      ],
    },
  });
}

function acceptClaim(id, note) {
  return paypal(`/v1/customer/disputes/${encodeURIComponent(id)}/accept-claim`, {
    method: 'POST',
    body: { note },
  });
}

module.exports = { listDisputes, getDispute, actionsOf, provideEvidence, acceptClaim };