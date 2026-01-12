// Shared helpers for all pages under /public
// - Contract address resolution: URL param ?contract=..., localStorage, or fallback
// - UI status helper: showStatus(message, type, targetId)
//
// NOTE: These pages are plain HTML files; we intentionally attach functions to `window`.

(function () {
  const DEFAULT_LOCALHOST_CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

  const SUPPORTED_NETWORKS = ["localhost", "sepolia"];
  const NETWORK_STORAGE_KEY = "NETWORK";

  let cachedAddresses = null;

  function isSupportedNetwork(value) {
    return SUPPORTED_NETWORKS.includes(String(value));
  }

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

  function getDefaultNetwork() {
    const host = String(window.location.hostname || "").toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return "localhost";
    return "sepolia";
  }

  function getSelectedNetwork() {
    // Priority order:
    // 1) explicit override in URL: ?network=localhost|sepolia
    // 2) localStorage
    // 3) auto-detect based on hostname
    const fromQuery = getQueryParam("network");
    if (isSupportedNetwork(fromQuery)) {
      try {
        window.localStorage?.setItem(NETWORK_STORAGE_KEY, String(fromQuery));
      } catch {
        // ignore
      }
      return String(fromQuery);
    }

    const fromStorage = window.localStorage?.getItem(NETWORK_STORAGE_KEY);
    if (isSupportedNetwork(fromStorage)) return String(fromStorage);

    return getDefaultNetwork();
  }

  function setSelectedNetwork(network) {
    if (!isSupportedNetwork(network)) {
      throw new Error("Unsupported network: " + network);
    }

    window.localStorage?.setItem(NETWORK_STORAGE_KEY, String(network));

    // Persist into the URL too so links/bookmarks keep the selection.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("network", String(network));
      window.location.href = url.toString();
    } catch {
      window.location.reload();
    }
  }

  function getAddressStorageKey(network) {
    return "CONTRACT_ADDRESS_" + String(network).toUpperCase();
  }

  async function loadAddressMap() {
    if (cachedAddresses !== null) return cachedAddresses;

    try {
      const res = await fetch("js/contract-addresses.json", { cache: "no-store" });
      if (!res.ok) {
        cachedAddresses = {};
        return cachedAddresses;
      }
      const json = await res.json();
      cachedAddresses = json && typeof json === "object" ? json : {};
      return cachedAddresses;
    } catch {
      cachedAddresses = {};
      return cachedAddresses;
    }
  }

  async function getContractAddress() {
    const network = getSelectedNetwork();

    // Priority order:
    // 1) explicit override in URL: ?contract=0x...
    // 2) localStorage set by user (or by deploy step)
    // 3) window.CONTRACT_ADDRESS if set manually in console
    // 4) default localhost address (Hardhat default first deployment address)
    const fromQuery = normalizeAddress(getQueryParam("contract"));
    if (fromQuery) return fromQuery;

    const fromStorage = normalizeAddress(window.localStorage?.getItem(getAddressStorageKey(network)));
    if (fromStorage) return fromStorage;

    const map = await loadAddressMap();
    const fromMap = normalizeAddress(map?.[network]);
    if (fromMap) return fromMap;

    const fromWindow = normalizeAddress(window.CONTRACT_ADDRESS);
    if (fromWindow) return fromWindow;

    // For localhost, return the default hardhat first deployment address.
    if (network === "localhost") return DEFAULT_LOCALHOST_CONTRACT;

    // For sepolia, prefer an explicit address (storage/map/window/URL).
    // If none is available, return an empty string so callers can show a clear error.
    return "";
  }

  function setContractAddress(address) {
    const normalized = normalizeAddress(address);
    if (!normalized) throw new Error("Contract address is empty");

    if (typeof ethers !== "undefined" && typeof ethers.isAddress === "function") {
      if (!ethers.isAddress(normalized)) {
        throw new Error("Invalid contract address: " + normalized);
      }
    }

    const network = getSelectedNetwork();
    window.localStorage?.setItem(getAddressStorageKey(network), normalized);
    window.CONTRACT_ADDRESS = normalized;

    const el = document.getElementById("contractAddress");
    if (el) el.textContent = normalized;

    return normalized;
  }

  function propagateNetworkToLinks() {
    const network = getSelectedNetwork();

    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      const href = a.getAttribute("href");
      if (!href) continue;
      if (href.startsWith("#")) continue;
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) continue; // has protocol
      if (!href.endsWith(".html") && !href.includes(".html?")) continue;

      try {
        const url = new URL(href, window.location.href);
        if (!url.searchParams.get("network")) {
          url.searchParams.set("network", network);
          a.setAttribute("href", url.pathname + url.search + url.hash);
        }
      } catch {
        // ignore malformed hrefs
      }
    }
  }

  function bindNetworkToggleButton() {
    // The site uses a single network toggle button in the topbar.
    const btn = document.getElementById("chainPill");
    if (!btn) return;

    const updateText = () => {
      const network = getSelectedNetwork();
      const label = network === "localhost" ? "Localhost" : "Sepolia";
      btn.innerHTML = `<span class="dot"></span> Chain: ${label}`;
    };

    updateText();

    btn.addEventListener("click", () => {
      const current = getSelectedNetwork();
      const next = current === "sepolia" ? "localhost" : "sepolia";
      setSelectedNetwork(next);
    });
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

  window.getSelectedNetwork = getSelectedNetwork;
  window.setSelectedNetwork = setSelectedNetwork;

  // Bind the existing toggle button and keep links consistent.
  const init = () => {
    bindNetworkToggleButton();
    propagateNetworkToLinks();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
