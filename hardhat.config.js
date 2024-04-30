require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24",
  networks: {
    sepolia: {
      url: process.env.INFURA_API,
      accounts: [process.env.PRIVATE_KEY],
    },
    // for mainnet
    base_mainnet: {
      url: "https://mainnet.base.org",
      accounts: [process.env.PRIVATE_KEY],
      gasPrice: 1000000000,
    },
    // for testnet
    base_sepolia: {
      url: "https://sepolia.base.org",
      accounts: [process.env.PRIVATE_KEY],
      gasPrice: 1000000000,
      verify: {
        etherscan: {
          apiUrl: "https://api-sepolia.basescan.org/api",
          apiKey: process.env.ETHERSCAN_API_KEY,
        },
      },
    },
    // for local dev environment
    base_local: {
      url: "http://localhost:8545",
      accounts: [process.env.PRIVATE_KEY],
      gasPrice: 1000000000,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "base_sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "sepolia.basescan.org",
        },
      },
    ],
  },
};
