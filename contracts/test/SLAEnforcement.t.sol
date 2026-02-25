// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/SLAEnforcement.sol";

contract MockAggregator {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, 200000000000, block.timestamp, block.timestamp, 1); // $2000 ETH, 8 decimals
    }
    function decimals() external pure returns (uint8) { return 8; }
}

/// @dev Mock World ID that always accepts proofs — for unit testing only
contract MockWorldID {
    function verifyProof(
        uint256, // root
        uint256, // groupId
        uint256, // signalHash
        uint256, // nullifierHash
        uint256, // externalNullifierHash
        uint256[8] calldata // proof
    ) external pure {
        // Always succeeds in tests
    }
}

contract SLAEnforcementTest is Test {
    SLAEnforcement slaContract;
    MockAggregator mockFeed;
    MockWorldID mockWorldId;

    address provider = makeAddr("provider");
    address tenant = makeAddr("tenant");
    address arbitrator = makeAddr("arbitrator");

    // Dummy ZK proof values (accepted by MockWorldID)
    uint256 constant ROOT = 1;
    uint256 constant NULLIFIER_PROVIDER = 100;
    uint256 constant NULLIFIER_ARBITRATOR = 200;
    uint256[8] proof; // zero proof, accepted by mock

    // Mirror event for vm.expectEmit
    event ArbitrationDecision(uint256 indexed slaId, address indexed arbitrator, bool upheld);

    function setUp() public {
        mockFeed = new MockAggregator();
        mockWorldId = new MockWorldID();
        slaContract = new SLAEnforcement(
            address(mockFeed),
            address(mockWorldId),
            "app_test"
        );
        vm.deal(provider, 10 ether);
        vm.deal(tenant, 1 ether);
    }

    // --- Helper ---
    function _registerProvider() internal {
        vm.prank(provider);
        slaContract.registerProvider{value: 0.1 ether}(ROOT, NULLIFIER_PROVIDER, proof);
    }

    function _registerArbitrator() internal {
        vm.prank(arbitrator);
        slaContract.registerArbitrator(ROOT, NULLIFIER_ARBITRATOR, proof);
    }

    // --- Provider Registration ---

    function test_registerProvider() public {
        _registerProvider();
        assertTrue(slaContract.verifiedProviders(provider));
        assertTrue(slaContract.usedNullifiers(NULLIFIER_PROVIDER));
    }

    function test_registerProviderMinBond() public {
        vm.prank(provider);
        vm.expectRevert("Min bond 0.1 ETH");
        slaContract.registerProvider{value: 0.05 ether}(ROOT, NULLIFIER_PROVIDER, proof);
    }

    function test_registerProviderDuplicate() public {
        _registerProvider();
        vm.prank(provider);
        vm.expectRevert("Already registered");
        slaContract.registerProvider{value: 0.1 ether}(ROOT, 999, proof);
    }

    function test_registerProviderNullifierReuse() public {
        _registerProvider();
        // Different address, same nullifier — should revert
        address other = makeAddr("other");
        vm.deal(other, 1 ether);
        vm.prank(other);
        vm.expectRevert("Nullifier already used");
        slaContract.registerProvider{value: 0.1 ether}(ROOT, NULLIFIER_PROVIDER, proof);
    }

    // --- Arbitrator Registration ---

    function test_registerArbitrator() public {
        _registerArbitrator();
        assertTrue(slaContract.verifiedArbitrators(arbitrator));
        assertTrue(slaContract.usedNullifiers(NULLIFIER_ARBITRATOR));
    }

    // --- SLA Creation ---

    function test_createSLA() public {
        _registerProvider();

        vm.prank(provider);
        uint256 slaId = slaContract.createSLA{value: 1 ether}(tenant, 48, 9950, 500);

        (address p, address t, uint256 bond, uint256 hrs, uint256 uptime, uint256 penalty,, bool active) = slaContract.slas(slaId);
        assertEq(p, provider);
        assertEq(t, tenant);
        assertEq(bond, 1 ether);
        assertEq(hrs, 48);
        assertEq(uptime, 9950);
        assertEq(penalty, 500);
        assertTrue(active);
    }

    function test_createSLANotVerified() public {
        vm.prank(provider);
        vm.expectRevert("Not verified provider");
        slaContract.createSLA{value: 1 ether}(tenant, 48, 9950, 500);
    }

    // --- Claims ---

    function test_fileClaim() public {
        _registerProvider();

        vm.prank(provider);
        uint256 slaId = slaContract.createSLA{value: 1 ether}(tenant, 48, 9950, 500);

        vm.prank(tenant);
        slaContract.fileClaim(slaId, "Plumbing issue in unit 4B");

        (uint256 sid, address t, string memory desc,, bool resolved) = slaContract.claims(0);
        assertEq(sid, slaId);
        assertEq(t, tenant);
        assertEq(desc, "Plumbing issue in unit 4B");
        assertFalse(resolved);
    }

    function test_fileClaimNotTenant() public {
        _registerProvider();

        vm.prank(provider);
        uint256 slaId = slaContract.createSLA{value: 1 ether}(tenant, 48, 9950, 500);

        vm.prank(provider);
        vm.expectRevert("Not tenant");
        slaContract.fileClaim(slaId, "Fake claim");
    }

    // --- Breach ---

    function test_recordBreach() public {
        _registerProvider();

        vm.prank(provider);
        uint256 slaId = slaContract.createSLA{value: 1 ether}(tenant, 48, 9950, 500);

        uint256 tenantBalBefore = tenant.balance;
        slaContract.recordBreach(slaId, 9800, 500); // 5% penalty

        (,, uint256 bondAfter,,,,, bool active) = slaContract.slas(slaId);
        assertEq(bondAfter, 0.95 ether);
        assertEq(tenant.balance - tenantBalBefore, 0.05 ether);
        assertTrue(active);
    }

    function test_recordBreachDrainsFullBond() public {
        _registerProvider();

        vm.prank(provider);
        uint256 slaId = slaContract.createSLA{value: 1 ether}(tenant, 48, 9950, 10000);

        slaContract.recordBreach(slaId, 9800, 10000);

        (,, uint256 bondAfter,,,,, bool active) = slaContract.slas(slaId);
        assertEq(bondAfter, 0);
        assertFalse(active);
    }

    // --- Arbitration ---

    function test_arbitrate() public {
        _registerArbitrator();
        _registerProvider();

        vm.prank(provider);
        uint256 slaId = slaContract.createSLA{value: 1 ether}(tenant, 48, 9950, 500);

        vm.expectEmit(true, true, false, true);
        emit ArbitrationDecision(slaId, arbitrator, true);

        vm.prank(arbitrator);
        slaContract.arbitrate(slaId, true);
    }

    function test_arbitrateNotVerified() public {
        vm.prank(arbitrator);
        vm.expectRevert("Not verified arbitrator");
        slaContract.arbitrate(0, true);
    }

    // --- Collateral ---

    function test_getCollateralRatio() public {
        _registerProvider();

        vm.prank(provider);
        uint256 slaId = slaContract.createSLA{value: 1 ether}(tenant, 48, 9950, 500);

        uint256 ratio = slaContract.getCollateralRatio(slaId);
        assertGt(ratio, 0);
    }
}
