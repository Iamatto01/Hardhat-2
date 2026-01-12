import { expect } from "chai";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers-chai-matchers";

let ethers: any;

function makeBatchId(): string {
  // Keep it deterministic-ish and unique per run
  return `GEL-${new Date().getFullYear()}-${Date.now()}`;
}

describe("HalalGelatinSupplyChain", function () {
  before(async function () {
    const connection = await network.connect();
    ethers = connection.ethers;
  });

  async function deployWithRoles() {
    const [admin, producer, authority, distributor, retailer, other] = await ethers.getSigners();
    
    // Get contract factory and deploy with admin signer
    const ContractFactory = await ethers.getContractFactory("HalalGelatinSupplyChain");
    const contract = await ContractFactory.connect(admin).deploy();
    await contract.waitForDeployment();

    await (await contract.connect(admin).addProducer(producer.address)).wait();
    await (await contract.connect(admin).addAuthority(authority.address)).wait();
    await (await contract.connect(admin).addDistributor(distributor.address)).wait();
    await (await contract.connect(admin).addRetailer(retailer.address)).wait();

    return { contract, admin, producer, authority, distributor, retailer, other };
  }

  it("runs the full halal gelatin flow end-to-end", async function () {
    const { contract, admin, producer, authority, distributor, retailer } = await deployWithRoles();

    // Producer creates batch
    const batchId = makeBatchId();
    await expect(contract.connect(producer).createBatch(batchId, "Raw Bovine Bones"))
      .to.emit(contract, "BatchCreated")
      .withArgs(batchId, producer.address);

    let batch = await contract.getBatch(batchId);
    expect(batch.batchId).to.equal(batchId);
    expect(batch.productName).to.equal("Raw Bovine Bones");
    expect(batch.producer).to.equal(producer.address);
    expect(batch.currentOwner).to.equal(producer.address);
    expect(batch.status).to.equal("Slaughtered");
    expect(batch.isCertified).to.equal(false);

    // Authority certifies halal
    const certHash = "QmTestHalalCert";
    await expect(contract.connect(authority).setHalalCertificate(batchId, certHash))
      .to.emit(contract, "HalalCertified")
      .withArgs(batchId, certHash, authority.address);

    batch = await contract.getBatch(batchId);
    expect(batch.isCertified).to.equal(true);
    expect(batch.halalCertHash).to.equal(certHash);
    expect(batch.status).to.equal("Halal Certified");

    // Farm -> Factory
    await expect(contract.connect(producer).transferBatch(batchId, distributor.address))
      .to.emit(contract, "BatchTransferred")
      .withArgs(batchId, producer.address, distributor.address);

    batch = await contract.getBatch(batchId);
    expect(batch.currentOwner).to.equal(distributor.address);
    expect(batch.status).to.equal("In Transit");

    // Factory processes (Istihalah)
    await expect(
      contract
        .connect(distributor)
        .updateStatus(batchId, "Processed into Gelatin", "Halal Gelatin Powder"),
    )
      .to.emit(contract, "StatusUpdated")
      .withArgs(batchId, "Processed into Gelatin", "Halal Gelatin Powder");

    batch = await contract.getBatch(batchId);
    expect(batch.productName).to.equal("Halal Gelatin Powder");
    expect(batch.status).to.equal("Processed into Gelatin");

    // Factory -> Retailer
    await expect(contract.connect(distributor).transferBatch(batchId, retailer.address))
      .to.emit(contract, "BatchTransferred")
      .withArgs(batchId, distributor.address, retailer.address);

    batch = await contract.getBatch(batchId);
    expect(batch.currentOwner).to.equal(retailer.address);
    expect(batch.status).to.equal("In Transit");

    // Retailer finalizes product
    await expect(contract.connect(retailer).updateStatus(batchId, "Ready for Sale", "Halal Gummy Bears"))
      .to.emit(contract, "StatusUpdated")
      .withArgs(batchId, "Ready for Sale", "Halal Gummy Bears");

    batch = await contract.getBatch(batchId);
    expect(batch.productName).to.equal("Halal Gummy Bears");
    expect(batch.status).to.equal("Ready for Sale");
  });

  it("restricts role assignment to admin", async function () {
    const { contract, producer, authority, distributor, retailer, other } = await deployWithRoles();

    await expect(contract.connect(other).addProducer(other.address)).to.be.revertedWith(
      "Only Admin can perform this action",
    );
    await expect(contract.connect(producer).addAuthority(other.address)).to.be.revertedWith(
      "Only Admin can perform this action",
    );
    await expect(contract.connect(authority).addDistributor(other.address)).to.be.revertedWith(
      "Only Admin can perform this action",
    );
    await expect(contract.connect(distributor).addRetailer(other.address)).to.be.revertedWith(
      "Only Admin can perform this action",
    );

    // Sanity: role state remains unchanged for the random address
    expect(await contract.producers(other.address)).to.equal(false);
    expect(await contract.halalAuthorities(other.address)).to.equal(false);
    expect(await contract.distributors(other.address)).to.equal(false);
    expect(await contract.retailers(other.address)).to.equal(false);
  });

  it("prevents non-producers from creating a batch", async function () {
    const { contract, other } = await deployWithRoles();
    await expect(contract.connect(other).createBatch(makeBatchId(), "Raw Bovine Bones")).to.be.revertedWith(
      "Only Producer (Farm) can perform this",
    );
  });

  it("prevents duplicate batch IDs", async function () {
    const { contract, producer } = await deployWithRoles();
    const batchId = makeBatchId();

    await (await contract.connect(producer).createBatch(batchId, "Raw Bovine Bones")).wait();
    await expect(contract.connect(producer).createBatch(batchId, "Duplicate"))
      .to.be.revertedWith("Batch ID already exists");
  });

  it("prevents non-authorities from certifying halal", async function () {
    const { contract, producer, other } = await deployWithRoles();
    const batchId = makeBatchId();
    await (await contract.connect(producer).createBatch(batchId, "Raw Bovine Bones")).wait();

    await expect(contract.connect(other).setHalalCertificate(batchId, "QmHash")).to.be.revertedWith(
      "Only JAKIM can perform this",
    );
  });

  it("reverts when certifying a missing batch", async function () {
    const { contract, authority } = await deployWithRoles();
    await expect(contract.connect(authority).setHalalCertificate("DOES-NOT-EXIST", "QmHash"))
      .to.be.revertedWith("Batch does not exist");
  });

  it("prevents non-owners from transferring or updating status", async function () {
    const { contract, producer, distributor, other } = await deployWithRoles();
    const batchId = makeBatchId();
    await (await contract.connect(producer).createBatch(batchId, "Raw Bovine Bones")).wait();

    await expect(contract.connect(other).transferBatch(batchId, distributor.address)).to.be.revertedWith(
      "You do not own this batch",
    );
    await expect(contract.connect(other).updateStatus(batchId, "Processed", "NewName")).to.be.revertedWith(
      "You do not own this batch",
    );
  });

  it("enforces producer -> distributor and distributor -> retailer transfer rules", async function () {
    const { contract, producer, distributor, retailer, other } = await deployWithRoles();
    const batchId = makeBatchId();
    await (await contract.connect(producer).createBatch(batchId, "Raw Bovine Bones")).wait();

    // Producer cannot transfer to non-distributor
    await expect(contract.connect(producer).transferBatch(batchId, other.address)).to.be.revertedWith(
      "Producer must transfer to a Distributor (Factory)",
    );

    // Producer -> distributor OK
    await (await contract.connect(producer).transferBatch(batchId, distributor.address)).wait();

    // Distributor cannot transfer to non-retailer
    await expect(contract.connect(distributor).transferBatch(batchId, other.address)).to.be.revertedWith(
      "Distributor must transfer to a Retailer",
    );

    // Distributor -> retailer OK
    await expect(contract.connect(distributor).transferBatch(batchId, retailer.address))
      .to.emit(contract, "BatchTransferred");
  });

  it("rejects transfer to the zero address", async function () {
    const { contract, producer } = await deployWithRoles();
    const batchId = makeBatchId();
    await (await contract.connect(producer).createBatch(batchId, "Raw Bovine Bones")).wait();

    await expect(contract.connect(producer).transferBatch(batchId, ethers.ZeroAddress)).to.be.revertedWith(
      "Invalid address",
    );
  });

  it("does not overwrite productName when updateStatus new name is empty", async function () {
    const { contract, producer } = await deployWithRoles();
    const batchId = makeBatchId();
    await (await contract.connect(producer).createBatch(batchId, "Raw Bovine Bones")).wait();

    await (await contract.connect(producer).updateStatus(batchId, "Status Only", "")).wait();
    const batch = await contract.getBatch(batchId);
    expect(batch.status).to.equal("Status Only");
    expect(batch.productName).to.equal("Raw Bovine Bones");
  });
});
