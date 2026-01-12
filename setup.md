## Prerequisites
- Node.js (LTS recommended) and npm

## Setup

###Create a new Hardhat project

```powershell
mkdir halal-gelatin-supply-chain
cd halal-gelatin-supply-chain

npm init -y

# Hardhat init (interactive)
npm install --save-dev hardhat
npx hardhat --init

# Add TypeScript + ethers + plugins (versions may differ)
npm install --save-dev typescript @types/node
npm install --save-dev @nomicfoundation/hardhat-ethers
npm install ethers
```

## Run (localhost)

You will use **3 terminals**.

### Terminal 1: Start local blockchain

```powershell
npx hardhat node
```

Keep this terminal running.

### Terminal 2: Deploy the contract

```powershell
npx hardhat run scripts/deploy.ts --network localhost
```

### Terminal 3: Run the full supply-chain flow

```powershell
npx hardhat run scripts/interact.ts --network localhost
```

## Open the UI on your phone (QR scanning)

### Serve the `public/` site on your Wi‑Fi network

From the project folder run:

```powershell
npm run serve:public
```

Then on your phone (same Wi‑Fi), open:

`http://YOUR_PC_LAN_IP:8080/index.html`

Example: `http://192.168.1.50:8080/index.html`

### Important note about phone camera scanning

Most mobile browsers only allow camera access (`getUserMedia`) on **HTTPS** pages ("secure context").

- If the camera scan button doesn’t work on your phone over `http://...`, use **Scan from Library** (pick a QR image) in the scanner modal.
- If you need live camera scanning on your phone, use an HTTPS URL (for example via a tunnel like `npx localtunnel --port 8080`) or serve the site with HTTPS.

## Run (Sepolia)

### Terminal: Set env vars (PowerShell)

You can use either naming style:

**Option A (recommended, works with this repo now):**

```powershell
$Env:SEPOLIA_RPC_URL = "https://sepolia.infura.io/v3/YOUR_KEY"
$Env:SEPOLIA_PRIVATE_KEY = "0xYOUR_PRIVATE_KEY"
```

**Option B (Hardhat 3 config variables style):**

```powershell
$Env:HARDHAT_VAR_SEPOLIA_RPC_URL = "https://sepolia.infura.io/v3/YOUR_KEY"
$Env:HARDHAT_VAR_SEPOLIA_PRIVATE_KEY = "0xYOUR_PRIVATE_KEY"
```

### Option C: Use a local `.env` file (recommended)

1) Copy `.env.example` to `.env`

```powershell
Copy-Item .env.example .env
```

2) Edit `.env` and set:
- `SEPOLIA_RPC_URL` (e.g., your Alchemy Sepolia HTTPS URL)
- `SEPOLIA_PRIVATE_KEY` (your wallet private key, starting with `0x`)

Note: `.env` is gitignored so secrets won't be committed.

### Deploy

```powershell
npx hardhat run scripts/deploy.ts --network sepolia
```

This will auto-update:
- `public/js/contract-address.js`
- `public/js/abi.js`

## Source code (full)

Include the following files in your PDF:

1) `contracts/GelatinHalal.sol`
2) `scripts/deploy.ts`
3) `scripts/interact.ts`
4) `hardhat.config.ts`
5) `tsconfig.json`
6) `package.json`

