// Director — the AI brain of the living canvas.
//   • openWorld / narrateBeat  → Gemini Flash (structured JSON): identity + evolution beats
//   • paintScene / evolveScene → Nano Banana (Gemini Flash Image): the actual frames
//
// SECURITY: calls Gemini directly from the browser with the Vite env key. Fine for
// a hackathon demo; proxy it for production so the key stays secret.

import {
  createScenePrompt, evolveScenePrompt,
  OPEN_SCHEMA, OPEN_SYSTEM, buildOpenTurn,
  BEAT_SCHEMA, BEAT_SYSTEM, buildBeatTurn,
} from './prompts.js';

const KEY = import.meta.env.VITE_GEMINI_API_KEY;
const TEXT_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-flash-latest';
const IMAGE_MODEL = import.meta.env.VITE_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const base = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${KEY}`;

export class Director {
  get ready() { return Boolean(KEY); }

  /* ---------------- text (structured JSON) ---------------- */
  async _json(system, userTurn, schema) {
    const res = await fetch(base(TEXT_MODEL), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: userTurn }] }],
        generationConfig: { temperature: 1.0, responseMimeType: 'application/json', responseSchema: schema },
      }),
    });
    if (!res.ok) throw new Error(`Text ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ?? '{}';
    return JSON.parse(text);
  }

  openWorld(phrase) { return this._json(OPEN_SYSTEM, buildOpenTurn(phrase), OPEN_SCHEMA); }
  narrateBeat(state, userCommand) { return this._json(BEAT_SYSTEM, buildBeatTurn(state, userCommand), BEAT_SCHEMA); }

  /* ---------------- images (Nano Banana) ---------------- */
  // Returns a data: URL, or null on failure.
  async _image(parts) {
    const res = await fetch(base(IMAGE_MODEL), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE'] } }),
    });
    if (!res.ok) throw new Error(`Image ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const img = (data?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
    if (!img) return null;
    return `data:${img.inlineData.mimeType || 'image/png'};base64,${img.inlineData.data}`;
  }

  paintScene(phrase) {
    return this._image([{ text: createScenePrompt(phrase) }]);
  }

  // Evolve the current frame (a data: URL) with an instruction — keeps continuity.
  evolveScene(currentDataUrl, instruction) {
    const [meta, b64] = splitDataUrl(currentDataUrl);
    return this._image([
      { inline_data: { mime_type: meta, data: b64 } },
      { text: evolveScenePrompt(instruction) },
    ]);
  }
}

function splitDataUrl(url) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(url || '');
  return m ? [m[1], m[2]] : ['image/png', ''];
}
