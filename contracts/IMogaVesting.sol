// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// cSpell:ignore moga

interface IMogaVesting {
    // ------------
    // --- Info ---
    // ------------
    function getToken() external view returns (address);

    function getVestingSchedulesCount() external view returns (uint256);

    function getVestingSchedulesTotalAmount() external view returns (uint256);

    // -------------------
    // --- Beneficiary ---
    // -------------------
    function getVestingSchedulesCountByBeneficiary(address holder) external view returns (uint256);

    function getVestingScheduleForBeneficiaryAndIndex(
        address holder,
        uint256 index
    )
        external
        view
        returns (
            address beneficiary,
            uint256 cliff,
            uint256 start,
            uint256 duration,
            uint256 slicePeriodSeconds,
            bool revocable,
            uint256 amountTotal,
            uint256 released,
            bool revoked
        );

    function getLastVestingScheduleForBeneficiary(
        address holder
    )
        external
        view
        returns (
            address beneficiary,
            uint256 cliff,
            uint256 start,
            uint256 duration,
            uint256 slicePeriodSeconds,
            bool revocable,
            uint256 amountTotal,
            uint256 released,
            bool revoked
        );

    function computeNextVestingScheduleIdForBeneficiary(address holder) external view returns (bytes32);

    function computeVestingScheduleIdForBeneficiaryAndIndex(address holder, uint256 index) external view returns (bytes32);

    function computeReleasableAmount(bytes32 vestingScheduleId) external view returns (uint256);

    function release(bytes32 vestingScheduleId, uint256 amount) external;

    // ---------------
    // --- Utility ---
    // ---------------
    receive() external payable;

    fallback() external payable;

    // -------------
    // --- Admin ---
    // -------------
    function createVestingSchedule(
        address beneficiary,
        uint256 start,
        uint256 cliff,
        uint256 duration,
        uint256 slicePeriodSeconds,
        bool revocable,
        uint256 amount
    ) external;

    function revoke(bytes32 vestingScheduleId) external;

    function getVestingIdAtIndex(uint256 index) external view returns (bytes32);

    function getVestingSchedule(
        bytes32 vestingScheduleId
    )
        external
        view
        returns (
            address beneficiary,
            uint256 cliff,
            uint256 start,
            uint256 duration,
            uint256 slicePeriodSeconds,
            bool revocable,
            uint256 amountTotal,
            uint256 released,
            bool revoked
        );

    function getWithdrawableAmount() external view returns (uint256);

    function withdraw(uint256 amount) external;

    // --------------
    // --- Events ---
    // --------------

    // --------------
    // --- Errors ---
    // --------------
    // error InvalidOwner(address queried, address actual);
}
