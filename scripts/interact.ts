import hre from "hardhat";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function resolveContractAddress(): Promise<string> {
  if (process.env.CONTRACT_ADDRESS?.trim()) {
    return process.env.CONTRACT_ADDRESS.trim();
  }

  // Prefer the address written by scripts/deploy.ts for the website
  try {
    const addressFilePath = join(process.cwd(), "public", "js", "contract-address.js");
    const contents = await readFile(addressFilePath, { encoding: "utf8" });
    const match = contents.match(/window\.CONTRACT_ADDRESS\s*=\s*\"(0x[a-fA-F0-9]{40})\"/);
    if (match?.[1]) return match[1];
  } catch {
    // ignore
  }

  // Fallback (old hardhat default deployment address)
  return "0x5FbDB2315678afecb367f032d93F642f64180aa3";
}

function buildBatchId(): string {
  if (process.env.BATCH_ID?.trim()) return process.env.BATCH_ID.trim();
  // Unique enough for repeated local runs
  const d = new Date();
  const y = d.getFullYear();
  const stamp = String(Date.now()).slice(-6);
  return `GEL-${y}-${stamp}`;
}

async function pickUniqueBatchId(contract: any, desiredId: string): Promise<string> {
  const strict = (process.env.STRICT_BATCH_ID || "").trim().toLowerCase();
  const strictMode = strict === "1" || strict === "true" || strict === "yes";

  const exists = async (id: string): Promise<boolean> => {
    const batch = await contract.getBatch(id);
    return !!(batch?.batchId && String(batch.batchId).length > 0);
  };

  if (!(await exists(desiredId))) return desiredId;
  if (strictMode) {
    throw new Error(`Batch already exists on-chain: ${desiredId}. Set BATCH_ID to a new value.`);
  }

  const bump = (base: string, n: number): string => {
    const m = base.match(/^(.*-)(\d+)$/);
    if (!m) return `${base}-${n}`;
    const prefix = m[1];
    const numStr = m[2];
    const next = (BigInt(numStr) + BigInt(n)).toString();
    // preserve width if possible
    const padded = next.length >= numStr.length ? next : next.padStart(numStr.length, "0");
    return `${prefix}${padded}`;
  };

  for (let i = 1; i <= 50; i++) {
    const candidate = bump(desiredId, i);
    if (!(await exists(candidate))) {
      console.log(`⚠️  BatchId '${desiredId}' already exists; using '${candidate}' instead.`);
      return candidate;
    }
  }

  throw new Error(`Could not find a free batch id starting from '${desiredId}'. Try setting BATCH_ID explicitly.`);
}

async function main() {
  // STEP 0: Setup
  const contractAddress = await resolveContractAddress();

  const connection = await hre.network.connect();
  const { ethers } = connection;
  
  // Get accounts from Hardhat
  const [admin, producer, authority, distributor, retailer] = await ethers.getSigners();

  const contract = await ethers.getContractAt(
    "HalalGelatinSupplyChain",
    contractAddress,
    admin
  );

  console.log("\n🔐 === HALAL GELATIN SUPPLY CHAIN FLOW ===\n");
  console.log("📍 Contract Address:", contractAddress);
  console.log("\n👥 Actors:");
  console.log("  Admin:       ", admin.address);
  console.log("  Producer:    ", producer.address, "(Farm)");
  console.log("  Authority:   ", authority.address, "(JAKIM)");
  console.log("  Distributor: ", distributor.address, "(Factory)");
  console.log("  Retailer:    ", retailer.address, "(Candy Maker)");

  // ========================================
  // STEP 1: Admin assigns roles
  // ========================================
  console.log("\n\n📋 STEP 1: Admin Assigns Roles");
  console.log("─────────────────────────────────");
  
  let tx;
  
  tx = await contract.addProducer(producer.address);
  await tx.wait();
  console.log("✅ Added Producer (Farm)");

  tx = await contract.addAuthority(authority.address);
  await tx.wait();
  console.log("✅ Added Halal Authority (JAKIM)");

  tx = await contract.addDistributor(distributor.address);
  await tx.wait();
  console.log("✅ Added Distributor (Factory)");

  tx = await contract.addRetailer(retailer.address);
  await tx.wait();
  console.log("✅ Added Retailer (Candy Maker)");

  // ========================================
  // STEP 2: Producer creates batch
  // ========================================
  console.log("\n\n🐄 STEP 2: Farm Creates Batch (Raw Bovine Bones)");
  console.log("────────────────────────────────────────────────");

  let batchId = buildBatchId();
  batchId = await pickUniqueBatchId(contract, batchId);

  try {
    tx = await contract.connect(producer).createBatch(batchId, "Raw Bovine Bones");
    await tx.wait();
    console.log("✅ Batch created:", batchId);
  } catch (e: any) {
    const msg = e?.shortMessage || e?.info?.error?.message || e?.message || String(e);
    throw new Error(`createBatch failed for ${batchId}: ${msg}`);
  }
  
  let batch = await contract.getBatch(batchId);
  console.log("   Product:", batch.productName);
  console.log("   Status:", batch.status);
  console.log("   Owner:", batch.currentOwner);

  // ========================================
  // STEP 3: JAKIM certifies as Halal
  // ========================================
  console.log("\n\n🕌 STEP 3: JAKIM Certifies Halal");
  console.log("─────────────────────────────────");
  
  const certHash = "QmX7K8...HalalCert"; // IPFS hash
  tx = await contract.connect(authority).setHalalCertificate(batchId, certHash);
  await tx.wait();
  console.log("✅ Halal Certification added");
  
  batch = await contract.getBatch(batchId);
  console.log("   Cert Hash:", batch.halalCertHash);
  console.log("   Status:", batch.status);
  console.log("   Certified:", batch.isCertified);

  // ========================================
  // STEP 4: Transfer to Factory
  // ========================================
  console.log("\n\n🏭 STEP 4: Farm → Factory (Gelatin Producer)");
  console.log("──────────────────────────────────────────────");
  
  tx = await contract.connect(producer).transferBatch(batchId, distributor.address);
  await tx.wait();
  console.log("✅ Batch transferred to Factory");
  
  batch = await contract.getBatch(batchId);
  console.log("   Status:", batch.status);
  console.log("   Owner:", batch.currentOwner);

  // ========================================
  // STEP 5: Factory processes (Istihalah)
  // ========================================
  console.log("\n\n⚗️  STEP 5: Factory Processes Bones → Gelatin Powder");
  console.log("────────────────────────────────────────────────────");
  
  tx = await contract.connect(distributor).updateStatus(
    batchId, 
    "Processed into Gelatin", 
    "Halal Gelatin Powder"
  );
  await tx.wait();
  console.log("✅ Product transformed (Istihalah concept)");
  
  batch = await contract.getBatch(batchId);
  console.log("   Product:", batch.productName);
  console.log("   Status:", batch.status);

  // ========================================
  // STEP 6: Transfer to Candy Maker
  // ========================================
  console.log("\n\n🍬 STEP 6: Factory → Candy Manufacturer");
  console.log("────────────────────────────────────────");
  
  tx = await contract.connect(distributor).transferBatch(batchId, retailer.address);
  await tx.wait();
  console.log("✅ Batch transferred to Candy Maker");
  
  batch = await contract.getBatch(batchId);
  console.log("   Status:", batch.status);
  console.log("   Owner:", batch.currentOwner);

  // ========================================
  // STEP 7: Retailer finalizes product
  // ========================================
  console.log("\n\n🎉 STEP 7: Candy Maker Completes Product");
  console.log("─────────────────────────────────────────");
  
  tx = await contract.connect(retailer).updateStatus(
    batchId, 
    "Ready for Sale", 
    "Halal Gummy Bears"
  );
  await tx.wait();
  console.log("✅ Final product ready");
  
  batch = await contract.getBatch(batchId);
  console.log("   Product:", batch.productName);
  console.log("   Status:", batch.status);

  // ========================================
  // FINAL SUMMARY
  // ========================================
  console.log("\n\n📊 === FINAL BATCH INFO ===");
  console.log("Batch ID:", batch.batchId);
  console.log("Product:", batch.productName);
  console.log("Producer:", batch.producer);
  console.log("Current Owner:", batch.currentOwner);
  console.log("Status:", batch.status);
  console.log("Halal Certified:", batch.isCertified);
  console.log("Certificate Hash:", batch.halalCertHash);
  console.log("Created At:", new Date(Number(batch.createdAt) * 1000).toLocaleString());
  
  console.log("\n✅ Supply Chain Flow Complete! 🎊\n");

  await connection.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
