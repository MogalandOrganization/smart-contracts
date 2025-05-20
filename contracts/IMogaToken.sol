// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// cSpell:ignore ierc, moga

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

interface IMogaToken is IERC20 {
    // From ERC20Capped
    // function cap() external view returns (uint256);

    // From ERC20Burnable
    // function burn(uint256 amount) external;
    // function burnFrom(address account, uint256 amount) external;

    // From Ownable
    // function owner() external view returns (address);
    // function transferOwnership(address newOwner) external;

    // Custom method to be called at TGE
    function mintTokens() external;
}
