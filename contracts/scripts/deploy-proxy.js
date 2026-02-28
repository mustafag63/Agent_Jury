const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const AgentJury = await ethers.getContractFactory("AgentJury");

  const COOLDOWN_SECONDS = 60;
  const proxy = await upgrades.deployProxy(AgentJury, [COOLDOWN_SECONDS], {
    kind: "uups",
  });
  await proxy.waitForDeployment();

  const proxyAddr = await proxy.getAddress();
  const implAddr = await upgrades.erc1967.getImplementationAddress(proxyAddr);

  console.log("Proxy address: ", proxyAddr);
  console.log("Implementation:", implAddr);
  console.log("Version:       ", (await proxy.CONTRACT_VERSION()).toString());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
