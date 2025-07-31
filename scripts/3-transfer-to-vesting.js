// cSpell:ignore moga

const hre = require('hardhat');
require('dotenv').config({ quiet: true });

async function main(argv) {
    // Validate inputs
    if (argv.length !== 1) {
        console.log('The amount of MOGA tokens to transfer to the vesting contract is required. It can be 0');
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
    const vestingAddress = process.env.VESTING_CONTRACT;

    // Get the contract factory and signer
    const [signer] = await hre.ethers.getSigners(); // Get the default signer
    console.log('Signer address:', signer.address);
    const MogaToken = await hre.ethers.getContractFactory('MogaToken');
    const Vesting = await hre.ethers.getContractFactory('MogaVesting');

    // Attach to the deployed contract
    const mogaToken = await MogaToken.attach(contractAddress).connect(signer);
    const vesting = await Vesting.attach(vestingAddress).connect(signer);

    // Display the owner of the contracts
    const mogaOwner = await mogaToken.owner();
    const vestingOwner = await vesting.owner();
    console.log('Moga contract owner:', mogaOwner);
    console.log('Vesting contract owner:', vestingOwner);
    if (mogaOwner !== process.env.PUBLIC_KEY) {
        throw new Error('You are not the owner of this contract!');
    }

    // Balance checks before transfer
    const senderBalance = await mogaToken.balanceOf(signer.address);
    console.log('Available supply:', hre.ethers.formatUnits(senderBalance, 18));
    if (senderBalance < amount) {
        console.error('Insufficient balance for transfer');
        return;
    }

    // Check the remaining tokens the spender is allowed to spend on the behalf of the owner
    const initialAllowance = await mogaToken.allowance(mogaOwner, vestingAddress);
    console.log('Amount the vesting contract can spend:', hre.ethers.formatUnits(initialAllowance, 18));
    if (initialAllowance > BigInt(0)) {
        console.log('The vesting contract is already approved to spend tokens on behalf of the owner');
        return;
    }

    // Approve the vesting contract to spend tokens on the behalf of the owner
    console.log('Attempting to approve vesting contract...');
    const approveTx = await mogaToken.approve(vestingAddress, amount);
    console.log('Waiting for transaction...');
    await approveTx.wait(1);
    console.log('Approval successful!');

    // Check the remaining tokens the spender is allowed to spend on the behalf of the owner
    const finalAllowance = await mogaToken.allowance(mogaOwner, vestingAddress);
    console.log('Amount the vesting contract can spend:', hre.ethers.formatUnits(finalAllowance, 18));

    // Transfer tokens to the vesting contract
    if (finalAllowance !== BigInt(0)) {
        console.log('Attempting to transfer tokens to vesting contract...');
        const transferTx = await mogaToken.transfer(vestingAddress, amount);

        console.log('Waiting for transaction...');
        await transferTx.wait(1);

        console.log('Transfer successful!');

        // Check the MOGA balance of the vesting contract
        const vestingBalance = await mogaToken.balanceOf(vestingAddress);
        console.log('Vesting contract balance:', hre.ethers.formatUnits(vestingBalance, 18));

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
