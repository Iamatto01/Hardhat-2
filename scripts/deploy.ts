import hre from "hardhat";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
  console.log("🚀 Deploying HalalGelatinSupplyChain...\n");

  const connection = await hre.network.connect();
  const { ethers, networkName } = connection;

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const net = await ethers.provider.getNetwork();
  console.log("Network:", networkName, "(chainId:", Number(net.chainId), ")");
  console.log("Deployer:", deployer.address);

  const contract = await ethers.deployContract("HalalGelatinSupplyChain", [], deployer);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\n✅ Deployed to:", address);

  // Sync address + ABI for the static website under /public
  const addressFilePath = join(process.cwd(), "public", "js", "contract-address.js");
  const addressFileContents = `// Auto-updated by scripts/deploy.ts\nwindow.CONTRACT_ADDRESS = "${address}";\n`;
  await writeFile(addressFilePath, addressFileContents, { encoding: "utf8" });

  // Persist per-network address so the website can switch between localhost and sepolia.
  const addressesJsonPath = join(process.cwd(), "public", "js", "contract-addresses.json");
  const addressKey =
    networkName === "localhost" || Number(net.chainId) === 31337
      ? "localhost"
      : Number(net.chainId) === 11155111
        ? "sepolia"
        : networkName;

  let addresses: Record<string, string> = {};
  try {
    const raw = await readFile(addressesJsonPath, { encoding: "utf8" });
    addresses = JSON.parse(raw) as Record<string, string>;
  } catch {
    addresses = {};
  }

  addresses[addressKey] = address;
  await writeFile(addressesJsonPath, JSON.stringify(addresses, null, 2) + "\n", { encoding: "utf8" });

  const artifact = await hre.artifacts.readArtifact("HalalGelatinSupplyChain");
  const abiFilePath = join(process.cwd(), "public", "js", "abi.js");
  const abiFileContents = `// Auto-updated by scripts/deploy.ts\n// Source: artifacts for HalalGelatinSupplyChain\n\n(function () {\n  window.CONTRACT_ABI = ${JSON.stringify(
    artifact.abi,
    null,
    2,
  )};\n})();\n`;
  await writeFile(abiFilePath, abiFileContents, { encoding: "utf8" });

  console.log("\n📌 Front-end synced:");
  console.log(" - public/js/contract-address.js");
  console.log(" - public/js/contract-addresses.json");
  console.log(" - public/js/abi.js\n");

  const assignmentRoles = ["producer", "authority", "distributor", "retailer"] as const;

  function normalizeAddress(value?: string) {
    if (!value) return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    return ethers.isAddress(trimmed) ? trimmed : "";
  }

  async function loadJsonFile<T>(path: string): Promise<T> {
    try {
      const raw = await readFile(path, { encoding: "utf8" });
      if (!raw) return {} as T;
      return JSON.parse(raw) as T;
    } catch {
      return {} as T;
    }
  }

  const envOverrides = assignmentRoles.reduce((acc, role) => {
    const envKey = `${role.toUpperCase()}_ADDRESS`;
    acc[role] = normalizeAddress(process.env[envKey]);
    return acc;
  }, {} as Record<typeof assignmentRoles[number], string>);

  const fallbackAssignments: Record<typeof assignmentRoles[number], string> = {
    producer: normalizeAddress(signers[1]?.address),
    authority: normalizeAddress(signers[2]?.address),
    distributor: normalizeAddress(signers[3]?.address),
    retailer: normalizeAddress(signers[4]?.address),
  };

  const finalAssignments: Record<string, string> = {
    admin: deployer.address,
    producer: envOverrides.producer || fallbackAssignments.producer,
    authority: envOverrides.authority || fallbackAssignments.authority,
    distributor: envOverrides.distributor || fallbackAssignments.distributor,
    retailer: envOverrides.retailer || fallbackAssignments.retailer,
  };

  const assignmentFns: Record<typeof assignmentRoles[number], (address: string) => Promise<unknown>> = {
    producer: (addr) => contract.addProducer(addr),
    authority: (addr) => contract.addAuthority(addr),
    distributor: (addr) => contract.addDistributor(addr),
    retailer: (addr) => contract.addRetailer(addr),
  };

  console.log("\n🛠️ Role assignments:");
  for (const role of assignmentRoles) {
    const addressValue = finalAssignments[role];
    if (!addressValue) {
      console.log(` - ${role}: skipped (no address)`);
      continue;
    }
    try {
      await assignmentFns[role](addressValue);
      console.log(` - ${role}: ${addressValue}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(` - ${role}: assignment failed (${message})`);
    }
  }

  type RoleAssignments = Record<string, Record<string, string>>;
  const roleAssignmentsPath = join(process.cwd(), "public", "js", "role-assignments.json");
  const roleAssignments = await loadJsonFile<RoleAssignments>(roleAssignmentsPath);
  roleAssignments[addressKey] = finalAssignments;
  await writeFile(roleAssignmentsPath, JSON.stringify(roleAssignments, null, 2) + "\n", { encoding: "utf8" });
  console.log(" - public/js/role-assignments.json (updated)");

  console.log("📌 Optional: set environment variable for scripts:");
  console.log(`$Env:CONTRACT_ADDRESS="${address}"\n`);

  await connection.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
