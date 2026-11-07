require('dotenv').config();
const { draftEvidencePack } = require('./evidence-pack');

const dispute = {
  id: 'PP-R-FUD-10196938',
  reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
  stage: 'INQUIRY',
  amount: { currency_code: 'USD', value: '5.00' },
  buyerNote: 'Testing dispute for hackathon.',
};

const bill = {
  id: 'a1b2c3d4',
  customer: 'Ravi',
  amount: 5,
  note: 'Rice and dal',
  status: 'PAID',
  createdAt: '2026-10-30T06:00:00Z',
  paidAt: '2026-10-30T06:05:00Z',
};

async function run(label, sellerNotes) {
  console.log('\n=== ' + label + ' ===');
  const pack = await draftEvidencePack({ dispute, bill, sellerNotes });
  console.log(JSON.stringify(pack, null, 2));
}

async function main() {
  await run('A: seller HAS delivery proof', {
    deliveryNote:
      'Items were handed over in person at the shop counter on Oct 30 right after payment.',
  });
  await run('B: seller has NO proof', {});
    await run('C: seller has courier tracking', {
    carrier: 'FEDEX',
    trackingNumber: 'TEST1234567890',
    deliveryNote: 'Parcel handed to the courier on Oct 30.',
  });
}

main().catch((e) => console.error('Error:', e.message));