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