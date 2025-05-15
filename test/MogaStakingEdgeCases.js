// cSpell:ignore moga, unstake, unstaked, unstaking
const { expect } = require('chai');
const hre = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const BN = require('bignumber.js');

describe('MogaStaking Edge Cases', function () {
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

    // Configure BN for high precision
    BN.config({ DECIMAL_PLACES: 27, POW_PRECISION: 100 });

    // Different interest rates
    let tinyRate = new BN(0.000001); // 0.0001% nominal interest per year
    let smallRate = new BN(0.001); // 0.1% nominal interest per year
    let rate = new BN(0.05); // 5% nominal interest per year

    // Different principal amounts
    let verySmallStakeAmount = '0.000001'; // 1 wei (minimal amount)
    let smallStakeAmount = '0.1'; // small stake
    let normalStakeAmount = '100'; // regular stake
    let largeStakeAmount = '1000000'; // large stake (1 million)

    // Different time periods
    let veryShortPeriod = 1; // 1 second
    let shortPeriod = 60; // 1 minute
    let mediumPeriod = 3600; // 1 hour
    let longPeriod = 86400; // 1 day

    beforeEach(async function () {
        // Get the ContractFactory and Signers
        Token = await hre.ethers.getContractFactory('MogaToken');
        Staking = await hre.ethers.getContractFactory('MogaStaking');
        [deployerAcc, mogaAdmin, addr1, addr2, addr3] = await hre.ethers.getSigners();

        // Deploy contracts
        mogaToken = await Token.deploy(mogaAdmin, tokenCap, mogaAdmin);
        await mogaToken.waitForDeployment();
        mogaTokenAddress = await mogaToken.getAddress();

        mogaStaking = await Staking.deploy(mogaAdmin, mogaTokenAddress, mogaAdmin);
        await mogaStaking.waitForDeployment();
        mogaStakingAddress = await mogaStaking.getAddress();

        // Mint tokens
        await mogaToken.connect(mogaAdmin).mintTokens();

        // Transfer initial staking rewards to the staking contract
        await mogaToken.connect(mogaAdmin).transfer(mogaStakingAddress, hre.ethers.parseEther(initialStakingAmount));

        // Setup flexible staking rate and fee
        await mogaStaking.connect(mogaAdmin).setNewFlexibleRewardRate(hre.ethers.parseEther(rate.toString()));
        await mogaStaking.connect(mogaAdmin).setNewFlexibleRewardFee(10);

        // Transfer tokens to test addresses
        await mogaToken.connect(mogaAdmin).transfer(addr1.address, hre.ethers.parseEther('10000'));
        await mogaToken.connect(mogaAdmin).transfer(addr2.address, hre.ethers.parseEther('10000'));
        await mogaToken.connect(mogaAdmin).transfer(addr3.address, hre.ethers.parseEther('10000'));

        // Approve staking contract to spend tokens
        await mogaToken.connect(mogaAdmin).approve(mogaStakingAddress, hre.ethers.parseEther('1000000'));
        await mogaToken.connect(addr1).approve(mogaStakingAddress, hre.ethers.parseEther('10000'));
        await mogaToken.connect(addr2).approve(mogaStakingAddress, hre.ethers.parseEther('10000'));
        await mogaToken.connect(addr3).approve(mogaStakingAddress, hre.ethers.parseEther('10000'));

        // Create a stake offer with normal parameters as a baseline
        await mogaStaking.connect(mogaAdmin).createStakeOffer(
            hre.ethers.parseEther(rate.toString()),
            10, // 10% fee
            longPeriod.toString(),
            false,
        );
    });

    describe('Zero Interest Scenarios', function () {
        it('should handle unstaking after extremely short periods with no meaningful interest', async function () {
            // Create stake offer with very short duration
            await mogaStaking.connect(mogaAdmin).createStakeOffer(
                hre.ethers.parseEther(tinyRate.toString()), // Very low rate
                10, // 10% fee
                veryShortPeriod.toString(), // 1 second duration
                false,
            );

            // Make sure we're using the correct stake offer ID
            const stakesOfferCount = await mogaStaking.getAllStakeOfferIds();
            const newStakeOfferId = stakesOfferCount.length;

            // Stake tokens
            const initialBalance = await mogaToken.balanceOf(addr1.address);
            await mogaStaking.connect(addr1).stakeFixedTerm(newStakeOfferId, hre.ethers.parseEther(normalStakeAmount));

            // Get stake ID
            const addr1Stakes = await mogaStaking.getAllStakeIdsOfAddress(addr1.address);
            const stakeId = addr1Stakes[addr1Stakes.length - 1];

            // Wait for just the lock period
            await helpers.time.increase(veryShortPeriod + 1);

            // Get rewards amount - expected to be very close to principal
            const rewards = await mogaStaking.rewards(stakeId);
            console.log(`Rewards after ${veryShortPeriod} second(s): ${hre.ethers.formatEther(rewards)}`);
            expect(rewards).to.be.closeTo(hre.ethers.parseEther(normalStakeAmount), hre.ethers.parseEther('0.001'));

            // Unstake
            await mogaStaking.connect(addr1).unStakeFixedTerm(stakeId);

            // Check final balance
            const finalBalance = await mogaToken.balanceOf(addr1.address);
            console.log(`Initial balance: ${hre.ethers.formatEther(initialBalance)}`);
            console.log(`Final balance: ${hre.ethers.formatEther(finalBalance)}`);
            console.log(`Difference: ${hre.ethers.formatEther(finalBalance - initialBalance)}`);

            // We should get back very close to what we put in
            expect(finalBalance).to.be.closeTo(initialBalance, hre.ethers.parseEther('0.01'));
        });
    });

    describe('Rounding Errors', function () {
        it('should handle rounding errors in calculations with small amounts', async function () {
            // Create stake offer with medium duration
            await mogaStaking.connect(mogaAdmin).createStakeOffer(
                hre.ethers.parseEther(smallRate.toString()), // 0.1% rate
                10, // 10% fee
                mediumPeriod.toString(), // 1 hour duration
                false,
            );

            // Get correct stake offer ID
            const stakesOfferCount = await mogaStaking.getAllStakeOfferIds();
            const newStakeOfferId = stakesOfferCount.length;

            // Stake a very small amount
            await mogaStaking.connect(addr1).stakeFixedTerm(newStakeOfferId, hre.ethers.parseEther(verySmallStakeAmount));

            // Get stake ID
            const addr1Stakes = await mogaStaking.getAllStakeIdsOfAddress(addr1.address);
            const stakeId = addr1Stakes[addr1Stakes.length - 1];

            // Wait for stake period
            await helpers.time.increase(mediumPeriod + 1);

            // Calculate expected interest (will be tiny)
            const stakeDetails = await mogaStaking.getStakeDetails(stakeId);
            const stakePrincipal = stakeDetails[1];
            const rewardsAmount = await mogaStaking.rewards(stakeId);
            const interest = rewardsAmount - stakePrincipal;

            console.log(`Stake principal: ${hre.ethers.formatEther(stakePrincipal)}`);
            console.log(`Rewards amount: ${hre.ethers.formatEther(rewardsAmount)}`);
            console.log(`Interest: ${hre.ethers.formatEther(interest)}`);

            // Unstake
            await mogaStaking.connect(addr1).unStakeFixedTerm(stakeId);

            // Verify stake is removed
            const stakeAfter = await mogaStaking.getStakeDetails(stakeId);
            expect(stakeAfter[1]).to.equal(0); // Principle should be 0 after unstaking
        });
    });

    describe('Token Burn Threshold', function () {
        it('should handle tiny burn amounts correctly', async function () {
            // Create stake offer
            await mogaStaking.connect(mogaAdmin).createStakeOffer(
                hre.ethers.parseEther(smallRate.toString()), // Small rate
                10, // 10% fee
                shortPeriod.toString(), // Short duration
                false,
            );

            // Get correct stake offer ID
            const stakesOfferCount = await mogaStaking.getAllStakeOfferIds();
            const newStakeOfferId = stakesOfferCount.length;

            // Record initial token supply
            const initialSupply = await mogaToken.totalSupply();

            // Stake very small amount that will generate minimal interest
            await mogaStaking.connect(addr1).stakeFixedTerm(newStakeOfferId, hre.ethers.parseEther(verySmallStakeAmount));

            // Get stake ID
            const addr1Stakes = await mogaStaking.getAllStakeIdsOfAddress(addr1.address);
            const stakeId = addr1Stakes[addr1Stakes.length - 1];

            // Wait for lock period
            await helpers.time.increase(shortPeriod + 1);

            // Calculate rewards and potential burn amounts
            const rewards = await mogaStaking.rewards(stakeId);
            const principal = hre.ethers.parseEther(verySmallStakeAmount);
            const interest = rewards - principal;
            const expectedFee = (interest * 10n) / 100n;
            const expectedBurn = expectedFee / 2n;

            console.log(`Principal: ${hre.ethers.formatEther(principal)}`);
            console.log(`Total rewards: ${hre.ethers.formatEther(rewards)}`);
            console.log(`Interest earned: ${hre.ethers.formatEther(interest)}`);
            console.log(`Expected fee: ${hre.ethers.formatEther(expectedFee)}`);
            console.log(`Expected burn amount: ${hre.ethers.formatEther(expectedBurn)}`);

            // Unstake
            await mogaStaking.connect(addr1).unStakeFixedTerm(stakeId);

            // Check if tokens were burned correctly
            const finalSupply = await mogaToken.totalSupply();
            const burned = initialSupply - finalSupply;

            console.log(`Actual burned amount: ${hre.ethers.formatEther(burned)}`);

            // If interest is extremely small, no burn might occur due to our safety check
            if (expectedBurn > 0n) {
                expect(burned).to.be.closeTo(expectedBurn, 1n);
            } else {
                expect(burned).to.equal(0n);
            }
        });
    });

    describe('Maximum Values', function () {
        it('should handle large token amounts without overflow', async function () {
            // Create stake offer
            await mogaStaking.connect(mogaAdmin).createStakeOffer(
                hre.ethers.parseEther(rate.toString()), // Normal rate
                10, // 10% fee
                mediumPeriod.toString(), // 1 hour duration
                false,
            );

            // Get correct stake offer ID
            const stakesOfferCount = await mogaStaking.getAllStakeOfferIds();
            const newStakeOfferId = stakesOfferCount.length;

            // Stake a large amount
            await mogaStaking.connect(mogaAdmin).stakeFixedTerm(newStakeOfferId, hre.ethers.parseEther(largeStakeAmount));

            // Get stake ID
            const adminStakes = await mogaStaking.getAllStakeIdsOfAddress(mogaAdmin.address);
            const stakeId = adminStakes[adminStakes.length - 1];

            // Wait for stake period
            await helpers.time.increase(mediumPeriod + 1);

            // Get reward amount
            const rewards = await mogaStaking.rewards(stakeId);
            console.log(`Rewards for large stake: ${hre.ethers.formatEther(rewards)}`);

            // Record balance before unstaking
            const beforeBalance = await mogaToken.balanceOf(mogaAdmin.address);

            // Unstake
            await mogaStaking.connect(mogaAdmin).unStakeFixedTerm(stakeId);

            // Check balance after unstaking
            const afterBalance = await mogaToken.balanceOf(mogaAdmin.address);
            const received = afterBalance - beforeBalance;

            console.log(`Amount received after unstaking: ${hre.ethers.formatEther(received)}`);

            // Should be close to the original stake amount plus interest minus fee
            expect(received).to.be.gt(hre.ethers.parseEther(largeStakeAmount));
        });
    });

    describe('Multiple Stake Types', function () {
        it('should handle a user having both fixed-term and flexible stakes', async function () {
            // Setup initial balances
            const initialBalance = await mogaToken.balanceOf(addr1.address);

            // Create a fixed-term stake
            await mogaStaking.connect(addr1).stakeFixedTerm(1, hre.ethers.parseEther(normalStakeAmount));

            // Create a flexible stake
            await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther(normalStakeAmount));

            // Verify both stakes exist
            const stakeIds = await mogaStaking.getAllStakeIdsOfAddress(addr1.address);
            expect(stakeIds.length).to.equal(1); // Fixed-term stake

            const flexibleBalance = await mogaStaking.flexibleBalanceOf(addr1.address);
            expect(flexibleBalance).to.equal(hre.ethers.parseEther(normalStakeAmount)); // Flexible stake

            // Advance time
            await helpers.time.increase(longPeriod + 1);

            // Check rewards for both stake types
            const fixedRewards = await mogaStaking.rewards(1);
            const flexibleRewards = await mogaStaking.rewardsFlexible(addr1.address);

            console.log(`Fixed-term rewards: ${hre.ethers.formatEther(fixedRewards)}`);
            console.log(`Flexible rewards: ${hre.ethers.formatEther(flexibleRewards)}`);

            // Unstake both
            await mogaStaking.connect(addr1).unStakeFixedTerm(1);
            await mogaStaking.connect(addr1).withdrawFlexible();

            // Verify final balance reflects both unstaked amounts plus interest
            const finalBalance = await mogaToken.balanceOf(addr1.address);
            const difference = finalBalance - initialBalance;

            console.log(`Initial balance: ${hre.ethers.formatEther(initialBalance)}`);
            console.log(`Final balance: ${hre.ethers.formatEther(finalBalance)}`);
            console.log(`Difference (should be positive due to interest): ${hre.ethers.formatEther(difference)}`);

            // Should have earned some interest
            expect(difference).to.be.gt(0);
        });
    });

    // New tests for the time-weighted accumulator system
    describe('Rate Change Scenarios', function () {
        it('should calculate rewards correctly across multiple rate changes', async function () {
            // Stake a significant amount
            await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther('1000'));

            // Initial rate is already set to 5%
            console.log('Starting with 5% rate');

            // First period - 3 months at 5%
            await helpers.time.increase(86400 * 90); // 90 days

            // Check rewards after first period
            let rewards1 = await mogaStaking.rewardsFlexible(addr1.address);
            const initialStake = hre.ethers.parseEther('1000');
            const stake1 = await mogaStaking.flexibleBalanceOf(addr1.address);

            console.log(`After 90 days at 5%:`);
            console.log(`- User stake balance: ${hre.ethers.formatEther(stake1)}`);
            console.log(`- Interest earned: ${hre.ethers.formatEther(rewards1)}`);
            console.log(`- Total value: ${hre.ethers.formatEther(stake1 + rewards1)}`);

            // Not expected rewards calculation with basic compounding: R = P * r * t
            let P = new BN('1000'); // Principal
            let r = new BN('0.05'); // Annual interest rate (5%)
            let t = new BN('90').div('365'); // Time in years (90 days)
            const notExpectedRewards1 = P * r * t;
            console.log(`No expected rewards: ${notExpectedRewards1.toString()}`);
            expect(rewards1).not.to.be.closeTo(hre.ethers.parseEther(notExpectedRewards1.toString()), hre.ethers.parseEther('0.0001'));
            // Expected rewards calculation with continuous compounding: A = P × e^(r × t)
            let A = P.times(new BN(Math.exp(r.times(t).toNumber()))); // Total amount after interest
            const expectedRewards1 = A.minus(P); // Total amount minus principal
            console.log(`Expected rewards: ${expectedRewards1.toString()}`);
            expect(rewards1).to.be.closeTo(hre.ethers.parseEther(expectedRewards1.toString()), hre.ethers.parseEther('0.0001'));

            // Change rate to 3%
            await mogaStaking.connect(mogaAdmin).setNewFlexibleRewardRate(hre.ethers.parseEther('0.03'));
            console.log('Rate changed to 3%');

            // Second period - 6 months at 3%
            await helpers.time.increase(86400 * 180); // 180 days

            // Check rewards after second period
            let rewards2 = await mogaStaking.rewardsFlexible(addr1.address);
            console.log(`After additional 180 days at 3%:`);
            console.log(`- User stake balance: ${hre.ethers.formatEther(stake1)}`);
            console.log(`- Interest earned: ${hre.ethers.formatEther(rewards2)}`);
            console.log(`- Total value: ${hre.ethers.formatEther(stake1 + rewards2)}`);

            // Not expected rewards calculation with basic compounding: R = P * r * t
            P = A; // Initial principal is now the total amount after first period
            r = new BN('0.03'); // Annual interest rate (3%)
            t = new BN('180').div('365'); // Time in years (180 days)
            const notExpectedRewards2 = P * r * t;
            console.log(`No expected rewards: ${notExpectedRewards2.toString()}`);
            expect(rewards2).not.to.be.closeTo(hre.ethers.parseEther(notExpectedRewards2.toString()), hre.ethers.parseEther('0.0001'));
            // Expected rewards calculation with continuous compounding: A = P × e^(r × t)
            A = P.times(new BN(Math.exp(r.times(t).toNumber()))); // Total amount after interest
            const expectedRewards2 = A.minus(P); // Total amount minus principal
            console.log(`Expected rewards: ${expectedRewards2.toString()}`);
            expect(rewards2).to.be.closeTo(hre.ethers.parseEther(expectedRewards2.toFixed(18)), hre.ethers.parseEther('0.0001'));

            // Change rate to 7%
            await mogaStaking.connect(mogaAdmin).setNewFlexibleRewardRate(hre.ethers.parseEther('0.07'));
            console.log('Rate changed to 7%');

            // Third period - 3 months at 7%
            await helpers.time.increase(86400 * 90); // 90 days

            // Check final rewards
            let rewards3 = await mogaStaking.rewardsFlexible(addr1.address);
            console.log(`After additional 90 days at 7%:`);
            console.log(`- User stake balance: ${hre.ethers.formatEther(stake1)}`);
            console.log(`- Interest earned: ${hre.ethers.formatEther(rewards3)}`);
            console.log(`- Total value: ${hre.ethers.formatEther(stake1 + rewards3)}`);

            // Not expected rewards calculation with basic compounding: R = P * r * t
            P = A; // Initial principal is now the total amount after first period
            r = new BN('0.03'); // Annual interest rate (3%)
            t = new BN('180').div('365'); // Time in years (180 days)
            const notExpectedRewards3 = P * r * t;
            console.log(`No expected rewards: ${notExpectedRewards3.toString()}`);
            expect(rewards3).not.to.be.closeTo(hre.ethers.parseEther(notExpectedRewards3.toString()), hre.ethers.parseEther('0.0001'));
            // Expected rewards calculation with continuous compounding: A = P × e^(r × t)
            A = P.times(new BN(Math.exp(r.times(t).toNumber()))); // Total amount after interest
            const expectedRewards3 = A.minus(P); // Total amount minus principal
            console.log(`Expected rewards: ${expectedRewards3.toString()}`);
            expect(rewards3).to.be.closeTo(hre.ethers.parseEther(expectedRewards3.toFixed(18)), hre.ethers.parseEther('0.0001'));

            // Verify rewards increased after each period
            expect(rewards2).to.be.gt(rewards1);
            expect(rewards3).to.be.gt(rewards2);

            // Withdraw to confirm system works end-to-end
            await mogaStaking.connect(addr1).withdrawFlexible();

            const finalUserBalance = await mogaToken.balanceOf(addr1.address);
            console.log(`Final user balance after withdrawal: ${hre.ethers.formatEther(finalUserBalance)}`);

            // User should receive more than they initially staked
            expect(finalUserBalance).to.be.gt(hre.ethers.parseEther('10000'));
        });

        it('should handle concurrent users with different start times correctly', async function () {
            const yearlyRateInRay = await mogaStaking.flexibleRewardRate();
            const yearlyRate = Number((yearlyRateInRay - 10n ** 27n) * (365n * 86400n)) / Math.pow(10, 27);

            // First user starts staking
            await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther('1000'));

            // Advance 30 days
            await helpers.time.increase(86400 * 30);

            // Second user starts staking
            await mogaStaking.connect(addr2).stakeFlexible(hre.ethers.parseEther('1000'));

            // Advance 30 more days
            await helpers.time.increase(86400 * 30);

            // Third user starts staking
            await mogaStaking.connect(addr3).stakeFlexible(hre.ethers.parseEther('1000'));

            // Change rate
            await mogaStaking.connect(mogaAdmin).setNewFlexibleRewardRate(hre.ethers.parseEther('0.08'));

            // Advance 60 more days
            await helpers.time.increase(86400 * 60);

            // Get rewards for all users
            const rewards1 = await mogaStaking.rewardsFlexible(addr1.address);
            const rewards2 = await mogaStaking.rewardsFlexible(addr2.address);
            const rewards3 = await mogaStaking.rewardsFlexible(addr3.address);

            console.log(`User 1 (120 days total): ${hre.ethers.formatEther(rewards1)}`);
            console.log(`User 2 (90 days total): ${hre.ethers.formatEther(rewards2)}`);
            console.log(`User 3 (60 days total): ${hre.ethers.formatEther(rewards3)}`);

            const initialStake = hre.ethers.parseEther('1000');

            // Expected rewards calculation with continuous compounding: A = P × e^(r × t)
            const P = BN('1000');
            const r = new BN(`${yearlyRate}`); // Annual interest rate (5%)
            let t = new BN('60').div('365'); // Time in years (60 days)
            let A = P.times(new BN(Math.exp(r.times(t).toNumber()))); // Total amount after interest
            const expectedRewards3 = A.minus(P); // Total amount minus principal
            console.log(`Expected rewards 3: ${expectedRewards3.toString()}`);
            expect(rewards3).to.be.closeTo(hre.ethers.parseEther(expectedRewards3.toFixed(18)), hre.ethers.parseEther('0.0001'));
            t = new BN('90').div('365'); // Time in years (30 + 60 days)
            A = P.times(new BN(Math.exp(r.times(t).toNumber()))); // Total amount after interest
            const expectedRewards2 = A.minus(P); // Total amount minus principal
            console.log(`Expected rewards 2: ${expectedRewards2.toString()}`);
            expect(rewards2).to.be.closeTo(hre.ethers.parseEther(expectedRewards2.toFixed(18)), hre.ethers.parseEther('0.0001'));
            t = new BN('120').div('365'); // Time in years (30 + 30 + 60 days)
            A = P.times(new BN(Math.exp(r.times(t).toNumber()))); // Total amount after interest
            const expectedRewards1 = A.minus(P); // Total amount minus principal
            console.log(`Expected rewards 1: ${expectedRewards1.toString()}`);
            expect(rewards1).to.be.closeTo(hre.ethers.parseEther(expectedRewards1.toFixed(18)), hre.ethers.parseEther('0.0001'));

            // User 1 should have more rewards than User 2, who should have more than User 3
            expect(rewards1).to.be.gt(rewards2);
            expect(rewards2).to.be.gt(rewards3);

            // Just verify that users have earned interest, not that total is greater than initial stake
            // (since we're just looking at interest calculation, not principal + interest)
            expect(Number(hre.ethers.formatEther(rewards1))).to.be.gt(13);
            expect(Number(hre.ethers.formatEther(rewards2))).to.be.gt(10);
            expect(Number(hre.ethers.formatEther(rewards3))).to.be.gt(5);
        });
    });
});
