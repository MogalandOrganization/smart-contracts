// cSpell:ignore moga

import hre from 'hardhat';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
const { ethers } = await hre.network.connect(process.env.HARDHAT_NETWORK);

async function main(argv) {
    // Validate inputs
    if (argv.length !== 0) {
        console.log('No parameters are required.');
        return;
    }

    // Get the contract address from command line or config
    const stakingAddress = process.env.STAKING_CONTRACT;

    // Get the contract factory and signer
    const [signer] = await ethers.getSigners(); // Get the default signer
    console.log('Signer address:', signer.address);
    const Staking = await ethers.getContractFactory('MogaStaking');

    // Attach to the deployed contract
    const staking = await Staking.attach(stakingAddress).connect(signer);

    const withdrawableAmount = await staking.getWithdrawableAmount(); // wad
    console.log('Withdrawable amount:', withdrawableAmount);
    if (withdrawableAmount !== 0n) {
        console.log('Withdrawing...');
        const tx = await staking.withdraw(withdrawableAmount - 1000n);
        console.log('Transaction hash:', tx.hash);
        await tx.wait();
        console.log('Withdrawn successfully.');
        console.log('Withdrawable amount:', await staking.getWithdrawableAmount());
    }
}

main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
