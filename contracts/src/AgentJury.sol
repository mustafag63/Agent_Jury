// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentJury {
    struct VerdictRecord {
        bytes32 caseHash;
        uint8 feasibilityScore;
        uint8 innovationScore;
        uint8 riskScore;
        uint8 finalScore;
        string shortVerdict;
        address submitter;
        uint256 timestamp;
    }

    VerdictRecord[] private verdicts;

    event VerdictSaved(
        uint256 indexed index,
        bytes32 indexed caseHash,
        address indexed submitter,
        uint8 finalScore,
        string shortVerdict
    );

    function saveVerdict(
        bytes32 caseHash,
        uint8 feasibilityScore,
        uint8 innovationScore,
        uint8 riskScore,
        uint8 finalScore,
        string calldata shortVerdict
    ) external {
        require(bytes(shortVerdict).length <= 140, "Verdict too long");
        require(
            feasibilityScore <= 100 &&
                innovationScore <= 100 &&
                riskScore <= 100 &&
                finalScore <= 100,
            "Scores must be 0-100"
        );

        verdicts.push(
            VerdictRecord({
                caseHash: caseHash,
                feasibilityScore: feasibilityScore,
                innovationScore: innovationScore,
                riskScore: riskScore,
                finalScore: finalScore,
                shortVerdict: shortVerdict,
                submitter: msg.sender,
                timestamp: block.timestamp
            })
        );

        emit VerdictSaved(
            verdicts.length - 1,
            caseHash,
            msg.sender,
            finalScore,
            shortVerdict
        );
    }

    function getVerdict(
        uint256 index
    ) external view returns (VerdictRecord memory) {
        require(index < verdicts.length, "Index out of bounds");
        return verdicts[index];
    }

    function getVerdictCount() external view returns (uint256) {
        return verdicts.length;
    }
}
