// cSpell:ignore moga

const hre = require('hardhat');
require('dotenv').config({ quiet: true });

async function main(argv) {
    // Validate inputs
    if (argv.length !== 1) {
        console.log('The amount of MOGA tokens to transfer to the staking contract is required. It can be 0');
        return;
    }

    const [rawAmount] = argv;

    if (isNaN(parseFloat(rawAmount)) || parseFloat(rawAmount) < 0) {
        console.error('Invalid amount specified');
        return;
    }
    const amount = hre.ethers.parseUnits(rawAmount, 18);

    // Get the contract address from command line or config
    const contractAddress = process.env.MOGA_CONTRACT;
    const stakingAddress = process.env.STAKING_CONTRACT;

    // Get the contract factory and signer
    const [signer] = await hre.ethers.getSigners(); // Get the default signer
    console.log('Signer address:', signer.address);
    const MogaToken = await hre.ethers.getContractFactory('MogaToken');
    const Staking = await hre.ethers.getContractFactory('MogaStaking');

    // Attach to the deployed contract
    const mogaToken = await MogaToken.attach(contractAddress).connect(signer);
    const staking = await Staking.attach(stakingAddress).connect(signer);

    // Display the owner of the contracts
    const mogaOwner = await mogaToken.owner();
    const stakingOwner = await staking.owner();
    console.log('Moga contract owner:', mogaOwner);
    console.log('Staking contract owner:', stakingOwner);

    // Balance checks before transfer
    const senderBalance = await mogaToken.balanceOf(
        signer.address,
        // process.env.MOGA_CONTRACT
    );
    console.log('Available supply:', hre.ethers.formatUnits(senderBalance, 18));
    if (senderBalance < amount) {
        console.error('Insufficient balance for transfer');
        return;
    }

    // Check the remaining tokens the spender is allowed to spend on the behalf of the owner
    try {
        const initialAllowance = await mogaToken.allowance(mogaOwner, stakingAddress);
        console.log('Amount the staking contract can spend:', hre.ethers.formatUnits(initialAllowance, 18));
    } catch (e) {
        console.log('Error:', e);
    }

    // Approve the staking contract to spend tokens on the behalf of the owner
    console.log('Attempting to approve staking contract...');
    const approveTx = await mogaToken.approve(stakingAddress, amount);
    console.log('Waiting for transaction...');
    await approveTx.wait();
    console.log('Approval successful!');

    // Check the remaining tokens the spender is allowed to spend on the behalf of the owner
    const finalAllowance = await mogaToken.allowance(mogaOwner, stakingAddress);
    console.log('Amount the staking contract can spend:', hre.ethers.formatUnits(finalAllowance, 18));

    // Transfer tokens to the staking contract
    if (finalAllowance !== BigInt(0)) {
        console.log('Attempting to transfer tokens to staking contract...');
        const transferTx = await mogaToken.transfer(stakingAddress, amount);

        console.log('Waiting for transaction...');
        await transferTx.wait(1);

        console.log('Transfer successful!');

        // Check the total supply of the token
        const totalSupply = await mogaToken.totalSupply();
        console.log('Total supply:', hre.ethers.formatUnits(totalSupply, 18));

        // Check the MOGA balance of the staking contract
        const stakingBalance = await mogaToken.balanceOf(stakingAddress);
        console.log('Staking contract balance:', hre.ethers.formatUnits(stakingBalance, 18));

        // Check the MOGA balance of the owner
        const ownerBalance = await mogaToken.balanceOf(mogaOwner);
        console.log('Owner balance:', hre.ethers.formatUnits(ownerBalance, 18));
    }
}

main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
