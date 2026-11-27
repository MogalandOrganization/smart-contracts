// cSpell:ignore moga unstake unstaking
// Pauses the MogaStaking contract (fixed-term and flexible-term staking live in the same contract).
//   - Blocked while paused: stakeFixedTerm, stakeFlexibleTerm, stakeFixedTermForBeneficiary (admin).
//   - Still working while paused: unStakeFixedTerm, unStakeFlexibleTerm, compoundFlexibleTerm and every read,
//     so holders can still withdraw their tokens.
// The owner can undo it with unpause() (for example from the explorer "Write contract" tab).
//
// Dry run, nothing is sent (checks the owner, the current state and simulates the transaction):
//   HARDHAT_NETWORK=edu-chain node scripts/18-pause-staking-contract.js
// Send the transaction:
//   HARDHAT_NETWORK=edu-chain node scripts/18-pause-staking-contract.js --confirm
//
// Environment (.env): HARDHAT_NETWORK, STAKING_CONTRACT, PRIVATE_KEY (read by hardhat.config.js for the signer).
import hre from 'hardhat';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

async function main(argv) {
    const unknownArguments = argv.filter((argument) => argument !== '--confirm');
    if (unknownArguments.length > 0) {
        console.error('Unknown argument(s):', unknownArguments.join(' '));
        console.error('Only --confirm is accepted. Without it, the script is a dry run.');
        return 1;
    }
    const confirm = argv.includes('--confirm');

    const networkName = process.env.HARDHAT_NETWORK;
    const stakingAddress = process.env.STAKING_CONTRACT;
    if (!networkName) {
        console.error('HARDHAT_NETWORK is required, e.g. HARDHAT_NETWORK=edu-chain');
        return 1;
    }
    if (!stakingAddress) {
        console.error('STAKING_CONTRACT is required in the environment or in .env');
        return 1;
    }

    const { ethers } = await hre.network.connect(networkName);
    const [signer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    console.log('Network:', networkName, '(chain id', network.chainId.toString() + ')');
    console.log('Signer address:', signer.address);
    console.log('Staking contract:', stakingAddress);

    if ((await ethers.provider.getCode(stakingAddress)) === '0x') {
        console.error('There is no contract at the staking address on this network.');
        return 1;
    }
    const staking = new ethers.Contract(
        stakingAddress,
        ['function owner() view returns (address)', 'function paused() view returns (bool)', 'function pause()'],
        signer,
    );

    const owner = await staking.owner();
    console.log('Contract owner:', owner);
    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
        console.error('The signer is not the owner of the staking contract. Nothing was sent.');
        return 1;
    }
    if (await staking.paused()) {
        console.log('The staking contract is already paused. Nothing to do.');
        return 0;
    }
    console.log('Current state: NOT paused. New stakes are still accepted.');

    // Simulates the call: fails here (before sending anything) if the transaction would revert.
    const gas = await staking.pause.estimateGas();
    const balance = await ethers.provider.getBalance(signer.address);
    console.log('Simulation OK. Estimated gas:', gas.toString(), '-- signer balance:', ethers.formatEther(balance));

    if (!confirm) {
        console.log('Dry run: nothing was sent. Re-run with --confirm to pause the staking contract.');
        return 0;
    }

    console.log('Sending pause()...');
    const tx = await staking.pause();
    console.log('Transaction hash:', tx.hash);
    const receipt = await tx.wait(1);
    console.log('Mined in block', receipt.blockNumber, '-- status', receipt.status);

    const paused = await staking.paused();
    if (!paused) {
        console.error('paused() still returns false after the transaction. Check the explorer.');
        return 1;
    }
    console.log('Done: the staking contract is paused. New stakes are rejected, unstaking still works.');
    return 0;
}

main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
