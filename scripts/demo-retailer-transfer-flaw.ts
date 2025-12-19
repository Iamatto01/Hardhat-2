import hre from "hardhat";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function resolveContractAddress(): Promise<string> {
  if (process.env.CONTRACT_ADDRESS?.trim()) {
    return process.env.CONTRACT_ADDRESS.trim();
  }

  try {
    const addressFilePath = join(process.cwd(), "public", "js", "contract-address.js");
    const contents = await readFile(addressFilePath, { encoding: "utf8" });
    const match = contents.match(/window\.CONTRACT_ADDRESS\s*=\s*\"(0x[a-fA-F0-9]{40})\"/);
    if (match?.[1]) return match[1];
  } catch {
    // ignore
  }

  return "0x5FbDB2315678afecb367f032d93F642f64180aa3";
}

function makeBatchId(): string {
  if (process.env.BATCH_ID?.trim()) return process.env.BATCH_ID.trim();
  return `GEL-DEMO-${Date.now()}`;
}

async function pickUniqueBatchId(contract: any, desiredId: string): Promise<string> {
  const exists = async (id: string): Promise<boolean> => {
    const batch = await contract.getBatch(id);
    return !!(batch?.batchId && String(batch.batchId).length > 0);
  };

  if (!(await exists(desiredId))) return desiredId;

  for (let i = 1; i <= 50; i++) {
    const candidate = `${desiredId}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }

  throw new Error(`Could not find a free batch id starting from '${desiredId}'.`);
}

async function main() {
  const contractAddress = await resolveContractAddress();

  const connection = await hre.network.connect();
  const { ethers } = connection;

  const [admin, producer, authority, distributor, retailer, outsider] = await ethers.getSigners();

  const contract = await ethers.getContractAt("HalalGelatinSupplyChain", contractAddress, admin);

  console.log("\n=== Demo: Retailer can transfer to any address (flaw) ===\n");
  console.log("Contract:", contractAddress);
  console.log("Retailer:", retailer.address);
  console.log("Outsider (no role assigned):", outsider.address);

  // Ensure roles are set (idempotent)
  await (await contract.addProducer(producer.address)).wait();
  await (await contract.addAuthority(authority.address)).wait();
  await (await contract.addDistributor(distributor.address)).wait();
  await (await contract.addRetailer(retailer.address)).wait();

  // Create + move batch through normal flow until Retailer owns it
  let batchId = makeBatchId();
  batchId = await pickUniqueBatchId(contract, batchId);

  await (await contract.connect(producer).createBatch(batchId, "Raw Bovine Bones")).wait();
  await (await contract.connect(authority).setHalalCertificate(batchId, "QmDemoCertHash")).wait();
  await (await contract.connect(producer).transferBatch(batchId, distributor.address)).wait();
  await (
    await contract
      .connect(distributor)
      .updateStatus(batchId, "Processed into Gelatin", "Halal Gelatin Powder")
  ).wait();
  await (await contract.connect(distributor).transferBatch(batchId, retailer.address)).wait();

  const before = await contract.getBatch(batchId);
  console.log("\nBatch before flaw transfer:");
  console.log("  batchId:", before.batchId);
  console.log("  owner:", before.currentOwner);
  console.log("  status:", before.status);

  // Flaw: Retailer is NOT restricted by role checks, so can transfer to any non-zero address.
  console.log("\nRetailer transferring batch to outsider (should NOT be allowed in a strict traceability design)...");
  await (await contract.connect(retailer).transferBatch(batchId, outsider.address)).wait();

  const after = await contract.getBatch(batchId);
  console.log("\nBatch after flaw transfer:");
  console.log("  batchId:", after.batchId);
  console.log("  owner:", after.currentOwner);
  console.log("  status:", after.status);

  if (after.currentOwner.toLowerCase() === outsider.address.toLowerCase()) {
    console.log("\n✅ Flaw reproduced: outsider is now the owner (no role check for Retailer).\n");
  } else {
    console.log("\n❌ Unexpected: owner did not change to outsider.\n");
  }

  await connection.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
