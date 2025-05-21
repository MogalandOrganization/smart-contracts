// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// cSpell:ignore ierc

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

interface ITokenMigration {
    // --------------
    // --- Public ---
    // --------------
    function oldToken() external view returns (IERC20);

    function newToken() external view returns (IERC20);

    function migrate(uint256 oldAmount) external;

    // -------------
    // --- Admin ---
    // -------------
    function setRatio(uint256 _ratio) external;

    function ratio() external view returns (uint256);

    function emergencyWithdraw(address tokenAddress, uint256 amount) external;

    // --------------
    // --- Events ---
    // --------------
    // event Migrated(address indexed user, uint256 oldAmount, uint256 newAmount);
    // event RatioUpdated(uint256 newRatio);
}
