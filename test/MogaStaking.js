// cSpell:ignore moga, unstake, unstaked, unstaking

const { expect } = require('chai');
const hre = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');

const BN = require('bignumber.js');

describe('MogaStaking contract', function () {
    // global vars
    let Token;
    let Staking;
    let mogaToken;
    let mogaTokenAddress;
    let mogaStaking;
    let mogaStakingAddress;
    let deployerAcc;
    let mogaAdmin;
    let addr1;
    let addr2;
    let addr3;
    let tokenCap = 1000000000;
    let initialStakingAmount = '1000000';
    let flexibleRewardRate = '1000';

    let stakeAmount = '100';
    let stakeOfferID1;

    BN.config({ DECIMAL_PLACES: 27, POW_PRECISION: 100 });

    let tinyRate = new BN(0.000005); //new BN(5000000000000); // // 0.0005% nominal interest per year, compounded continuously
    // Note: If you want to test a smaller interest rate than this,
    // you have to pass it as a string. Otherwise the JS toString() method
    // will fail when passing to web3.utils.toWei()
    let smallRate = new BN(0.005); // 0.5% nominal interest per year, compounded continuously
    let rate = new BN(0.05); // 5% nominal interest per year, compounded continuously
    let bigRate = new BN(0.5); // 50% nominal interest per year, compounded continuously
    let hugeRate = new BN(1); // 100% nominal interest per year, compounded continuously

    let tinyPrincipal = new BN(1); // 1 Wei
    let smallPrincipal = new BN(100000000);
    let principal = new BN(1000000000000000000);
    let bigPrincipal = new BN(100000000000000000000);
    let hugePrincipal = hre.ethers.parseEther('1000000');

    let tinyMaturity = new BN(1); // 1 second
    let smallMaturity = new BN(600); // 10 minutes
    let maturity = new BN(36000); // 10 hours
    let bigMaturity = new BN(86400 * 10); // 10 days
    let hugeMaturity = new BN(365 * 86400 * 50); // 50 years

    let yearMaturity = new BN(365 * 86400); // 1 year in seconds

    function yearlyRateToRay(rate) {
        // rate = new BN(_rate);
        ten = new BN(10);
        return rate
            .times(ten.pow(27))
            .div(new BN(365 * 86400))
            .plus(new BN(1).times(ten.pow(27)));
    }

    function accrueInterest(principal, rateRay, age) {
        ten = new BN(10);

        return rateRay.div(ten.pow(27)).pow(age).times(principal);
    }

    function mogaFee(amount) {
        return (amount * (100 - flexibleFee)) / 1000;
    }

    this.beforeEach(async function () {
        // Get the ContractFactory and Signers here.
        Token = await hre.ethers.getContractFactory('MogaToken');
        Staking = await hre.ethers.getContractFactory('MogaStaking');
        [deployerAcc, mogaAdmin, addr1, addr2, addr3] = await hre.ethers.getSigners();

        mogaToken = await Token.deploy(mogaAdmin, tokenCap, mogaAdmin);
        await mogaToken.waitForDeployment();
        mogaTokenAddress = await mogaToken.getAddress();

        mogaStaking = await Staking.deploy(mogaAdmin, mogaTokenAddress, mogaAdmin);
        await mogaStaking.waitForDeployment();
        mogaStakingAddress = await mogaStaking.getAddress();

        await mogaToken.connect(mogaAdmin).mintTokens();

        // during post-deployment we transfer some amount of staking rewards as initial staking
        // rewards supply
        await mogaToken.connect(mogaAdmin).transfer(mogaStakingAddress, hre.ethers.parseEther(initialStakingAmount));
        const stakingBalance = await mogaToken.balanceOf(mogaStakingAddress);
        //console.log(stakingBalance);
        expect(Number(hre.ethers.formatEther(stakingBalance))).to.equal(Number(initialStakingAmount));
        //console.log("total rewards " + (await mogaStaking.totalRewards()));

        // set flexibleRewardRate and fee for flexible staking
        await mogaStaking.connect(mogaAdmin).setNewFlexibleRewardRate(hre.ethers.parseEther(rate.toString()));
        await mogaStaking.connect(mogaAdmin).setNewFlexibleRewardFee(10);

        // user addr1 prep
        // transfer stakeAmount to addr1
        await mogaToken.connect(mogaAdmin).transfer(addr1.address, hre.ethers.parseEther(stakeAmount));

        // TBD IF we want admin to create staking on behalf of another user, e.g. through airdrops, then we need to approve the
        // mogaStaking contract an amount that takes care of all future transfers - potentially totalSupply?
        await mogaToken.connect(mogaAdmin).approve(mogaStakingAddress, hre.ethers.parseEther(initialStakingAmount));

        const addr1Balance = await mogaToken.balanceOf(addr1.address);
        expect(Number(hre.ethers.formatEther(addr1Balance))).to.equal(Number(stakeAmount));

        // before a deposit is possible, we need to approve the staking contract
        await mogaToken.connect(addr1).approve(mogaStakingAddress, hre.ethers.parseEther(stakeAmount));

        // user addr2 and addr3 prep
        // we do not approve moga staking contract to test fail scenarios
        await mogaToken.connect(mogaAdmin).transfer(addr2.address, hre.ethers.parseEther(stakeAmount));
        const addr2Balance = await mogaToken.balanceOf(addr2.address);
        expect(Number(hre.ethers.formatEther(addr2Balance))).to.equal(Number(stakeAmount));

        const addr3Balance = await mogaToken.balanceOf(addr3.address);
        expect(Number(hre.ethers.formatEther(addr3Balance))).to.equal(0);
    });

    describe('Deployment', function () {
        it('Should set the right mogaAdmin', async function () {
            expect(await mogaStaking.owner()).to.equal(mogaAdmin.address);
        });

        it('should have 0 MOGA staked', async function () {
            expect(await mogaStaking.totalStaked()).to.eq(0);
        });

        it('should have ' + initialStakingAmount + ' rewards', async function () {
            let totalRewards = Number(hre.ethers.formatEther(await mogaStaking.totalRewards()));
            expect(totalRewards).to.eq(Number(initialStakingAmount));
        });
    });

    describe('interest rate calculations', function () {
        it('Check yearlyRateToRay() function', async () => {
            // Check that yearly interest rates are converted to ray correctly.
            // Save and use the bignumber.js objects

            tinyRateRay = await mogaStaking.yearlyRateToRay(hre.ethers.parseEther(tinyRate.toString()));
            // console.log(tinyRateRay);
            // console.log(yearlyRateToRay(tinyRate));
            expect(tinyRateRay).to.eq(yearlyRateToRay(tinyRate).toFixed(0));

            smallRateRay = await mogaStaking.yearlyRateToRay(hre.ethers.parseEther(smallRate.toString()));
            expect(smallRateRay).to.eq(yearlyRateToRay(smallRate).toFixed(0));

            rateRay = await mogaStaking.yearlyRateToRay(hre.ethers.parseEther(rate.toString()));
            expect(rateRay).to.eq(yearlyRateToRay(rate).toFixed(0));

            bigRateRay = await mogaStaking.yearlyRateToRay(hre.ethers.parseEther(bigRate.toString()));
            expect(bigRateRay).to.eq(yearlyRateToRay(bigRate).toFixed(0));

            hugeRateRay = await mogaStaking.yearlyRateToRay(hre.ethers.parseEther(hugeRate.toString()));
            expect(hugeRateRay).to.eq(yearlyRateToRay(hugeRate).toFixed(0));
        });

        it('Check accrueInterest() function', async () => {
            // Save and use the bignumber.js objects for interest rates as rays
            tinyRateRayBN = yearlyRateToRay(tinyRate).toFixed(0);
            smallRateRayBN = yearlyRateToRay(smallRate).toFixed(0);
            rateRayBN = yearlyRateToRay(rate).toFixed(0);
            bigRateRayBN = yearlyRateToRay(bigRate).toFixed(0);
            hugeRateRayBN = yearlyRateToRay(hugeRate).toFixed(0);

            // Check principal return values for a combination of different
            // interest rates, principals, and maturity times

            testCases = [
                { principal: tinyPrincipal, rate: tinyRateRayBN, age: tinyMaturity },
                { principal: smallPrincipal, rate: smallRateRayBN, age: smallMaturity },
                { principal: principal, rate: rateRayBN, age: maturity },
                { principal: bigPrincipal, rate: bigRateRayBN, age: bigMaturity },
                { principal: tinyPrincipal, rate: hugeRateRayBN, age: tinyMaturity },
                { principal: hugePrincipal, rate: tinyRateRayBN, age: tinyMaturity },
                { principal: tinyPrincipal, rate: tinyRateRayBN, age: hugeMaturity },
            ];

            for (let i = 0; i < testCases.length; i++) {
                _principal = testCases[i].principal;
                _rateRay = testCases[i].rate;
                _age = testCases[i].age;

                // console.log("age: " + _age);
                // console.log("principal: " + _principal);
                // console.log("rateRay: " + _rateRay);

                newPrincipal = await mogaStaking.accrueInterest(_principal.toString(), _rateRay.toString(), _age.toString());
                // console.log(
                //   "newPrincipal from contract: " +
                //     hre.ethers.parseEther(newPrincipal.toString())
                // );

                // console.log(
                //   "newPrincipal from test: " +
                //     accrueInterest(
                //       new BN(_principal),
                //       new BN(_rateRay),
                //       new BN(_age)
                //     ).toFixed(0)
                // );

                expect(accrueInterest(new BN(_principal), new BN(_rateRay), new BN(_age)).toFixed(0)).to.equal(newPrincipal);
            }
        });
    });

    describe('fixedTerm staking transactions', function () {
        it('admin: Should create new stakeOffers', async function () {
            expect(
                await mogaStaking
                    .connect(mogaAdmin)
                    .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, yearMaturity.toString(), false),
            ).to.emit(mogaStaking, 'StakeOfferCreated');
        });

        it('admin: Should discontinue stakeOffers', async function () {
            expect(await mogaStaking.connect(mogaAdmin).discontinueStakeOffer(1)).to.emit(mogaStaking, 'StakeOfferDiscontinued');
        });

        it('admin: Should create stakeFixedTermForBeneficiary', async function () {
            await mogaStaking
                .connect(mogaAdmin)
                .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, yearMaturity.toString(), false);

            expect(
                await mogaStaking.connect(mogaAdmin).stakeFixedTermForBeneficiary(1, hre.ethers.parseEther(stakeAmount), addr2.address),
            ).to.emit(mogaStaking, 'StakeOfferCreated');
        });

        it('staking should create correct stake struct', async function () {
            //after staking, addr1 balance is zero, stakingContract balance is equal to stakeAmount
            await mogaStaking
                .connect(mogaAdmin)
                .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, yearMaturity.toString(), false);

            await expect(mogaStaking.connect(addr1).stakeFixedTerm(1, hre.ethers.parseEther(stakeAmount))).to.changeTokenBalances(
                mogaToken,
                [addr1, mogaStaking],
                [hre.ethers.parseEther(stakeAmount) * -1n, hre.ethers.parseEther(stakeAmount)],
            );

            let [stakeOfferId, principle, created, owner] = await mogaStaking.connect(mogaAdmin).getStakeDetails(1);

            expect(stakeOfferId == 1);
            expect(principle == stakeAmount);
            expect(created == (await helpers.time.latest()));
            expect(owner == addr1.address);

            expect(await mogaStaking.totalStaked()).to.eq(hre.ethers.parseEther(stakeAmount));
        });

        it('staking should create two correct stake structs', async function () {
            //after staking, addr1 balance is zero, stakingContract balance is equal to stakeAmount
            await mogaStaking
                .connect(mogaAdmin)
                .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, yearMaturity.toString(), false);

            const halfStakeAmount = (parseInt(stakeAmount, 10) / 2).toString();

            const tx1 = mogaStaking.connect(addr1).stakeFixedTerm(1, hre.ethers.parseEther(halfStakeAmount));
            await expect(tx1).to.changeTokenBalances(
                mogaToken,
                [addr1, mogaStaking],
                [hre.ethers.parseEther(halfStakeAmount) * -1n, hre.ethers.parseEther(halfStakeAmount)],
            );
            await expect(tx1).to.emit(mogaStaking, 'Deposit').withArgs(addr1.address, hre.ethers.parseEther(halfStakeAmount), 1);

            let [stakeOfferId, principle, created, owner] = await mogaStaking.connect(mogaAdmin).getStakeDetails(1);

            expect(stakeOfferId == 1);
            expect(principle == halfStakeAmount);
            expect(created == (await helpers.time.latest()));
            expect(owner == addr1.address);

            // before a deposit is possible, let addr2 approve the staking contract spending capacity
            await mogaToken.connect(addr2).approve(mogaStakingAddress, hre.ethers.parseEther(stakeAmount));

            const tx2 = mogaStaking.connect(addr2).stakeFixedTerm(1, hre.ethers.parseEther(halfStakeAmount));
            await expect(tx2).to.changeTokenBalances(
                mogaToken,
                [addr2, mogaStaking],
                [hre.ethers.parseEther(halfStakeAmount) * -1n, hre.ethers.parseEther(halfStakeAmount)],
            );
            await expect(tx2).to.emit(mogaStaking, 'Deposit').withArgs(addr2.address, hre.ethers.parseEther(halfStakeAmount), 2);

            let details = await mogaStaking.connect(mogaAdmin).getStakeDetails(2);
            stakeOfferId = details[0];
            principle = details[1];
            created = details[2];
            owner = details[3];

            expect(stakeOfferId == 1);
            expect(principle == halfStakeAmount);
            expect(created == (await helpers.time.latest()));
            expect(owner == addr2.address);

            expect(await mogaStaking.totalStaked()).to.eq(hre.ethers.parseEther(stakeAmount));
        });

        it('fixed term staking can be unstaked after lockup time, anytime', async function () {
            //after staking, addr1 balance is zero, stakingContract balance is equal to stakeAmount
            await mogaStaking
                .connect(mogaAdmin)
                .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, yearMaturity.toString(), false);

            // console.log(await mogaStaking.stakeOffers(1));

            // console.log(
            //   "addr1 balance start: " +
            //     hre.ethers.formatEther(await mogaToken.balanceOf(addr1))
            // );

            await expect(mogaStaking.connect(addr1).stakeFixedTerm(1, hre.ethers.parseEther(stakeAmount))).to.changeTokenBalances(
                mogaToken,
                [addr1, mogaStaking],
                [hre.ethers.parseEther(stakeAmount) * -1n, hre.ethers.parseEther(stakeAmount)],
            );

            //console.log(await mogaStaking.getStakeDetails(1));

            // console.log(
            //   "addr1 balance before: " +
            //     hre.ethers.formatEther(await mogaToken.balanceOf(addr1))
            // );

            await helpers.time.increase(yearMaturity);

            //console.log("claimable balance: " + (await mogaStaking.rewards(1)));

            await mogaStaking.connect(addr1).unStakeFixedTerm(1);
            // console.log(
            //   "addr1 balance after: " +
            //     hre.ethers.formatEther(await mogaToken.balanceOf(addr1))
            // );
        });

        it('short term staking can be unstaked after short lockup time (2 hours)', async function () {
            // Define a short lockup period (2 hours in seconds)
            const twoHourMaturity = 2 * 60 * 60;

            // Create stake offer with short lockup duration
            await mogaStaking
                .connect(mogaAdmin)
                .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, twoHourMaturity.toString(), false);

            // Stake tokens
            await expect(mogaStaking.connect(addr1).stakeFixedTerm(1, hre.ethers.parseEther(stakeAmount))).to.changeTokenBalances(
                mogaToken,
                [addr1, mogaStaking],
                [hre.ethers.parseEther(stakeAmount) * -1n, hre.ethers.parseEther(stakeAmount)],
            );

            // Check stake details to confirm stake was created properly
            let [stakeOfferId, principle, created, owner] = await mogaStaking.connect(mogaAdmin).getStakeDetails(1);
            expect(stakeOfferId).to.equal(1);
            expect(principle).to.equal(hre.ethers.parseEther(stakeAmount));
            expect(owner).to.equal(addr1.address);

            // Advance time just past the lockup period
            await helpers.time.increase(twoHourMaturity + 1);

            // Log reward amount before unstaking to check calculated interest
            const rewardAmount = await mogaStaking.rewards(1);
            console.log('Reward amount after short period:', hre.ethers.formatEther(rewardAmount));

            // Record token balance before unstaking
            const beforeBalance = await mogaToken.balanceOf(addr1.address);

            // Should be able to unstake after the short period
            await mogaStaking.connect(addr1).unStakeFixedTerm(1);

            // Record token balance after unstaking and calculate difference
            const afterBalance = await mogaToken.balanceOf(addr1.address);
            const returnedAmount = afterBalance - beforeBalance;
            console.log('Returned amount after unstaking:', hre.ethers.formatEther(returnedAmount));

            // Verify stake is gone from contract
            const afterUnstake = await mogaStaking.connect(mogaAdmin).getStakeDetails(1);
            expect(afterUnstake[1]).to.equal(0); // Principle should be 0 after unstaking

            // Verify total staked has decreased
            expect(await mogaStaking.totalStaked()).to.equal(0);
        });

        it('verifies fee calculation logic for short term stakes with minimal interest', async function () {
            // Setup: Use higher interest rate to make calculation more visible
            const highRate = new BN(0.5); // 50% interest rate
            const shortPeriod = 60 * 60; // 1 hour

            // Create stake offer with high rate and very short lockup
            await mogaStaking
                .connect(mogaAdmin)
                .createStakeOffer(hre.ethers.parseEther(highRate.toString()), 10, shortPeriod.toString(), false);

            // Stake tokens - need to use ID 1 since that's the ID of the offer we just created
            await mogaStaking.connect(addr1).stakeFixedTerm(1, hre.ethers.parseEther(stakeAmount));

            // Advance time just past the lockup period
            await helpers.time.increase(shortPeriod + 1);

            // Get reward amount
            const initialStake = hre.ethers.parseEther(stakeAmount);
            const rewardBefore = await mogaStaking.rewards(1);
            console.log('Initial stake amount:', hre.ethers.formatEther(initialStake));
            console.log('Total reward amount (with interest):', hre.ethers.formatEther(rewardBefore));

            // Calculate expected interest and fee manually
            const interest = rewardBefore - initialStake;
            console.log('Interest earned:', hre.ethers.formatEther(interest));

            // Get total supply before unstaking
            const totalSupplyBefore = await mogaToken.totalSupply();
            console.log('Total token supply before unstaking:', hre.ethers.formatEther(totalSupplyBefore));

            // Get user balance before unstaking
            const balanceBefore = await mogaToken.balanceOf(addr1.address);

            // Unstake
            await mogaStaking.connect(addr1).unStakeFixedTerm(1);

            // Get user balance after unstaking
            const balanceAfter = await mogaToken.balanceOf(addr1.address);
            const amountReceived = balanceAfter - balanceBefore;
            console.log('Amount received after unstaking:', hre.ethers.formatEther(amountReceived));

            // Get total supply after unstaking to check burn amount
            const totalSupplyAfter = await mogaToken.totalSupply();
            console.log('Total token supply after unstaking:', hre.ethers.formatEther(totalSupplyAfter));
            const burnAmount = totalSupplyBefore - totalSupplyAfter;
            console.log('Amount burned during unstaking:', hre.ethers.formatEther(burnAmount));

            // Verify fee calculation logic
            if (interest > 0) {
                // Updated contract logic calculates fee as: feeAmount = (diff * fee) / 100
                // For a fee of 10%, this means (interest * 10) / 100 = interest * 0.1
                // So fee is correctly 10% of interest
                const expectedFeeAmount = (interest * 10n) / 100n;
                const expectedBurnAmount = expectedFeeAmount / 2n;

                console.log('Expected fee amount:', hre.ethers.formatEther(expectedFeeAmount));
                console.log('Expected burn amount:', hre.ethers.formatEther(expectedBurnAmount));

                // Check if burn amount matches expected
                expect(burnAmount).to.be.closeTo(expectedBurnAmount, 1000000n); // Allow small precision error

                // Verify amount received is correct (initial + interest - fee)
                const expectedReceived = initialStake + interest - expectedFeeAmount;
                expect(amountReceived).to.be.closeTo(expectedReceived, 1000000n); // Allow small precision error
            } else {
                console.log('No interest earned in this short period');
            }
        });

        it('beneficiaries can unstake after lockup period', async function () {
            await mogaStaking
                .connect(mogaAdmin)
                .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, yearMaturity.toString(), false);

            await mogaStaking.connect(mogaAdmin).stakeFixedTermForBeneficiary(1, hre.ethers.parseEther(stakeAmount), addr2.address);

            await helpers.time.increase(yearMaturity);

            expect(await mogaStaking.connect(addr2).unStakeFixedTerm(1)).to.emit(mogaStaking, 'Withdraw');
        });

        it('should increase totalInterest by to be committed rewards', async function () {
            await mogaStaking
                .connect(mogaAdmin)
                .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, yearMaturity.toString(), false);

            await mogaStaking.connect(addr1).stakeFixedTerm(1, hre.ethers.parseEther(stakeAmount));

            // console.log(
            //   "totalInterest after stake: " + (await mogaStaking.totalInterest())
            // );

            await helpers.time.increase(yearMaturity);

            await mogaStaking.connect(addr1).unStakeFixedTerm(1);

            // console.log(
            //   "totalInterest after unStake: " + (await mogaStaking.totalInterest())
            // );
            expect(await mogaStaking.totalInterest()).to.equal(0);
        });

        describe('validations', function () {
            it('should revert if staking offer does not exist', async function () {
                await expect(mogaStaking.connect(addr2).stakeFixedTerm(99, stakeAmount)).to.be.reverted;
            });

            it('should revert if staking offer is only accessible by admin', async function () {
                await mogaStaking
                    .connect(mogaAdmin)
                    .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, yearMaturity.toString(), true);

                await expect(mogaStaking.connect(addr2).stakeFixedTerm(2, stakeAmount)).to.be.reverted;

                // add admin stake test
            });

            it('should revert if staking offer no longer active', async function () {
                await mogaStaking
                    .connect(mogaAdmin)
                    .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, yearMaturity.toString(), false);
                await mogaStaking.connect(mogaAdmin).discontinueStakeOffer(1);

                await expect(mogaStaking.connect(addr1).stakeFixedTerm(1, stakeAmount)).to.be.reverted;
            });

            it('should revert if unstaking is attempted by other than stake Owner', async function () {
                await mogaStaking
                    .connect(mogaAdmin)
                    .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, yearMaturity.toString(), false);

                mogaStaking.connect(addr1).stakeFixedTerm(1, stakeAmount);

                await helpers.time.increase(yearMaturity);

                await expect(mogaStaking.connect(addr2).unStakeFixedTerm(1)).to.be.reverted;
            });

            it('should revert if unStakeFixedTerm is attempted prior to lockup period', async function () {
                //after staking, addr1 balance is zero, stakingContract balance is equal to stakeAmount
                await mogaStaking
                    .connect(mogaAdmin)
                    .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, yearMaturity.toString(), false);

                await expect(mogaStaking.connect(addr1).stakeFixedTerm(1, stakeAmount)).to.changeTokenBalances(
                    mogaToken,
                    [addr1, mogaStaking],
                    [stakeAmount * -1, stakeAmount],
                );

                await expect(mogaStaking.connect(addr1).unStakeFixedTerm(1)).to.be.reverted;
            });

            it('should revert if staking address not approved', async function () {
                await mogaStaking
                    .connect(mogaAdmin)
                    .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, yearMaturity.toString(), false);

                await expect(mogaStaking.connect(addr2).stakeFixedTerm(1, stakeAmount)).to.be.reverted;
            });

            it('should revert if address has insufficient balance', async function () {
                await mogaStaking
                    .connect(mogaAdmin)
                    .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, yearMaturity.toString(), false);

                const totalSupply = await mogaToken.totalSupply();
                await mogaToken.connect(addr2).approve(mogaStakingAddress, totalSupply);
                await expect(mogaStaking.connect(addr2).stakeFixedTerm(1, totalSupply)).to.be.reverted;
            });
        });

        describe('events', function () {
            it('should emit StakeOfferCreated event', async function () {
                await expect(
                    mogaStaking
                        .connect(mogaAdmin)
                        .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, yearMaturity.toString(), false),
                )
                    .to.emit(mogaStaking, 'StakeOfferCreated')
                    .withArgs(1);
            });

            it('should emit StakeOfferDiscontinued event', async function () {
                await mogaStaking
                    .connect(mogaAdmin)
                    .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, yearMaturity.toString(), false);
                await expect(mogaStaking.connect(mogaAdmin).discontinueStakeOffer(1))
                    .to.emit(mogaStaking, 'StakeOfferDiscontinued')
                    .withArgs(1);
            });

            it('should emit Deposit event', async function () {
                await mogaStaking
                    .connect(mogaAdmin)
                    .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, yearMaturity.toString(), false);

                await expect(mogaStaking.connect(addr1).stakeFixedTerm(1, stakeAmount))
                    .to.emit(mogaStaking, 'Deposit')
                    .withArgs(addr1.address, stakeAmount, 1);
            });

            it('should emit Withdraw event', async function () {
                await mogaStaking
                    .connect(mogaAdmin)
                    .createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, yearMaturity.toString(), false);

                await mogaStaking.connect(addr1).stakeFixedTerm(1, stakeAmount);

                await helpers.time.increase(yearMaturity);

                await expect(mogaStaking.connect(addr1).unStakeFixedTerm(1)).to.emit(mogaStaking, 'Withdraw');
            });
        });

        describe('flexible stake transactions', function () {
            it('should deposit amount in flexible stake', async function () {
                await expect(mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther(stakeAmount))).to.changeTokenBalances(
                    mogaToken,
                    [addr1, mogaStaking],
                    [hre.ethers.parseEther(stakeAmount) * -1n, hre.ethers.parseEther(stakeAmount)],
                );
            });

            it('Should have a flexibleBalanceOf(address) equal to amount deposited', async function () {
                await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther(stakeAmount));
                expect(await mogaStaking.flexibleBalanceOf(addr1.address)).to.eq(hre.ethers.parseEther(stakeAmount));
            });

            it('Should initialize userRewardIndex when staking for the first time', async function () {
                await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther(stakeAmount));
                expect(await mogaStaking.userRewardIndex(addr1.address)).to.eq(await mogaStaking.rewardIndex());
            });

            it('Should update the global rewardIndex over time', async function () {
                const initialIndex = await mogaStaking.rewardIndex();

                // Stake to ensure the system is active
                await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther(stakeAmount));

                // Advance time
                await helpers.time.increase(yearMaturity);

                // Trigger an update by interacting with the contract
                await mogaStaking.connect(mogaAdmin).setNewFlexibleRewardRate(hre.ethers.parseEther(rate.toString()));

                // Check if the index increased
                const newIndex = await mogaStaking.rewardIndex();
                expect(newIndex).to.be.gt(initialIndex);
            });

            it('Should not change the total reward balance', async function () {
                await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther(stakeAmount));
                const rewardBalance = await mogaStaking.totalRewards();

                expect(Number(hre.ethers.formatEther(rewardBalance))).to.equal(Number(initialStakingAmount));
            });

            it('Should not change the total interest', async function () {
                // flexible staking total interest cannot be pre-calculated as flexible staking runs forever so it will stay zero
                await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther(stakeAmount));
                const totalInterest = await mogaStaking.totalInterest();

                expect(Number(hre.ethers.formatEther(totalInterest))).to.equal(0);
            });

            describe('validations', function () {
                it('should revert if staking address not approved', async function () {
                    await expect(mogaStaking.connect(addr2).stakeFlexible(stakeAmount)).to.be.reverted;
                });

                it('should revert if address has insufficient balance', async function () {
                    const totalSupply = await mogaToken.totalSupply();
                    await mogaToken.connect(addr2).approve(mogaStakingAddress, totalSupply);
                    await expect(mogaStaking.connect(addr2).stakeFlexible(totalSupply)).to.be.reverted;
                });
            });

            describe('events', function () {
                it('should emit DepositFlexible event', async function () {
                    await expect(mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther(stakeAmount)))
                        .to.emit(mogaStaking, 'DepositFlexible')
                        .withArgs(addr1.address, hre.ethers.parseEther(stakeAmount));
                });

                it('should emit RewardIndexUpdated event when rate changes', async function () {
                    await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther(stakeAmount));
                    await helpers.time.increase(yearMaturity);

                    await expect(
                        mogaStaking.connect(mogaAdmin).setNewFlexibleRewardRate(hre.ethers.parseEther(smallRate.toString())),
                    ).to.emit(mogaStaking, 'RewardIndexUpdated');
                });
            });
        });

        describe('flexible Compound', function () {
            this.beforeEach(async function () {
                await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther(stakeAmount));
                await helpers.time.increase(yearMaturity);
            });

            it('Should increment balanceOf(address) when compounding', async function () {
                const initialBalance = await mogaStaking.flexibleBalanceOf(addr1.address);
                const initialRewards = await mogaStaking.rewardsFlexible(addr1.address);

                console.log(`Initial balance: ${hre.ethers.formatEther(initialBalance)}`);
                console.log(`Initial rewards: ${hre.ethers.formatEther(initialRewards)}`);

                await mogaStaking.connect(addr1).compoundFlexible(addr1.address);
                const newBalance = await mogaStaking.flexibleBalanceOf(addr1.address);

                console.log(`New balance after compound: ${hre.ethers.formatEther(newBalance)}`);

                // New balance should be greater than initial balance
                expect(newBalance).to.be.gt(initialBalance);

                // Rough calculation - approximately 5% after a year with some fees taken out
                // should increase balance by around 4.5-4.7%
                const minExpectedBalance = (initialBalance * 104n) / 100n;
                expect(newBalance).to.be.gt(minExpectedBalance);
            });

            it('Should increment staking balance', async function () {
                const initialStakingBalance = await mogaStaking.totalStaked();

                await mogaStaking.connect(addr1).compoundFlexible(addr1.address);
                const newStakingBalance = await mogaStaking.totalStaked();

                // Total staking balance should increase
                expect(newStakingBalance).to.be.gt(initialStakingBalance);

                // Should increase by roughly the same amount as the user's balance increases
                const expectedMinIncrease = (initialStakingBalance * 104n) / 100n - initialStakingBalance;
                const actualIncrease = newStakingBalance - initialStakingBalance;
                expect(actualIncrease).to.be.gt(expectedMinIncrease);
            });

            it('Should set userUnclaimedRewards to zero after compounding', async function () {
                // First update to generate rewards
                await mogaStaking.connect(addr1).compoundFlexible(addr1.address);

                // Advance time to generate more rewards
                await helpers.time.increase(yearMaturity / 4); // Add 3 more months

                // Trigger an update for the user which will update userUnclaimedRewards
                await mogaStaking.connect(mogaAdmin).setNewFlexibleRewardRate(hre.ethers.parseEther(rate.toString()));

                // Compound again to move rewards to principal
                await mogaStaking.connect(addr1).compoundFlexible(addr1.address);

                // Check that unclaimed rewards is reset to 0
                expect(await mogaStaking.userUnclaimedRewards(addr1.address)).to.equal(0);
            });

            it('Should update userRewardIndex when compounding', async function () {
                const initialIndex = await mogaStaking.userRewardIndex(addr1.address);

                // Advance time to ensure index will update
                await helpers.time.increase(yearMaturity / 4);

                // Trigger a global index update
                await mogaStaking.connect(mogaAdmin).setNewFlexibleRewardRate(hre.ethers.parseEther(rate.toString()));
                const globalIndex = await mogaStaking.rewardIndex();

                // Compound which should update the user's index
                await mogaStaking.connect(addr1).compoundFlexible(addr1.address);
                const newUserIndex = await mogaStaking.userRewardIndex(addr1.address);

                // The user's index should now be close to the global index
                // Due to the way the indexes are updated, there can be some differences
                // We just make sure they're relatively close
                const difference = newUserIndex > globalIndex ? newUserIndex - globalIndex : globalIndex - newUserIndex;

                const tolerance = globalIndex / 10000n; // Allow 0.01% difference
                expect(difference).to.be.lt(tolerance);
                expect(newUserIndex).to.not.equal(initialIndex);
            });

            describe('Events', function () {
                it('Should emit CompoundFlexible event', async function () {
                    await expect(mogaStaking.connect(addr1).compoundFlexible(addr1.address)).to.emit(mogaStaking, 'CompoundFlexible');
                });
            });
        });

        describe('Withdraw flexible stake', async function () {
            beforeEach(async function () {
                await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther(stakeAmount));
                await helpers.time.increase(yearMaturity);
            });

            it('Should transfer correct tokens when withdrawing', async function () {
                const initialUserBalance = await mogaToken.balanceOf(addr1.address);
                const initialContractBalance = await mogaToken.balanceOf(mogaStakingAddress);
                const initialStake = await mogaStaking.flexibleBalanceOf(addr1.address);

                // Withdraw
                await mogaStaking.connect(addr1).withdrawFlexible();

                // Check balances
                const finalUserBalance = await mogaToken.balanceOf(addr1.address);
                const finalContractBalance = await mogaToken.balanceOf(mogaStakingAddress);

                const userGain = finalUserBalance - initialUserBalance;
                console.log(`User balance change: ${hre.ethers.formatEther(userGain)}`);
                console.log(`Contract balance change: ${hre.ethers.formatEther(finalContractBalance - initialContractBalance)}`);

                // User should have received at least their stake back, and some interest
                expect(userGain).to.be.gt(initialStake);

                // Due to 5% interest rate over a year, should get roughly 4.5% more back
                // after fees are considered
                const minExpectedWithdraw = (initialStake * 104n) / 100n;
                expect(userGain).to.be.gt(minExpectedWithdraw);
            });

            it('Should set flexibleBalanceOf(address) to zero', async function () {
                await mogaStaking.connect(addr1).withdrawFlexible();
                expect(await mogaStaking.flexibleBalanceOf(addr1.address)).to.eq(0);
            });

            it('Should set userUnclaimedRewards to zero', async function () {
                // First update rewards but don't withdraw
                await mogaStaking.connect(mogaAdmin).setNewFlexibleRewardRate(hre.ethers.parseEther(rate.toString()));

                // Now withdraw
                await mogaStaking.connect(addr1).withdrawFlexible();

                // Check that unclaimed rewards is reset
                expect(await mogaStaking.userUnclaimedRewards(addr1.address)).to.equal(0);
            });

            it('Should decrement total staking balance correctly', async function () {
                const initialStaked = await mogaStaking.totalStaked();
                const userStake = await mogaStaking.flexibleBalanceOf(addr1.address);

                await mogaStaking.connect(addr1).withdrawFlexible();

                const finalStaked = await mogaStaking.totalStaked();
                expect(finalStaked).to.equal(initialStaked - userStake);
            });

            describe('Validations', function () {
                it('Should revert if flexible stake has no withdrawable balance', async function () {
                    // withdraw first, successfully
                    await mogaStaking.connect(addr1).withdrawFlexible();
                    // attempt to withdraw again
                    await expect(mogaStaking.connect(addr1).withdrawFlexible()).to.be.revertedWithCustomError(
                        mogaStaking,
                        'FlexibleStakeBalanceIsZero',
                    );
                });

                it('Should revert if flexible stake does not exist', async function () {
                    await expect(mogaStaking.connect(addr2).withdrawFlexible()).to.be.revertedWithCustomError(
                        mogaStaking,
                        'FlexibleStakeBalanceIsZero',
                    );
                });

                it('Should reduce MOGA circulating supply after burning during flexible unstake', async function () {
                    let currentSupply = await mogaToken.totalSupply();
                    await mogaStaking.connect(addr1).withdrawFlexible();
                    let newSupply = await mogaToken.totalSupply();
                    expect(newSupply).to.be.lt(currentSupply);
                });
            });
        });
    });

    /*
  describe("rewards", function () {
    this.beforeEach(async function () {
      await mogaStaking.connect(addr1).stakeFixedTerm(stakeAmount);
    });
    it("should have 100 rewards after one hour", async function () {
      await helpers.time.increase(60 * 60);
      console.log("balance: " + (await mogaStaking.balanceOf(addr1.address)));
      console.log("rewards: " + (await mogaStaking.rewards(addr1.address)));
      expect(await mogaStaking.rewards(addr1.address)).to.eq(
        //hre.ethers.parseEther("100")
        100 ///////// WHY IS IT RETURNING WRONG FORMAT???
      );
    });
    it("should have 1/36 rewards after one second", async function () {
      await helpers.time.increase(1);
      expect(await mogaStaking.rewards(addr1.address)).to.eq(
        stakeAmount / 1000 / 3600
      );
    });
    it("should have 1 reward after 36 seconds", async function () {
      await helpers.time.increase(36);
      expect(await mogaStaking.rewards(addr1.address)).to.eq(
        hre.ethers.parseEther("1")
      );
    });
  });
  */
});
