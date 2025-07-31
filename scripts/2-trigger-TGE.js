// cSpell:ignore moga

const hre = require('hardhat');
require('dotenv').config({ quiet: true });

async function main(argv) {
    // Get the contract address from command line or config
    const contractAddress = process.env.MOGA_CONTRACT;

    // Get the contract factory
    const MogaToken = await hre.ethers.getContractFactory('MogaToken');

    // Attach to the deployed contract
    const mogaToken = await MogaToken.attach(contractAddress);

    // Check if the signer is the owner
    const owner = await mogaToken.owner();
    console.log('Contract owner:', owner);
    if (owner !== process.env.PUBLIC_KEY) {
        throw new Error('You are not the owner of this contract!');
    }

    // Check if tokens have already been minted
    const currentSupply = await mogaToken.totalSupply();
    console.log('Current total supply before TGE:', hre.ethers.formatUnits(currentSupply, 18));

    try {
        // Trigger the TGE
        console.log('Attempting to mint tokens...');
        const tx = await mogaToken.mintTokens();

        console.log('Waiting for transaction...');
        await tx.wait(1);

        console.log('Minting successful!');
    } catch (error) {
        console.error('Detailed error:', error.message);
        // If available, get the revert reason
        if (error.error && error.error.message) {
            console.error('Revert reason:', error.error.message);
        }
    }

    // Optional: Check the total supply after TGE
    const totalSupply = await mogaToken.totalSupply();
    console.log('Total supply after TGE:', hre.ethers.formatUnits(totalSupply, 18));
}

main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
