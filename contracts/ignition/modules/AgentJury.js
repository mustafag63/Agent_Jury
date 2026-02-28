const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("AgentJuryModule", (m) => {
  // Initial fee: 0.001 MON (in wei)
  const fee = m.getParameter("evaluationFee", BigInt("1000000000000000"));
  const agentJury = m.contract("AgentJury", [fee]);
  return { agentJury };
});
