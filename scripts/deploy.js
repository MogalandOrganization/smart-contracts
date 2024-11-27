const hre = require("hardhat");
require("dotenv").config();

let mogaTokenAddress;
let mogaStaking;
let mogaStakingAddress;
let mogaVestingAddress;
let mogaVesting;
let tokenCap = 1000000000;
let initialStakingAmount = 100000;
let stakingRewardsPerHour = 1000;

async function main() {
  Token = await ethers.getContractFactory("MogaToken");
  Staking = await ethers.getContractFactory("MogaStaking");
  Vesting = await hre.ethers.getContractFactory("MogaVesting");
  [deployerAcc, mogaAdmin, addr1, addr2, addr3] = await hre.ethers.getSigners();

  mogaToken = await Token.deploy(
    "0x0ba5550b728933f9c5cb81dea564e97020904ec1",
    1000000000
  );
  await mogaToken.waitForDeployment();
  mogaTokenAddress = await mogaToken.getAddress();
  console.log("MOGA token deployed: ", mogaTokenAddress);

  mogaStaking = await Staking.deploy(
    "0x0ba5550b728933f9c5cb81dea564e97020904ec1",
    mogaTokenAddress
  );
  await mogaStaking.waitForDeployment();
  mogaStakingAddress = await mogaStaking.getAddress();
  console.log("MOGA staking deployed: ", mogaStakingAddress);

  mogaVesting = await Vesting.deploy(
    "0x0ba5550b728933f9c5cb81dea564e97020904ec1",
    mogaTokenAddress
  );
  await mogaVesting.waitForDeployment();
  mogaVestingAddress = await mogaVesting.getAddress();
  console.log("MOGA Vesting deployed: ", mogaVestingAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
