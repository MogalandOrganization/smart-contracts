// cSpell:ignore moga addrs

const { expect } = require('chai');
const hre = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');

describe('TokenVesting', function () {
    let Token;
    let testToken;
    let testTokenAddress;
    let TokenVesting;
    let tokenVestingAddress;
    let owner;
    let addr1;
    let addr2;
    let addrs;
    let tokenCap = 1000000000;

    before(async function () {
        Token = await hre.ethers.getContractFactory('MogaToken');
        TokenVesting = await hre.ethers.getContractFactory('MogaVesting');

        [owner, addr1, addr2, ...addrs] = await hre.ethers.getSigners();
    });

    beforeEach(async function () {
        testToken = await Token.deploy(owner, tokenCap);
        await testToken.waitForDeployment();
        testTokenAddress = await testToken.getAddress();
        await testToken.connect(owner).mintTokens();
    });

    describe('Vesting', function () {
        it('Should assign the total supply of tokens to the owner', async function () {
            const ownerBalance = await testToken.balanceOf(owner.address);
            expect(await testToken.totalSupply()).to.equal(ownerBalance);
        });

        it('Should vest tokens gradually', async function () {
            // deploy vesting contract
            const tokenVesting = await TokenVesting.deploy(owner, testTokenAddress);
            await tokenVesting.waitForDeployment();
            tokenVestingAddress = await tokenVesting.getAddress();
            // console.log("testTokenAddress: " + testTokenAddress);
            // console.log(
            //   "tokenVesting.getToken(): " + (await tokenVesting.getToken())
            // );
            expect((await tokenVesting.getToken()).toString()).to.equal(testTokenAddress);
            // send tokens to vesting contract
            await expect(testToken.transfer(tokenVestingAddress, 1000))
                .to.emit(testToken, 'Transfer')
                .withArgs(owner.address, tokenVestingAddress, 1000);
            const vestingContractBalance = await testToken.balanceOf(tokenVestingAddress);
            expect(vestingContractBalance).to.equal(1000);
            expect(await tokenVesting.getWithdrawableAmount()).to.equal(1000);

            //const baseTime = 1622551248;
            const baseTime = await helpers.time.latest();
            const beneficiary = addr1;
            const startTime = baseTime;
            const cliff = 0;
            const duration = 1000;
            const slicePeriodSeconds = 1;
            const revokable = true;
            const amount = 100;

            // create new vesting schedule
            await tokenVesting.createVestingSchedule(
                beneficiary.address,
                startTime,
                cliff,
                duration,
                slicePeriodSeconds,
                revokable,
                amount,
            );
            expect(await tokenVesting.getVestingSchedulesCount()).to.be.equal(1);
            expect(await tokenVesting.getVestingSchedulesCountByBeneficiary(beneficiary.address)).to.be.equal(1);

            // compute vesting schedule id
            const vestingScheduleId = await tokenVesting.computeVestingScheduleIdForBeneficiaryAndIndex(beneficiary.address, 0);

            // check that vested amount is 0
            expect(await tokenVesting.computeReleasableAmount(vestingScheduleId)).to.be.equal(0);

            // set time to half the vesting period
            const halfTime = baseTime + duration / 2;
            //await tokenVesting.setCurrentTime(halfTime);

            await helpers.time.increaseTo(halfTime);

            // check that vested amount is half the total amount to vest
            expect(await tokenVesting.connect(beneficiary).computeReleasableAmount(vestingScheduleId)).to.be.equal(50);

            // check that only beneficiary can try to release vested tokens
            await expect(tokenVesting.connect(addr2).release(vestingScheduleId, 100)).to.be.revertedWith(
                'TokenVesting: only beneficiary and owner can release vested tokens',
            );

            // check that beneficiary cannot release more than the vested amount
            await expect(tokenVesting.connect(beneficiary).release(vestingScheduleId, 100)).to.be.revertedWith(
                'TokenVesting: cannot release tokens, not enough vested tokens',
            );

            // release 10 tokens and check that a Transfer event is emitted with a value of 10
            await expect(tokenVesting.connect(beneficiary).release(vestingScheduleId, 10))
                .to.emit(testToken, 'Transfer')
                .withArgs(tokenVestingAddress, beneficiary.address, 10);

            // check that the vested amount is now 40
            expect(await tokenVesting.connect(beneficiary).computeReleasableAmount(vestingScheduleId)).to.be.equal(40);
            let vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            // check that the released amount is 10
            expect(vestingSchedule.released).to.be.equal(10);

            // set current time after the end of the vesting period
            //await tokenVesting.setCurrentTime(baseTime + duration + 1);
            await helpers.time.increaseTo(baseTime + duration + 1);

            // check that the vested amount is 90
            expect(await tokenVesting.connect(beneficiary).computeReleasableAmount(vestingScheduleId)).to.be.equal(90);

            // beneficiary release vested tokens (45)
            await expect(tokenVesting.connect(beneficiary).release(vestingScheduleId, 45))
                .to.emit(testToken, 'Transfer')
                .withArgs(tokenVestingAddress, beneficiary.address, 45);

            // owner release vested tokens (45)
            await expect(tokenVesting.connect(owner).release(vestingScheduleId, 45))
                .to.emit(testToken, 'Transfer')
                .withArgs(tokenVestingAddress, beneficiary.address, 45);
            vestingSchedule = await tokenVesting.getVestingSchedule(vestingScheduleId);

            // check that the number of released tokens is 100
            expect(vestingSchedule.released).to.be.equal(100);

            // check that the vested amount is 0
            expect(await tokenVesting.connect(beneficiary).computeReleasableAmount(vestingScheduleId)).to.be.equal(0);

            // check that anyone cannot revoke a vesting
            await expect(tokenVesting.connect(addr2).revoke(vestingScheduleId)).to.be.revertedWithCustomError(
                tokenVesting,
                'OwnableUnauthorizedAccount',
            );
            await tokenVesting.revoke(vestingScheduleId);

            /*
             * TEST SUMMARY
             * deploy vesting contract
             * send tokens to vesting contract
             * create new vesting schedule (100 tokens)
             * check that vested amount is 0
             * set time to half the vesting period
             * check that vested amount is half the total amount to vest (50 tokens)
             * check that only beneficiary can try to release vested tokens
             * check that beneficiary cannot release more than the vested amount
             * release 10 tokens and check that a Transfer event is emitted with a value of 10
             * check that the released amount is 10
             * check that the vested amount is now 40
             * set current time after the end of the vesting period
             * check that the vested amount is 90 (100 - 10 released tokens)
             * release all vested tokens (90)
             * check that the number of released tokens is 100
             * check that the vested amount is 0
             * check that anyone cannot revoke a vesting
             */
        });

        it('Should release vested tokens if revoked', async function () {
            // deploy vesting contract
            const tokenVesting = await TokenVesting.deploy(owner, testTokenAddress);
            await tokenVesting.waitForDeployment();
            tokenVestingAddress = await tokenVesting.getAddress();
            expect((await tokenVesting.getToken()).toString()).to.equal(testTokenAddress);
            // send tokens to vesting contract
            await expect(testToken.transfer(tokenVestingAddress, 1000))
                .to.emit(testToken, 'Transfer')
                .withArgs(owner.address, tokenVestingAddress, 1000);

            const baseTime = await helpers.time.latest();
            const beneficiary = addr1;
            const startTime = baseTime;
            const cliff = 0;
            const duration = 1000;
            const slicePeriodSeconds = 1;
            const revokable = true;
            const amount = 100;

            // create new vesting schedule
            await tokenVesting.createVestingSchedule(
                beneficiary.address,
                startTime,
                cliff,
                duration,
                slicePeriodSeconds,
                revokable,
                amount,
            );

            // compute vesting schedule id
            const vestingScheduleId = await tokenVesting.computeVestingScheduleIdForBeneficiaryAndIndex(beneficiary.address, 0);

            // set time to half the vesting period
            const halfTime = baseTime + duration / 2;
            await helpers.time.increaseTo(halfTime);

            await expect(tokenVesting.revoke(vestingScheduleId))
                .to.emit(testToken, 'Transfer')
                .withArgs(tokenVestingAddress, beneficiary.address, 50);
        });

        it('Should compute vesting schedule index', async function () {
            const tokenVesting = await TokenVesting.deploy(owner, testTokenAddress);
            await tokenVesting.waitForDeployment();
            tokenVestingAddress = await tokenVesting.getAddress();
            const expectedVestingScheduleId = '0xa279197a1d7a4b7398aa0248e95b8fcc6cdfb43220ade05d01add9c5468ea097';
            expect((await tokenVesting.computeVestingScheduleIdForBeneficiaryAndIndex(addr1.address, 0)).toString()).to.equal(
                expectedVestingScheduleId,
            );
            expect((await tokenVesting.computeNextVestingScheduleIdForBeneficiary(addr1.address)).toString()).to.equal(
                expectedVestingScheduleId,
            );
        });

        it('Should check input parameters for createVestingSchedule method', async function () {
            const tokenVesting = await TokenVesting.deploy(owner, testTokenAddress);
            await tokenVesting.waitForDeployment();
            tokenVestingAddress = await tokenVesting.getAddress();
            await testToken.transfer(tokenVestingAddress, 1000);
            const time = Date.now();
            await expect(tokenVesting.createVestingSchedule(addr1.address, time, 0, 0, 1, false, 1)).to.be.revertedWith(
                'TokenVesting: duration must be > 0',
            );
            await expect(tokenVesting.createVestingSchedule(addr1.address, time, 0, 1, 0, false, 1)).to.be.revertedWith(
                'TokenVesting: slicePeriodSeconds must be >= 1',
            );
            await expect(tokenVesting.createVestingSchedule(addr1.address, time, 0, 1, 1, false, 0)).to.be.revertedWith(
                'TokenVesting: amount must be > 0',
            );
        });
    });
});
