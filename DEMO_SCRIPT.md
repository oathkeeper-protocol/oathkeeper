# OathLayer Demo Video Script (~3 min)

---

## 1. Intro (0:00–0:20)

> "This is OathLayer — privacy-first, AI-powered SLA enforcement for tokenized real-world assets.
>
> Providers bond ETH as collateral, and if they violate their service agreement, a 3-agent AI Tribunal running on Chainlink CRE automatically detects the breach and slashes their bond — all on-chain, all verifiable.
>
> World ID gates provider identity for Sybil resistance. Let me walk you through how it works."

---

## 2. Wallet Setup (0:20–0:35)

*Show MetaMask / wallet*

> "First, we connect to OathLayer's Tenderly Virtual Network — a Sepolia fork with state sync.
>
> I'll add the custom RPC to my wallet..."

*Paste VNet RPC URL into MetaMask custom network — Chain ID 11155111*

> "...and now we're connected to the OathLayer testnet."

---

## 3. Register as Provider with World ID (0:35–1:00)

*Navigate to `/provider/register`*

> "To become a provider, you need to verify your identity with World ID. This isn't KYC — it's Sybil resistance. One human, one provider identity.
>
> I'll click Verify with World ID..."

*Show World ID verification flow (or mini app)*

> "Once verified, the proof is submitted to our WorldChainRegistry contract on World Chain. Chainlink CRE picks up the event, runs a confidential compliance check in a TEE, and relays the approval cross-chain to Sepolia.
>
> Now I'm a verified provider — I can bond ETH and create SLAs."

*Show compliance status polling → Approved*

---

## 4. Create SLA (1:00–1:20)

*Navigate to `/sla/create`*

> "Now I'll create a Service Level Agreement. I'm setting up a Cloud CDN service with 99.5% minimum uptime, 8-hour response time, and a 4% penalty rate per breach.
>
> I bond 2 ETH as collateral — this is what gets slashed if I violate the agreement."

*Fill form and submit transaction*

> "The SLA is now live on-chain. My bond is locked, and CRE will start monitoring this SLA every 15 minutes."

---

## 5. Dashboard Overview (1:20–1:45)

*Navigate to `/dashboard`*

> "The dashboard pulls all data from our Ponder indexer via GraphQL — live, 5-second polling.
>
> **Active Agreements** — each SLA card shows the provider, min uptime, penalty rate, and bond health. Green means active, red means penalized — bond has been slashed.
>
> **AI Tribunal** — every assessment from our 3-agent council: Risk Analyst, Provider Advocate, and Enforcement Judge. You can see the vote tally — 3-0 BREACH, 2-1 WARNING, 0-3 CLEAR — with each agent's reasoning.
>
> **Recent Breaches** — the actual on-chain slashing events with penalty amounts."

---

## 6. Simulate Breach with CRE (1:45–2:25)

*Open terminal alongside dashboard*

> "Now let's see what happens when a provider's uptime drops. I'll lower the mock uptime to 94% — below the SLA threshold — and trigger the CRE workflow."

*Run in terminal:*
```
cre workflow simulate ./workflow --broadcast --verbose
```

> "Here's what's happening behind the scenes:
>
> First, CRE reads all active SLAs from the contract. Then it fetches each provider's uptime from our API.
>
> SLA 5 — uptime 94%, threshold 99.5% — that's a breach.
>
> Now the AI Tribunal kicks in. Three agents running Llama 3.3 70B on Groq, each called via Chainlink's ConfidentialHTTPClient — meaning the API keys are protected inside a TEE, invisible even to the DON nodes.
>
> Risk Analyst evaluates the metrics... Provider Advocate tries to defend... Enforcement Judge renders the final verdict.
>
> 3-0 BREACH. All three agents agree — uptime is below threshold, no defense possible.
>
> CRE writes two transactions: `recordBreachWarning` for the tribunal audit trail, and `recordBreach` to slash the bond. All in one automated pipeline."

*Show dashboard updating in real-time*

> "And the dashboard picks it up instantly — you can see the SLA flipped to Penalized, bond reduced, breach recorded."

---

## 7. SLA Detail Page (2:25–2:50)

*Click into the breached SLA → `/sla/5`*

> "Clicking into the SLA detail, we see the full picture:
>
> **Agreement Details** — the terms both parties agreed to.
>
> **Stats** — 2 breaches, total ETH slashed, claims filed.
>
> **Breach History** — every slashing event with the exact uptime reading and penalty amount.
>
> **AI Tribunal History** — the full audit trail. Every verdict is recorded on-chain — BREACH, WARNING, even CLEAR assessments with risk score zero. This is the 'decentralized AI' transparency layer. You can see exactly how each agent voted and why.
>
> When a verdict says PENALIZED, that means the tribunal voted BREACH and the bond was actually slashed at that block."

---

## 8. Closing (2:50–3:00)

> "That's OathLayer — automated SLA enforcement powered by Chainlink CRE, a 3-agent AI Tribunal, and World ID identity. Every verdict on-chain, every breach verifiable, every provider accountable.
>
> Privacy-first. AI-powered. Fully autonomous."

---

## Production Notes

- **Dashboard URL**: https://oathlayer-protocol.vercel.app
- **Demo controls**: FAB button bottom-right — set uptime %, trigger breach/warning, time-warp cooldowns
- **Before recording**: Run `POST /reset` to clear cooldowns and set uptime to 99.9%
- **For breach demo**: Set uptime to 94%, then run CRE simulate with `--broadcast`
- **Time-warp between runs**: `POST /time-warp` with `{"hours": 25}` to clear 24h breach cooldown
