// cSpell:ignore moga

const BN = require('bignumber.js');
const hre = require('hardhat');
require('dotenv').config();

function calculateReward(amount, stakingPeriod = 'short') {
    // APY in basis points (1 basis point = 0.01%)
    const SHORT_TERM_APY = 1500; // 15%
    const LONG_TERM_APY = 3000; // 30%

    // Minimum staking periods
    const SHORT_TERM_PERIOD = 60;
    const LONG_TERM_PERIOD = 365;

    if (stakingPeriod === 'short') {
        apy = SHORT_TERM_APY;
    } else {
        apy = LONG_TERM_APY;
    }

    // Calculate reward: (amount * apy * stakingPeriod) / (10000 * 365 days)
    return (amount * apy * stakingPeriod) / (10000 * 365);
}

async function main(argv) {
    if (argv.length !== 4) {
        // Validate inputs
        console.log(
            'The reward rate is required as first parameter--value in percent, between [1; 20].\n' +
                'The cancellation fee is required as second parameter--value in percent, between [1; 20].\n' +
                'The lockup duration is required as third parameter--value in days, with 30 days per month, 365 days for a year.\n' +
                'The indication of an admin-only staking contract is required as fourth parameter--value is true or anything else.',
        );
        return;
    }

    let [rate, fee, lockupDuration, adminOnly] = argv;

    rate = parseInt(rate, 10);
    if (isNaN(rate) || rate < 1 || rate > 20) {
        console.error('Invalid amount reward rate. It should be a number between 1 and 20.');
        return;
    }
    rate = hre.ethers.parseUnits((rate / 100).toString(), 18);
    fee = parseInt(fee, 10);
    if (isNaN(cancellationFee) || cancellationFee < 1 || cancellationFee > 20) {
        console.error('Invalid amount cancellation fee. It should be a number between 1 and 20.');
        return;
    }
    fee = fee; // It's the value in percent, no transformation needed
    lockupDuration = parseFloat(lockupDuration);
    if (isNaN(lockupDuration) || ![30, 60, 91, 182, 365].includes(lockupDuration)) {
        console.error('Invalid amount lockup duration. It should be a number in [30, 60, 91, 182, 365].');
        return;
    }
    lockupDuration = Math.floor(lockupDuration * 24 * 60 * 60); // Convert to seconds
    adminOnly = adminOnly === 'true' ? true : false;

    // Get the contract address from command line or config
    const stakingAddress = process.env.STAKING_CONTRACT;

    // Get the contract factory and signer
    const [signer] = await hre.ethers.getSigners(); // Get the default signer
    console.log('Signer address:', signer.address);
    const Staking = await hre.ethers.getContractFactory('MogaStaking');

    // Attach to the deployed contract
    const staking = await Staking.attach(stakingAddress).connect(signer);

    // Get the list of staking offer ids
    let lastOfferId = await staking.lastFixedTermOfferId();
    console.log('Last offer id:', lastOfferId.toString());
    for (let i = 1; i <= lastOfferId; i++) {
        const offer = await staking.fixedTermOffers(i);
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

    try {
        // Create fixed-term staking offer
        console.log('Attempting to create fixed-term staking offer...');
        const tx = await staking.createFixedTermOffer(rate, fee, lockupDuration, adminOnly);

        console.log('Waiting for transaction...');
        await tx.wait(1);

        console.log('Creation of fixed-term staking offer successful!');
        console.log('Transfer successful! ' + tx.hash);
    } catch (error) {
        console.error('Detailed error:', error.message);
        // If available, get the revert reason
        if (error.error && error.error.message) {
            console.error('Revert reason:', error.error.message);
        }
    }

    // Get the list of staking offer ids
    lastOfferId = await staking.lastFixedTermOfferId();
    console.log('Last offer id:', lastOfferId.toString());
    for (let i = 1; i <= lastOfferId; i++) {
        const offer = await staking.fixedTermOffers(i);
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
