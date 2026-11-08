// A small buyer agent: asks the API for a coin, reads the 402 price, checks it against its budget,
// pays in test USDC on Solana (devnet or a local validator), retries with proof of payment and summarizes what it bought.
// usage: node agent.mjs SOL [ZEC ...] [--budget 0.05] [--hours 24] [--api http://localhost:8402]
import { PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createTransferCheckedInstruction, getAccount } from "@solana/spl-token";
import { conn, load, config, NETWORK, MEMO_PROGRAM, txLink, b64, unb64, units } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const API = opt("--api", process.env.API || "http://localhost:8402");
let budget = BigInt(Math.round(Number(opt("--budget", "0.05")) * 1e6));
const hours = opt("--hours", "24");
const coins = args.length ? args : ["SOL"];
const c = conn();
const agent = load("agent");
const cfg = config();
const say = (...a) => console.log(`[agent ${new Date().toISOString().slice(11, 19)}]`, ...a);

async function pay(req) {
  const mint = new PublicKey(req.asset);
  const from = getAssociatedTokenAddressSync(mint, agent.publicKey);
  const to = getAssociatedTokenAddressSync(mint, new PublicKey(req.payTo));
  const tx = new Transaction()
    .add(createTransferCheckedInstruction(from, mint, to, agent.publicKey, BigInt(req.maxAmountRequired), req.extra.decimals))
    .add(new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(req.extra.memo) }));
  return sendAndConfirmTransaction(c, tx, [agent], { commitment: "confirmed" });
}

const bal = async () => (await getAccount(c, getAssociatedTokenAddressSync(new PublicKey(cfg.mint), agent.publicKey))).amount;
say(`wallet ${agent.publicKey.toBase58()} holds ${units(await bal())} test USDC; budget ${units(budget)}`);

for (const coin of coins) {
  const url = `${API}/v1/coin/${encodeURIComponent(coin)}/calls?hours=${hours}`;
  say(`GET ${url}`);
  let r = await fetch(url);
  if (r.status === 402) {
    const body = await r.json();
    const req = body.accepts.find((a) => a.network === NETWORK && a.scheme === "exact");
    if (!req) { say("no Solana payment option offered, skipping"); continue; }
    const price = BigInt(req.maxAmountRequired);
    say(`402 Payment Required: ${units(price)} ${req.extra.token} to ${req.payTo.slice(0, 6)}...`);
    if (price > budget) { say(`price is above my remaining budget (${units(budget)}), not paying`); continue; }
    const sig = await pay(req);
    budget -= price;
    say(`paid on ${NETWORK}: ${sig}`);
    r = await fetch(url, { headers: { "X-PAYMENT": b64({ x402Version: 1, scheme: "exact", network: NETWORK, payload: { signature: sig, nonce: req.extra.nonce } }) } });
  }
  if (r.status !== 200) { say(`failed: HTTP ${r.status}`, JSON.stringify(await r.json()).slice(0, 200)); continue; }
  const receipt = r.headers.get("x-payment-response");
  if (receipt) say(`receipt: ${JSON.stringify(unb64(receipt))}`);
  const d = await r.json();
  const s = d.summary;
  say(`$${d.symbol}, last ${d.hours}h: ${s.calls} calls from ${s.kols} KOLs (${s.long} long, ${s.short} short)`);
  for (const x of d.calls.slice(0, 5)) {
    const mv = Object.entries(x.price_move_pct).map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}%`).join(", ") || "not measured yet";
    say(`  @${x.kol} (${x.followers.toLocaleString("en-US")} followers) ${x.direction} at ${x.posted_at} -> ${mv}`);
  }
}
say(`done; remaining budget ${units(budget)} test USDC, wallet ${units(await bal())}`);
