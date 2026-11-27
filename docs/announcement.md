<!-- cSpell:ignore moga mogaland sailfish thrustpad -->

## MOGA is moving to Base. Here is what happens and what you need to do.

Open Campus has announced that EDU Chain is shutting down, and that assets must leave it before **23 December 2026** ([Open Campus announcement](https://opencampus-xyz.medium.com/open-campus-expands-multichain-to-accelerate-on-chain-education-network-effects-while-edu-chain-9fca99dd3d9b)). Each project decides what happens to its own token. We decided that **MOGA continues on Base**.

### How the transition works

1. **Snapshot.** On **Friday 11 December 2026 at 20:00 UTC** we record every MOGA balance on EDU Chain. MOGA you stake in Mogaland counts too: the amount you would receive when unstaking (your tokens plus the rewards earned, minus the 1% fee on rewards).
2. **Automatic transfer.** During the week of **14 to 18 December**, we send the same amount of new MOGA to **the same wallet address, on Base**. Your wallet works on Base with the same private key or seed phrase. You do not have to claim, bridge, connect to a website, or pay anything. The tokens simply appear in your wallet. Staked MOGA arrives as regular MOGA, with nothing to unstake.
3. **Transparency.** After the snapshot we publish the full list of addresses and amounts, with a checksum, on [GitHub](https://github.com/MogalandOrganization/smart-contracts). The new contract address is announced on our official channels only: [Discord](https://discord.com/invite/Qs8CBjDyR5), [Telegram](https://t.me/addlist/ibh3KBtjQ6c0MGUy), [X / Twitter](https://x.com/mogaland_io?mx=2).

### Staking is paused

Since **Friday November 27 2026**, the Mogaland staking contract is **paused**: new stakes are no longer accepted. **Unstaking is still possible**, so you can take your tokens back at any time. You do not have to: **everything still staked at the snapshot is transferred directly to your wallet on Base**, as regular MOGA, with the rewards you earned minus the 1% fee on rewards. Unstaking before the snapshot gives you exactly the same amount.

### What to do before the snapshot

- **Do not move or trade your MOGA after the snapshot.** The list is fixed at the snapshot, and EDU Chain transfers after that moment are not reflected on Base.
- **Staking:** nothing to do. You can leave your MOGA staked, it is transferred with the rest. You can also unstake if you prefer.
- **SailFish liquidity:** if you provided MOGA liquidity on SailFish, close your position before the snapshot (a community-built withdrawal tool is mentioned in the Open Campus announcement; review every transaction before signing). MOGA left in a pool is not credited to you.
- **ThrustPad:** if you bought MOGA in the ThrustPad launch and have not claimed your tokens, claim them before the snapshot.
- **Your other EDU Chain assets** (EDU, WEDU, USDC, USDT) are not covered by us. Follow the Open Campus instructions to bridge them to Arbitrum before 23 December.

### Stay safe

- We will **never** ask for your seed phrase or private key.
- We will **never** ask you to send tokens to anyone, or to connect your wallet to an unknown website.
- We will **never** message you first. Ignore everyone who does.
- The only contact for this operation is hello@mogaland.io.

### Good to know

- Balances below 0.001 MOGA are not transferred.
- The tokens arrive at the same address you use today. To use another wallet afterwards, transfer them yourself from that wallet on Base. It costs a small network fee, paid in ETH on Base.
- Keep access to your wallet (seed phrase or private key) safe: it is what gives you access to the tokens on Base.
- If anything is unclear, or if tokens are missing after the transfer, write to hello@mogaland.io.