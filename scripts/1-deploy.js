// cSpell:ignore moga

import hre from 'hardhat';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
const { ethers } = await hre.network.connect(process.env.HARDHAT_NETWORK);

async function main(argv) {
    // Get the contract references
    const Token = await ethers.getContractFactory('MogaToken');
    const Staking = await ethers.getContractFactory('MogaStaking');
    const Vesting = await ethers.getContractFactory('MogaVesting');
    let deployerAcc, mogaAdmin, addr1, addr2, addr3; // declared explicitly: ESM is strict, implicit globals throw
    [deployerAcc, mogaAdmin, addr1, addr2, addr3] = await ethers.getSigners();

    // Publish the MOGA token contract
    const mogaToken = await Token.deploy(process.env.PUBLIC_KEY, 1000000000);
    await mogaToken.waitForDeployment();
    const mogaTokenAddress = await mogaToken.getAddress();
    console.log('MOGA token deployed: ', mogaTokenAddress);
    // const mogaTokenAddress = process.env.MOGA_CONTRACT;

    // Publish the MOGA staking contract
    const mogaStaking = await Staking.deploy(process.env.PUBLIC_KEY, mogaTokenAddress);
    await mogaStaking.waitForDeployment();
    const mogaStakingAddress = await mogaStaking.getAddress();
    console.log('MOGA staking deployed: ', mogaStakingAddress);

    // Publish the MOGA vesting contract
    const mogaVesting = await Vesting.deploy(process.env.PUBLIC_KEY, mogaTokenAddress);
    await mogaVesting.waitForDeployment();
    const mogaVestingAddress = await mogaVesting.getAddress();
    console.log('MOGA Vesting deployed: ', mogaVestingAddress);
}

main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
