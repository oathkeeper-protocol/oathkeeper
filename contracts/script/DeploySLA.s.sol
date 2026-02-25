// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/SLAEnforcement.sol";

contract DeploySLA is Script {
    // Chainlink ETH/USD on Sepolia
    address constant ETH_USD_FEED = 0x694AA1769357215DE4FAC081bf1f309aDC325306;

    // World ID Router on Sepolia
    // https://docs.world.org/world-id/reference/address-book
    address constant WORLD_ID_ROUTER = 0x469449f251692E0779667583026b5A1E99512157;

    // Your World ID app ID from developer.world.org
    string constant APP_ID = "app_staging_oathkeeper";

    function run() external {
        vm.startBroadcast();
        SLAEnforcement sla = new SLAEnforcement(
            ETH_USD_FEED,
            WORLD_ID_ROUTER,
            APP_ID
        );
        console.log("SLAEnforcement deployed at:", address(sla));
        console.log("World ID Router:", WORLD_ID_ROUTER);
        console.log("Price Feed:", ETH_USD_FEED);
        vm.stopBroadcast();
    }
}
