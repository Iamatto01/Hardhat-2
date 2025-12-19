import hre from "hardhat";
import { ethers } from "ethers";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
  console.log("🚀 Deploying HalalGelatinSupplyChain...\n");

  // Connect to localhost provider
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const deployer = new ethers.Wallet(privateKey, provider);
  
  console.log("Deployer:", deployer.address);

  // Read contract artifact
  const artifact = await hre.artifacts.readArtifact("HalalGelatinSupplyChain");
  
  // Deploy
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  console.log("\n✅ Deployed to:", contract.target);

  // Write address for the static website under /public
  const addressFilePath = join(process.cwd(), "public", "js", "contract-address.js");
  const addressFileContents = `// Auto-updated by scripts/deploy.ts\nwindow.CONTRACT_ADDRESS = "${contract.target}";\n`;
  await writeFile(addressFilePath, addressFileContents, { encoding: "utf8" });

  console.log("\n📌 Set environment variable:");
  console.log(`$Env:CONTRACT_ADDRESS="${contract.target}"\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
