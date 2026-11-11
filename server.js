require('dotenv').config();
const express = require('express');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  listDisputes,
  getDispute,
  actionsOf,
  provideEvidence,
  acceptClaim,
} = require('./paypal-disputes');
const { draftEvidencePack } = require('./evidence-pack');

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const PAYPAL_API = 'https://api-m.sandbox.paypal.com';
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'bills.json');
const DISPUTES_FILE = path.join(DATA_DIR, 'disputes.json');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- tiny JSON "database" ----------
function loadBills() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return [];
  }
}
function saveBills(bills) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(bills, null, 2));
}
function loadExtras() {
  try {
    return JSON.parse(fs.readFileSync(DISPUTES_FILE, 'utf8'));
  } catch {
    return {};
  }
}
function saveExtras(extras) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DISPUTES_FILE, JSON.stringify(extras, null, 2));
}

// ---------- PayPal Orders helpers ----------
async function getAccessToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error('PayPal auth failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function createPayPalOrder(bill) {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: bill.id,
          description: bill.note || `Bill for ${bill.customer}`,
          amount: { currency_code: 'USD', value: bill.amount.toFixed(2) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: `${BASE_URL}/paypal/return?bill=${bill.id}`,
            cancel_url: `${BASE_URL}/paypal/cancel?bill=${bill.id}`,
            user_action: 'PAY_NOW',
          },
        },
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Create order failed: ' + JSON.stringify(data));
  const link = data.links.find((l) => l.rel === 'payer-action');
  return { orderId: data.id, payUrl: link.href };
}

async function capturePayPalOrder(orderId) {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return res.json();
}

