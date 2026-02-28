const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("AgentJury", function () {
  let contract, owner, writer, disputer, outsider, attestorWallet;
  const COOLDOWN = 60;
  const WRITER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WRITER_ROLE"));
  const DISPUTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DISPUTER_ROLE"));
  const ADMIN_ROLE = ethers.ZeroHash;

  async function deployProxy() {
    const Factory = await ethers.getContractFactory("AgentJury");
    return upgrades.deployProxy(Factory, [COOLDOWN], { kind: "uups" });
  }

  function caseHash(id) {
    return ethers.keccak256(ethers.toUtf8Bytes(id));
  }

  async function makeAttestation(hash, f, i, r, fs, verdict) {
    const msgHash = ethers.solidityPackedKeccak256(
      ["bytes32", "uint8", "uint8", "uint8", "uint8", "string"],
      [hash, f, i, r, fs, verdict],
    );
    return attestorWallet.signMessage(ethers.getBytes(msgHash));
  }

  beforeEach(async function () {
    [owner, writer, disputer, outsider] = await ethers.getSigners();
    attestorWallet = ethers.Wallet.createRandom();

    contract = await deployProxy();
    await contract.waitForDeployment();

    await contract.grantRole(WRITER_ROLE, writer.address);
    await contract.grantRole(DISPUTER_ROLE, disputer.address);
  });

  // ── Initialization ──────────────────────────────
  describe("Initialization", function () {
    it("sets correct version", async function () {
      expect(await contract.CONTRACT_VERSION()).to.equal(2n);
    });

    it("sets deployer as admin", async function () {
      expect(await contract.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
    });

    it("sets deployer as writer", async function () {
      expect(await contract.hasRole(WRITER_ROLE, owner.address)).to.be.true;
    });

    it("sets cooldown", async function () {
      expect(await contract.saveCooldown()).to.equal(BigInt(COOLDOWN));
    });

    it("starts with 0 verdicts", async function () {
      expect(await contract.getVerdictCount()).to.equal(0n);
    });
  });

  // ── UUPS Upgrade ────────────────────────────────
  describe("UUPS Upgrade", function () {
    it("admin can upgrade", async function () {
      const V2 = await ethers.getContractFactory("AgentJury");
      const upgraded = await upgrades.upgradeProxy(
        await contract.getAddress(),
        V2,
      );
      expect(await upgraded.CONTRACT_VERSION()).to.equal(2n);
    });

    it("non-admin cannot upgrade", async function () {
      const V2 = await ethers.getContractFactory("AgentJury", outsider);
      await expect(
        upgrades.upgradeProxy(await contract.getAddress(), V2),
      ).to.be.reverted;
    });
  });

  // ── Save Verdict (no attestation) ───────────────
  describe("saveVerdict (no attestation)", function () {
    it("saves and emits event with correct data", async function () {
      const ch = caseHash("case-001");
      const tx = await contract
        .connect(writer)
        .saveVerdict(ch, 82, 74, 21, 79, "Ship it", "0x");
      const receipt = await tx.wait();

      await expect(tx)
        .to.emit(contract, "VerdictSaved")
        .withArgs(0, ch, writer.address, 82, 74, 21, 79, false, await getBlockTimestamp(receipt));

      expect(await contract.getVerdictCount()).to.equal(1n);

      const v = await contract.getVerdict(0);
      expect(v.caseHash).to.equal(ch);
      expect(v.feasibilityScore).to.equal(82);
      expect(v.innovationScore).to.equal(74);
      expect(v.riskScore).to.equal(21);
      expect(v.finalScore).to.equal(79);
      expect(v.shortVerdict).to.equal("Ship it");
      expect(v.submitter).to.equal(writer.address);
      expect(v.status).to.equal(0); // Active
      expect(v.attestationVerified).to.be.false;
    });

    it("measures gas for saveVerdict", async function () {
      const tx = await contract
        .connect(writer)
        .saveVerdict(caseHash("gas-test"), 80, 70, 30, 75, "Ship with staged rollout", "0x");
      const receipt = await tx.wait();
      console.log(`    saveVerdict gas (no attestation): ${receipt.gasUsed}`);
    });

    it("rejects unauthorized writer", async function () {
      await expect(
        contract.connect(outsider).saveVerdict(caseHash("x"), 50, 50, 50, 50, "Test", "0x"),
      ).to.be.reverted;
    });

    it("rejects empty verdict", async function () {
      await expect(
        contract.connect(writer).saveVerdict(caseHash("x"), 50, 50, 50, 50, "", "0x"),
      ).to.be.revertedWithCustomError(contract, "VerdictEmpty");
    });

    it("rejects verdict > 140 chars", async function () {
      const longVerdict = "x".repeat(141);
      await expect(
        contract.connect(writer).saveVerdict(caseHash("x"), 50, 50, 50, 50, longVerdict, "0x"),
      ).to.be.revertedWithCustomError(contract, "VerdictTooLong");
    });

    it("rejects score > 100", async function () {
      await expect(
        contract.connect(writer).saveVerdict(caseHash("x"), 101, 50, 50, 50, "Test", "0x"),
      ).to.be.revertedWithCustomError(contract, "ScoreOutOfRange");
    });

    it("enforces cooldown", async function () {
      await contract.connect(writer).saveVerdict(caseHash("1"), 50, 50, 50, 50, "First", "0x");
      await expect(
        contract.connect(writer).saveVerdict(caseHash("2"), 50, 50, 50, 50, "Second", "0x"),
      ).to.be.revertedWithCustomError(contract, "CooldownNotElapsed");
    });

    it("allows after cooldown elapsed", async function () {
      await contract.connect(writer).saveVerdict(caseHash("1"), 50, 50, 50, 50, "First", "0x");
      await ethers.provider.send("evm_increaseTime", [COOLDOWN + 1]);
      await ethers.provider.send("evm_mine");
      await expect(
        contract.connect(writer).saveVerdict(caseHash("2"), 50, 50, 50, 50, "Second", "0x"),
      ).to.not.be.reverted;
    });
  });

  // ── Save Verdict (with attestation) ─────────────
  describe("saveVerdict (with attestation)", function () {
    beforeEach(async function () {
      await contract.setAttestor(attestorWallet.address);
      await contract.setAttestationRequired(true);
    });

    it("accepts valid attestation signature", async function () {
      const ch = caseHash("att-001");
      const sig = await makeAttestation(ch, 60, 55, 40, 58, "Iterate on UX");
      const tx = await contract
        .connect(writer)
        .saveVerdict(ch, 60, 55, 40, 58, "Iterate on UX", sig);
      const receipt = await tx.wait();

      console.log(`    saveVerdict gas (with attestation): ${receipt.gasUsed}`);

      const v = await contract.getVerdict(0);
      expect(v.attestationVerified).to.be.true;
      expect(v.finalScore).to.equal(58);
    });

    it("rejects invalid signature", async function () {
      const ch = caseHash("att-bad");
      const fake = ethers.Wallet.createRandom();
      const msgHash = ethers.solidityPackedKeccak256(
        ["bytes32", "uint8", "uint8", "uint8", "uint8", "string"],
        [ch, 70, 65, 30, 72, "Fake"],
      );
      const badSig = await fake.signMessage(ethers.getBytes(msgHash));
      await expect(
        contract.connect(writer).saveVerdict(ch, 70, 65, 30, 72, "Fake", badSig),
      ).to.be.revertedWithCustomError(contract, "InvalidSignature");
    });

    it("rejects empty signature when required", async function () {
      await expect(
        contract.connect(writer).saveVerdict(caseHash("x"), 50, 50, 50, 50, "Test", "0x"),
      ).to.be.revertedWithCustomError(contract, "InvalidSignatureLength");
    });
  });

  // ── Dispute / Revocation ────────────────────────
  describe("Dispute & Revocation", function () {
    beforeEach(async function () {
      await contract.connect(writer).saveVerdict(caseHash("d-001"), 80, 70, 30, 75, "Ship it", "0x");
    });

    it("disputer can dispute an active verdict", async function () {
      const tx = await contract.connect(disputer).disputeVerdict(0, "Score seems inflated");
      await expect(tx).to.emit(contract, "VerdictDisputed");

      const v = await contract.getVerdict(0);
      expect(v.status).to.equal(1); // Disputed
      expect(v.disputeReason).to.equal("Score seems inflated");
    });

    it("cannot dispute already disputed verdict", async function () {
      await contract.connect(disputer).disputeVerdict(0, "Reason 1");
      await expect(
        contract.connect(disputer).disputeVerdict(0, "Reason 2"),
      ).to.be.revertedWithCustomError(contract, "InvalidStatusTransition");
    });

    it("dispute requires reason", async function () {
      await expect(
        contract.connect(disputer).disputeVerdict(0, ""),
      ).to.be.revertedWithCustomError(contract, "DisputeReasonRequired");
    });

    it("outsider cannot dispute", async function () {
      await expect(
        contract.connect(outsider).disputeVerdict(0, "No permission"),
      ).to.be.reverted;
    });

    it("submitter can revoke own verdict", async function () {
      const tx = await contract.connect(writer).revokeVerdict(0);
      await expect(tx).to.emit(contract, "VerdictRevoked");

      const v = await contract.getVerdict(0);
      expect(v.status).to.equal(2); // Revoked
    });

    it("admin can revoke any verdict", async function () {
      await contract.connect(owner).revokeVerdict(0);
      const v = await contract.getVerdict(0);
      expect(v.status).to.equal(2); // Revoked
    });

    it("outsider cannot revoke", async function () {
      await expect(
        contract.connect(outsider).revokeVerdict(0),
      ).to.be.revertedWithCustomError(contract, "OnlySubmitterOrAdmin");
    });

    it("cannot revoke already revoked", async function () {
      await contract.connect(writer).revokeVerdict(0);
      await expect(
        contract.connect(writer).revokeVerdict(0),
      ).to.be.revertedWithCustomError(contract, "InvalidStatusTransition");
    });

    it("admin can resolve dispute → reinstate", async function () {
      await contract.connect(disputer).disputeVerdict(0, "Inflated");
      const tx = await contract.connect(owner).resolveDispute(0, true);
      await expect(tx).to.emit(contract, "VerdictResolved");

      const v = await contract.getVerdict(0);
      expect(v.status).to.equal(3); // Resolved
    });

    it("admin can resolve dispute → revoke", async function () {
      await contract.connect(disputer).disputeVerdict(0, "Bad data");
      await contract.connect(owner).resolveDispute(0, false);

      const v = await contract.getVerdict(0);
      expect(v.status).to.equal(2); // Revoked
    });

    it("cannot resolve non-disputed verdict", async function () {
      await expect(
        contract.connect(owner).resolveDispute(0, true),
      ).to.be.revertedWithCustomError(contract, "InvalidStatusTransition");
    });
  });

  // ── Reading & Pagination ────────────────────────
  describe("Reading & Pagination", function () {
    beforeEach(async function () {
      for (let i = 0; i < 5; i++) {
        if (i > 0) {
          await ethers.provider.send("evm_increaseTime", [COOLDOWN + 1]);
          await ethers.provider.send("evm_mine");
        }
        await contract
          .connect(writer)
          .saveVerdict(caseHash(`page-${i}`), 50 + i, 60 + i, 20 + i, 55 + i, `Verdict ${i}`, "0x");
      }
    });

    it("getVerdictCount returns correct count", async function () {
      expect(await contract.getVerdictCount()).to.equal(5n);
    });

    it("getVerdictsPage returns correct slice", async function () {
      const page = await contract.getVerdictsPage(1, 2);
      expect(page.length).to.equal(2);
      expect(page[0].shortVerdict).to.equal("Verdict 1");
      expect(page[1].shortVerdict).to.equal("Verdict 2");
    });

    it("getVerdictsPage handles out-of-range offset", async function () {
      const page = await contract.getVerdictsPage(100, 10);
      expect(page.length).to.equal(0);
    });

    it("getLatestVerdicts returns most recent", async function () {
      const latest = await contract.getLatestVerdicts(3);
      expect(latest.length).to.equal(3);
      expect(latest[2].shortVerdict).to.equal("Verdict 4");
    });

    it("getVerdictsByCaseHash returns correct verdicts", async function () {
      const ch = caseHash("page-2");
      const results = await contract.getVerdictsByCaseHash(ch);
      expect(results.length).to.equal(1);
      expect(results[0].shortVerdict).to.equal("Verdict 2");
    });

    it("getVerdictCountByCaseHash returns correct count", async function () {
      expect(await contract.getVerdictCountByCaseHash(caseHash("page-0"))).to.equal(1n);
      expect(await contract.getVerdictCountByCaseHash(caseHash("nonexistent"))).to.equal(0n);
    });

    it("reverts on out-of-bounds getVerdict", async function () {
      await expect(contract.getVerdict(999)).to.be.revertedWithCustomError(
        contract,
        "IndexOutOfBounds",
      );
    });
  });

  // ── Admin Config ────────────────────────────────
  describe("Admin Configuration", function () {
    it("admin can change cooldown", async function () {
      await expect(contract.setCooldown(120))
        .to.emit(contract, "CooldownUpdated")
        .withArgs(COOLDOWN, 120);
      expect(await contract.saveCooldown()).to.equal(120n);
    });

    it("admin can change attestor", async function () {
      const newAttestor = ethers.Wallet.createRandom();
      await expect(contract.setAttestor(newAttestor.address))
        .to.emit(contract, "AttestorUpdated");
      expect(await contract.attestor()).to.equal(newAttestor.address);
    });

    it("admin can toggle attestation requirement", async function () {
      await contract.setAttestationRequired(true);
      expect(await contract.attestationRequired()).to.be.true;
      await contract.setAttestationRequired(false);
      expect(await contract.attestationRequired()).to.be.false;
    });

    it("non-admin cannot change config", async function () {
      await expect(contract.connect(outsider).setCooldown(1)).to.be.reverted;
      await expect(
        contract.connect(outsider).setAttestor(outsider.address),
      ).to.be.reverted;
      await expect(
        contract.connect(outsider).setAttestationRequired(true),
      ).to.be.reverted;
    });
  });

  // ── Role Management ─────────────────────────────
  describe("Role Management", function () {
    it("admin can grant and revoke writer role", async function () {
      await contract.grantRole(WRITER_ROLE, outsider.address);
      expect(await contract.hasRole(WRITER_ROLE, outsider.address)).to.be.true;

      await contract.revokeRole(WRITER_ROLE, outsider.address);
      expect(await contract.hasRole(WRITER_ROLE, outsider.address)).to.be.false;
    });

    it("admin can grant disputer role", async function () {
      await contract.grantRole(DISPUTER_ROLE, outsider.address);
      expect(await contract.hasRole(DISPUTER_ROLE, outsider.address)).to.be.true;
    });

    it("non-admin cannot grant roles", async function () {
      await expect(
        contract.connect(outsider).grantRole(WRITER_ROLE, outsider.address),
      ).to.be.reverted;
    });
  });

  // ── Edge Cases ──────────────────────────────────
  describe("Edge Cases", function () {
    it("handles max score values (100, 100, 100, 100)", async function () {
      await contract
        .connect(writer)
        .saveVerdict(caseHash("max"), 100, 100, 100, 100, "Maximum scores", "0x");
      const v = await contract.getVerdict(0);
      expect(v.feasibilityScore).to.equal(100);
      expect(v.finalScore).to.equal(100);
    });

    it("handles min score values (0, 0, 0, 0)", async function () {
      await contract
        .connect(writer)
        .saveVerdict(caseHash("min"), 0, 0, 0, 0, "Minimum scores", "0x");
      const v = await contract.getVerdict(0);
      expect(v.feasibilityScore).to.equal(0);
    });

    it("handles exactly 140 char verdict", async function () {
      const maxVerdict = "A".repeat(140);
      await contract
        .connect(writer)
        .saveVerdict(caseHash("140"), 50, 50, 50, 50, maxVerdict, "0x");
      const v = await contract.getVerdict(0);
      expect(v.shortVerdict).to.equal(maxVerdict);
    });

    it("multiple verdicts for same caseHash are indexed", async function () {
      const ch = caseHash("dup");
      await contract.connect(writer).saveVerdict(ch, 50, 50, 50, 50, "First eval", "0x");

      await ethers.provider.send("evm_increaseTime", [COOLDOWN + 1]);
      await ethers.provider.send("evm_mine");

      await contract.connect(writer).saveVerdict(ch, 70, 70, 30, 70, "Re-eval", "0x");

      expect(await contract.getVerdictCountByCaseHash(ch)).to.equal(2n);
      const results = await contract.getVerdictsByCaseHash(ch);
      expect(results[0].shortVerdict).to.equal("First eval");
      expect(results[1].shortVerdict).to.equal("Re-eval");
    });
  });

  async function getBlockTimestamp(receipt) {
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    return block.timestamp;
  }
});
