// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

contract MogaToken is ERC20Capped, ERC20Burnable, Ownable {
    constructor(
        address initialOwner,
        uint256 cap
    )
        ERC20("MogaToken", "Moga")
        ERC20Capped(cap * (10 ** decimals()))
        Ownable(initialOwner)
    {}

   // overriding internal function to enforce implementation from ERC20Capped
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override(ERC20Capped, ERC20) {
        super._update(from, to, value);

        if (from == address(0)) {
            uint256 maxSupply = cap();
            uint256 supply = totalSupply();
            if (supply > maxSupply) {
                revert ERC20ExceededCap(supply, maxSupply);
            }
        }
    }

    // delayed TGE event, only callable once due to fixed cap
    function mintTokens() public onlyOwner {
        _mint(owner(), 1000000000 * (10 ** decimals()));
    }
}
