// dypsi-proxy: https://script.google.com/macros/s/AKfycbzyehwozgIdxLkNHteqQWsQgvv0oncIjFqTy3w5RYjJi1_K4xeVqs2VtJoziZw3wtyj/exec
export const config = {
  api: { bodyParser: false } // importante: no tocar el body
};

const cors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,authorization,x-proxy-token");
  res.setHeader("Access-Control-Max-Age", "86400");
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const TARGET = process.env.APPS_SCRIPT_URL;
  if (!TARGET) {
    res.status(500).json({ ok: false, error: "Missing env APPS_SCRIPT_URL" });
    return;
  }

  // (Opcional) token simple para que no sea un proxy abierto
  const TOKEN = process.env.PROXY_TOKEN || "";
  if (TOKEN) {
    const t = req.headers["x-proxy-token"] || (new URL(req.url, `https://${req.headers.host}`)).searchParams.get("t") || "";
    if (String(t) !== String(TOKEN)) {
      res.status(401).json({ ok: false, error: "Unauthorized (bad proxy token)" });
      return;
    }
  }

  // Construye URL destino: copia querystring de /api/proxy?... hacia /exec?... (menos 't')
  const inUrl = new URL(req.url, `https://${req.headers.host}`);
  const targetUrl = new URL(TARGET);
  inUrl.searchParams.forEach((v, k) => {
    if (k === "t") return; // no reenviar token al Apps Script
    targetUrl.searchParams.append(k, v);
  });

  // Headers a reenviar
  const headers = new Headers();
  const ct = req.headers["content-type"];
  if (ct) headers.set("content-type", ct);

  // IMPORTANTE: NO reenviar host/origin originales
  headers.set("user-agent", "dypsi-proxy");

  let body = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const raw = await readRawBody(req);
    body = raw.length ? raw : null;
  }

  try {
    const r = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body,
      redirect: "follow"
    });

    const buf = Buffer.from(await r.arrayBuffer());

    // Copia content-type si viene
    const outCT = r.headers.get("content-type");
    if (outCT) res.setHeader("Content-Type", outCT);

    // Evitar cache raro
    res.setHeader("Cache-Control", "no-store");

    res.status(r.status).send(buf);
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
}

