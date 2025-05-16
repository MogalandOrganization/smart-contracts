// cSpell:ignore moga, unstake, unstaked, unstaking
const { expect } = require('chai');
const hre = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const BN = require('bignumber.js');

describe('MogaStaking Contract Updates', function () {
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
    let stakeAmount = '100';

    BN.config({ DECIMAL_PLACES: 27, POW_PRECISION: 100 });
    let rate = new BN(0.05); // 5% nominal interest per year, compounded continuously

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
        
        // set flexibleRewardRate and fee for flexible staking
        await mogaStaking.connect(mogaAdmin).setNewFlexibleRewardRate(hre.ethers.parseEther(rate.toString()));
        await mogaStaking.connect(mogaAdmin).setNewFlexibleRewardFee(10);

        // Transfer tokens to test addresses and approve staking contract
        await mogaToken.connect(mogaAdmin).transfer(addr1.address, hre.ethers.parseEther(stakeAmount));
        await mogaToken.connect(mogaAdmin).transfer(addr2.address, hre.ethers.parseEther(stakeAmount));
        await mogaToken.connect(mogaAdmin).approve(mogaStakingAddress, hre.ethers.parseEther(initialStakingAmount));
        await mogaToken.connect(addr1).approve(mogaStakingAddress, hre.ethers.parseEther(stakeAmount));
        await mogaToken.connect(addr2).approve(mogaStakingAddress, hre.ethers.parseEther(stakeAmount));
    });

    describe('Input Validation', function () {
        it('Should revert when passing zero address to stakeFixedTermForBeneficiary', async function () {
            await mogaStaking.connect(mogaAdmin).createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, 86400, false);
            
            // Try to stake for zero address
            await expect(
                mogaStaking.connect(mogaAdmin).stakeFixedTermForBeneficiary(1, hre.ethers.parseEther('10'), ethers.ZeroAddress)
            ).to.be.reverted;
        });

        it('Should revert when passing zero address to compoundFlexible', async function () {
            // Try to compound for zero address
            await expect(
                mogaStaking.connect(addr1).compoundFlexible(ethers.ZeroAddress)
            ).to.be.reverted;
        });
    });

    describe('Fee calculation and burn logic', function () {
        it('Should correctly handle fee application', async function () {
            // Create stake offer with normal fee
            await mogaStaking.connect(mogaAdmin).createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, 60, false);
            
            // Stake a small amount
            const smallAmount = '1';
            await mogaToken.connect(mogaAdmin).transfer(addr3.address, hre.ethers.parseEther(smallAmount));
            await mogaToken.connect(addr3).approve(mogaStakingAddress, hre.ethers.parseEther(smallAmount));
            
            await mogaStaking.connect(addr3).stakeFixedTerm(1, hre.ethers.parseEther(smallAmount));
            
            // Wait for lockup to end
            await helpers.time.increase(60 + 1);
            
            // Record initial balance
            const balanceBefore = await mogaToken.balanceOf(addr3.address);
            
            // Unstake
            await mogaStaking.connect(addr3).unStakeFixedTerm(1);
            
            // Get final balance
            const balanceAfter = await mogaToken.balanceOf(addr3.address);
            
            // Verify user received back their principal plus some interest
            expect(balanceAfter).to.be.gt(balanceBefore);
        });
        
        it('Should emit TokensBurned event when burning tokens', async function () {
            // Create stake offer with fee
            await mogaStaking.connect(mogaAdmin).createStakeOffer(hre.ethers.parseEther(rate.toString()), 10, 86400, false);
            
            // Stake tokens
            await mogaStaking.connect(addr1).stakeFixedTerm(1, hre.ethers.parseEther('50'));
            
            // Advance time to generate substantial interest
            await helpers.time.increase(86400 * 30); // 30 days
            
            // Unstake and check for TokensBurned event
            await expect(mogaStaking.connect(addr1).unStakeFixedTerm(1))
                .to.emit(mogaStaking, 'TokensBurned');
        });
    });

    describe('Reserved rewards tracking', function () {
        it('Should emit ReservedRewardsUpdated event when rewards are accrued', async function () {
            // Stake in flexible staking
            await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther('50'));
            
            // Advance time to generate rewards
            await helpers.time.increase(86400 * 30); // 30 days
            
            // Trigger reward update and check for event
            await expect(mogaStaking.connect(addr1).withdrawFlexible())
                .to.emit(mogaStaking, 'ReservedRewardsUpdated');
        });

        it('Should properly update rewards when compounding', async function () {
            // Stake in flexible staking
            await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther('50'));
            
            // Advance time to generate rewards
            await helpers.time.increase(86400 * 30); // 30 days
            
            // Check for proper reward update by verifying balance increase
            const balanceBefore = await mogaStaking.flexibleBalanceOf(addr1.address);
            
            // Compound rewards
            await mogaStaking.connect(addr1).compoundFlexible(addr1.address);
            
            // Verify balance has increased from compounding
            const balanceAfter = await mogaStaking.flexibleBalanceOf(addr1.address);
            expect(balanceAfter).to.be.gt(balanceBefore);
        });
    });

    describe('Flexible principal tracking', function () {
        it('Should emit FlexiblePrincipalUpdated when depositing to flexible staking', async function () {
            // Stake and check for event
            await expect(mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther('50')))
                .to.emit(mogaStaking, 'FlexiblePrincipalUpdated');
        });

        it('Should update total staked amount when withdrawing', async function () {
            // Stake first
            await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther('50'));
            
            // Get initial total staked amount
            const initialStaked = await mogaStaking.totalStaked();
            
            // Withdraw and check total staked is reduced
            await mogaStaking.connect(addr1).withdrawFlexible();
            
            const finalStaked = await mogaStaking.totalStaked();
            expect(finalStaked).to.be.lt(initialStaked);
        });
    });

    describe('Flexible stakers pagination', function () {
        it('Should correctly return flexible stakers count', async function () {
            // Add multiple stakers
            await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther('20'));
            await mogaStaking.connect(addr2).stakeFlexible(hre.ethers.parseEther('30'));
            
            // Check count
            const stakersCount = await mogaStaking.connect(mogaAdmin).getFlexibleStakersCount();
            expect(stakersCount).to.equal(2);
        });

        it('Should correctly return paginated flexible stakers', async function () {
            // Add multiple stakers
            await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther('20'));
            await mogaStaking.connect(addr2).stakeFlexible(hre.ethers.parseEther('30'));
            
            // Get paginated list
            const stakers = await mogaStaking.connect(mogaAdmin).getFlexibleStakers(0, 1);
            expect(stakers.length).to.equal(1);
            expect(stakers[0]).to.equal(addr1.address);
        });

        it('Should remove staker from list when they withdraw completely', async function () {
            // Add multiple stakers
            await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther('20'));
            await mogaStaking.connect(addr2).stakeFlexible(hre.ethers.parseEther('30'));
            
            // Initial count
            const initialCount = await mogaStaking.connect(mogaAdmin).getFlexibleStakersCount();
            
            // Convert to Number for comparison
            const initialCountNum = Number(initialCount);
            
            // Withdraw completely
            await mogaStaking.connect(addr1).withdrawFlexible();
            
            // Final count should be reduced
            const finalCount = await mogaStaking.connect(mogaAdmin).getFlexibleStakersCount();
            const finalCountNum = Number(finalCount);
            
            expect(finalCountNum).to.equal(initialCountNum - 1);
        });
    });

    describe('getWithdrawableAmount calculation', function () {
        it('Should calculate withdrawable amount correctly with flexible staking rewards', async function () {
            // Initial withdrawable amount
            const initialWithdrawable = await mogaStaking.getWithdrawableAmount();
            
            // Stake in flexible staking
            await mogaStaking.connect(addr1).stakeFlexible(hre.ethers.parseEther('50'));
            
            // Advance time to generate rewards
            await helpers.time.increase(86400 * 30); // 30 days
            
            // Check withdrawable amount has been adjusted to account for rewards
            const finalWithdrawable = await mogaStaking.getWithdrawableAmount();
            expect(finalWithdrawable).to.be.lt(initialWithdrawable);
        });
    });
});