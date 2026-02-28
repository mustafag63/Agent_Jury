// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

contract AgentJury is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable
{
    // ── Roles ──────────────────────────────────────
    bytes32 public constant WRITER_ROLE = keccak256("WRITER_ROLE");
    bytes32 public constant ATTESTOR_ROLE = keccak256("ATTESTOR_ROLE");
    bytes32 public constant DISPUTER_ROLE = keccak256("DISPUTER_ROLE");

    // ── Enums ──────────────────────────────────────
    enum VerdictStatus { Active, Disputed, Revoked, Resolved }

    // ── Storage-optimized verdict ──────────────────
    // Slot 0: caseHash (32 bytes)
    // Slot 1: submitter(20) + timestamp(5) + 4×score(4) + status(1) + flags(1) = 31 bytes → fits in 1 slot
    // Slot 2: shortVerdict string pointer
    // Slot 3: disputeReason string pointer
    struct StoredVerdict {
        bytes32 caseHash;
        address submitter;
        uint40 timestamp;
        uint8 feasibilityScore;
        uint8 innovationScore;
        uint8 riskScore;
        uint8 finalScore;
        VerdictStatus status;
        bool attestationVerified;
        string shortVerdict;
        string disputeReason;
    }

    // ── ABI-stable external return type ────────────
    struct VerdictRecord {
        bytes32 caseHash;
        uint8 feasibilityScore;
        uint8 innovationScore;
        uint8 riskScore;
        uint8 finalScore;
        string shortVerdict;
        address submitter;
        uint256 timestamp;
        VerdictStatus status;
        bool attestationVerified;
        string disputeReason;
    }

    // ── State ──────────────────────────────────────
    StoredVerdict[] private _verdicts;

    uint256 public saveCooldown;
    mapping(address => uint256) public lastSavedAt;

    address public attestor;
    bool public attestationRequired;

    mapping(bytes32 => uint256[]) private _caseHashIndex;

    uint256 public constant CONTRACT_VERSION = 2;

    // ── Events (rich, indexed for off-chain) ───────
    event VerdictSaved(
        uint256 indexed verdictId,
        bytes32 indexed caseHash,
        address indexed submitter,
        uint8 feasibilityScore,
        uint8 innovationScore,
        uint8 riskScore,
        uint8 finalScore,
        bool attestationVerified,
        uint256 timestamp
    );

    event VerdictDisputed(
        uint256 indexed verdictId,
        bytes32 indexed caseHash,
        address indexed disputer,
        string reason,
        uint256 timestamp
    );

    event VerdictRevoked(
        uint256 indexed verdictId,
        bytes32 indexed caseHash,
        address indexed revoker,
        uint256 timestamp
    );

    event VerdictResolved(
        uint256 indexed verdictId,
        bytes32 indexed caseHash,
        address indexed resolver,
        VerdictStatus newStatus,
        uint256 timestamp
    );

    event AttestorUpdated(address indexed oldAttestor, address indexed newAttestor);
    event AttestationRequirementUpdated(bool required);
    event CooldownUpdated(uint256 oldCooldown, uint256 newCooldown);

    // ── Errors (cheaper than strings) ──────────────
    error CooldownNotElapsed(uint256 remaining);
    error VerdictEmpty();
    error VerdictTooLong(uint256 length, uint256 maxLength);
    error ScoreOutOfRange(string field, uint8 value);
    error AttestorNotSet();
    error InvalidSignatureLength(uint256 length);
    error InvalidSignature();
    error IndexOutOfBounds(uint256 index, uint256 total);
    error InvalidStatusTransition(VerdictStatus current, VerdictStatus target);
    error DisputeReasonRequired();
    error OnlySubmitterOrAdmin();

    // ── Initializer (replaces constructor for UUPS) ─
    function initialize(uint256 _cooldown) public initializer {
        __AccessControl_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(WRITER_ROLE, msg.sender);

        saveCooldown = _cooldown;
    }

    // ── UUPS authorization ─────────────────────────
    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    // ── Core: save verdict ─────────────────────────
    function saveVerdict(
        bytes32 caseHash,
        uint8 feasibilityScore,
        uint8 innovationScore,
        uint8 riskScore,
        uint8 finalScore,
        string calldata shortVerdict,
        bytes calldata attestationSignature
    ) external onlyRole(WRITER_ROLE) {
        _enforceCooldown(msg.sender);
        _validateScores(feasibilityScore, innovationScore, riskScore, finalScore);

        uint256 svLen = bytes(shortVerdict).length;
        if (svLen == 0) revert VerdictEmpty();
        if (svLen > 140) revert VerdictTooLong(svLen, 140);

        bool attVerified = false;
        if (attestationRequired) {
            _verifyAttestation(
                caseHash, feasibilityScore, innovationScore,
                riskScore, finalScore, shortVerdict, attestationSignature
            );
            attVerified = true;
        }

        uint256 verdictId = _verdicts.length;
        _verdicts.push(StoredVerdict({
            caseHash: caseHash,
            submitter: msg.sender,
            timestamp: uint40(block.timestamp),
            feasibilityScore: feasibilityScore,
            innovationScore: innovationScore,
            riskScore: riskScore,
            finalScore: finalScore,
            status: VerdictStatus.Active,
            attestationVerified: attVerified,
            shortVerdict: shortVerdict,
            disputeReason: ""
        }));

        _caseHashIndex[caseHash].push(verdictId);
        lastSavedAt[msg.sender] = block.timestamp;

        emit VerdictSaved(
            verdictId, caseHash, msg.sender,
            feasibilityScore, innovationScore, riskScore, finalScore,
            attVerified, block.timestamp
        );
    }

    // ── Dispute / Revocation ───────────────────────
    function disputeVerdict(uint256 verdictId, string calldata reason)
        external
        onlyRole(DISPUTER_ROLE)
    {
        if (bytes(reason).length == 0) revert DisputeReasonRequired();
        StoredVerdict storage v = _getStoredVerdict(verdictId);

        if (v.status != VerdictStatus.Active)
            revert InvalidStatusTransition(v.status, VerdictStatus.Disputed);

        v.status = VerdictStatus.Disputed;
        v.disputeReason = reason;

        emit VerdictDisputed(verdictId, v.caseHash, msg.sender, reason, block.timestamp);
    }

    function revokeVerdict(uint256 verdictId) external {
        StoredVerdict storage v = _getStoredVerdict(verdictId);

        bool isSubmitter = msg.sender == v.submitter;
        bool isAdmin = hasRole(DEFAULT_ADMIN_ROLE, msg.sender);
        if (!isSubmitter && !isAdmin) revert OnlySubmitterOrAdmin();

        if (v.status == VerdictStatus.Revoked)
            revert InvalidStatusTransition(v.status, VerdictStatus.Revoked);

        v.status = VerdictStatus.Revoked;

        emit VerdictRevoked(verdictId, v.caseHash, msg.sender, block.timestamp);
    }

    function resolveDispute(uint256 verdictId, bool reinstate)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        StoredVerdict storage v = _getStoredVerdict(verdictId);

        if (v.status != VerdictStatus.Disputed)
            revert InvalidStatusTransition(v.status, reinstate ? VerdictStatus.Resolved : VerdictStatus.Revoked);

        v.status = reinstate ? VerdictStatus.Resolved : VerdictStatus.Revoked;

        emit VerdictResolved(verdictId, v.caseHash, msg.sender, v.status, block.timestamp);
    }

    // ── Read: single verdict ───────────────────────
    function getVerdict(uint256 index) external view returns (VerdictRecord memory) {
        return _toRecord(_getStoredVerdict(index));
    }

    function getVerdictCount() external view returns (uint256) {
        return _verdicts.length;
    }

    // ── Read: pagination ───────────────────────────
    function getVerdictsPage(uint256 offset, uint256 limit)
        external view returns (VerdictRecord[] memory page)
    {
        uint256 total = _verdicts.length;
        if (offset >= total || limit == 0) return new VerdictRecord[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;

        uint256 size = end - offset;
        page = new VerdictRecord[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = _toRecord(_verdicts[offset + i]);
        }
    }

    function getLatestVerdicts(uint256 limit)
        external view returns (VerdictRecord[] memory page)
    {
        uint256 total = _verdicts.length;
        if (limit == 0 || total == 0) return new VerdictRecord[](0);

        uint256 size = limit > total ? total : limit;
        page = new VerdictRecord[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = _toRecord(_verdicts[total - size + i]);
        }
    }

    // ── Read: by caseHash ──────────────────────────
    function getVerdictsByCaseHash(bytes32 caseHash)
        external view returns (VerdictRecord[] memory results)
    {
        uint256[] storage ids = _caseHashIndex[caseHash];
        results = new VerdictRecord[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            results[i] = _toRecord(_verdicts[ids[i]]);
        }
    }

    function getVerdictCountByCaseHash(bytes32 caseHash)
        external view returns (uint256)
    {
        return _caseHashIndex[caseHash].length;
    }

    // ── Admin: config ──────────────────────────────
    function setAttestor(address _attestor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address old = attestor;
        attestor = _attestor;
        emit AttestorUpdated(old, _attestor);
    }

    function setAttestationRequired(bool required) external onlyRole(DEFAULT_ADMIN_ROLE) {
        attestationRequired = required;
        emit AttestationRequirementUpdated(required);
    }

    function setCooldown(uint256 _cooldown) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 old = saveCooldown;
        saveCooldown = _cooldown;
        emit CooldownUpdated(old, _cooldown);
    }

    // ── Internal helpers ───────────────────────────
    function _getStoredVerdict(uint256 id) internal view returns (StoredVerdict storage) {
        if (id >= _verdicts.length) revert IndexOutOfBounds(id, _verdicts.length);
        return _verdicts[id];
    }

    function _enforceCooldown(address sender) internal view {
        uint256 last = lastSavedAt[sender];
        if (last != 0 && block.timestamp < last + saveCooldown) {
            revert CooldownNotElapsed(last + saveCooldown - block.timestamp);
        }
    }

    function _validateScores(uint8 f, uint8 i, uint8 r, uint8 fs) internal pure {
        if (f > 100) revert ScoreOutOfRange("feasibility", f);
        if (i > 100) revert ScoreOutOfRange("innovation", i);
        if (r > 100) revert ScoreOutOfRange("risk", r);
        if (fs > 100) revert ScoreOutOfRange("finalScore", fs);
    }

    function _verifyAttestation(
        bytes32 caseHash,
        uint8 feasibilityScore,
        uint8 innovationScore,
        uint8 riskScore,
        uint8 finalScore,
        string calldata shortVerdict,
        bytes calldata sig
    ) internal view {
        if (attestor == address(0)) revert AttestorNotSet();
        if (sig.length != 65) revert InvalidSignatureLength(sig.length);

        bytes32 messageHash = keccak256(abi.encodePacked(
            caseHash, feasibilityScore, innovationScore,
            riskScore, finalScore, shortVerdict
        ));
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;

        address recovered = ecrecover(ethSignedHash, v, r, s);
        if (recovered != attestor) revert InvalidSignature();
    }

    function _toRecord(StoredVerdict storage s) internal view returns (VerdictRecord memory) {
        return VerdictRecord({
            caseHash: s.caseHash,
            feasibilityScore: s.feasibilityScore,
            innovationScore: s.innovationScore,
            riskScore: s.riskScore,
            finalScore: s.finalScore,
            shortVerdict: s.shortVerdict,
            submitter: s.submitter,
            timestamp: uint256(s.timestamp),
            status: s.status,
            attestationVerified: s.attestationVerified,
            disputeReason: s.disputeReason
        });
    }
}
