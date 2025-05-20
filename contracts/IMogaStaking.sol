// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// cSpell:ignore moga

interface IMogaStaking {
    // ---------------------
    // --- General infos ---
    // ---------------------
    function totalStaked() external view returns (uint256);

    function totalInterest() external view returns (uint256);

    function totalRewards() external view returns (uint256);

    // --------------------------
    // --- Fixed Term Staking ---
    // --------------------------
    function lastFixedTermOfferId() external view returns (uint256);

    function fixedTermOffers(
        uint256 stakeOfferId
    ) external view returns (uint256 rate, uint256 fee, uint256 lockupDuration, bool active, bool onlyAdmin);

    function stakeFixedTerm(uint256 _stakeOfferId, uint256 _amount) external;

    function unStakeFixedTerm(uint256 _stakeId) external;

    function getAllStakeIdsOfAddress(address _address, uint256 _start, uint256 _count) external view returns (uint256[] memory);

    function getStakeDetails(uint256 _stakeId) external view returns (uint256 offerId, uint256 principle, uint256 created, address owner);

    function getFixedTermRewards(uint256 _stakeId) external view returns (uint256);

    // ------------------------
    // --- Flexible Staking ---
    // ------------------------
    function flexibleTermRate() external view returns (uint256);

    function flexibleTermFee() external view returns (uint256);

    function globalRewardIndex() external view returns (uint256);

    function userRewardIndex(address) external view returns (uint256);

    function lastGlobalRewardIndexUpdateDate() external view returns (uint256);

    function flexibleTermBalances(address) external view returns (uint256);

    function flexibleTermUnclaimedRewards(address) external view returns (uint256);

    function stakeFlexibleTerm(uint256 _amount) external;

    function unStakeFlexibleTerm() external;

    function compoundFlexibleTerm(address _beneficiary) external;

    function getFlexibleTermRewards(address _user) external view returns (uint256);

    // --------------------
    // --- View/Utility ---
    // --------------------
    receive() external payable;

    fallback() external payable;

    function yearlyRateToRay(uint _rateWad) external pure returns (uint);

    function accrueInterest(uint _principal, uint _rate, uint _age) external pure returns (uint);

    // -------------------
    // --- Admin/Owner ---
    // -------------------
    function pause() external;

    function unpause() external;

    function getLastStakeId() external view returns (uint256);

    function createFixedTermOffer(uint256 _rate, uint256 _fee, uint256 _lockupDuration, bool _onlyAdmin) external;

    function discontinueFixedTermOffer(uint256 _stakeOfferId) external;

    function stakeFixedTermForBeneficiary(uint256 _stakeOfferId, uint256 _amount, address _beneficiary) external;

    function setFlexibleTermRate(uint256 _rate) external;

    function setFlexibleTermFee(uint256 _fee) external;

    function getFlexibleStakersCount() external view returns (uint256);

    function getFlexibleStakers(uint256 _start, uint256 _count) external view returns (address[] memory);

    function getWithdrawableAmount() external view returns (uint256);

    function withdraw(uint256 amount) external;

    // --------------
    // --- Events ---
    // --------------
    // event StakeOfferCreated(uint256 _stakeOfferId);
    // event StakeOfferDiscontinued(uint256 _stakeOfferId);
    // event FixedTermDeposit(address _address, uint256 _amount, uint256 _stakeId);
    // event FixedTermWithdraw(address _address, uint256 _amount);
    // event FixedTermClaim(address _address, uint256 _amount);
    // event FlexibleTermRateModified(uint256 _newRate);
    // event FlexibleTermFeeModified(uint256 _newFee);
    // event FlexibleTermDeposit(address _address, uint256 _amount);
    // event FlexibleTermWithdraw(address _address, uint256 _amount);
    // event CompoundFlexibleTerm(address _address, uint256 _amount);
    // event RewardIndexUpdated(uint256 _newIndex);
    // event FlexibleTermPrincipalUpdated(uint256 _oldAmount, uint256 _newAmount);
    // event ReservedRewardsUpdated(uint256 _oldAmount, uint256 _newAmount);
    // event TokensBurned(uint256 _amount);

    // --------------
    // --- Errors ---
    // --------------
    // error StakeOfferNotActive(uint256 _stakeOfferId);
    // error StakeOfferNotAccessible(uint256 _stakeOfferId);
    // error StakeBalanceIsZero(uint256 _stakeId);
    // error StakeIsLocked(uint256 _stakeId);
    // error InvalidAmount(uint256 _amount);
    // error InvalidOwner(uint256 _stakeId, address _address);
    // error FlexibleTermRateInvalid(uint256 _rate);
    // error FlexibleTermFeeInvalid(uint256 _fee);
    // error FlexibleTermBalanceIsZero(address _address);
}
