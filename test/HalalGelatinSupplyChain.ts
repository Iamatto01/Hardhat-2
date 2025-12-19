import { expect } from "chai";
import { network } from "hardhat";

import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-toolbox-mocha-ethers";

const { ethers } = await network.connect();

function makeBatchId(): string {
  // Keep it deterministic-ish and unique per run
  return `GEL-${new Date().getFullYear()}-${Date.now()}`;
}

describe("HalalGelatinSupplyChain", function () {
  it("runs the full halal gelatin flow end-to-end", async function () {
    const [admin, producer, authority, distributor, retailer] = await ethers.getSigners();

    const contract = await ethers.deployContract("HalalGelatinSupplyChain");

    // Admin assigns roles
    await (await contract.connect(admin).addProducer(producer.address)).wait();
    await (await contract.connect(admin).addAuthority(authority.address)).wait();
    await (await contract.connect(admin).addDistributor(distributor.address)).wait();
    await (await contract.connect(admin).addRetailer(retailer.address)).wait();

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
});
