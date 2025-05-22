// cSpell:ignore moga

const { cons } = require('fp-ts/lib/NonEmptyArray2v');
const hre = require('hardhat');
require('dotenv').config();

async function main(argv) {
    // Validate inputs
    if (argv.length !== 1) {
        console.log('The wallet address of the recipient is required.');
        return;
    }

    const [recipient] = argv;

    if (!hre.ethers.isAddress(recipient)) {
        console.error('Invalid recipient address');
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

    const globalRewardIndex = await staking.globalRewardIndex(); // ray
    const lastGlobalRewardIndexUpdateDate = await staking.lastGlobalRewardIndexUpdateDate();
    const rate = await staking.flexibleTermRate(); // ray
    const balance = await staking.flexibleTermBalances(recipient); // wad
    const userRewardIndex = await staking.userRewardIndex(recipient); // ray
    const unclaimedReward = await staking.flexibleTermUnclaimedRewards(recipient); // wad
    console.log('Global reward index:', globalRewardIndex);
    console.log('User reward index:  ', userRewardIndex);
    console.log('Rate:               ', rate);
    console.log('Balance:            ', balance);
    console.log('Unclaimed reward:   ', unclaimedReward);

    // currentIndex = globalRewardIndex × rate^timeDelta
    const timeDelta = BigInt(Math.floor(Date.now() / 1000)) - lastGlobalRewardIndexUpdateDate; // seconds
    const rateOverTime = powerRay(rate, timeDelta);
    const currentIndex = mulRay(globalRewardIndex, rateOverTime);

    console.log('Time delta:         ', timeDelta);
    console.log('Rate over time:     ', rateOverTime);
    console.log('Current index       ', currentIndex);

    // rewards = balance × (currentIndex / userRewardIndex) - balance
    const indexByUserIndex = divRay(currentIndex, userRewardIndex);
    const rewards = mulRay(indexByUserIndex, balance) - balance + unclaimedReward; // rewards is in wad

    console.log('Index by user index:', indexByUserIndex);
    console.log('Rewards:            ', rewards);

    console.log(' ');
    const contractValue = await staking.getFlexibleTermRewards(recipient);
    console.log('Local estimation:    ', parseFloat(hre.ethers.formatUnits(rewards, 18), 'MOGA'));
    console.log('Contract computation:', parseFloat(hre.ethers.formatUnits(contractValue, 18), 'MOGA'));
    console.log('Difference:          ', parseFloat(hre.ethers.formatUnits(rewards - contractValue, 18), 'MOGA'));
}

const RAY = 10n ** 27n;

function mulRay(x, y) {
    return (x * y + RAY / 2n) / RAY;
}

function divRay(x, y) {
    return (x * RAY + y / 2n) / y;
}

function powerRay(x, n) {
    let z = n % 2n != 0 ? x : RAY;

    for (n /= 2n; n != 0; n /= 2n) {
        x = mulRay(x, x);

        if (n % 2n != 0) {
            z = mulRay(z, x);
        }
    }

    return z;
}

main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
