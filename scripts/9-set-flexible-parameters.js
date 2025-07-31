// cSpell:ignore moga

const hre = require('hardhat');
require('dotenv').config({ quiet: true });

async function main(argv) {
    // Validate inputs
    if (argv.length !== 2) {
        console.log(['The rate in percent is expected, between [1; 20].', 'The fee in percent is expected, between [1; 20].'].join('\n'));
        return;
    }

    let [rate, fee] = argv;

    rate = parseInt(rate, 10);
    if (isNaN(rate) || rate < 1 || rate > 20) {
        console.error('Invalid amount reward rate. It should be a number between 1 and 20.');
        return;
    }
    rate = hre.ethers.parseUnits((rate / 100).toString(), 18);
    fee = parseInt(fee, 10);
    if (isNaN(fee) || fee < 1 || fee > 20) {
        console.error('Invalid amount cancellation fee. It should be a number between 1 and 20.');
        return;
    }
    fee = fee; // It's the value in percent, no transformation needed

    // Get the contract address from command line or config
    const stakingAddress = process.env.STAKING_CONTRACT;

    // Get the contract factory and signer
    const [signer] = await hre.ethers.getSigners(); // Get the default signer
    console.log('Signer address:', signer.address);
    const Staking = await hre.ethers.getContractFactory('MogaStaking');

    // Attach to the deployed contract
    const staking = await Staking.attach(stakingAddress).connect(signer);

    // Get the list of staking offer ids
    console.log('Rate:', await staking.flexibleTermRate(), '-- Fee:', await staking.flexibleTermFee());

    try {
        // Change the rate
        console.log('Attempting to set the flexible-term rate..');
        let tx = await staking.setFlexibleTermRate(rate);

        console.log('Waiting for transaction...');
        await tx.wait(1);

        console.log('Rate set!');

        // Change the fee
        console.log('Attempting to set the flexible-term fee..');
        tx = await staking.setFlexibleTermFee(fee);

        console.log('Waiting for transaction...');
        await tx.wait(1);

        console.log('Fee set!');

        console.log('Transfer successful! ', tx.hash);
    } catch (error) {
        console.error('Detailed error:', error.message);
        // If available, get the revert reason
        if (error.error && error.error.message) {
            console.error('Revert reason:', error.error.message);
        }
    }

    // Get the list of staking offer ids
    console.log('Rate:', await staking.flexibleTermRate(), '-- Fee:', await staking.flexibleTermFee());
}

main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
