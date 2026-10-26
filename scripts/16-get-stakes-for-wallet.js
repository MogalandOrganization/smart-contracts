const hre = require('hardhat');
const fs = require('node:fs');
const path = require('node:path');

class StakeDetailsForWalletService {
    constructor() {
        // const rpcUrl = process.env.RPC_URL;
        const rpcUrl = process.env.RPC_PROVIDER_URL;
        this.provider = new hre.ethers.JsonRpcProvider(rpcUrl);

        this.stakingContract = new hre.ethers.Contract(
            process.env.STAKING_CONTRACT,
            [
                'function getAllStakeIdsOfAddress(address _address, uint256 _start, uint256 _count) external view returns (uint256[] memory)',
                'function getStakeDetails(uint256 _stakeId) external view returns (uint256 offerId, uint256 principle, uint256 created, address owner)',

                'function fixedTermOffers(uint256 orderId) view returns (uint256 rate, uint256 fee, uint256 lockupDuration, bool active, bool onlyAdmin)',
                'function stakeIdToStakeOffer(uint256 stakeId) external view returns (uint256 offerId)',
                'event FixedTermDeposit(address _address, uint256 _amount, uint256 _stakeId)',
            ],
            this.provider,
        );
    }

    async getStakeDetails(userWallet, walletIndex = 0) {
        // Get the contract factory and signer
        const [signer] = await hre.ethers.getSigners(); // Get the default signer

        // Attach to the deployed contract
        const staking = await this.stakingContract.connect(signer);

        const stakeIds = await staking.getAllStakeIdsOfAddress(userWallet, 0, 100);

        const stakesDetails = [];
        for (let idx = 0; idx < stakeIds.length; idx++) {
            const stakeId = stakeIds[idx];
            const stake = await staking.getStakeDetails(stakeId);
            const [offerId, principle, created, owner] = stake;
            if (idx === 0) {
                console.log(`[${walletIndex}]`, 'Owner:', owner);
            }
            const amount = hre.ethers.formatUnits('' + principle, 18);
            const creationDate = new Date(Number(created) * 1000);
            console.log('Stake offerId', Number(offerId), 'Principle:', amount, 'Created:', creationDate);
            stakesDetails.push({
                stakeId: Number(stakeId),
                offerId: Number(offerId),
                principle: parseFloat(amount),
                created: creationDate,
            });
        }

        return stakesDetails;
    }
}

async function main(argv) {
    if (argv.length < 1) {
        // Validate inputs
        console.log(['The wallet address is required.'].join('\n'));
        return;
    }

    const service = new StakeDetailsForWalletService();

    const [param, size, index] = argv;
    if (param.startsWith('0x') && param.length === 42) {
        // One Ether address
        await service.getStakeDetails(param);
    } else if (param.startsWith('/tmp')) {
        // One file path with a list of Ether addresses
        const cachedData = fs.readFileSync(param, 'utf-8');
        if (!cachedData.startsWith('[\n  {\n    "userId":')) {
            console.log('Invalid cache file content, expected to get an array of Ether addresses');
            return;
        }

        const users = JSON.parse(cachedData);
        const startIndex = index || 0;
        const endIndex = Math.min(users.length, (index || 0) + (size || 100));

        const allStakeDetails = {};
        for (let idx = startIndex; idx < endIndex; idx++) {
            const user = users[idx];
            if (user.wallet) {
                const stakeDetails = await service.getStakeDetails(user.wallet);
                console.log('Owner:', user, 'Stake details:', stakeDetails);
                if (0 < stakeDetails.length) {
                    allStakeDetails[user.userId] = stakeDetails;
                }
            }
        }
        fs.writeFileSync('/tmp/web3-stake-details.json', JSON.stringify(allStakeDetails, null, 2), 'utf-8');
    } else if (param.endsWith('.csv')) {
        // One file path with a list of Ether addresses
        const addressList = fs.readFileSync(param, 'utf-8').split('\n');
        const startIndex = index || 0;
        const endIndex = Math.min(addressList.length, (index || 0) + (size || 100));

        const allStakeDetails = {};
        for (let idx = startIndex; idx < endIndex; idx++) {
            const address = addressList[idx].trim();
            try {
                const stakeDetails = await service.getStakeDetails(address, idx);
                if (0 < stakeDetails.length) {
                    allStakeDetails[address] = stakeDetails;
                }
            } catch (error) {
                console.log('^^^', 'Unexpected error:', error);
            }
        }

        const parsed = path.parse(param);
        const outPath = path.join(parsed.dir, `${parsed.name}-staked-assets-${startIndex}-${endIndex}.json`);
        fs.writeFileSync(outPath, JSON.stringify(allStakeDetails, null, 2), 'utf-8');
    } else {
        console.log('Invalid parameter:', param);
    }
}

main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
