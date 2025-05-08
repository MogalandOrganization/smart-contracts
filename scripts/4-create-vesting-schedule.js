// cSpell:ignore moga

const hre = require('hardhat');
require('dotenv').config();

async function main(argv) {
    // Validate inputs
    if (argv.length !== 3) {
        console.log(
            '1. The wallet address of the recipient is required.\n' +
                '2. The amount of MOGA tokens to vest is required.\n' +
                '3. The vesting type is required. (non-revocable or anything else)',
        );
        return;
    }

    const [recipient, rawAmount, vestingType] = argv;

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
    const vestingAddress = process.env.VESTING_CONTRACT;

    // Get the contract factories
    const MogaToken = await hre.ethers.getContractFactory('MogaToken');
    const Vesting = await hre.ethers.getContractFactory('MogaVesting');

    // Attach to the deployed contracts
    const mogaToken = await MogaToken.attach(contractAddress);
    const vesting = await Vesting.attach(vestingAddress);

    // Check the remaining tokens the spender is allowed to spend on the behalf of the owner
    const allowance = await mogaToken.allowance(process.env.PUBLIC_KEY, vestingAddress);
    console.log('Current allowance:', hre.ethers.formatUnits(allowance, 18));
    if (allowance < amount) {
        console.error('Insufficient allowance for vesting contract');
        return;
    }

    // Display the owner of the contracts
    const mogaOwner = await mogaToken.owner();
    const vestingOwner = await vesting.owner();
    console.log('Moga contract owner:', mogaOwner);
    console.log('Vesting contract owner:', vestingOwner);
    if (mogaOwner !== process.env.PUBLIC_KEY) {
        throw new Error('You are not the owner of this contract!');
    }

    // Get the vesting schedule for the specified beneficiary
    const count = await vesting.getVestingSchedulesCountByBeneficiary(recipient);
    console.log('Number of vesting schedules for recipient:', count.toString(), typeof count);
    for (let i = 0; i < count; i++) {
        const schedule = await vesting.getVestingScheduleByAddressAndIndex(recipient, i);
        console.log(`Vesting schedule info for address and index ${i}:`, schedule);
        const scheduleId = await vesting.getVestingIdAtIndex(i);
        console.log(`Vesting schedule ID ${i}:`, scheduleId);
        const scheduleInfo = await vesting.getVestingSchedule(scheduleId);
        console.log(`Vesting schedule info for index ${i}:`, scheduleInfo);

        const totalAmount = await vesting.getVestingSchedulesTotalAmount();
        console.log(`Total amount of vesting schedules:`, totalAmount);
        const withdrawableAmount = await vesting.getWithdrawableAmount();
        console.log(`Withdrawable amount of vesting schedules:`, withdrawableAmount);
    }

    try {
        const startTime = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
        const oneDay = 24 * 60 * 60; // 24 hours in seconds
        const eightDays = 8 * oneDay; // 8 days in seconds

        console.log(`Creating vesting schedule for ${recipient} with ${rawAmount} MOGA tokens`);
        console.log(`Start time: ${startTime}`);
        console.log(`Cliff duration: ${oneDay} seconds (1 day)`);
        console.log(`Total duration: ${eightDays} seconds (8 days)`);
        console.log(`Slice period: ${oneDay} seconds (1 day)`);

        const tx = await vesting.createVestingSchedule(
            recipient,
            startTime, // start time in seconds
            oneDay, // cliff duration: 1 day in seconds
            eightDays, // total duration: 8 days in seconds
            oneDay, // slice period: 1 day in seconds
            vestingType !== 'non-revocable',
            amount,
        );
        console.log('Transaction hash:', tx.hash); // 0x9443f84d1fa850f23dfafd04173a01f311f0b99d8529b06d50963994ca5da85b
        const blockExplorerUrl = process.env.BLOCK_EXPLORER_URL;
        console.log(`${blockExplorerUrl}/tx/${tx.hash}`);

        await tx.wait(1);

        console.log('Vesting schedule created successfully');
    } catch (error) {
        console.error('Detailed error:', error.message);
        // If available, get the revert reason
        if (error.error && error.error.message) {
            console.error('Revert reason:', error.error.message);
        }
    }
}

main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
