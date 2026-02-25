// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/SLAEnforcement.sol";

contract DeploySLA is Script {
    // ETH/USD on Sepolia (also works on Tenderly fork of Sepolia)
    address constant ETH_USD_FEED = 0x694AA1769357215DE4FAC081bf1f309aDC325306;

    function run() external {
        vm.startBroadcast();
        SLAEnforcement sla = new SLAEnforcement(ETH_USD_FEED);
        console.log("SLAEnforcement deployed at:", address(sla));
        vm.stopBroadcast();
    }
}
