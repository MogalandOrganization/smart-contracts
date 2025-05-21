// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// cSpell:ignore reentrancy, ierc, moga, wmul

import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import './ITokenMigration.sol';
import '../lib/DSMath.sol';

using SafeERC20 for IERC20;

/**
 * @title TokenMigration
 * @dev This contract allows users to migrate their old MOGA tokens to new MOGA tokens.
 * It uses the SafeERC20 library to handle token transfers safely.
 * The contract owner can withdraw any remaining tokens in case of an emergency.
 * @notice This contract is designed for the migration of MOGA tokens from an old contract to a new one.
 * Users must approve the contract to spend their old tokens before calling the migrate function.
 * The contract will transfer the specified amount of old tokens from the user to itself and then
 * transfer the same amount of new tokens to the user.
 * The migration ratio is set in fixed-point format, where 1e18 means 1:1, 2e18 means 2 new per 1 old,
 * and 0.5e18 means 0.5 new per 1 old. The contract owner can update the migration ratio and withdraw
 * any remaining tokens in case of an emergency.
 * It will be up to the owner to burn the old tokens.
 */
contract TokenMigration is Ownable, ReentrancyGuard, DSMath, ITokenMigration {
    IERC20 public oldToken;
    IERC20 public newToken;
    uint256 public ratio; // e.g., 1e18 means 1:1, 2e18 means 2 new per 1 old, 0.5e18 means 0.5 new per 1 old

    event Migrated(address indexed user, uint256 oldAmount, uint256 newAmount);
    event RatioUpdated(uint256 newRatio);

    constructor(address initialOwner, address from, address to, uint256 _ratio) Ownable(initialOwner) {
        require(Ownable(from).owner() == initialOwner, 'Not owner of old token');
        require(Ownable(to).owner() == initialOwner, 'Not owner of new token');
        require(_ratio > 0, 'Ratio must be positive');
        oldToken = IERC20(from);
        newToken = IERC20(to);
        ratio = _ratio;
    }

    function setRatio(uint256 _ratio) external onlyOwner {
        require(_ratio > 0, 'Ratio must be positive');
        ratio = _ratio;
        emit RatioUpdated(_ratio);
    }

    // Users call this to migrate their old tokens
    function migrate(uint256 oldAmount) external nonReentrant {
        require(oldAmount > 0, 'Amount must be greater than 0');

        // Transfer old MOGA from user to this contract
        oldToken.safeTransferFrom(msg.sender, address(this), oldAmount);

        // Calculate new token amount with ratio (fixed-point math)
        uint256 newAmount = wmul(oldAmount, ratio);

        require(newAmount > 0, 'Resulting new token amount is zero');

        // Transfer new MOGA from this contract to user
        newToken.safeTransfer(msg.sender, newAmount);

        emit Migrated(msg.sender, oldAmount, newAmount);
    }

    // Owner can withdraw remaining tokens (optional cleanup)
    function emergencyWithdraw(address tokenAddress, uint256 amount) external onlyOwner nonReentrant {
        require(tokenAddress == address(oldToken) || tokenAddress == address(newToken), 'Can only withdraw oldMOGA or newMOGA');
        IERC20(tokenAddress).safeTransfer(owner(), amount);
    }
}
