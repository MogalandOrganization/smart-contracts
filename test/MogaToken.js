// cSpell:ignore moga

const { expect } = require('chai');
const hre = require('hardhat');

describe('MogaToken contract', function () {
    // global vars
    let Token;
    let mogaToken;
    let deployerAcc;
    let mogaAdmin;
    let addr1;
    let addr2;
    let tokenCap = 1000000000; // 1 billion without decimals

    let burnAmount = 1000;

    beforeEach(async function () {
        // Get the ContractFactory and Signers here.
        Token = await hre.ethers.getContractFactory('MogaToken');
        [deployerAcc, mogaAdmin, addr1, addr2] = await hre.ethers.getSigners();

        mogaToken = await Token.deploy(mogaAdmin, tokenCap);
        await mogaToken.waitForDeployment();

        await mogaToken.connect(mogaAdmin).mintTokens();
    });

    describe('Deployment', function () {
        it('Should set the right owner', async function () {
            expect(await mogaToken.owner()).to.equal(mogaAdmin.address);
        });

        it('Should set the max capped supply to the argument provided during deployment', async function () {
            const cap = await mogaToken.cap();
            //console.log("cap: " + cap);
            expect(Number(hre.ethers.formatEther(cap))).to.equal(tokenCap);
        });
    });

    describe('Transactions', function () {
        it('Should revert if admin tries to mint total cap more than once', async function () {
            await expect(mogaToken.connect(mogaAdmin).mintTokens()).to.be.reverted;
        });

        it('Should revert if anyone tries to mint tokens after initial mint', async function () {
            await expect(mogaToken.connect(addr1).mintTokens()).to.be.reverted;
        });

        it('Should transfer tokens between accounts', async function () {
            // Transfer 50 tokens from mogaAdmin to addr1
            await mogaToken.connect(mogaAdmin).transfer(addr1.address, hre.ethers.parseEther('50'));
            const addr1Balance = await mogaToken.balanceOf(addr1.address);
            expect(Number(hre.ethers.formatEther(addr1Balance))).to.equal(50);

            // Transfer 50 tokens from addr1 to addr2
            // We use .connect(signer) to send a transaction from another account
            await mogaToken.connect(addr1).transfer(addr2.address, hre.ethers.parseEther('50'));
            const addr2Balance = await mogaToken.balanceOf(addr2.address);
            expect(Number(hre.ethers.formatEther(addr2Balance))).to.equal(50);
        });

        it("Should fail if sender doesn't have enough tokens", async function () {
            const initialOwnerBalance = await mogaToken.balanceOf(mogaAdmin.address);
            // Try to send 1 token from addr1 (0 tokens) to mogaAdmin (1000000 tokens).
            // `require` will evaluate false and revert the transaction.
            await expect(mogaToken.connect(addr1).transfer(mogaAdmin.address, 1)).to.be.revertedWithCustomError(
                mogaToken,
                'ERC20InsufficientBalance',
            );

            // mogaAdmin balance shouldn't have changed.
            expect(await mogaToken.balanceOf(mogaAdmin.address)).to.equal(initialOwnerBalance);
        });

        it('Should update balances after transfers', async function () {
            const initialOwnerBalance = await mogaToken.balanceOf(mogaAdmin.address);
            // we minted 1000000000 tokens in constructor

            // Transfer 100 tokens from mogaAdmin to addr1.
            await mogaToken.connect(mogaAdmin).transfer(addr1.address, hre.ethers.parseEther('100'));

            // Transfer another 50 tokens from mogaAdmin to addr2.
            await mogaToken.connect(mogaAdmin).transfer(addr2.address, hre.ethers.parseEther('50'));

            // Check balances.
            const finalOwnerBalance = await mogaToken.balanceOf(mogaAdmin.address);
            expect(Number(hre.ethers.formatEther(finalOwnerBalance))).to.equal(999999850);

            const addr1Balance = await mogaToken.balanceOf(addr1.address);
            expect(Number(hre.ethers.formatEther(addr1Balance))).to.equal(100);

            const addr2Balance = await mogaToken.balanceOf(addr2.address);
            expect(Number(hre.ethers.formatEther(addr2Balance))).to.equal(50);
        });
    });

    describe('validations', function () {
        it('Should reduce circulating supply after burning', async function () {
            let currentSupply = await mogaToken.totalSupply();
            //console.log("current Supply before: " + currentSupply);
            await mogaToken.connect(mogaAdmin).burn(burnAmount);
            let newSupply = await mogaToken.totalSupply();
            //console.log("new Supply after: " + newSupply);
            expect(Number(hre.ethers.formatEther(newSupply)) < Number(hre.ethers.formatEther(currentSupply)));
        });
    });
});
