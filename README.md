# Mihenk AI: pay per call on Solana

AI agents buy measured crypto-influencer (KOL) data one call at a time and pay for it in USDC on Solana. There is no account and no API key. The API answers `402 Payment Required`, the agent pays on Solana, and the data comes back with a receipt.

Demo video (87 s): [demo/mihenk-solana-pay-per-call.mp4](demo/mihenk-solana-pay-per-call.mp4)

Built for the **MLH Solana Hackathon (6–8 November 2026)**. All code in this repository was written during the hackathon weekend. The data comes from [Mihenk AI](https://mihenkai.com)'s existing measured dataset, which tracks 15,800+ crypto KOLs on X, Telegram and YouTube and measures what the market did after each of their calls.

## Why

When a crypto influencer calls a coin, traders and trading agents act on it within minutes. An agent needs to know two things before it follows: who else called this coin, and what happened after their earlier calls. Mihenk already measures that. This project lets an agent buy the answer on Solana for one cent per call, with nothing to sign up for.

## How it works

```
agent                                   API (server.mjs)                         Solana
  | GET /v1/coin/SOL/calls                   |                                          |
  |----------------------------------------->|                                          |
  | 402 {price 0.01, mint, payTo, nonce}     |                                          |
  |<-----------------------------------------|                                          |
  | transferChecked 0.01 USDC + memo "mihenk-x402:<nonce>"                             |
  |------------------------------------------------------------------------------------>|
  | GET again, X-PAYMENT: {signature, nonce} |                                          |
  |----------------------------------------->| getParsedTransaction(signature)          |
  |                                          |----------------------------------------->|
  |                                          | ok? memo has nonce? seller got >= price? |
  | 200 data + X-PAYMENT-RESPONSE receipt    |                                          |
  |<-----------------------------------------|                                          |
```

The server checks five things before it answers: the transaction succeeded, its memo carries the nonce the server issued for this exact request, the seller's token balance went up by at least the price, the signature has not been used before, and the payment is less than 10 minutes old. One payment buys one call: the nonce and the signature are reserved before the server waits on the RPC, so a replayed or parallel reuse of the same payment is refused.

The messages follow x402 v1 (`accepts`, `X-PAYMENT`, `X-PAYMENT-RESPONSE`, scheme `exact`). On Solana this repo uses a pay-then-prove variant without a facilitator: the agent submits the transfer itself and the server verifies it on-chain.

The buyer agent (`agent.mjs`) reads the price from the 402, checks it against its own budget, pays only if it fits, and summarizes what it bought.

## Run it

Requires Node 22.13 or newer.

On a local validator (nothing to fund):

```bash
npm install
solana-test-validator --reset &           # from the Solana / Agave CLI
export RPC=http://127.0.0.1:8899
npm run setup     # airdrops the payer, creates a test USDC mint (6 decimals), seller and agent wallets, 5 test USDC for the agent
npm run server &  # API on http://localhost:8402
node agent.mjs SOL ZEC --budget 0.05
npm test          # replay test: one payment buys exactly one call
```

On devnet (not tested yet; the example run below is from a local validator): leave `RPC` unset and put a keypair holding a little devnet SOL in `keys/payer.json` (https://faucet.solana.com), then run the same commands from `npm run setup` on.

With `MIHENK_DB` pointing to Mihenk's SQLite dataset the server answers with live data; without it, it answers from `data/sample.json` (a trimmed snapshot of 8 November 2026), so the whole payment flow runs anywhere. To pay with Circle's devnet USDC instead of the test mint, put `{"mint": "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"}` in `keys/config.json` before `npm run setup` and fund the agent from [faucet.circle.com](https://faucet.circle.com).

## Example run

Recorded on 8 November 2026 on a local Solana validator, with a snapshot of Mihenk's dataset from the same day.

The agent buys two calls:

```
[agent 12:09:25] wallet 6fpMV1ioGg4nxYdCkryRqbsV44He1gpXVTZ9fM5vHzSC holds 4.95 test USDC; budget 0.05
[agent 12:09:25] GET http://localhost:8402/v1/coin/SOL/calls?hours=24
[agent 12:09:25] 402 Payment Required: 0.01 test USDC to DtAwrE...
[agent 12:09:25] paid on solana-localnet: 4owXBMXschHhNqrZpAHY5nhiFMQ4SydVqAb3T8rJAoyDRNBba1kngEawg1pbx7jfYyHiJ5Yat7G3Y77eQnRLG6Tp
[agent 12:09:25] receipt: {"success":true,"transaction":"4owXBMXschHhNqrZpAHY5nhiFMQ4SydVqAb3T8rJAoyDRNBba1kngEawg1pbx7jfYyHiJ5Yat7G3Y77eQnRLG6Tp","network":"solana-localnet","payer":"6fpMV1ioGg4nxYdCkryRqbsV44He1gpXVTZ9fM5vHzSC"}
[agent 12:09:25] $SOL, last 24h: 24 calls from 24 KOLs (20 long, 4 short)
[agent 12:09:25]   @VioletViolet66 (141,887 followers) long at 2026-11-08T08:27:00Z -> 5m +0.1%, 1h 0%
[agent 12:09:25]   @martiniguyyt (701,050 followers) short at 2026-11-08T07:24:00Z -> 5m 0%, 1h -0.1%
[agent 12:09:25]   @going4ward (28,475 followers) long at 2026-11-08T05:14:00Z -> 5m 0%, 1h -0.2%
[agent 12:09:25]   @OguzCoskunlu (12,004 followers) long at 2026-11-08T04:42:00Z -> 5m -0.2%, 1h +0.1%
[agent 12:09:25]   @L0cCapital (24,103 followers) long at 2026-11-08T04:18:00Z -> 5m +0.1%, 1h +0.1%
[agent 12:09:25] GET http://localhost:8402/v1/coin/ZEC/calls?hours=24
[agent 12:09:25] 402 Payment Required: 0.01 test USDC to DtAwrE...
[agent 12:09:26] paid on solana-localnet: 42TFQxroFug9Ha4foTS8Lkj3nBDD6ASq2r8PzHaj95qZXjWcNL5VywXQD11yXLYeE789RTKibQrP7yct5heQaiem
[agent 12:09:26] receipt: {"success":true,"transaction":"42TFQxroFug9Ha4foTS8Lkj3nBDD6ASq2r8PzHaj95qZXjWcNL5VywXQD11yXLYeE789RTKibQrP7yct5heQaiem","network":"solana-localnet","payer":"6fpMV1ioGg4nxYdCkryRqbsV44He1gpXVTZ9fM5vHzSC"}
[agent 12:09:26] $ZEC, last 24h: 18 calls from 16 KOLs (9 long, 9 short)
[agent 12:09:26]   @hirozaki2020 (123,527 followers) short at 2026-11-08T10:37:00Z -> 5m +0.7%
[agent 12:09:26]   @Smart_Money (55,611 followers) short at 2026-11-08T06:52:00Z -> 5m -0.1%, 1h +0.5%
[agent 12:09:26]   @coachkcrypto (132,108 followers) long at 2026-11-08T03:52:00Z -> 5m -0.1%
[agent 12:09:26]   @ThinkingBitmex (92,963 followers) long at 2026-11-08T03:18:00Z -> 5m -0.3%, 1h -0.2%
[agent 12:09:26]   @trader1sz (693,609 followers) short at 2026-11-08T01:33:00Z -> 5m -0.1%, 1h 0%
[agent 12:09:26] done; remaining budget 0.03 test USDC, wallet 4.93
```

A replayed payment is refused:

```
[test] paid once: 5m2bataJvVXYKK6L...
[test] first call with the payment -> 200
[test] same payment, new request   -> 402 payment already used
[test] same payment, made-up nonce -> 402 unknown or expired nonce
[test] PASS: one payment buys exactly one call
```

And the agent will not pay above its budget:

```
[agent 12:09:27] wallet 6fpMV1ioGg4nxYdCkryRqbsV44He1gpXVTZ9fM5vHzSC holds 4.92 test USDC; budget 0.005
[agent 12:09:27] GET http://localhost:8402/v1/coin/BTC/calls?hours=24
[agent 12:09:27] 402 Payment Required: 0.01 test USDC to DtAwrE...
[agent 12:09:27] price is above my remaining budget (0.005), not paying
[agent 12:09:27] done; remaining budget 0.005 test USDC, wallet 4.92
```

## Files

| File | What it does |
|---|---|
| `server.mjs` | The pay-per-call API: 402 with payment requirements, on-chain verification, data with a receipt |
| `agent.mjs` | Buyer agent: reads the price, checks its budget, pays on Solana, retries with proof |
| `data.mjs` | Read-only access to Mihenk's measured KOL calls (or the offline sample) |
| `setup.mjs` | One-time setup (local validator or devnet): test mint, wallets, token accounts |
| `test.mjs` | Replay test: one payment buys exactly one call |
| `lib.mjs` | Shared config and helpers |

## What's next

- The same flow with USDC on Solana mainnet.
- Solana as a payment option in Mihenk's existing x402 Agent API, which already takes USDC on Base, Arc and Polygon.
- A Solana Action (Blink) that opens a KOL's call record from a post on X.

## About Mihenk AI

Mihenk AI measures crypto influencers by what their posts actually do and runs five products on that engine: KOL intelligence, KOL marketing for agencies and token projects, social trading with a one-tap trade from the user's own wallet, Mihenk Pay (USDC that reaches a KOL only after verified delivery) and the x402 Agent API.

https://mihenkai.com

Data is measurement, not investment advice.

## License

MIT
