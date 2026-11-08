// Replay test: pay once, then try to reuse the same payment for a second call.
// usage (server running): node test.mjs [--api http://localhost:8402]
import { PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createTransferCheckedInstruction } from "@solana/spl-token";
import { conn, load, NETWORK, MEMO_PROGRAM, b64 } from "./lib.mjs";

const i = process.argv.indexOf("--api");
const API = i > 0 ? process.argv[i + 1] : process.env.API || "http://localhost:8402";
const url = `${API}/v1/coin/SOL/calls?hours=24`;
const c = conn();
const agent = load("agent");
const proof = (signature, nonce) => ({ headers: { "X-PAYMENT": b64({ x402Version: 1, scheme: "exact", network: NETWORK, payload: { signature, nonce } }) } });
const quote = async () => (await (await fetch(url)).json()).accepts[0];
const say = (...a) => console.log("[test]", ...a);

const q1 = await quote();
const mint = new PublicKey(q1.asset);
const tx = new Transaction()
  .add(createTransferCheckedInstruction(getAssociatedTokenAddressSync(mint, agent.publicKey), mint,
    getAssociatedTokenAddressSync(mint, new PublicKey(q1.payTo)), agent.publicKey, BigInt(q1.maxAmountRequired), q1.extra.decimals))
  .add(new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(q1.extra.memo) }));
const sig = await sendAndConfirmTransaction(c, tx, [agent], { commitment: "confirmed" });
say("paid once:", sig.slice(0, 16) + "...");

const r1 = await fetch(url, proof(sig, q1.extra.nonce));
say("first call with the payment ->", r1.status);
const q2 = await quote();
const r2 = await fetch(url, proof(sig, q2.extra.nonce));
say("same payment, new request   ->", r2.status, (await r2.json()).error);
const r3 = await fetch(url, proof(sig, "0".repeat(24)));
say("same payment, made-up nonce ->", r3.status, (await r3.json()).error);
const ok = r1.status === 200 && r2.status === 402 && r3.status === 402;
say(ok ? "PASS: one payment buys exactly one call" : "FAIL");
process.exit(ok ? 0 : 1);
