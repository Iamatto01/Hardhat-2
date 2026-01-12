// Shared Web3 helpers for all pages under /public
// - MetaMask connection
// - Sepolia network enforcement
// - Read/write contract instances (ethers v6)
//
// These pages are plain HTML files; we intentionally attach functions to `window`.

(function () {
  const NETWORKS = {
    sepolia: {
      chainId: 11155111,
      chainIdHex: "0xaa36a7",
      chainName: "Sepolia",
      nativeCurrency: { name: "SepoliaETH", symbol: "SEP", decimals: 18 },
      rpcUrls: ["https://rpc.sepolia.org"],
      blockExplorerUrls: ["https://sepolia.etherscan.io"],
      // NOTE: Some public RPC endpoints do not enable CORS, which breaks browser-based read calls.
      // We keep a small list of fallbacks and probe them at runtime.
      readRpcUrls: [
        "https://rpc.ankr.com/eth_sepolia",
        "https://ethereum-sepolia.publicnode.com",
        "https://rpc.sepolia.org",
      ],
      defaultReadRpcUrl: "https://rpc.ankr.com/eth_sepolia",
    },
    localhost: {
      chainId: 31337,
      chainIdHex: "0x7a69",
      chainName: "Hardhat Localhost",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: ["http://127.0.0.1:8545"],
      blockExplorerUrls: [],
      readRpcUrls: ["http://127.0.0.1:8545"],
      defaultReadRpcUrl: "http://127.0.0.1:8545",
    },
  };

  function normalizeErrorMessage(err) {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    if (typeof err.message === "string") return err.message;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }

  function getSelectedNetworkName() {
    const fn = window.getSelectedNetwork;
    if (typeof fn === "function") {
      try {
        const name = fn();
        if (name && NETWORKS[String(name)]) return String(name);
      } catch {
        // ignore
      }
    }

    const host = String(window.location.hostname || "").toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return "localhost";
    return "sepolia";
  }

  function getSelectedNetworkConfig() {
    return NETWORKS[getSelectedNetworkName()] ?? NETWORKS.sepolia;
  }

  async function ensureMetaMask(statusTarget) {
    if (!window.ethereum) {
      if (typeof window.showStatus === "function" && statusTarget) {
        window.showStatus("❌ MetaMask not installed. Please install MetaMask.", "error", statusTarget);
      }
      return null;
    }
    return window.ethereum;
  }

  async function getBrowserProvider() {
    return new ethers.BrowserProvider(window.ethereum);
  }

  async function ensureOnSelectedNetwork(provider, statusTarget) {
    const selected = getSelectedNetworkConfig();
    const requiredChainId = selected.chainId;

    try {
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      if (chainId === requiredChainId) return true;

      // Try to request a network switch.
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: selected.chainIdHex }],
      });

      return true;
    } catch (err) {
      // If Sepolia isn't added in MetaMask yet.
      const code = err && typeof err === "object" ? err.code : undefined;
      if (code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: selected.chainIdHex,
                chainName: selected.chainName,
                nativeCurrency: selected.nativeCurrency,
                rpcUrls: selected.rpcUrls,
                blockExplorerUrls: selected.blockExplorerUrls,
              },
            ],
          });

          // After adding, try switching again.
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: selected.chainIdHex }],
          });

          return true;
        } catch (addErr) {
          const message = normalizeErrorMessage(addErr);
          if (typeof window.showStatus === "function" && statusTarget) {
            window.showStatus(
              "❌ Please add/switch to the selected network in MetaMask. " + message,
              "error",
              statusTarget,
            );
          }
          return false;
        }
      }

      const message = normalizeErrorMessage(err);
      if (typeof window.showStatus === "function" && statusTarget) {
        window.showStatus(
          "❌ Please switch MetaMask network to match the selected network. " + message,
          "error",
          statusTarget,
        );
      }
      return false;
    }
  }

  async function requestAccounts(provider, statusTarget) {
    try {
      const existingAccounts = await window.ethereum.request({ method: "eth_accounts" });
      if (existingAccounts && existingAccounts.length > 0) return existingAccounts;
      return await provider.send("eth_requestAccounts", []);
    } catch (err) {
      const message = normalizeErrorMessage(err);
      if (typeof window.showStatus === "function" && statusTarget) {
        window.showStatus("❌ Wallet connection failed. " + message, "error", statusTarget);
      }
      return null;
    }
  }

  async function getConnectedAccount() {
    if (!window.ethereum) return null;
    try {
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (accounts && accounts.length > 0) return String(accounts[0]);
      return null;
    } catch {
      return null;
    }
  }

  async function connectWallet(statusTarget, options) {
    const opts = options && typeof options === "object" ? options : {};
    const forcePrompt = Boolean(opts.forcePrompt);

    const eth = await ensureMetaMask(statusTarget);
    if (!eth) return null;

    // Best effort: ask wallet to show account selection.
    // Note: Some wallets will not re-prompt if the site is already connected.
    if (forcePrompt) {
      try {
        await window.ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch {
        // ignore; we'll fall back to normal request below
      }
    }

    const provider = await getBrowserProvider();

    // Ensure network first so MetaMask prompts on the correct chain.
    const okNetwork = await ensureOnSelectedNetwork(provider, statusTarget);
    if (!okNetwork) return null;

    let accounts;
    if (forcePrompt) {
      try {
        accounts = await provider.send("eth_requestAccounts", []);
      } catch (err) {
        const message = normalizeErrorMessage(err);
        if (typeof window.showStatus === "function" && statusTarget) {
          window.showStatus("❌ Wallet connection failed. " + message, "error", statusTarget);
        }
        return null;
      }
    } else {
      accounts = await requestAccounts(provider, statusTarget);
    }

    if (!accounts || accounts.length === 0) return null;

    try {
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      return {
        address: String(address),
        network: getSelectedNetworkName(),
      };
    } catch {
      return {
        address: String(accounts[0]),
        network: getSelectedNetworkName(),
      };
    }
  }

  async function disconnectWallet(statusTarget) {
    if (!window.ethereum) return true;

    // Best effort: revoke the dapp's eth_accounts permission.
    // Not all wallets support this.
    try {
      await window.ethereum.request({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }],
      });

      if (typeof window.showStatus === "function" && statusTarget) {
        window.showStatus("✅ Disconnected. You can connect a different account now.", "success", statusTarget);
      }
      return true;
    } catch (err) {
      const message = normalizeErrorMessage(err);
      if (typeof window.showStatus === "function" && statusTarget) {
        window.showStatus(
          "⚠️ Unable to disconnect automatically. In MetaMask: Settings → Connected sites → disconnect this site. " +
            message,
          "error",
          statusTarget,
        );
      }
      return false;
    }
  }

  async function getReadProvider() {
    // Prefer MetaMask for reads when available (no account needed for eth_call).
    // If MetaMask is on a different chain, we try a chain switch prompt.
    // Otherwise, fall back to direct JSON-RPC endpoints (must support CORS).
    const selected = getSelectedNetworkConfig();

    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const network = await provider.getNetwork();
        if (Number(network.chainId) === selected.chainId) return provider;

        // Best effort: ask wallet to switch chains so reads work without CORS.
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: selected.chainIdHex }],
          });
          const after = await provider.getNetwork();
          if (Number(after.chainId) === selected.chainId) return provider;
        } catch {
          // ignore; we'll fall back to JSON-RPC below
        }
      } catch {
        // ignore
      }
    }

    const urls = Array.isArray(selected.readRpcUrls) && selected.readRpcUrls.length > 0
      ? selected.readRpcUrls
      : [selected.defaultReadRpcUrl];

    let lastError;
    for (const url of urls) {
      try {
        const provider = new ethers.JsonRpcProvider(url);
        const network = await provider.getNetwork();
        if (Number(network.chainId) === selected.chainId) return provider;
      } catch (err) {
        lastError = err;
      }
    }

    const msg =
      "Unable to connect to the selected network for read-only calls. " +
      "If you are using Sepolia in a browser, this is often a CORS-restricted RPC issue. " +
      "Try installing MetaMask (or using the MetaMask mobile browser) and switching to Sepolia, " +
      "or update the CORS-friendly RPC list in public/js/web3.js.";

    const e = new Error(msg);
    e.cause = lastError;
    throw e;
  }

  async function ensureContractDeployed(provider, address, statusTarget) {
    let code;
    try {
      code = await provider.getCode(address);
    } catch {
      // If provider doesn't support getCode for some reason, don't block.
      return true;
    }

    if (!code || code === "0x") {
      const message =
        "No contract found at this address on the selected network. " +
        "Deploy to Sepolia and set the correct contract address.";

      if (typeof window.showStatus === "function" && statusTarget) {
        window.showStatus("❌ " + message, "error", statusTarget);
        return false;
      }

      throw new Error(message);
    }

    return true;
  }

  async function getReadContract() {
    const provider = await getReadProvider();
    const address = await window.getContractAddress();
    await ensureContractDeployed(provider, address);
    return new ethers.Contract(address, window.CONTRACT_ABI, provider);
  }

  async function getWriteContract(statusTarget) {
    const eth = await ensureMetaMask(statusTarget);
    if (!eth) return null;

    const provider = await getBrowserProvider();

    const accounts = await requestAccounts(provider, statusTarget);
    if (!accounts) return null;

    const okNetwork = await ensureOnSelectedNetwork(provider, statusTarget);
    if (!okNetwork) return null;

    const signer = await provider.getSigner();
    const address = await window.getContractAddress();
    const ok = await ensureContractDeployed(provider, address, statusTarget);
    if (!ok) return null;
    return new ethers.Contract(address, window.CONTRACT_ABI, signer);
  }

  function getBatchIdFromUrl() {
    try {
      const value = new URLSearchParams(window.location.search).get("batchId");
      return value ? String(value) : "";
    } catch {
      return "";
    }
  }

  function getContractFromUrl() {
    try {
      const value = new URLSearchParams(window.location.search).get("contract");
      return value ? String(value) : "";
    } catch {
      return "";
    }
  }

  function buildTrackUrl(batchId, contractAddress) {
    const url = new URL("track.html", window.location.href);
    try {
      const fn = window.getSelectedNetwork;
      if (typeof fn === "function") {
        const network = fn();
        if (network) url.searchParams.set("network", String(network));
      }
    } catch {
      // ignore
    }
    if (batchId) url.searchParams.set("batchId", batchId);
    if (contractAddress) url.searchParams.set("contract", contractAddress);
    return url.toString();
  }

  window.WEB3_CONFIG = {
    networks: NETWORKS,
  };

  window.getReadProvider = getReadProvider;
  window.getReadContract = getReadContract;
  window.getWriteContract = getWriteContract;
  window.getConnectedAccount = getConnectedAccount;
  window.connectWallet = connectWallet;
  window.disconnectWallet = disconnectWallet;
  window.getBatchIdFromUrl = getBatchIdFromUrl;
  window.getContractFromUrl = getContractFromUrl;
  window.buildTrackUrl = buildTrackUrl;
})();
