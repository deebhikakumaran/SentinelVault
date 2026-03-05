// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title SentinelRegistry — Onchain audit log for CRE risk assessments
/// @notice Receives DON-signed reports via KeystoneForwarder.onReport()
/// @dev Deployed on Sepolia. CRE workflow writes risk assessments here.
contract SentinelRegistry is IReceiver {

    address public immutable KEYSTONE_FORWARDER;
    address public owner;

    struct RiskAssessment {
        uint8   riskScore;       // 0-100
        string  action;          // HOLD, DELEVERAGE, REBALANCE, EMERGENCY_EXIT
        uint256 healthFactor;    // Worst health factor (18 decimals, 1e18 = 1.0)
        uint256 totalDebtUsd;    // Aave total debt (8 decimals)
        string  worstChain;      // Chain with worst health factor
        uint256 timestamp;
    }

    RiskAssessment[] public assessments;

    event AssessmentLogged(
        uint8   indexed riskScore,
        string  action,
        uint256 healthFactor,
        uint256 totalDebtUsd,
        string  worstChain,
        uint256 timestamp
    );

    constructor(address _forwarder) {
        KEYSTONE_FORWARDER = _forwarder;
        owner = msg.sender;
    }

    /// @notice CRE Consumer entry point — called by KeystoneForwarder
    /// @dev ABI encoding MUST match main.ts encodeAbiParameters exactly:
    ///      (uint8 riskScore, string action, uint256 healthFactor, uint256 totalDebtUsd, string worstChain)
    function onReport(bytes calldata /* metadata */, bytes calldata report) external override {

        require(
            msg.sender == KEYSTONE_FORWARDER || msg.sender == owner,
            "Unauthorized: Not the Forwarder or Owner"
        );

        (
            uint8   riskScore,
            string memory action,
            uint256 healthFactor,
            uint256 totalDebtUsd,
            string memory worstChain
        ) = abi.decode(report, (uint8, string, uint256, uint256, string));

        assessments.push(RiskAssessment({
            riskScore:    riskScore,
            action:       action,
            healthFactor: healthFactor,
            totalDebtUsd: totalDebtUsd,
            worstChain:   worstChain,
            timestamp:    block.timestamp
        }));

        emit AssessmentLogged(riskScore, action, healthFactor, totalDebtUsd, worstChain, block.timestamp);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x1f744e23 || // IReceiver ID
               interfaceId == 0x01ffc9a7;    // ERC165 ID
    }

    // ——— View Functions ———

    function getLatestAssessment() external view returns (
        uint8   riskScore,
        string memory action,
        uint256 healthFactor,
        uint256 totalDebtUsd,
        string memory worstChain,
        uint256 timestamp
    ) {
        require(assessments.length > 0, "SentinelRegistry: no assessments yet");
        RiskAssessment memory a = assessments[assessments.length - 1];
        return (a.riskScore, a.action, a.healthFactor, a.totalDebtUsd, a.worstChain, a.timestamp);
    }

    function getAssessmentCount() external view returns (uint256) {
        return assessments.length;
    }

    function getAssessment(uint256 index) external view returns (RiskAssessment memory) {
        require(index < assessments.length, "SentinelRegistry: index out of bounds");
        return assessments[index];
    }
}
