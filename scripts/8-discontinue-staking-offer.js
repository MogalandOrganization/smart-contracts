// cSpell:ignore moga

const hre = require('hardhat');
require('dotenv').config();

async function main(argv) {
    // Validate inputs
    if (argv.length !== 1) {
        console.log('The id of the stake offer is required. If `0` is given, the offer list is printed, no offer is removed.');
        return;
    }

    let [offerId] = argv;

    offerId = parseInt(offerId, 10);
    if (isNaN(offerId) || offerId < 0) {
        console.error('Invalid amount offer ID. If `0` is given, the offer list is printed, no offer is removed..');
        return;
    }

    // Get the contract address from command line or config
    const stakingAddress = process.env.STAKING_CONTRACT;

    // Get the contract factory and signer
    const [signer] = await hre.ethers.getSigners(); // Get the default signer
    console.log('Signer address:', signer.address);
    const Staking = await hre.ethers.getContractFactory('MogaStaking');

    // Attach to the deployed contract
    const staking = await Staking.attach(stakingAddress).connect(signer);

    // Get the list of staking offer ids
    const stakingOfferIds = await staking.getAllStakeOfferIds();
    console.log('List of staking offers: [', stakingOfferIds.join(', '), ']');
    for (const offerId of stakingOfferIds) {
        const offer = await staking.stakeOffers(offerId);
        if (offer[3] === false || offer[4] === true) {
            continue;
        }
        console.log(
            'Staking offer: { rate:',
            offer[0],
            ', fee:',
            offer[1],
            ', duration:',
            offer[2],
            ', active:',
            offer[3],
            ', adminOnly:',
            offer[4],
            ' }',
        );
    }

    if (offerId !== 0) {
        try {
            // Create fixed-term staking offer
            console.log('Attempting to discontinue fixed-term staking offer...');
            const tx = await staking.discontinueStakeOffer(offerId);

            console.log('Waiting for transaction...');
            await tx.wait(1);

            console.log('Discontinuation of fixed-term staking offer successful!');
            console.log('Transfer successful! ' + tx.hash);
        } catch (error) {
            console.error('Detailed error:', error.message);
            // If available, get the revert reason
            if (error.error && error.error.message) {
                console.error('Revert reason:', error.error.message);
            }
        }
    }

    // Get the list of staking offer ids
    const updatedStakingOfferIds = await staking.getAllStakeOfferIds();
    console.log('List of staking offers: [', updatedStakingOfferIds.join(', '), ']');
    for (const offerId of updatedStakingOfferIds) {
        const offer = await staking.stakeOffers(offerId);
        if (offer[3] === false || offer[4] === true) {
            continue;
        }
        console.log(
            'Staking offer: { rate:',
            offer[0],
            ', fee:',
            offer[1],
            ', duration:',
            offer[2],
            ', active:',
            offer[3],
            ', adminOnly:',
            offer[4],
            ' }',
        );
    }
}

main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