### 1) contracts/GelatinHalal.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Remix/Hardhat shared source: keep this file and the Remix copy identical.
// No external imports; compile with Solidity 0.8.28 (or compatible ^0.8.28).
contract HalalGelatinSupplyChain {

    // --- ROLES ---
    address public admin;
    mapping(address => bool) public producers;        // The Farm / Slaughterhouse
    mapping(address => bool) public halalAuthorities; // JAKIM
    mapping(address => bool) public distributors;     // Gelatin Factory
    mapping(address => bool) public retailers;        // Candy Manufacturer

    // --- DATA STRUCTURES ---
    struct Batch {
        string batchId;         // e.g., "GEL-2025-01"
        string productName;     // e.g., "Raw Bovine Bones" -> "Gelatin Powder"
        address producer;       // The Farm
        address currentOwner;   // Who holds it now
        string status;          // "Slaughtered", "Halal Certified", "Processed"
        string halalCertHash;   // IPFS Hash from JAKIM
        uint256 createdAt;
        bool isCertified;       // Helper to check certification easily
    }

    mapping(string => Batch) public batches;

    // --- EVENTS ---
    event BatchCreated(string batchId, address producer);
    event HalalCertified(string batchId, string certHash, address authority);
    event BatchTransferred(string batchId, address from, address to);
    event StatusUpdated(string batchId, string newStatus, string newName);

    // --- MODIFIERS ---
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only Admin can perform this action");
        _;
    }

    modifier onlyProducer() {
        require(producers[msg.sender], "Only Producer (Farm) can perform this");
        _;
    }

    modifier onlyAuthority() {
        require(halalAuthorities[msg.sender], "Only JAKIM can perform this");
        _;
    }

    modifier onlyCurrentOwner(string memory _batchId) {
        require(batches[_batchId].currentOwner == msg.sender, "You do not own this batch");
        _;
    }

    constructor() {
        admin = msg.sender; // Deployer is the Admin
    }

    // --- ROLE MANAGEMENT ---
    // In Remix, deploy with account A (Admin), then call these functions to assign roles to other accounts.
    function addProducer(address _user) external onlyAdmin { producers[_user] = true; }
    function addAuthority(address _user) external onlyAdmin { halalAuthorities[_user] = true; }
    function addDistributor(address _user) external onlyAdmin { distributors[_user] = true; }
    function addRetailer(address _user) external onlyAdmin { retailers[_user] = true; }

    // --- CORE FUNCTIONS ---

    // 1) Create Batch (Farm creates "Raw Bones")
    function createBatch(string memory _batchId, string memory _productName) external onlyProducer {
        require(batches[_batchId].producer == address(0), "Batch ID already exists");

        batches[_batchId] = Batch({
            batchId: _batchId,
            productName: _productName,
            producer: msg.sender,
            currentOwner: msg.sender,
            status: "Slaughtered",
            halalCertHash: "",
            createdAt: block.timestamp,
            isCertified: false
        });

        emit BatchCreated(_batchId, msg.sender);
    }

    // 2) Set Halal Certificate (JAKIM verifies the slaughter)
    function setHalalCertificate(string memory _batchId, string memory _certHash) external onlyAuthority {
        require(bytes(batches[_batchId].batchId).length != 0, "Batch does not exist");

        Batch storage b = batches[_batchId];
        b.halalCertHash = _certHash;
        b.isCertified = true;
        b.status = "Halal Certified";

        emit HalalCertified(_batchId, _certHash, msg.sender);
    }

    // 3) Transfer Batch (Farm sells to Factory; Factory sells to Retailer)
    function transferBatch(string memory _batchId, address _to) external onlyCurrentOwner(_batchId) {
        require(_to != address(0), "Invalid address");

        // Ensure receiver has the correct role.
        if (producers[msg.sender]) {
            require(distributors[_to], "Producer must transfer to a Distributor (Factory)");
        } else if (distributors[msg.sender]) {
            require(retailers[_to], "Distributor must transfer to a Retailer");
        }

        Batch storage b = batches[_batchId];
        address oldOwner = b.currentOwner;
        b.currentOwner = _to;
        b.status = "In Transit";

        emit BatchTransferred(_batchId, oldOwner, _to);
    }

    // 4) Update Status (Factory processes bones into Gelatin; Retailer finalizes product)
    function updateStatus(
        string memory _batchId,
        string memory _newStatus,
        string memory _newProductName
    ) external onlyCurrentOwner(_batchId) {
        Batch storage b = batches[_batchId];
        b.status = _newStatus;

        if (bytes(_newProductName).length > 0) {
            b.productName = _newProductName;
        }

        emit StatusUpdated(_batchId, _newStatus, _newProductName);
    }

    // 5) Get Batch Info
    function getBatch(string memory _batchId) external view returns (Batch memory) {
        return batches[_batchId];
    }
}
```

### 2) scripts/deploy.ts

```ts
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
```

### 3) scripts/interact.ts

```ts
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

  const contract = await ethers.getContractAt("HalalGelatinSupplyChain", contractAddress, admin);

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

  tx = await contract.connect(retailer).updateStatus(batchId, "Ready for Sale", "Halal Gummy Bears");
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
```

### 4) hardhat.config.ts

```ts
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatEthers, hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
});
```

### 5) tsconfig.json

```jsonc
/* Based on https://github.com/tsconfig/bases/blob/501da2bcd640cf95c95805783e1012b992338f28/bases/node22.json */
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowJs": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node16"
  },
  "include": ["scripts", "contracts", "types", "test", "hardhat.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### 6) package.json

```json
{
  "name": "hardhat-2",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "hardhat test",
    "test:cov": "nyc hardhat test"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "module",
  "devDependencies": {
    "@nomicfoundation/hardhat-ethers": "^4.0.3",
    "@nomicfoundation/hardhat-ignition": "^3.0.6",
    "@nomicfoundation/hardhat-toolbox-mocha-ethers": "^3.0.2",
    "@types/chai": "^4.3.20",
    "@types/chai-as-promised": "^8.0.2",
    "@types/mocha": "^10.0.10",
    "@types/node": "^22.19.3",
    "chai": "^5.3.3",
    "ethers": "^6.16.0",
    "forge-std": "github:foundry-rs/forge-std#v1.9.4",
    "hardhat": "^3.1.0",
    "mocha": "^11.7.5",
    "nyc": "^15.1.0",
    "typescript": "~5.8.0"
  }
}
```

