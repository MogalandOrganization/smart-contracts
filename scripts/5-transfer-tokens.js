// cSpell:ignore moga

const hre = require('hardhat');
require('dotenv').config({ quiet: true });

async function main(argv) {
    // Validate inputs
    if (argv.length !== 2) {
        console.log(
            ['1. The amount of MOGA tokens to transfer is required.', '2. The wallet address of the recipient is required.'].join('\n'),
        );
        return;
    }

    const [rawAmount, recipient] = argv;

    if (!hre.ethers.isAddress(recipient)) {
        console.error('Invalid recipient address');
        return;
    }

    if (isNaN(parseFloat(rawAmount)) || parseFloat(rawAmount) <= 0) {
        console.error('Invalid amount specified');
        return;
    }
    const amount = hre.ethers.parseUnits(rawAmount, 18);

    // Get the contract address from command line or config
    const contractAddress = process.env.MOGA_CONTRACT;

    // Get the contract factory and signer
    const [signer] = await hre.ethers.getSigners(); // Get the default signer
    console.log('Signer address:', signer.address);
    const MogaToken = await hre.ethers.getContractFactory('MogaToken');

    // Attach to the deployed contract
    const mogaToken = await MogaToken.attach(contractAddress).connect(signer);

    // Check if the signer is the owner
    const owner = await mogaToken.owner();
    console.log('Contract owner:', owner);

    // Check if tokens have already been minted
    const currentSupply = await mogaToken.totalSupply();
    console.log('Current total supply:', hre.ethers.formatUnits(currentSupply, 18));

    // Balance checks before transfer
    const senderBalance = await mogaToken.balanceOf(signer.address);
    console.log('Available supply:', hre.ethers.formatUnits(senderBalance, 18));
    if (senderBalance < amount) {
        console.error('Insufficient balance for transfer');
        return;
    }

    try {
        // Estimate gas for the transfer
        console.log('Estimating gas for transfer...');
        const estimatedGas = await mogaToken.transfer.estimateGas(recipient, amount);
        console.log('Estimated gas:', estimatedGas.toString());

        // Transfer the amount
        console.log('Attempting to transfer tokens...');
        const tx = await mogaToken.transfer(recipient, amount, {
            gasLimit: (estimatedGas * BigInt(110)) / BigInt(100), // Add 10% buffer
        });

        console.log('Waiting for transaction...');
        await tx.wait(1);

        console.log('Transfer successful! ', tx.hash);
    } catch (error) {
        console.error('Detailed error:', error.message);
        // If available, get the revert reason
        if (error.code === 'ACTION_REJECTED') {
            console.error('Transaction was rejected by user');
        } else if (error.code === 'INSUFFICIENT_FUNDS') {
            console.error('Insufficient funds for gas');
        } else {
            console.error('Transfer failed:', error.message);
        }
    }

    // Optional: Check the total supply after TGE
    const newSenderBalance = await mogaToken.balanceOf(signer.address);
    console.log('New available supply:', hre.ethers.formatUnits(newSenderBalance, 18));
}

main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
