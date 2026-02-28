const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentJury", function () {
  let contract;
  let owner;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    const AgentJury = await ethers.getContractFactory("AgentJury");
    contract = await AgentJury.deploy();
    await contract.waitForDeployment();
  });

  describe("saveVerdict (no attestation required)", function () {
    it("saves verdict with empty attestation and measures gas", async function () {
      const tx = await contract.saveVerdict(
        ethers.keccak256(ethers.toUtf8Bytes("case-001")),
        82, 74, 21, 79,
        "Ship with staged rollout",
        "0x"
      );
      const receipt = await tx.wait();

      // eslint-disable-next-line no-console
      console.log(`saveVerdict gasUsed (no attestation): ${receipt.gasUsed.toString()}`);

      expect(await contract.getVerdictCount()).to.equal(1n);
      const verdict = await contract.getVerdict(0);
      expect(verdict.caseHash).to.equal(ethers.keccak256(ethers.toUtf8Bytes("case-001")));
      expect(verdict.feasibilityScore).to.equal(82);
      expect(verdict.innovationScore).to.equal(74);
      expect(verdict.riskScore).to.equal(21);
      expect(verdict.finalScore).to.equal(79);
      expect(verdict.shortVerdict).to.equal("Ship with staged rollout");
    });
  });

  describe("saveVerdict (attestation required)", function () {
    let attestorWallet;

    beforeEach(async function () {
      attestorWallet = ethers.Wallet.createRandom();
      await contract.setAttestor(attestorWallet.address);
      await contract.setAttestationRequired(true);
    });

    it("accepts valid backend attestation signature", async function () {
      const caseHash = ethers.keccak256(ethers.toUtf8Bytes("case-002"));
      const shortVerdict = "Iterate on UX";

      const messageHash = ethers.solidityPackedKeccak256(
        ["bytes32", "uint8", "uint8", "uint8", "uint8", "string"],
        [caseHash, 60, 55, 40, 58, shortVerdict]
      );
      const signature = await attestorWallet.signMessage(ethers.getBytes(messageHash));

      const tx = await contract.saveVerdict(
        caseHash, 60, 55, 40, 58, shortVerdict, signature
      );
      const receipt = await tx.wait();

      // eslint-disable-next-line no-console
      console.log(`saveVerdict gasUsed (with attestation): ${receipt.gasUsed.toString()}`);

      expect(await contract.getVerdictCount()).to.equal(1n);
      const verdict = await contract.getVerdict(0);
      expect(verdict.finalScore).to.equal(58);
    });

    it("rejects invalid attestation signature", async function () {
      const caseHash = ethers.keccak256(ethers.toUtf8Bytes("case-003"));
      const fakeWallet = ethers.Wallet.createRandom();

      const messageHash = ethers.solidityPackedKeccak256(
        ["bytes32", "uint8", "uint8", "uint8", "uint8", "string"],
        [caseHash, 70, 65, 30, 72, "Fake verdict"]
      );
      const badSignature = await fakeWallet.signMessage(ethers.getBytes(messageHash));

      await expect(
        contract.saveVerdict(caseHash, 70, 65, 30, 72, "Fake verdict", badSignature)
      ).to.be.revertedWith("Invalid attestation signature");
    });

    it("rejects empty signature when attestation is required", async function () {
      const caseHash = ethers.keccak256(ethers.toUtf8Bytes("case-004"));

      await expect(
        contract.saveVerdict(caseHash, 50, 50, 50, 50, "Some verdict", "0x")
      ).to.be.revertedWith("Invalid signature length");
    });
  });
});
