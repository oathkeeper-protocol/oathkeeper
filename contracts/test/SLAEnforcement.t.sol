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

contract SLAEnforcementTest is Test {
    SLAEnforcement slaContract;
    MockAggregator mockFeed;
    address provider = makeAddr("provider");
    address tenant = makeAddr("tenant");
    address arbitrator = makeAddr("arbitrator");

    // Mirror event for vm.expectEmit
    event ArbitrationDecision(uint256 indexed slaId, address indexed arbitrator, bool upheld);

    function setUp() public {
        mockFeed = new MockAggregator();
        slaContract = new SLAEnforcement(address(mockFeed));
        vm.deal(provider, 10 ether);
        vm.deal(tenant, 1 ether);
    }

    function test_registerProvider() public {
        vm.prank(provider);
        slaContract.registerProvider{value: 0.1 ether}(bytes32(uint256(1)));
        assertTrue(slaContract.verifiedProviders(provider));
        assertEq(slaContract.providerNullifiers(provider), bytes32(uint256(1)));
    }

    function test_registerProviderMinBond() public {
        vm.prank(provider);
        vm.expectRevert("Min bond 0.1 ETH");
        slaContract.registerProvider{value: 0.05 ether}(bytes32(uint256(1)));
    }

    function test_registerProviderDuplicate() public {
        vm.startPrank(provider);
        slaContract.registerProvider{value: 0.1 ether}(bytes32(uint256(1)));
        vm.expectRevert("Already registered");
        slaContract.registerProvider{value: 0.1 ether}(bytes32(uint256(2)));
        vm.stopPrank();
    }

    function test_createSLA() public {
        vm.prank(provider);
        slaContract.registerProvider{value: 0.1 ether}(bytes32(uint256(1)));

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

    function test_fileClaim() public {
        vm.prank(provider);
        slaContract.registerProvider{value: 0.1 ether}(bytes32(uint256(1)));

        vm.prank(provider);
        uint256 slaId = slaContract.createSLA{value: 1 ether}(tenant, 48, 9950, 500);

        vm.prank(tenant);
        slaContract.fileClaim(slaId, "Plumbing issue in unit 4B");

        (uint256 sid, address t, string memory desc,,bool resolved) = slaContract.claims(0);
        assertEq(sid, slaId);
        assertEq(t, tenant);
        assertEq(desc, "Plumbing issue in unit 4B");
        assertFalse(resolved);
    }

    function test_fileClaimNotTenant() public {
        vm.prank(provider);
        slaContract.registerProvider{value: 0.1 ether}(bytes32(uint256(1)));

        vm.prank(provider);
        uint256 slaId = slaContract.createSLA{value: 1 ether}(tenant, 48, 9950, 500);

        vm.prank(provider); // Wrong caller
        vm.expectRevert("Not tenant");
        slaContract.fileClaim(slaId, "Fake claim");
    }

    function test_recordBreach() public {
        vm.prank(provider);
        slaContract.registerProvider{value: 0.1 ether}(bytes32(uint256(1)));

        vm.prank(provider);
        uint256 slaId = slaContract.createSLA{value: 1 ether}(tenant, 48, 9950, 500);

        uint256 tenantBalBefore = tenant.balance;

        // CRE calls recordBreach
        slaContract.recordBreach(slaId, 9800, 500); // 5% penalty, 98% uptime

        (,, uint256 bondAfter,,,,, bool active) = slaContract.slas(slaId);
        assertEq(bondAfter, 0.95 ether); // 5% slashed
        assertEq(tenant.balance - tenantBalBefore, 0.05 ether); // 5% transferred
        assertTrue(active); // Still active (bond > 0)
    }

    function test_recordBreachDrainsFullBond() public {
        vm.prank(provider);
        slaContract.registerProvider{value: 0.1 ether}(bytes32(uint256(1)));

        vm.prank(provider);
        uint256 slaId = slaContract.createSLA{value: 1 ether}(tenant, 48, 9950, 10000); // 100% penalty

        slaContract.recordBreach(slaId, 9800, 10000);

        (,, uint256 bondAfter,,,,, bool active) = slaContract.slas(slaId);
        assertEq(bondAfter, 0);
        assertFalse(active); // Deactivated when bond = 0
    }

    function test_arbitrate() public {
        vm.prank(arbitrator);
        slaContract.registerArbitrator(bytes32(uint256(99)));
        assertTrue(slaContract.verifiedArbitrators(arbitrator));

        vm.prank(provider);
        slaContract.registerProvider{value: 0.1 ether}(bytes32(uint256(1)));

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

    function test_getCollateralRatio() public {
        vm.prank(provider);
        slaContract.registerProvider{value: 0.1 ether}(bytes32(uint256(1)));

        vm.prank(provider);
        uint256 slaId = slaContract.createSLA{value: 1 ether}(tenant, 48, 9950, 500);

        uint256 ratio = slaContract.getCollateralRatio(slaId);
        // 1 ETH * $2000 = $2000 USD (in 2 decimal form)
        assertGt(ratio, 0);
    }
}
