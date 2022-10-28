// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IGovernanceTreasury.sol";
import "./interfaces/IGovernanceRegistry.sol";
import "./interfaces/ITokenRegistry.sol";
import "./interfaces/IGovernanceToken.sol";

contract GovernanceTreasury is IGovernanceTreasury {
    IGovernanceRegistry private immutable _registry;

    constructor(IGovernanceRegistry registry_) {
        _registry = registry_;
    }

    function deposit(
        address token,
        address from,
        uint256 amount
    ) external payable override {
        IGovernanceToken govToken = IGovernanceToken(_registry.governanceToken());
        if (token == address(0)) {
            // if ETH
            require(msg.value > 0, "No Funds");
            govToken.mint(msg.sender, msg.value);
        } else {
            // if not ETH
            require(msg.value == 0); // to make sure they don't send eth by mistake
            // check token is authorized
        }
    }

    function registry() external view override returns (address) {
        return address(_registry);
    }
}