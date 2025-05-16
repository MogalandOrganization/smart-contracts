# cSpell:ignore opencampus moga

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
npx hardhat run --network opencampus scripts/deploy.js
npx hardhat verify --network opencampus deployedTokenAddress "mogaAdminAddress" 1000000000
npx hardhat verify --network opencampus deployedStakingAddress "mogaAdminAddress" "deployedTokenAddress"
npx hardhat verify --network opencampus deployedVestingAddress "mogaAdminAddress" "deployedTokenAddress"
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
npx hardhat run --network edu-chain scripts/deploy.js
```

### Deployment example using dev wallet

npx hardhat verify --network sepolia 0xd27e8acd8d796ee459292675f3a554E9160aC88f "0x0ba5550b728933f9c5cb81dea564e97020904ec1" 1000000000
npx hardhat verify --network sepolia 0x51828028b1C5E10C2B5b5a2fBdCDF22eF3b14593 "0x0ba5550b728933f9c5cb81dea564e97020904ec1" "0xd27e8acd8d796ee459292675f3a554E9160aC88f"
npx hardhat verify --network sepolia 0xD6648D8cf8e674bACF3d6E1A43290140F34E6827 "0x0ba5550b728933f9c5cb81dea564e97020904ec1" "0xd27e8acd8d796ee459292675f3a554E9160aC88f"

### Special EDUchain/OPENCAMPUS consideration

The etherscan API key has been set to "empty" in the hardhat conf since for testnet this is not required.

### Delayed TGE event

The TGE event can be triggered at any time by the admin and mints the full token supply at once.

# Notes

-   initial staking reward allocation (the staking contract must always have enough unassigned MOGA tokens to distribute staking rewards)
-   https://www.immunebytes.com/blog/precision-loss-vulnerability-in-solidity-a-deep-technical-dive/

API documentation can be found here: https://www.notion.so/Blockchain-Smart-Contracts-1e36853244c380f3b7a0fc2b3cd409c6?pvs=4

The vesting contract is taken from https://github.com/AbdelStark/token-vesting-contracts and has been processed in the following ways:

-   Updated to latest solidity
-   converted to use OpenZeppelin
-   modified from a constructor POV to enable automatic transfer of ownership to mogaAdmin (@Dom, please check how tio attribute this accordingly)

Interest calculation taken from https://github.com/wolflo/solidity-interest-helper/tree/master

## Deployment

During deployment we use Dom's dev account again. Ownership is automatically given to mogaAdmin wallet (Tracy ledger?)

### Post-Deployment

The following transactions need to be executed to set everything up and running:

Tracy:

-   Setup initial staking offers (2)
-   transfer a pre-determined initial staking reward allocation (e.g. 1 million MOGA) to staking contract
-   Setup team and investor vesting
