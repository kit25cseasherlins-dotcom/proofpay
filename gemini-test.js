require('dotenv').config();

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL;
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function main() {
  if (!KEY) return console.log('GEMINI_API_KEY is missing in .env');

  if (!MODEL) {
    const res = await fetch(`${BASE}/models?pageSize=100`, {
      headers: { 'x-goog-api-key': KEY },
    });
    const data = await res.json();
    console.log('STATUS:', res.status);
    if (!res.ok) return console.log(JSON.stringify(data, null, 2));
    (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .forEach((m) => console.log(m.name.replace('models/', '')));
    console.log('Pick a "flash" model from the list and put it in GEMINI_MODEL in .env');
    return;
  }

  const res = await fetch(`${BASE}/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Say hello in Tamil in one short sentence.' }] }],
    }),
  });
  const data = await res.json();
  console.log('STATUS:', res.status);
  console.log(
    data.candidates?.[0]?.content?.parts?.[0]?.text ||
      JSON.stringify(data, null, 2)
  );
}

main();