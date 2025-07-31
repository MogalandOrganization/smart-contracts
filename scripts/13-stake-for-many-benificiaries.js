// cSpell:ignore moga

const BN = require('bignumber.js');
const hre = require('hardhat');
require('dotenv').config({ silent: true });

async function main(argv) {
    if (argv.length !== 1) {
        // Validate inputs
        console.log(['The fixed-term offer id is required.'].join('\n'));
        return;
    }

    let [offerId, amount, beneficiary] = argv;

    offerId = parseInt(offerId, 10);
    if (isNaN(offerId) || offerId < 1) {
        console.error('Invalid offer id. It should be a positive integer.');
        return;
    }

    // TODO: check the ethereum address validity

    // Get the contract address from command line or config
    const stakingAddress = process.env.STAKING_CONTRACT;

    // Get the contract factory and signer
    const [signer] = await hre.ethers.getSigners(); // Get the default signer
    console.log('Signer address:', signer.address);
    const Staking = await hre.ethers.getContractFactory('MogaStaking');

    // Attach to the deployed contract
    const staking = await Staking.attach(stakingAddress).connect(signer);

    // Get the list of staking offer ids
    const offer = await staking.fixedTermOffers(offerId);
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

    const users = [];
    for (let i = 0; i < users.length; i++) {
        try {
            const user = users[i];
            const [object, operation, role, email, nickname, zealy, twitter, discord, wallet, amount, date, hash] = user;
            if (isNaN(amount) || amount <= 0) {
                console.error('Invalid amount specified');
                return;
            }
            const convertedAmount = hre.ethers.parseUnits(amount.toString(), 18);

            // Allocate the stake for the beneficiary
            let tx = { hash: '' };
            if (wallet.startsWith('0x')) {
                tx = await staking.stakeFixedTermForBeneficiary(offerId, convertedAmount, wallet);
                await tx.wait(1);
                // tx = { hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef--' + i };
            }

            console.log(
                `${object || ''},${operation || ''},${role || ''},${email || ''},${nickname || ''},${zealy || ''},${twitter || ''},${
                    discord || ''
                },${wallet || ''},${amount},${date || ''},${tx.hash || ''}`,
            );
        } catch (error) {
            console.error('Detailed error:', error.message);
            // If available, get the revert reason
            if (error.error && error.error.message) {
                console.error('Revert reason:', error.error.message);
            }
        }
    }
}

main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
