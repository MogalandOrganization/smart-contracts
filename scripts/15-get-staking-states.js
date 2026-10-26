const hre = require('hardhat');

const CONSTANTS = {
    WAD_DECIMALS: 18,
    RAY_DECIMALS: 27,
    CHAIN_SWITCH_ERROR_CODE: 4902,
};

class StakingVerificationService {
    constructor() {
        // const rpcUrl = process.env.RPC_URL;
        const rpcUrl = process.env.RPC_PROVIDER_URL;
        this.provider = new hre.ethers.JsonRpcProvider(rpcUrl);

        this.stakingContract = new hre.ethers.Contract(
            process.env.STAKING_CONTRACT,
            [
                'function fixedTermOffers(uint256 orderId) view returns (uint256 rate, uint256 fee, uint256 lockupDuration, bool active, bool onlyAdmin)',
                'function stakeIdToStakeOffer(uint256 stakeId) external view returns (uint256 offerId)',
                'event FixedTermDeposit(address _address, uint256 _amount, uint256 _stakeId)',
            ],
            this.provider,
        );
    }

    async getActiveStakesByOfferId(offerId, userWallet) {
        // : Promise<Stake[]> {
        try {
            // Get all event FixedTermDeposit
            const depositFilter = this.stakingContract.filters.FixedTermDeposit();
            const depositEvents = await this.stakingContract.queryFilter(depositFilter);
            console.log('^^^', 'Event collection size:', depositEvents.length);

            // Optionally filter by userWallet
            let walletEvents = depositEvents;
            if (userWallet) {
                const normalizedWallet = userWallet.toLowerCase();
                walletEvents = depositEvents.filter((event) => event.args._address.toLowerCase() === normalizedWallet);
                console.log('^^^', 'Filtered for wallet event collection size:', walletEvents.length);
            }

            // Retrieve each deposit's offerId
            const offerIds = await Promise.all(
                walletEvents.map(async (event) => {
                    const depositInfo = event.args;
                    const offerId = await this.stakingContract.stakeIdToStakeOffer(depositInfo._stakeId);
                    console.log('^^^', 'Mapping stakeId:', depositInfo._stakeId, '=> offerId:', offerId);
                    return Number(offerId);
                }),
            );
            console.log('^^^', 'Offer id list size:', offerIds.length, offerIds);

            // Filter deposits by offerId
            const filteredDeposits = walletEvents.filter((_event, idx) => offerIds[idx] === offerId);
            console.log('^^^', 'Filtered for offer id', offerId, 'event collection size:', filteredDeposits.length);

            // Retrieve the event creation date
            const creationDates = await Promise.all(
                filteredDeposits.map(async (event) => {
                    const block = await this.provider.getBlock(event.blockNumber);
                    return block.timestamp * 1000;
                }),
            );
            console.log('^^^', 'Event creation date list size:', creationDates.length);

            // Get offer details
            const offerDetails = await this.stakingContract.fixedTermOffers(offerId);
            const duration = Number(offerDetails.lockupDuration) * 1000;

            // Filter deposits by active status and lockupDuration
            const now = Date.now();
            const activeDeposits = filteredDeposits.filter((_event, idx) => {
                return creationDates[idx] + duration > now;
            });
            console.log('^^^', 'Active event collection size:', activeDeposits.length);

            return Promise.all(
                activeDeposits.map(async (event) => {
                    const depositInfo = event.args;
                    const block = await this.provider.getBlock(event.blockNumber);
                    return {
                        id: depositInfo._stakeId,
                        offerId: BigInt(offerId),
                        principle: parseFloat(hre.ethers.formatUnits(depositInfo._amount, CONSTANTS.WAD_DECIMALS)),
                        created: new Date(block.timestamp * 1000),
                        owner: depositInfo._address,
                    };
                }),
            );
        } catch (error) {
            console.log(error);
        }
        return [];
    }
}

async function main(argv) {
    if (argv.length < 1) {
        // Validate inputs
        console.log(['The offer id is required. The wallet address is optional'].join('\n'));
        return;
    }

    const [offerId, walletAddress] = argv;

    const service = new StakingVerificationService();
    const stakes = await service.getActiveStakesByOfferId(Number(offerId), walletAddress);
    console.log('Stakes:', stakes);
}

main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
