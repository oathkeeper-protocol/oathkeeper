// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/WorldChainRegistry.sol";

contract DeployWorldChain is Script {
    // World ID Router on World Chain mainnet (chain ID 480)
    address constant WORLD_ID_ROUTER_WORLD_CHAIN = 0x17B354dD2595411ff79041f930e491A4Df39A278;
    // World ID Router on World Chain testnet (chain ID 4801)
    address constant WORLD_ID_ROUTER_WORLD_CHAIN_TESTNET = 0x57f928158C3EE7CDad1e4D8642503c4D0201f611;

    string constant APP_ID = "app_staging_oathkeeper";

    function run() external {
        address router = block.chainid == 480
            ? WORLD_ID_ROUTER_WORLD_CHAIN
            : WORLD_ID_ROUTER_WORLD_CHAIN_TESTNET;

        vm.startBroadcast();
        WorldChainRegistry registry = new WorldChainRegistry(router, APP_ID);
        console.log("WorldChainRegistry deployed at:", address(registry));
        console.log("Chain ID:", block.chainid);
        console.log("World ID Router:", router);
        vm.stopBroadcast();
    }
}
