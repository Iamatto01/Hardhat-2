// Shared helpers for all pages under /public
// - Contract address resolution: URL param ?contract=..., localStorage, or fallback
// - UI status helper: showStatus(message, type, targetId)
//
// NOTE: These pages are plain HTML files; we intentionally attach functions to `window`.

(function () {
  const DEFAULT_LOCALHOST_CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const STORAGE_KEY = "CONTRACT_ADDRESS";

  function getQueryParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch {
      return null;
    }
  }

  function normalizeAddress(value) {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    return trimmed;
  }

  async function getContractAddress() {
    // Priority order:
    // 1) explicit override in URL: ?contract=0x...
    // 2) localStorage set by user (or by deploy step)
    // 3) window.CONTRACT_ADDRESS if set manually in console
    // 4) default localhost address (Hardhat default first deployment address)
    const fromQuery = normalizeAddress(getQueryParam("contract"));
    if (fromQuery) return fromQuery;

    const fromStorage = normalizeAddress(window.localStorage?.getItem(STORAGE_KEY));
    if (fromStorage) return fromStorage;

    const fromWindow = normalizeAddress(window.CONTRACT_ADDRESS);
    if (fromWindow) return fromWindow;

    return DEFAULT_LOCALHOST_CONTRACT;
  }

  function setContractAddress(address) {
    const normalized = normalizeAddress(address);
    if (!normalized) throw new Error("Contract address is empty");

    if (typeof ethers !== "undefined" && typeof ethers.isAddress === "function") {
      if (!ethers.isAddress(normalized)) {
        throw new Error("Invalid contract address: " + normalized);
      }
    }

    window.localStorage?.setItem(STORAGE_KEY, normalized);
    window.CONTRACT_ADDRESS = normalized;

    const el = document.getElementById("contractAddress");
    if (el) el.textContent = normalized;

    return normalized;
  }

  function showStatus(message, type, targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;

    el.textContent = message;
    el.className = "status " + (type === "success" ? "success" : "error");
    el.style.display = "block";
  }

  // expose globals used by the HTML pages
  window.getContractAddress = getContractAddress;
  window.setContractAddress = setContractAddress;
  window.showStatus = showStatus;
})();
