// cSpell:ignore educhain, opencampus, moga, basescan

import { defineConfig, configVariable } from 'hardhat/config';
import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';
import dotenv from 'dotenv';

// Populates process.env from .env so that configVariable('...') can resolve the secrets.
dotenv.config({ quiet: true });

export default defineConfig({
    plugins: [hardhatToolboxMochaEthers],
    // OpenZeppelin 5.6.1 pragmas go up to ^0.8.26; contracts use ^0.8.0 / ^0.8.20.
    solidity: {
        profiles: {
            default: { version: '0.8.28' },
            production: { version: '0.8.28' },
        },
    },
    networks: {
        // EDUCHAIN / OPENCAMPUS TESTNET
        opencampus: {
            type: 'http',
            url: 'https://rpc.open-campus-codex.gelato.digital/',
            accounts: [configVariable('PRIVATE_KEY')],
            chainId: 656476, //'0xa045c', // 656476
            gasPrice: 1000000000,
        },
        // EDUCHAIN / OPENCAMPUS MAINNET
        'edu-chain': {
            type: 'http',
            url: 'https://rpc.edu-chain.raas.gelato.cloud',
            accounts: [configVariable('PRIVATE_KEY')],
            chainId: 41923, // '0xa3c3', // 41923
            gasPrice: 1000000000,
        },
        // for base mainnet
        base_mainnet: {
            type: 'http',
            url: 'https://mainnet.base.org',
            accounts: [configVariable('PRIVATE_KEY')],
            gasPrice: 1000000000,
        },
        // for testnet
        base_sepolia: {
            type: 'http',
            url: 'https://sepolia.base.org',
            accounts: [configVariable('PRIVATE_KEY')],
            gasPrice: 1000000000,
        },
        // for local dev environment
        base_local: {
            type: 'http',
            url: 'http://localhost:8545',
            accounts: [configVariable('PRIVATE_KEY')],
            gasPrice: 1000000000,
        },
    },
    verify: {
        etherscan: {
            apiKey: configVariable('ETHERSCAN_API_KEY'),
        },
        blockscout: {
            enabled: true,
        },
    },
    chainDescriptors: {
        84532: {
            name: 'base_sepolia',
            blockExplorers: {
                etherscan: {
                    name: 'Basescan',
                    url: 'https://sepolia.basescan.org',
                    apiUrl: 'https://api-sepolia.basescan.org/api',
                },
            },
        },
        656476: {
            name: 'opencampus',
            blockExplorers: {
                blockscout: {
                    name: 'EDU Chain Testnet Blockscout',
                    url: 'https://edu-chain-testnet.blockscout.com',
                    apiUrl: 'https://edu-chain-testnet.blockscout.com/api',
                },
            },
        },
        41923: {
            name: 'edu-chain',
            blockExplorers: {
                blockscout: {
                    name: 'EDU Chain Blockscout',
                    url: 'https://educhain.blockscout.com',
                    apiUrl: 'https://educhain.blockscout.com/api',
                },
            },
        },
    },
});
