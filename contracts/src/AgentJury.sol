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

    address public owner;
    uint256 public evaluationFee;
    uint256 public totalRevenue;

    VerdictRecord[] private verdicts;

    event VerdictSaved(
        uint256 indexed index,
        bytes32 indexed caseHash,
        address indexed submitter,
        uint8 finalScore,
        string shortVerdict
    );

    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event Withdrawn(address indexed to, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(uint256 _evaluationFee) {
        owner = msg.sender;
        evaluationFee = _evaluationFee;
    }

    function saveVerdict(
        bytes32 caseHash,
        uint8 feasibilityScore,
        uint8 innovationScore,
        uint8 riskScore,
        uint8 finalScore,
        string calldata shortVerdict
    ) external payable {
        require(msg.value >= evaluationFee, "Insufficient fee");
        require(bytes(shortVerdict).length <= 140, "Verdict too long");
        require(
            feasibilityScore <= 100 &&
                innovationScore <= 100 &&
                riskScore <= 100 &&
                finalScore <= 100,
            "Scores must be 0-100"
        );

        totalRevenue += msg.value;

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

    function setFee(uint256 _newFee) external onlyOwner {
        uint256 oldFee = evaluationFee;
        evaluationFee = _newFee;
        emit FeeUpdated(oldFee, _newFee);
    }

    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds");
        totalRevenue = 0;
        (bool ok, ) = payable(owner).call{value: balance}("");
        require(ok, "Transfer failed");
        emit Withdrawn(owner, balance);
    }
}
