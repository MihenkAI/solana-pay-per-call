// Pay-per-call API on Solana (devnet or a local validator) with an x402-style handshake:
//   1. GET without payment            -> 402 + payment requirements (amount, mint, payTo, one-time nonce)
//   2. client sends a USDC transfer on Solana with the nonce in a memo
//   3. GET again with X-PAYMENT        -> server verifies the transfer on-chain, answers 200 + X-PAYMENT-RESPONSE
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import { conn, config, NETWORK, PRICE, DECIMALS, txLink, b64, unb64, units } from "./lib.mjs";
import { coinCalls, source } from "./data.mjs";

const PORT = Number(process.env.PORT || 8402);
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const cfg = config();
const c = conn();
const nonces = new Map(); // nonce -> { resource, exp }
const USED = "data/used.json";
const used = new Set(fs.existsSync(USED) ? JSON.parse(fs.readFileSync(USED, "utf8")) : []);
const pending = new Set(); // signatures being verified right now (blocks two parallel requests with one payment)
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function requirements(resource) {
  const nonce = crypto.randomBytes(12).toString("hex");
  nonces.set(nonce, { resource, exp: Date.now() + 5 * 60e3 });
  return {
    x402Version: 1,
    error: "X-PAYMENT header is required",
    accepts: [{
      scheme: "exact",
      network: NETWORK,
      maxAmountRequired: PRICE.toString(),
      asset: cfg.mint,
      payTo: cfg.seller,
      resource,
      description: "Measured crypto-KOL calls for one coin (Mihenk AI)",
      mimeType: "application/json",
      maxTimeoutSeconds: 300,
      extra: { decimals: DECIMALS, token: "test USDC", memo: `mihenk-x402:${nonce}`, nonce },
    }],
  };
}

async function verify(payment, resource) {
  const { signature, nonce } = payment?.payload || {};
  if (payment?.network !== NETWORK || !signature || !nonce) return "malformed X-PAYMENT";
  const n = nonces.get(nonce);
  if (!n || n.exp < Date.now()) return "unknown or expired nonce";
  if (n.resource !== resource) return "nonce was issued for a different resource";
  if (used.has(signature) || pending.has(signature)) return "payment already used";
  // Reserve the nonce and the signature before any await, so a parallel request can't reuse them.
  nonces.delete(nonce);
  pending.add(signature);
  const fail = (reason) => { pending.delete(signature); nonces.set(nonce, n); return reason; };
  let tx = null;
  try {
    for (let i = 0; i < 10 && !tx; i++) {
      tx = await c.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      if (!tx) await new Promise((r) => setTimeout(r, 1000));
    }
  } catch { return fail("could not read the transaction"); }
  if (!tx) return fail(`transaction not found on ${NETWORK}`);
  if (tx.meta?.err) return fail("transaction failed on-chain");
  if (tx.blockTime && Date.now() / 1000 - tx.blockTime > 600) return fail("payment is older than 10 minutes");
  const memos = tx.transaction.message.instructions.filter((ix) => ix.program === "spl-memo").map((ix) => String(ix.parsed));
  if (!memos.some((m) => m.includes(`mihenk-x402:${nonce}`))) return fail("memo with the nonce is missing");
  const bal = (arr) => arr?.find((b) => b.owner === cfg.seller && b.mint === cfg.mint)?.uiTokenAmount?.amount;
  const paid = BigInt(bal(tx.meta.postTokenBalances) || 0) - BigInt(bal(tx.meta.preTokenBalances) || 0);
  if (paid < PRICE) return fail(`paid ${paid} units, ${PRICE} required`);
  pending.delete(signature);
  used.add(signature);
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(USED, JSON.stringify([...used]));
  const payer = tx.transaction.message.accountKeys.find((k) => k.signer)?.pubkey?.toBase58();
  return { ok: true, signature, payer, paid };
}

const send = (res, code, body, headers = {}) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*",
    "access-control-expose-headers": "X-PAYMENT-RESPONSE", ...headers });
  res.end(JSON.stringify(body, null, 2));
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, PUBLIC_URL);
    if (url.pathname === "/") {
      return send(res, 200, {
        name: "Mihenk AI - pay per call on Solana",
        description: `Measured crypto-KOL data for AI agents. Each call costs ${units(PRICE)} test USDC on ${NETWORK}, paid with an x402-style 402 handshake.`,
        endpoints: { "GET /v1/coin/{symbol}/calls?hours=24": `${units(PRICE)} test USDC per call` },
        network: NETWORK, asset: cfg.mint, payTo: cfg.seller, data_source: source,
      });
    }
    const m = url.pathname.match(/^\/v1\/coin\/([A-Za-z0-9$]{1,16})\/calls$/);
    if (!m) return send(res, 404, { error: "not_found" });
    const resource = `${PUBLIC_URL}${url.pathname}${url.search}`;
    const header = req.headers["x-payment"];
    if (!header) {
      log("402", url.pathname + url.search);
      return send(res, 402, requirements(resource));
    }
    let payment;
    try { payment = unb64(header); } catch { return send(res, 402, { ...requirements(resource), error: "X-PAYMENT is not valid base64 JSON" }); }
    const v = await verify(payment, resource);
    if (v?.ok !== true) {
      log("402 rejected:", v);
      return send(res, 402, { ...requirements(resource), error: v });
    }
    const data = coinCalls(m[1], url.searchParams.get("hours"));
    log("200 paid", units(v.paid), "by", v.payer, txLink(v.signature));
    return send(res, 200, data, { "X-PAYMENT-RESPONSE": b64({ success: true, transaction: v.signature, network: NETWORK, payer: v.payer }) });
  } catch (e) {
    log("error", e.message);
    return send(res, 500, { error: "internal_error" });
  }
}).listen(PORT, () => log(`listening on ${PORT} (${source}); price ${units(PRICE)} test USDC; payTo ${cfg.seller}`));
