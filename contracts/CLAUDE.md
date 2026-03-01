# Contracts Module

Foundry project with two Solidity contracts deployed across two chains.

## Contracts

### SLAEnforcement.sol (Sepolia / Tenderly VNet)
Main enforcement contract. Key design:
- `onlyCREForwarder` modifier gates `recordBreach()`, `recordBreachWarning()`, `setComplianceStatus()`
- `complianceGate` modifier on `createSLA()` — requires `ComplianceStatus.APPROVED`
- `recordBreach()` reads `penaltyBps` from SLA storage (not caller param)
- `breachCount` state var incremented on each breach (avoids event-counting on dashboard)
- `recordBreachWarning()` has 4-hour cooldown per SLA (`lastWarningTime` mapping)
- `ComplianceStatus.REJECTED` is permanent — `setComplianceStatus` blocks REJECTED→APPROVED

### WorldChainRegistry.sol (World Chain Sepolia 4801)
Registration proxy that verifies World ID proofs on World Chain and emits events for CRE to relay to Sepolia.

## Testing

```bash
forge test                                    # all tests
forge test --match-contract SLAEnforcementTest  # SLA tests only
forge test -vvv                               # verbose with traces
```

22 tests covering: access control, compliance gate, cooldown, breach count, permanent rejection, registration, claims, arbitration.

## Deploy

```bash
forge script script/DeploySLA.s.sol --rpc-url $TENDERLY_RPC_URL --broadcast
forge script script/DeployWorldChain.s.sol --rpc-url $WORLD_CHAIN_RPC --broadcast
```

## Conventions
- `require()` with string messages (not custom errors) — hackathon readability
- MockWorldID and MockAggregator in tests for isolated unit testing
- `vm.prank(creForwarder)` pattern for CRE-only function tests
- `vm.warp()` for cooldown testing
