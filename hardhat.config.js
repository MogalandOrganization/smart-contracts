// cSpell:ignore educhain, opencampus, moga, basescan

require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config({ quiet: true });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: '0.8.24',
    networks: {
        // EDUCHAIN / OPENCAMPUS TESTNET
        opencampus: {
            url: 'https://rpc.open-campus-codex.gelato.digital/',
            accounts: [process.env.PRIVATE_KEY],
            chainId: 656476, //'0xa045c', // 656476
            gasPrice: 1000000000,
        },
        // EDUCHAIN / OPENCAMPUS MAINNET
        'edu-chain': {
            url: 'https://rpc.edu-chain.raas.gelato.cloud',
            accounts: [process.env.PRIVATE_KEY],
            chainId: 41923, // '0xa3c3', // 41923
            gasPrice: 1000000000,
        },
        // for base mainnet
        base_mainnet: {
            url: 'https://mainnet.base.org',
            accounts: [process.env.PRIVATE_KEY],
            gasPrice: 1000000000,
        },
        // for testnet
        base_sepolia: {
            url: 'https://sepolia.base.org',
            accounts: [process.env.PRIVATE_KEY],
            gasPrice: 1000000000,
            verify: {
                etherscan: {
                    apiUrl: 'https://api-sepolia.basescan.org/api',
                    apiKey: process.env.ETHERSCAN_API_KEY,
                },
            },
        },
        // for local dev environment
        base_local: {
            url: 'http://localhost:8545',
            accounts: [process.env.PRIVATE_KEY],
            gasPrice: 1000000000,
        },
    },
    etherscan: {
        apiKey: {
            opencampus: 'empty',
            'edu-chain': 'empty',
        },
        customChains: [
            {
                network: 'base_sepolia',
                chainId: 84532,
                urls: {
                    apiURL: 'https://api-sepolia.basescan.org/api',
                    browserURL: 'sepolia.basescan.org',
                },
            },
            {
                network: 'opencampus',
                chainId: 656476,
                urls: {
                    apiURL: 'https://edu-chain-testnet.blockscout.com/api',
                    browserURL: 'https://edu-chain-testnet.blockscout.com',
                },
            },
            {
                network: 'edu-chain',
                chainId: 41923,
                urls: {
                    apiURL: 'https://educhain.blockscout.com/api',
                    browserURL: 'https://educhain.blockscout.com',
                },
            },
        ],
    },
};