// ---------- Bills API ----------
app.post('/api/bills', async (req, res) => {
  const customer = String(req.body.customer || '').trim().slice(0, 80);
  const note = String(req.body.note || '').trim().slice(0, 200);
  const amount = Math.round(Number(req.body.amount) * 100) / 100;

  if (!customer || !Number.isFinite(amount) || amount <= 0 || amount > 10000) {
    return res.status(400).json({ error: 'Customer name and a valid amount are required' });
  }

  const bill = {
    id: crypto.randomBytes(4).toString('hex'),
    customer,
    amount,
    note,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  try {
    const { orderId, payUrl } = await createPayPalOrder(bill);
    bill.orderId = orderId;
    bill.payUrl = payUrl;
    bill.qr = await QRCode.toDataURL(payUrl);
    const bills = loadBills();
    bills.unshift(bill);
    saveBills(bills);
    res.json(bill);
  } catch (e) {
    console.error(e.message);
    res.status(502).json({ error: 'Could not create PayPal order' });
  }
});

app.get('/api/bills', (req, res) => {
  res.json(loadBills());
});

// PayPal sends the customer back here after they approve the payment
app.get('/paypal/return', async (req, res) => {
  const bills = loadBills();
  const bill = bills.find((b) => b.id === req.query.bill);
  if (!bill) return res.redirect('/?error=notfound');

  try {
    if (bill.status !== 'PAID') {
      const result = await capturePayPalOrder(bill.orderId);
      if (result.status === 'COMPLETED') {
        bill.status = 'PAID';
        bill.paidAt = new Date().toISOString();
        bill.captureId = result.purchase_units?.[0]?.payments?.captures?.[0]?.id;
        saveBills(bills);
      } else {
        console.error('Capture not completed:', JSON.stringify(result));
        return res.redirect('/?error=capture');
      }
    }
    res.redirect(`/?paid=${bill.id}`);
  } catch (e) {
    console.error(e.message);
    res.redirect('/?error=capture');
  }
});

app.get('/paypal/cancel', (req, res) => {
  res.redirect('/?cancelled=1');
});

// ---------- Disputes ----------
const CARRIERS = ['FEDEX', 'UPS', 'USPS'];
const DISPUTE_ID = /^[A-Za-z0-9-]{3,60}$/;

function findBill(d) {
  const bills = loadBills();
  const txId = d.disputed_transactions?.[0]?.buyer_transaction_id;
  const amount = Number(d.dispute_amount?.value);
  let bill = bills.find((b) => b.captureId && b.captureId === txId);
  if (bill) return { bill, matchedBy: 'transaction ID' };
  bill = bills.find((b) => b.status === 'PAID' && b.amount === amount);
  if (bill) return { bill, matchedBy: 'amount' };
  return { bill: null, matchedBy: null };
}

function cleanNotes(body) {
  const carrier = String(body.carrier || '').toUpperCase();
  const trackingNumber = String(body.trackingNumber || '').trim();
  const deliveryNote = String(body.deliveryNote || '').trim().slice(0, 500);
  return {
    carrier: CARRIERS.includes(carrier) ? carrier : '',
    trackingNumber: /^[A-Za-z0-9-]{5,40}$/.test(trackingNumber) ? trackingNumber : '',
    deliveryNote,
  };
}

app.get('/api/disputes', async (req, res) => {
  try {
    const list = await listDisputes();
    const details = await Promise.all(
      list.slice(0, 10).map((i) => getDispute(i.dispute_id))
    );
    const extras = loadExtras();
    res.json(
      details.map((d) => {
        const { bill, matchedBy } = findBill(d);
        const saved = extras[d.dispute_id] || {};
        return {
          id: d.dispute_id,
          reason: d.reason,
          status: d.status,
          stage: d.dispute_life_cycle_stage,
          amount: d.dispute_amount,
          dueDate: d.seller_response_due_date || null,
          actions: actionsOf(d),
          bill: bill
            ? { id: bill.id, customer: bill.customer, amount: bill.amount, note: bill.note, matchedBy }
            : null,
          sellerNotes: saved.sellerNotes || null,
          pack: saved.pack || null,
          resolution: saved.resolution || null,
        };
      })
    );
  } catch (e) {
    console.error(e.message);
    res.status(502).json({ error: 'Could not load disputes from PayPal' });
  }
});

app.post('/api/disputes/:id/draft', async (req, res) => {
  const id = req.params.id;
  if (!DISPUTE_ID.test(id)) return res.status(400).json({ error: 'Bad dispute id' });
  try {
    const d = await getDispute(id);
    const { bill, matchedBy } = findBill(d);
    const sellerNotes = cleanNotes(req.body);
    const buyerNote =
      (d.evidences || []).find((e) => e.evidence_type === 'CREATE')?.notes || '';
    const pack = await draftEvidencePack({
      dispute: {
        id,
        reason: d.reason,
        stage: d.dispute_life_cycle_stage,
        amount: d.dispute_amount,
        buyerNote,
      },
      bill: bill
        ? {
            id: bill.id,
            customer: bill.customer,
            amount: bill.amount,
            note: bill.note,
            status: bill.status,
            createdAt: bill.createdAt,
            paidAt: bill.paidAt,
            matchedBy,
          }
        : null,
      sellerNotes,
    });
    const extras = loadExtras();
    extras[id] = { ...(extras[id] || {}), sellerNotes, pack };
    saveExtras(extras);
    res.json({ sellerNotes, pack });
  } catch (e) {
    console.error(e.message);
    res.status(502).json({ error: 'Could not draft the evidence pack. Please try again.' });
  }
});

app.post('/api/disputes/:id/approve', async (req, res) => {
  const id = req.params.id;
  if (!DISPUTE_ID.test(id)) return res.status(400).json({ error: 'Bad dispute id' });
  const action = req.body.action;
  const notes = String(req.body.notes || '').trim().slice(0, 2000);
  try {
    const d = await getDispute(id);
    const allowed = actionsOf(d);
    const extras = loadExtras();
    const saved = extras[id] || {};
    if (!saved.pack) {
      return res.status(409).json({ error: 'Draft the evidence pack and review it first' });
    }

    if (action === 'EVIDENCE') {
      if (!allowed.includes('provide_evidence')) {
        return res.status(409).json({ error: 'PayPal is not asking for evidence on this dispute right now' });
      }
      const n = saved.sellerNotes || {};
      if (!n.carrier || !n.trackingNumber) {
        return res.status(400).json({ error: 'Courier and tracking number are needed to send delivery proof' });
      }
      if (!notes) return res.status(400).json({ error: 'Add a short note for PayPal' });
      await provideEvidence(id, { carrier: n.carrier, trackingNumber: n.trackingNumber, notes });
    } else if (action === 'ACCEPT') {
      if (!allowed.includes('accept_claim')) {
        return res.status(409).json({ error: 'This claim cannot be accepted right now' });
      }
      await acceptClaim(id, notes || 'Seller accepts the claim.');
    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }

    extras[id] = { ...saved, resolution: { action, at: new Date().toISOString() } };
    saveExtras(extras);
    res.json({ ok: true });
  } catch (e) {
    console.error(e.message);
    res.status(502).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`ProofPay running at ${BASE_URL}`));