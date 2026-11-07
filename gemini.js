require('dotenv').config();

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function modelList() {
  return [process.env.GEMINI_MODEL, process.env.GEMINI_FALLBACK_MODEL].filter(Boolean);
}

async function generateText(prompt, { retries = 3 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is missing');
  const models = modelList();
  if (!models.length) throw new Error('GEMINI_MODEL is missing');

  let lastError;
  for (const model of models) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(`${BASE}/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        const data = await res.json();
        if (res.ok) {
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return text;
          lastError = new Error('Empty response from ' + model);
          break;
        }
        lastError = new Error(`${model}: ${res.status} ${data.error?.message || ''}`);
        // only overload / rate limit errors are worth retrying
        if (res.status !== 429 && res.status !== 503) break;
      } catch (e) {
        lastError = e; // network error, retry
      }
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastError;
}

module.exports = { generateText };