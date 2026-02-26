// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/WorldChainRegistry.sol";

contract MockWorldIDRegistry {
    function verifyProof(uint256, uint256, uint256, uint256, uint256, uint256[8] calldata) external pure {}
}

contract WorldChainRegistryTest is Test {
    WorldChainRegistry registry;
    MockWorldIDRegistry mockWorldId;

    address provider = makeAddr("provider");
    address arbitrator = makeAddr("arbitrator");

    uint256 constant ROOT = 1;
    uint256 constant PROVIDER_NULLIFIER = 100;
    uint256 constant ARBITRATOR_NULLIFIER = 200;
    uint256[8] proof;

    event ProviderRegistrationRequested(address indexed user, uint256 nullifierHash, uint256 root, uint256 timestamp);
    event ArbitratorRegistrationRequested(address indexed user, uint256 nullifierHash, uint256 root, uint256 timestamp);

    function setUp() public {
        mockWorldId = new MockWorldIDRegistry();
        registry = new WorldChainRegistry(address(mockWorldId), "app_test");
    }

    function test_requestProviderRegistration() public {
        vm.expectEmit(true, false, false, false);
        emit ProviderRegistrationRequested(provider, PROVIDER_NULLIFIER, ROOT, block.timestamp);

        vm.prank(provider);
        registry.requestProviderRegistration(ROOT, PROVIDER_NULLIFIER, proof);

        assertTrue(registry.registeredProviders(provider));
        assertTrue(registry.usedNullifiers(PROVIDER_NULLIFIER));
    }

    function test_requestProviderRegistrationDuplicate() public {
        vm.prank(provider);
        registry.requestProviderRegistration(ROOT, PROVIDER_NULLIFIER, proof);

        vm.prank(provider);
        vm.expectRevert("Already registered");
        registry.requestProviderRegistration(ROOT, 999, proof);
    }

    function test_requestProviderNullifierReuse() public {
        vm.prank(provider);
        registry.requestProviderRegistration(ROOT, PROVIDER_NULLIFIER, proof);

        address other = makeAddr("other");
        vm.prank(other);
        vm.expectRevert("Nullifier already used");
        registry.requestProviderRegistration(ROOT, PROVIDER_NULLIFIER, proof);
    }

    function test_requestArbitratorRegistration() public {
        vm.expectEmit(true, false, false, false);
        emit ArbitratorRegistrationRequested(arbitrator, ARBITRATOR_NULLIFIER, ROOT, block.timestamp);

        vm.prank(arbitrator);
        registry.requestArbitratorRegistration(ROOT, ARBITRATOR_NULLIFIER, proof);

        assertTrue(registry.registeredArbitrators(arbitrator));
        assertTrue(registry.usedNullifiers(ARBITRATOR_NULLIFIER));
    }
}
