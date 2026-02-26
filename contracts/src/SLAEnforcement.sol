// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface AggregatorV3Interface {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
    function decimals() external view returns (uint8);
}

/// @dev World ID router interface — verifies ZK proofs on-chain
interface IWorldID {
    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external view;
}

/// @dev Utility to hash a signal address for World ID
library ByteHasher {
    function hashToField(bytes memory value) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(value))) >> 8;
    }
}

contract SLAEnforcement {
    using ByteHasher for bytes;

    // --- Chainlink ---
    AggregatorV3Interface public immutable priceFeed;

    // --- World ID ---
    IWorldID public immutable worldId;
    uint256 public immutable groupId = 1; // 1 = Orb verified
    uint256 public immutable providerExternalNullifier;
    uint256 public immutable arbitratorExternalNullifier;

    // --- CRE Cross-chain Forwarder ---
    /// @notice Address of the Chainlink CRE DON forwarder contract.
    ///         Set at deploy time; this is the only address allowed to call
    ///         registerProviderRelayed / registerArbitratorRelayed.
    address public creForwarder;

    // --- Storage ---
    struct SLA {
        address provider;
        address tenant;
        uint256 bondAmount;
        uint256 responseTimeHrs;
        uint256 minUptimeBps;  // e.g. 9950 = 99.50%
        uint256 penaltyBps;    // e.g. 500 = 5%
        uint256 createdAt;
        bool active;
    }

    struct Claim {
        uint256 slaId;
        address tenant;
        string description;
        uint256 filedAt;
        bool resolved;
    }

    mapping(uint256 => SLA) public slas;
    mapping(uint256 => Claim) public claims;
    mapping(address => bool) public verifiedProviders;
    mapping(address => bool) public verifiedArbitrators;
    mapping(uint256 => bool) public usedNullifiers; // prevent double-use of World ID proofs

    uint256 public slaCount;
    uint256 public claimCount;

    // --- Events ---
    event ProviderRegistered(address indexed provider, uint256 nullifierHash);
    event ArbitratorRegistered(address indexed arbitrator, uint256 nullifierHash);
    event SLACreated(uint256 indexed slaId, address indexed provider, address indexed tenant);
    event ClaimFiled(uint256 indexed claimId, uint256 indexed slaId, address tenant);
    event SLABreached(uint256 indexed slaId, address indexed provider, uint256 uptimeBps, uint256 penaltyAmount);
    event ArbitrationDecision(uint256 indexed slaId, address indexed arbitrator, bool upheld);

    constructor(
        address _priceFeed,
        address _worldId,
        string memory _appId,
        address _creForwarder
    ) {
        priceFeed = AggregatorV3Interface(_priceFeed);
        worldId = IWorldID(_worldId);
        // External nullifiers scope proofs to this app + action
        providerExternalNullifier = abi.encodePacked(
            abi.encodePacked(_appId).hashToField(), "oathlayer-provider-register"
        ).hashToField();
        arbitratorExternalNullifier = abi.encodePacked(
            abi.encodePacked(_appId).hashToField(), "oathlayer-arbitrator-register"
        ).hashToField();
        // For hackathon: deployer address is acceptable as initial CRE forwarder
        creForwarder = _creForwarder;
    }

    /// @notice Register as SLA provider — requires valid World ID ZK proof
    /// @param root Merkle root from IDKit proof
    /// @param nullifierHash Unique hash preventing double-registration
    /// @param proof ZK proof from World ID
    function registerProvider(
        uint256 root,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) external payable {
        require(!verifiedProviders[msg.sender], "Already registered");
        require(!usedNullifiers[nullifierHash], "Nullifier already used");
        require(msg.value >= 0.1 ether, "Min bond 0.1 ETH");

        // On-chain ZK proof verification — reverts if invalid
        worldId.verifyProof(
            root,
            groupId,
            abi.encodePacked(msg.sender).hashToField(),
            nullifierHash,
            providerExternalNullifier,
            proof
        );

        verifiedProviders[msg.sender] = true;
        usedNullifiers[nullifierHash] = true;
        emit ProviderRegistered(msg.sender, nullifierHash);
    }

    /// @notice Register as arbitrator — requires valid World ID ZK proof
    function registerArbitrator(
        uint256 root,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) external {
        require(!verifiedArbitrators[msg.sender], "Already registered");
        require(!usedNullifiers[nullifierHash], "Nullifier already used");

        worldId.verifyProof(
            root,
            groupId,
            abi.encodePacked(msg.sender).hashToField(),
            nullifierHash,
            arbitratorExternalNullifier,
            proof
        );

        verifiedArbitrators[msg.sender] = true;
        usedNullifiers[nullifierHash] = true;
        emit ArbitratorRegistered(msg.sender, nullifierHash);
    }

    /// @notice Called by the CRE DON forwarder to register a provider whose World ID
    ///         proof was already verified on World Chain. Skips local ZK verification
    ///         because the CRE DON is the trusted bridge between chains.
    /// @param user  The wallet address that was verified on World Chain
    /// @param nullifierHash Unique nullifier from the World ID proof (prevents reuse)
    function registerProviderRelayed(address user, uint256 nullifierHash) external {
        require(msg.sender == creForwarder, "Not CRE forwarder");
        require(!verifiedProviders[user], "Already registered");
        require(!usedNullifiers[nullifierHash], "Nullifier already used");

        verifiedProviders[user] = true;
        usedNullifiers[nullifierHash] = true;
        emit ProviderRegistered(user, nullifierHash);
    }

    /// @notice Called by the CRE DON forwarder to register an arbitrator whose World ID
    ///         proof was already verified on World Chain.
    /// @param user  The wallet address that was verified on World Chain
    /// @param nullifierHash Unique nullifier from the World ID proof (prevents reuse)
    function registerArbitratorRelayed(address user, uint256 nullifierHash) external {
        require(msg.sender == creForwarder, "Not CRE forwarder");
        require(!verifiedArbitrators[user], "Already registered");
        require(!usedNullifiers[nullifierHash], "Nullifier already used");

        verifiedArbitrators[user] = true;
        usedNullifiers[nullifierHash] = true;
        emit ArbitratorRegistered(user, nullifierHash);
    }

    /// @notice Create an SLA agreement (must be a verified provider)
    function createSLA(
        address tenant,
        uint256 responseTimeHrs,
        uint256 minUptimeBps,
        uint256 penaltyBps
    ) external payable returns (uint256) {
        require(verifiedProviders[msg.sender], "Not verified provider");
        require(msg.value > 0, "Must bond collateral");

        uint256 slaId = slaCount++;
        slas[slaId] = SLA({
            provider: msg.sender,
            tenant: tenant,
            bondAmount: msg.value,
            responseTimeHrs: responseTimeHrs,
            minUptimeBps: minUptimeBps,
            penaltyBps: penaltyBps,
            createdAt: block.timestamp,
            active: true
        });

        emit SLACreated(slaId, msg.sender, tenant);
        return slaId;
    }

    /// @notice Tenant files a maintenance claim
    function fileClaim(uint256 slaId, string calldata description) external {
        SLA storage sla = slas[slaId];
        require(sla.active, "SLA not active");
        require(msg.sender == sla.tenant, "Not tenant");

        uint256 claimId = claimCount++;
        claims[claimId] = Claim({
            slaId: slaId,
            tenant: msg.sender,
            description: description,
            filedAt: block.timestamp,
            resolved: false
        });

        emit ClaimFiled(claimId, slaId, msg.sender);
    }

    /// @notice CRE workflow calls this to slash bond on breach
    function recordBreach(
        uint256 slaId,
        uint256 uptimeBps,
        uint256 penaltyBps
    ) external {
        SLA storage sla = slas[slaId];
        require(sla.active, "SLA not active");

        uint256 penaltyAmount = (sla.bondAmount * penaltyBps) / 10000;
        require(penaltyAmount <= sla.bondAmount, "Penalty exceeds bond");

        sla.bondAmount -= penaltyAmount;
        payable(sla.tenant).transfer(penaltyAmount);

        if (sla.bondAmount == 0) {
            sla.active = false;
        }

        emit SLABreached(slaId, sla.provider, uptimeBps, penaltyAmount);
    }

    /// @notice World ID verified arbitrator upholds or overturns a breach
    function arbitrate(uint256 slaId, bool upheld) external {
        require(verifiedArbitrators[msg.sender], "Not verified arbitrator");
        emit ArbitrationDecision(slaId, msg.sender, upheld);
    }

    /// @notice Get collateral USD value via Chainlink price feed
    function getCollateralRatio(uint256 slaId) public view returns (uint256) {
        SLA storage sla = slas[slaId];
        (, int256 price,,,) = priceFeed.latestRoundData();
        uint256 ethPrice = uint256(price);
        return (sla.bondAmount * ethPrice) / 1e26;
    }
}
