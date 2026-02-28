const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("AgentJuryModule", (m) => {
  const agentJury = m.contract("AgentJury");
  return { agentJury };
});
