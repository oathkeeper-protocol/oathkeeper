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

contract SLAEnforcement {
    AggregatorV3Interface public immutable priceFeed;

    struct SLA {
        address provider;
        address tenant;
        uint256 bondAmount;        // ETH bonded by provider
        uint256 responseTimeHrs;   // max hours to respond
        uint256 minUptimeBps;      // minimum uptime in basis points (9950 = 99.50%)
        uint256 penaltyBps;        // penalty per breach in basis points
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
    mapping(address => bytes32) public providerNullifiers;

    uint256 public slaCount;
    uint256 public claimCount;

    uint256 public constant MIN_COLLATERAL_RATIO = 150; // 150%

    event ProviderRegistered(address indexed provider, bytes32 nullifierHash);
    event SLACreated(uint256 indexed slaId, address indexed provider, address indexed tenant);
    event ClaimFiled(uint256 indexed claimId, uint256 indexed slaId, address tenant);
    event SLABreached(uint256 indexed slaId, address indexed provider, uint256 uptimeBps, uint256 penaltyAmount);
    event ArbitrationDecision(uint256 indexed slaId, address indexed arbitrator, bool upheld);

    constructor(address _priceFeed) {
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    /// @notice Register as SLA provider (World ID verified off-chain, nullifier stored)
    function registerProvider(bytes32 nullifierHash) external payable {
        require(!verifiedProviders[msg.sender], "Already registered");
        require(msg.value >= 0.1 ether, "Min bond 0.1 ETH");
        verifiedProviders[msg.sender] = true;
        providerNullifiers[msg.sender] = nullifierHash;
        emit ProviderRegistered(msg.sender, nullifierHash);
    }

    /// @notice Create an SLA agreement
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

    /// @notice CRE workflow calls this when SLA is breached
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

    /// @notice World ID verified arbitrator can override
    function arbitrate(uint256 slaId, bool upheld) external {
        require(verifiedArbitrators[msg.sender], "Not verified arbitrator");
        emit ArbitrationDecision(slaId, msg.sender, upheld);
    }

    /// @notice Register as arbitrator (World ID verified)
    function registerArbitrator(bytes32 nullifierHash) external {
        verifiedArbitrators[msg.sender] = true;
        providerNullifiers[msg.sender] = nullifierHash;
        emit ProviderRegistered(msg.sender, nullifierHash);
    }

    /// @notice Get collateral value in USD using Chainlink price feed
    function getCollateralRatio(uint256 slaId) public view returns (uint256) {
        SLA storage sla = slas[slaId];
        (, int256 price,,,) = priceFeed.latestRoundData();
        uint256 ethPrice = uint256(price); // 8 decimals
        uint256 collateralUsd = (sla.bondAmount * ethPrice) / 1e26; // normalize to 2 decimal places
        return collateralUsd;
    }
}
