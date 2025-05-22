<!-- cSpell:ignore opencampus moga -->

# Moga Token

Token name: $MOGA

Contract standard: ERC20

Maximum Supply: 1,000,000,000

Decimal: 18 -> 1 MOGA is represented as 1000000000000000000 in the code, allowing standard ETH/ERC20 behavior with decimals in UI

# Commands

Rename .env copy file to .env and fill out details. I use an Infura API key since alchemy is buggy for me fyi
TBD: use env file to setup deployment details

```shell
npm ci
npx hardhat compile
npx hardhat test
npx hardhat node
npx solc --include-path node_modules/ --base-path . contracts/MogaToken.sol --abi --verbose --output-dir abi/
npx solc --include-path node_modules/ --base-path . contracts/MogaVesting.sol --abi --verbose --output-dir abi/
npx solc --include-path node_modules/ --base-path . contracts/MogaStaking.sol --abi --verbose --output-dir abi/
npx hardhat run --network opencampus scripts/1-deploy.js
npx hardhat verify --network opencampus _deployedTokenAddress_ _mogaAdminAddress_ 1000000000
npx hardhat verify --network opencampus _deployedStakingAddress_ _mogaAdminAddress_ _deployedTokenAddress_
npx hardhat verify --network opencampus _deployedVestingAddress_ _mogaAdminAddress_ _deployedTokenAddress_
```

```shell
# Update .env file with PUBLIC_KEY, PRIVATE_KEY, ALCHEMY_API, INFURA_API, ETHERSCAN_API_KEY
HARDHAT_NETWORK=opencampus node scripts/1-deploy.js
# Run the command `npx hardhat verify --network opencampus ...` for each new contract
# Update .env file with MOGA_CONTRACT, VESTING_CONTRACT, STAKING_CONTRACT
HARDHAT_NETWORK=opencampus node scripts/2-trigger-TGE.js
HARDHAT_NETWORK=opencampus node scripts/3-transfer-to-vesting.js [amount]
HARDHAT_NETWORK=opencampus node scripts/4-create-vesting-schedule.js [recipient-wallet-address] [amount] [non-revocable / anything-else]
HARDHAT_NETWORK=opencampus node scripts/5-transfer-tokens.js [recipient-wallet-address] [amount]
HARDHAT_NETWORK=opencampus node scripts/6-transfer-to-staking.js [amount]
HARDHAT_NETWORK=opencampus node scripts/7-create-staking-offer.js [rate] [fee] [lockup duration] [true / anything-else]
HARDHAT_NETWORK=opencampus node scripts/8-discontinue-staking-offer.js [offer-id]
```

```shell
npx hardhat run --network edu-chain scripts/1-deploy.js
```

### Special EDUchain/OPENCAMPUS consideration

The etherscan API key has been set to "empty" in the hardhat conf since for testnet this is not required.

### Delayed TGE event

The TGE event can be triggered at any time by the admin. The admin can then decide to mint the full token supply at once, or delay it.

# Notes

-   Initial staking reward allocation (the staking contract must always have enough unassigned MOGA tokens to distribute staking rewards)
-   https://www.immunebytes.com/blog/precision-loss-vulnerability-in-solidity-a-deep-technical-dive/

API documentation can be found here: https://www.notion.so/Blockchain-Smart-Contracts-1e36853244c380f3b7a0fc2b3cd409c6?pvs=4

The vesting contract is taken from https://github.com/AbdelStark/token-vesting-contracts and has been processed in the following ways:

-   Updated to latest solidity
-   Converted to use OpenZeppelin
-   Modified from a constructor POV to enable automatic transfer of ownership to mogaAdmin (@Dom, please check how tio attribute this accordingly)

Interest calculation taken from https://github.com/wolflo/solidity-interest-helper/tree/master

# Flexible Term Staking Reward Computation

The time-weighted accumulator (also known as a "cumulative reward index" or "reward per share" model) is a well-established pattern in DeFi, especially for staking, yield farming, and liquidity mining.

The idea behind time-weighted accumulators is to maintain a global reward index that tracks the cumulative rewards over time for all users.
Each user's rewards are calculated based on their balance and the difference between the global index at the time of their last interaction and the current global index.
This approach is commonly used in staking systems to calculate rewards dynamically based on time and the user's balance without requiring constant updates to every user's state.

Key Components:
Global Reward Index (rewardIndex):

-   Tracks the cumulative rewards over time for all users.
-   Updated periodically or when a user interacts with the contract.

User-Specific Snapshot (userRewardIndex):

-   Stores the value of the global reward index at the time of the user's last interaction.
-   Used to calculate the user's share of rewards since their last interaction.

Unclaimed Rewards (userUnclaimedRewards):

-   Tracks the rewards that the user has earned but not yet claimed or compounded.

Efficient Updates:

-   Instead of recalculating rewards for all users every time the global state changes, rewards are calculated only when a user interacts with the contract (e.g., staking, compounding, or withdrawing).

## How It Works

`updateRewardIndex():`

-   Time Delta: Calculates the time elapsed since the last update (`timeDelta`).
-   Compound Interest: Uses the `rpow` function to calculate the compounded reward multiplier over `timeDelta` seconds.
-   Update Index: Multiplies the current `rewardIndex` by the compounded multiplier to get the new index.
-   Emit Event: Emits an event to log the updated index.

`updateUserRewards():`

-   Update Global Index: Calls `updateRewardIndex()` to ensure the global index is up-to-date.
-   Check User Balance: Ensures the user has a balance and a valid snapshot (`userRewardIndex`).
-   Calculate Rewards:
    -   Computes the ratio of the current global index to the user's last recorded index.
    -   Multiplies this ratio by the user's balance to calculate the rewards earned since the last interaction.
    -   Subtracts the user's balance to isolate the rewards (excluding the principal).
-   Update Unclaimed Rewards: Adds the newly calculated rewards to the user's unclaimed rewards.
-   Update Snapshot: Updates the user's reward index snapshot to the current global index.

## References

-   Original source: https://github.com/Synthetixio/synthetix/blob/develop/contracts/StakingRewards.sol,
-   3-part video explainer: https://www.youtube.com/watch?v=6ZO5aYg1GI8
