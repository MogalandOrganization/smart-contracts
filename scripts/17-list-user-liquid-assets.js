// cSpell:ignore moga
// Lists the liquid MOGA balance of a batch of wallet addresses.
//
// Reads a CSV of Ether addresses (one per line) and writes a CSV of
// `walletAddress,mogaBalance`. Read-only: only calls `balanceOf`, so no
// signer / private key is required.
//
// Env:
//   MOGA_CONTRACT  - address of the deployed MogaToken contract (used live,
//                    never persisted by this script)
//
// Args:
//   1. csvFilename   - path to the CSV of addresses (required)
//   2. count         - number of addresses to process (default 100)
//   3. startIndex    - index of the first address to process (default 0)
//
// Run:
//   HARDHAT_NETWORK=edu-chain node scripts/17-list-user-liquid-assets.js 17-wallet-addresses.csv 25 50

const hre = require('hardhat');
const fs = require('node:fs');
const path = require('node:path');

const DECIMALS = 18;

class LiquidAssetsService {
    constructor() {
        const contractAddress = process.env.MOGA_CONTRACT;
        if (!contractAddress) {
            throw new Error('MOGA_CONTRACT environment variable is not set');
        }
        if (!hre.ethers.isAddress(contractAddress)) {
            throw new Error(`MOGA_CONTRACT is not a valid address: ${contractAddress}`);
        }
        this.contractAddress = contractAddress;
    }

    async init() {
        const MogaToken = await hre.ethers.getContractFactory('MogaToken');
        // Attach without a signer: balanceOf is a view call, no key needed.
        this.mogaToken = MogaToken.attach(this.contractAddress);
        return this;
    }

    async getBalance(address) {
        const raw = await this.mogaToken.balanceOf(address);
        return hre.ethers.formatUnits(raw, DECIMALS);
    }
}

function parseAddresses(csvPath) {
    const raw = fs.readFileSync(csvPath, 'utf-8');
    return raw
        .replace(/^\uFEFF/, '') // strip UTF-8 BOM if present
        .split(/\r?\n/)
        .map((line) => line.trim())
        // keep only the first field in case the CSV grows extra columns later
        .map((line) => line.split(',')[0].trim())
        .filter((value) => value.length > 0);
}

async function main(argv) {
    if (argv.length < 1) {
        console.log(
            [
                '1. The CSV filename with wallet addresses is required.',
                '   Optional: 2. count (default 100)  3. startIndex (default 0)',
            ].join('\n'),
        );
        return;
    }

    const [csvFilename, rawCount, rawStartIndex] = argv;

    const count = rawCount !== undefined ? parseInt(rawCount, 10) : 100;
    const startIndex = rawStartIndex !== undefined ? parseInt(rawStartIndex, 10) : 0;

    if (Number.isNaN(count) || count <= 0) {
        console.error('Invalid count specified:', rawCount);
        return;
    }
    if (Number.isNaN(startIndex) || startIndex < 0) {
        console.error('Invalid startIndex specified:', rawStartIndex);
        return;
    }

    if (!fs.existsSync(csvFilename)) {
        console.error('CSV file not found:', csvFilename);
        return;
    }

    const addresses = parseAddresses(csvFilename);
    console.log('Total addresses in file:', addresses.length);

    const endIndex = Math.min(addresses.length, startIndex + count);
    console.log(`Processing addresses [${startIndex}, ${endIndex}) against MOGA contract ${process.env.MOGA_CONTRACT}`);

    const service = await new LiquidAssetsService().init();

    const rows = [['walletAddress', 'mogaBalance']];
    for (let idx = startIndex; idx < endIndex; idx++) {
        const address = addresses[idx];
        if (!hre.ethers.isAddress(address)) {
            console.warn(`[${idx}] skipping invalid address: ${address}`);
            rows.push([address, 'INVALID_ADDRESS']);
            continue;
        }
        try {
            const balance = await service.getBalance(address);
            console.log(`[${idx}] ${address} -> ${balance} MOGA`);
            rows.push([address, balance]);
        } catch (error) {
            console.error(`[${idx}] ${address} -> error: ${error.message}`);
            rows.push([address, `ERROR:${error.message}`]);
        }
    }

    const parsed = path.parse(csvFilename);
    const outPath = path.join(parsed.dir, `${parsed.name}-liquid-assets-${startIndex}-${endIndex}.csv`);
    const csvOut = rows.map((cols) => cols.join(',')).join('\n') + '\n';
    fs.writeFileSync(outPath, csvOut, 'utf-8');
    console.log('Wrote balances to:', outPath);
}

main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// HARDHAT_NETWORK=edu-chain node scripts/17-list-user-liquid-assets.js 17-wallet-addresses.csv 25 50
