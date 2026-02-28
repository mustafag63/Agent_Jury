// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentJury {
    // External return shape is kept stable for frontend compatibility.
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

    // Storage-optimized layout:
    // slot0: caseHash
    // slot1: shortVerdict pointer/length
    // slot2: submitter(20) + timestamp(8) + 4 scores(4) = 32 bytes
    struct StoredVerdict {
        bytes32 caseHash;
        string shortVerdict;
        address submitter;
        uint64 timestamp;
        uint8 feasibilityScore;
        uint8 innovationScore;
        uint8 riskScore;
        uint8 finalScore;
    }

    StoredVerdict[] private verdicts;
    uint256 public constant SAVE_COOLDOWN = 60;
    mapping(address => uint256) public lastSavedAt;
    address public owner;
    bool public writeAccessRestricted;
    mapping(address => bool) public authorizedWriters;
    address public attestor;
    bool public attestationRequired;

    event VerdictSaved(
        uint256 indexed index,
        bytes32 indexed caseHash,
        address indexed submitter,
        uint8 feasibilityScore,
        uint8 innovationScore,
        uint8 riskScore,
        uint8 finalScore,
        string shortVerdict
    );
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event WriteAccessRestrictionUpdated(bool enabled);
    event WriterAuthorizationUpdated(address indexed writer, bool authorized);
    event AttestorUpdated(address indexed newAttestor);
    event AttestationRequirementUpdated(bool required);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyAuthorizedWriter() {
        if (writeAccessRestricted) {
            require(authorizedWriters[msg.sender], "Writer not authorized");
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedWriters[msg.sender] = true;
    }

    function saveVerdict(
        bytes32 caseHash,
        uint8 feasibilityScore,
        uint8 innovationScore,
        uint8 riskScore,
        uint8 finalScore,
        string calldata shortVerdict,
        bytes calldata attestationSignature
    ) external onlyAuthorizedWriter {
        uint256 lastSaved = lastSavedAt[msg.sender];
        require(
            lastSaved == 0 || block.timestamp >= lastSaved + SAVE_COOLDOWN,
            "Please wait before saving again"
        );
        require(bytes(shortVerdict).length > 0, "Verdict cannot be empty");
        require(bytes(shortVerdict).length <= 140, "Verdict too long");
        require(
            feasibilityScore <= 100 &&
                innovationScore <= 100 &&
                riskScore <= 100 &&
                finalScore <= 100,
            "Scores must be 0-100"
        );

        if (attestationRequired) {
            require(attestor != address(0), "Attestor not set");
            require(attestationSignature.length == 65, "Invalid signature length");

            bytes32 messageHash = keccak256(
                abi.encodePacked(
                    caseHash,
                    feasibilityScore,
                    innovationScore,
                    riskScore,
                    finalScore,
                    shortVerdict
                )
            );
            bytes32 ethSignedHash = keccak256(
                abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
            );

            bytes32 r;
            bytes32 s;
            uint8 v;
            assembly {
                r := calldataload(attestationSignature.offset)
                s := calldataload(add(attestationSignature.offset, 32))
                v := byte(0, calldataload(add(attestationSignature.offset, 64)))
            }
            if (v < 27) v += 27;

            address recovered = ecrecover(ethSignedHash, v, r, s);
            require(recovered == attestor, "Invalid attestation signature");
        }

        verdicts.push(
            StoredVerdict({
                caseHash: caseHash,
                shortVerdict: shortVerdict,
                submitter: msg.sender,
                timestamp: uint64(block.timestamp),
                feasibilityScore: feasibilityScore,
                innovationScore: innovationScore,
                riskScore: riskScore,
                finalScore: finalScore
            })
        );
        lastSavedAt[msg.sender] = block.timestamp;

        emit VerdictSaved(
            verdicts.length - 1,
            caseHash,
            msg.sender,
            feasibilityScore,
            innovationScore,
            riskScore,
            finalScore,
            shortVerdict
        );
    }

    function getVerdict(
        uint256 index
    ) external view returns (VerdictRecord memory) {
        require(index < verdicts.length, "Index out of bounds");
        return toVerdictRecord(verdicts[index]);
    }

    function getVerdictCount() external view returns (uint256) {
        return verdicts.length;
    }

    function getVerdictsPage(
        uint256 offset,
        uint256 limit
    ) external view returns (VerdictRecord[] memory page) {
        uint256 total = verdicts.length;
        if (offset >= total || limit == 0) {
            return new VerdictRecord[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        uint256 size = end - offset;
        page = new VerdictRecord[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = toVerdictRecord(verdicts[offset + i]);
        }
    }

    function getLatestVerdicts(
        uint256 limit
    ) external view returns (VerdictRecord[] memory page) {
        uint256 total = verdicts.length;
        if (limit == 0 || total == 0) {
            return new VerdictRecord[](0);
        }

        uint256 size = limit > total ? total : limit;
        page = new VerdictRecord[](size);

        for (uint256 i = 0; i < size; i++) {
            page[i] = toVerdictRecord(verdicts[total - size + i]);
        }
    }

    function toVerdictRecord(
        StoredVerdict storage stored
    ) internal view returns (VerdictRecord memory) {
        return
            VerdictRecord({
                caseHash: stored.caseHash,
                feasibilityScore: stored.feasibilityScore,
                innovationScore: stored.innovationScore,
                riskScore: stored.riskScore,
                finalScore: stored.finalScore,
                shortVerdict: stored.shortVerdict,
                submitter: stored.submitter,
                timestamp: uint256(stored.timestamp)
            });
    }

    function setWriteAccessRestricted(bool enabled) external onlyOwner {
        writeAccessRestricted = enabled;
        emit WriteAccessRestrictionUpdated(enabled);
    }

    function setAuthorizedWriter(address writer, bool authorized) external onlyOwner {
        require(writer != address(0), "Invalid writer");
        authorizedWriters[writer] = authorized;
        emit WriterAuthorizationUpdated(writer, authorized);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function setAttestor(address _attestor) external onlyOwner {
        attestor = _attestor;
        emit AttestorUpdated(_attestor);
    }

    function setAttestationRequired(bool required) external onlyOwner {
        attestationRequired = required;
        emit AttestationRequirementUpdated(required);
    }
}
