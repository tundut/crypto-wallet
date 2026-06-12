const provider = new ethers.JsonRpcProvider(
  "https://ethereum-sepolia-rpc.publicnode.com"
);

// const API = 'http://localhost:3000/api';
const API = '/api';
let activeWallet = null;
let activeWalletIndex = 0;
let walletBalanceUSD = 0;
let allWallets = [];
let lastTxRef = null;
let tokens = [
  {
    name: 'Ethereum',
    symbol: 'ETH',
    address: '0xDa6F7b67eCBd74fecF96Eb40f24BDdFf1b460465',
    icon: 'https://assets.coingecko.com/coins/images/279/thumb/ethereum.png',
    decimals: 18,
    badge: 'Earn',
    balance: 0,
  },
  {
    name: 'USD Coin',
    symbol: 'USDC',
    address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    icon: 'https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png',
    decimals: 6,
    badge: 'Stablecoin',
    balance: 0,
  },
  {
    name: 'Chainlink',
    symbol: 'LINK',
    icon: 'https://assets.coingecko.com/coins/images/877/thumb/chainlink-new-logo.png',
    address: '0x779877A7B0D9E8603169DdbD7836e478b4624789',
    decimals: 18,
    badge: '',
    balance: 0,
  },
];

// ── UTILS ───────────────────────────────────────────────
function fmt(addr) { return addr ? addr.slice(0, 10) + '...' + addr.slice(-6) : '—'; }
function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'medium' });
}
function fmtAmt(n, dir) {
  const sign = dir === 'out' ? '-' : '+';
  return `${sign}${parseFloat(n).toFixed(4)}`;
}

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'API error');
  return data;
}

function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => el.className = 'toast', 3000);
}

function showUnlockScreen() {
  document.getElementById('unlock-screen').style.display = 'flex';
}
function showCreateWalletScreen() {
  document.getElementById('create-wallet-screen').style.display = 'flex';
}

// ── MODAL ───────────────────────────────────────────────
function openModal(id) {
  document.getElementById('modal-overlay').classList.add('active');
  document.getElementById(id).classList.add('active');

  // Initialize mnemonic input grid when import modal is opened
  if (id === 'import-wallet-modal') {
    buildMnemonicInputGrid(12);
  }
}
function closeAllModals() {
  document.getElementById('modal-overlay').classList.remove('active');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  document.querySelectorAll('.error-msg').forEach(e => e.textContent = '');

}

function createWalletModal() {
  closeAllModals();
  document.getElementById('create-password').value = '';
  document.getElementById('confirm-password').value = '';

  document.getElementById('mnemonic-grid').innerHTML = '';
  document.getElementById('mnemonic-meta').textContent = '';
}

function closeBackupModal() {
  closeAllModals();
  document.getElementById('backup-password').value = '';
  document.getElementById('backup-mnemonic-grid').innerHTML = ''
  document.getElementById('backup-meta').innerHTML = '';
  document.getElementById('backup-mnemonic-result').style.display = 'none';
  document.querySelector('#backup-modal > div.form-group').style.display = 'block';
  document.querySelector('#backup-modal > button.btn-primary').style.display = 'block';
  document.querySelector('#backup-error').style.display = 'block';
}

function closeExportModal() {
  closeAllModals();
  document.getElementById('export-password').value = '';
  document.getElementById('export-result').style.display = 'none';
  document.getElementById('export-error').textContent = '';
  document.querySelector('#export-wallet-modal > div.form-group').style.display = 'block';
  document.querySelector('#export-wallet-modal > button.btn-primary').style.display = 'block';
  document.querySelector('#export-error').style.display = 'block';
}

// ── TABS ────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');

    const tabName = tab.dataset.tab;
    if (tabName === 'history') loadHistory();
    if (tabName === 'tokens') loadTokens();
    if (tabName === 'attack') loadAttack();
  });
});

// ── WALLET CREATION ──────────────────────────────────────
let _selectedWordCount = 12;

async function createWallet() {
  const pw = document.getElementById('create-password').value;
  const cpw = document.getElementById('confirm-password').value;
  if (!pw || pw.length < 4) {
    document.getElementById('create-error').textContent = 'Password must be at least 4 characters';
    return;
  }
  if (pw !== cpw) {
    document.getElementById('create-error').textContent = 'Passwords do not match';
    return;
  }
  const btn = document.getElementById('create-btn-text');
  btn.textContent = 'Creating...';
  btn.disabled = true;
  document.getElementById('create-error').textContent = '';

  try {
    const data = await api('/wallet/create', {
      method: 'POST',
      body: JSON.stringify({ password: pw })
    });
    createWalletModal();
    await refreshAll();
    // selectWallet(data.address);

    // Show mnemonic display modal
    showMnemonicDisplay(data.mnemonic, data.address);
    if (data.totpUrl) {
      QRCode.toCanvas(document.getElementById('totp-qrcode'), data.totpUrl, function (error) {
        if (error) console.error(error);
      });
    }
    await saveWallet({
      address: data.address,
      encryptedMnemonic: data.vault.encryptedMnemonic,
      iv: data.vault.iv,
      salt: data.vault.salt,
      authTag: data.vault.authTag,
      accountCount: 1
    });
    activeWallet = ethers.Wallet.fromPhrase(data.mnemonic);
    saveSession(activeWallet);

    showWallet(data.address);
    toast(`Wallet created!`, 'success');
  } catch (e) {
    document.getElementById('create-error').textContent = e.message;
  } finally {
    btn.textContent = 'Generate Wallet';
  }
}

async function unlockWallet() {
  const pw = document.getElementById('password').value;
  if (!pw) {
    toast('Password required', 'error');
    return;
  }
  try {
    const walletData = await getWallet();
    if (!walletData) {
      toast('No wallet found', 'error');
      return;
    }

    const data = await api('/wallet/unlock', {
      method: 'POST',
      body: JSON.stringify({
        password: pw,
        vault: walletData
      })
    });
    activeWallet = ethers.Wallet.fromPhrase(data.mnemonic);
    await reloadWallets();
    await refreshAll();
    const session = loadSession();
    activeWalletIndex = session ? session.activeIndex : 0;
    saveSession(activeWallet);
    showWallet(activeWallet);
    toast('Wallet unlocked!', 'success');
    document.getElementById('password').value = '';
  } catch (e) {
    toast(e.message, 'error');
  }
}

// Lock wallet
document.getElementById('lockWallet-btn')
  .addEventListener('click', () => {
    clearSession();
    activeWallet = null;
    document.getElementById('wallet-screen').style.display = 'none';
    document.querySelector('#no-wallet-screen').style.display = 'flex';
    document.querySelector('#no-wallet-screen #create-wallet-screen').style.display = 'none';
    document.querySelector('#no-wallet-screen #unlock-screen').style.display = 'flex';
    document.getElementById('wallet-list-sidebar').innerHTML = '';
    showUnlockScreen();
    toast('Wallet locked', 'info');
  });


async function showWallet(wallet) {
  document.getElementById('no-wallet-screen').style.display = 'none';
  document.getElementById('wallet-screen').style.display = 'block';

  document.getElementById('hdr-address').textContent = `Address: ${wallet.address}`;
  document.getElementById('hdr-pubkey').textContent = `Public key: ${wallet.publicKey}`;

  refreshAll();
  renderSidebar();
}

function showMnemonicDisplay(mnemonic, address) {
  const words = mnemonic.trim().split(/\s+/);
  const grid = document.getElementById('mnemonic-grid');
  grid.innerHTML = words.map((w, i) => `
    <div class="mnemonic-word">
      <span class="word-num">${i + 1}.</span>
      <span class="word-text">${w}</span>
    </div>
  `).join('');

  document.getElementById('mnemonic-meta').innerHTML =
    `BIP-39 · ${words.length} words · Derivation: m/44'/60'/0'/0/0<br>
    Address: ${address}`;

  // Store for "Continue" button
  document.getElementById('mnemonic-display-modal')._targetAddress = address;
  openModal('mnemonic-display-modal');
}

function confirmMnemonicSaved() {
  const cb = document.getElementById('mnemonic-saved-cb');
  if (!cb.checked) { toast('Please confirm you saved your phrase', 'error'); return; }
  closeAllModals();
}

// ── IMPORT WALLET ─────────────────────────────────────────
function switchImportTab(tab, btn) {
  document.querySelectorAll('.import-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('import-tab-mnemonic').style.display = tab === 'mnemonic' ? 'block' : 'none';
  document.getElementById('import-tab-privkey').style.display = tab === 'privkey' ? 'block' : 'none';
}

function buildMnemonicInputGrid(count = 12) {
  const el = document.getElementById('mnemonic-input-grid');
  el.innerHTML = Array.from({ length: count }, (_, i) => `
    <div class="mnemonic-input-cell">
      <span class="word-num">${i + 1}.</span>
      <input type="text" id="mw-${i}" placeholder="word" autocomplete="off" spellcheck="false"
             oninput="onMnemonicWordInput(${i})">
    </div>
  `).join('');
}

function onMnemonicWordInput(index) {
  // Auto-handle paste: if word contains spaces, distribute across cells
  const val = document.getElementById(`mw-${index}`).value.trim();
  const words = val.split(/\s+/);
  if (words.length > 1) {
    words.forEach((w, i) => {
      const inp = document.getElementById(`mw-${index + i}`);
      if (inp) inp.value = w;
    });
    document.getElementById(`mw-${index}`).value = words[0];
  }
}

async function importFromMnemonic() {
  const inputs = document.querySelectorAll('[id^="mw-"]');
  const words = Array.from(inputs).map(i => i.value.trim().toLowerCase()).filter(Boolean);
  const mnemonic = words.join(' ');
  const password = document.getElementById('import-mnemonic-password').value;
  const errEl = document.getElementById('import-mnemonic-error');
  errEl.textContent = '';

  if (words.length !== 12 && words.length !== 24) {
    errEl.textContent = `Need 12 or 24 words, got ${words.length}`; return;
  }
  if (!password) { errEl.textContent = 'Password required'; return; }

  try {
    const btn = document.querySelector('#import-tab-mnemonic > button');
    btn.textContent = 'Importing...';
    btn.disabled = true;

    const data = await api('/wallet/import/mnemonic', {
      method: 'POST',
      body: JSON.stringify({ mnemonic: mnemonic, password: password })
    });

    await saveWallet({
      address: data.address,
      encryptedMnemonic: data.vault.encryptedMnemonic,
      iv: data.vault.iv,
      salt: data.vault.salt,
      authTag: data.vault.authTag
    });
    activeWallet = ethers.Wallet.fromPhrase(mnemonic);

    await reloadWallets();
    await refreshAll();
    saveSession(activeWallet);
    updateAccountCount(allWallets.length);
    closeAllModals();
    showWallet(data.address);
    toast(`Wallet imported!`, 'success');
    if (data.totpUrl) {
      QRCode.toCanvas(document.getElementById('import-totp-qrcode'), data.totpUrl, function (error) {
        if (error) console.error(error);
        openModal('totp-setup-modal');
      });
    }
    document.getElementById('import-mnemonic-password').value = '';
    btn.textContent = 'Import from Phrase';
    btn.disabled = false;
  } catch (e) {
    errEl.textContent = "Invalid mnemonic or error importing wallet";
  }
}

async function importWallet() {
  const pk = document.getElementById('import-privkey').value.trim();
  const pw = document.getElementById('import-password').value;
  if (!pk || pk.replace(/^0x/, '').length !== 64) {
    document.getElementById('import-error').textContent = 'Private key must be 64 hex chars';
    return;
  }
  try {
    const data = await api('/wallet/import', { method: 'POST', body: JSON.stringify({ privateKey: pk, password: pw }) });
    closeAllModals();
    toast(`Wallet imported: ${fmt(data.address)}`, 'success');
    await refreshAll();
    selectWallet(data.address);
  } catch (e) {
    document.getElementById('import-error').textContent = e.message;
  }
}

function copyMnemonic() {
  const inputs = document.querySelectorAll('#mnemonic-grid .word-text');
  const words = Array.from(inputs).map(i => i.textContent.trim()).filter(Boolean);
  navigator.clipboard.writeText(words.join(' '));
  toast('Mnemonic copied to clipboard', 'success');
}

function copyBackupMnemonic() {
  const inputs = document.querySelectorAll('#backup-mnemonic-grid .word-text');
  const words = Array.from(inputs).map(i => i.textContent.trim()).filter(Boolean);
  navigator.clipboard.writeText(words.join(' '));
  toast('Mnemonic copied to clipboard', 'success');
}

function pasteMnemonic() {
  const inputs = document.querySelectorAll('.mnemonic-input-cell input');
  navigator.clipboard.readText().then(text => {
    const words = text.trim().split(/\s+/);
    words.forEach((w, i) => {
      const inp = inputs[i];
      if (inp) inp.value = w;
    });
  });
}

// ── REVEAL MNEMONIC ───────────────────────────────────────
function revealMnemonic() {
  requestOTP(() => executeRevealMnemonic());
}

async function executeRevealMnemonic() {
  const pw = document.getElementById('backup-password').value;
  const errEl = document.getElementById('backup-error');
  errEl.textContent = '';
  if (!pw) {
    toast('Password required', 'error');
    return;
  }
  try {
    const walletData = await getWallet();
    if (!walletData) {
      toast('No wallet found', 'error');
      return;
    }

    const data = await api('/wallet/unlock', {
      method: 'POST',
      body: JSON.stringify({
        password: pw,
        vault: walletData
      })
    });

    toast('Mnemonic revealed! Handle with care.', 'success');

    const words = data.mnemonic.trim().split(/\s+/);
    const grid = document.getElementById('backup-mnemonic-grid');
    grid.innerHTML = words.map((w, i) => `
      <div class="mnemonic-word">
        <span class="word-num">${i + 1}.</span>
        <span class="word-text">${w}</span>
      </div>
    `).join('');
    document.getElementById('backup-meta').innerHTML =
      `BIP-39 · ${words.length} words · Path: m/44'/60'/0'/0/0`;
    document.getElementById('backup-mnemonic-result').style.display = 'block'
    document.querySelector('#backup-modal > div.form-group').style.display = 'none';
    document.querySelector('#backup-modal > button.btn-primary').style.display = 'none';
    document.querySelector('#backup-error').style.display = 'none';

  } catch (e) {
    toast(e.message, 'error');
  }
}

async function revealPrivateKey() {
  requestOTP(() => executeRevealPrivateKey());
}

async function executeRevealPrivateKey() {
  const pw = document.getElementById('export-password').value;

  if (!pw) {
    toast('Password required', 'error');
    return;
  }
  try {
    const walletData = await getWallet();
    if (!walletData) {
      toast('No wallet found', 'error');
      return;
    }

    const data = await api('/wallet/unlock', {
      method: 'POST',
      body: JSON.stringify({
        password: pw,
        vault: walletData
      })
    });
    toast('Private key revealed! Handle with care.', 'success');
    const privateKey = activeWallet.privateKey;
    const el = document.getElementById('export-result');
    el.style.display = 'block';
    el.textContent = privateKey;
    document.getElementById('export-error').textContent = '';

    document.querySelector('#export-wallet-modal > div.form-group').style.display = 'none';
    document.querySelector('#export-wallet-modal > button.btn-primary').style.display = 'none';
    document.querySelector('#export-error').style.display = 'none';
    
    openModal('export-wallet-modal');
  } catch (e) {
    document.getElementById('export-error').textContent = e.message;
    openModal('export-wallet-modal');
  }
}

function copyAddress() {
  if (!activeWallet) return;
  navigator.clipboard.writeText(activeWallet.address);
  toast('Address copied!', 'info');
}

async function refreshBalance() {
  if (!activeWallet) return;
  try {
    document.getElementById('hdr-balance').textContent = '$' + parseFloat(walletBalanceUSD).toFixed(2);
    // if (data.pendingOut > 0) {
    //   document.getElementById('hdr-pending').textContent = `−${data.pendingOut.toFixed(4)} CVT pending`;
    // } else if (data.pendingIn > 0) {
    //   document.getElementById('hdr-pending').textContent = `+${data.pendingIn.toFixed(4)} CVT incoming`;
    // } else {
    //   document.getElementById('hdr-pending').textContent = '';
    // }
    // activeWallet.balance = data.confirmed;
    // activeWallet.available = data.available;
  } catch (e) {
    toast('Error fetching balance', 'error');
  }
}

// ── RENDER SIDEBAR ───────────────────────────────────────
function renderSidebar() {
  const el = document.getElementById('wallet-list-sidebar');
  let html = '';
  for (let i = 0; i < allWallets.length; i++) {
    const w = allWallets[i];
    const isActive = (i === activeWalletIndex);
    let balStr = isActive ? `$${parseFloat(walletBalanceUSD).toFixed(2)}` : "Loading...";
    html += `
      <div class="sidebar-wallet-item ${isActive ? 'active' : ''}" onclick="selectAccount(${i})">
        <div class="sw-label">Account ${i + 1}</div>
        <div class="sw-address">${fmt(w.address)}</div>
        <div class="sw-balance" id="sidebar-bal-${i}">${balStr}</div>
      </div>
    `;
  }
  el.innerHTML = html;

  // Load balances for inactive accounts
  for (let i = 0; i < allWallets.length; i++) {
      const w = allWallets[i];
      const balEl = document.getElementById(`sidebar-bal-${i}`);
      balEl.textContent = `$${parseFloat(w.balanceUSD).toFixed(2)}`;
  }
}

// function renderQuickWallets() {
//   const others = allWallets.filter(w => w.address !== activeWallet?.address);
//   const el = document.getElementById('quick-wallet-list');
//   if (!others.length) { el.innerHTML = '<div style="font-size:12px;color:var(--text3)">No other wallets. Create one first.</div>'; return; }
//   el.innerHTML = others.map(w => `
//     <div class="quick-wallet-btn" onclick="document.getElementById('send-to').value='${w.address}'">
//       <span class="qw-addr">${fmt(w.address)}</span>
//       <span class="qw-bal">${parseFloat(w.balance || 0).toFixed(4)} CVT</span>
//     </div>
//   `).join('');
// }

// ── SEND TRANSACTION ─────────────────────────────────────
let pendingTx = null;
let currentPendingTx = null;
let pendingPollingTimer = null;
let swapHistory = loadSwapHistory();

function loadSwapHistory() {
  try {
    return JSON.parse(localStorage.getItem('swap_history') || '[]');
  } catch {
    return [];
  }
}

function saveSwapHistory() {
  try {
    localStorage.setItem('swap_history', JSON.stringify(swapHistory));
  } catch (err) {
    console.error('Unable to save swap history', err);
  }
}

function addSwapHistoryEntry(entry) {
  swapHistory = [entry, ...swapHistory.filter((item) => item.hash !== entry.hash)].slice(0, 50);
  saveSwapHistory();
}

function updateSwapHistoryStatus(hash, status) {
  const idx = swapHistory.findIndex((item) => item.hash === hash);
  if (idx === -1) return;
  swapHistory[idx].status = status;
  saveSwapHistory();
}

function getSwapHistoryEntries() {
  return swapHistory;
}

function isValidAddress(address) {
  return ethers.isAddress(address);
}

function isValidAmount(amount) {
  if (!amount) return false;
  if (!/^\d*\.?\d+$/.test(amount)) return false;

  try {
    return ethers.parseEther(amount) > 0n;
  } catch {
    return false;
  }
}

const toInput = document.getElementById('send-to');
const amountInput = document.getElementById('send-amount');
const errEl = document.getElementById('send-error');

toInput.addEventListener('input', validateForm);
amountInput.addEventListener('input', validateForm);

function getSelectedSendToken() {
  const sel = document.getElementById('send-token');
  if (!sel) return { symbol: 'ETH', decimals: 18 };
  const opt = sel.options[sel.selectedIndex];
  return {
    symbol: opt.dataset.symbol || opt.value,
    address: opt.dataset.address,
    decimals: parseInt(opt.dataset.decimals || '18', 10)
  };
}

function validateForm() {
  const to = toInput.value.trim();
  const amount = amountInput.value;

  if (!to) {
    errEl.textContent = 'Recipient address required';
    return false;
  }

  if (!ethers.isAddress(to)) {
    errEl.textContent = 'Invalid address';
    return false;
  }

  if (!amount) {
    errEl.textContent = 'Amount required';
    return false;
  }

  const token = getSelectedSendToken();
  const t = tokens.find(x => x.symbol === token.symbol);
  const balance = t ? t.balance : 0;

  const amountParsed = parseFloat(amount);
  if (amountParsed > balance) {
    errEl.textContent = 'Insufficient balance';
    return false;
  }

  try {
    if (ethers.parseUnits(amount, token.decimals) <= 0n) {
      errEl.textContent = 'Invalid amount';
      return false;
    }
  } catch {
    errEl.textContent = 'Invalid amount';
    return false;
  }

  errEl.textContent = '';
  return true;
}

async function prepareSendReview() {
  if (!validateForm()) return;
  const to = document.getElementById('send-to').value.trim();
  const amount = document.getElementById('send-amount').value;
  const token = getSelectedSendToken();

  pendingTx = { to, amount, token };

  document.querySelector('.send-form').classList.add('hidden');
  document.getElementById('send-review').style.display = 'block';
  document.getElementById('send-review').scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('review-from').textContent = activeWallet.address;
  document.getElementById('review-to').textContent = to;
  document.getElementById('review-amount').textContent = `${parseFloat(amount).toFixed(4)} ${token.symbol}`;

  try {
    let payload = "0x";
    let targetAddr = to;
    if (token.symbol !== 'ETH' && token.address) {
      const abi = ["function transfer(address to, uint256 amount) returns (bool)"];
      const iface = new ethers.Interface(abi);
      const parsedAmount = ethers.parseUnits(amount, token.decimals);
      payload = iface.encodeFunctionData("transfer", [to, parsedAmount]);
      targetAddr = token.address;
    }

    const data = await api('/transaction/gas-fee', {
      method: 'POST',
      body: JSON.stringify({
        from: activeWallet.address,
        to: targetAddr,
        amount: token.symbol === 'ETH' ? amount : "0",
        data: payload
      })
    });

    document.getElementById('review-fee').textContent = `${data.fee} ETH`;
  } catch (e) {
    document.getElementById('review-fee').textContent = 'Error fetching fee';
  }
}

function backToSendForm() {
  document.getElementById('send-review').style.display = 'none';
  document.getElementById('send-error').textContent = '';
  document.querySelector('.send-form').classList.remove('hidden');
}

function activateTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabName}`));
  if (tabName === 'history') {
    renderHistoryWithPending();
  }
}

function sendTransaction() {
  requestOTP(() => sendTransaction());
}

async function sendTransaction() {
  const to = pendingTx.to;
  const amount = pendingTx.amount;
  const token = pendingTx.token;

  let txTo = to;
  let txValue = ethers.parseEther(amount);
  let txData = "0x";

  if (token.symbol !== 'ETH' && token.address) {
    txTo = token.address;
    txValue = 0n;
    const abi = ["function transfer(address to, uint256 amount) returns (bool)"];
    const iface = new ethers.Interface(abi);
    const parsedAmount = ethers.parseUnits(amount, token.decimals);
    txData = iface.encodeFunctionData("transfer", [to, parsedAmount]);
  }

  const nonce = await provider.getTransactionCount(activeWallet.address);
  const feeData = await provider.getFeeData();
  const gasLimit = await provider.estimateGas({
    from: activeWallet.address,
    to: txTo,
    value: txValue,
    data: txData
  });

  const tx = {
    to: txTo,
    value: txValue,
    data: txData,
    nonce,
    gasLimit,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    chainId: 11155111 // Sepolia
  };

  const signedTx = await activeWallet.signTransaction(tx);
  console.log('Signed transaction:', signedTx);

  try {
    const data = await api('/transaction/send', {
      method: 'POST',
      body: JSON.stringify({ signedTx })
    });

    const result = data.result;
    console.log('Transaction sent:', result);
    const txHash = result.hash;
    const feePrice = feeData.maxFeePerGas || feeData.gasPrice;
    const estimatedFee = feePrice ? ethers.formatEther(gasLimit * feePrice) : '0';

    currentPendingTx = {
      hash: txHash,
      from: activeWallet.address,
      to,
      amount,
      asset: token.symbol,
      type: 'out',
      status: 'pending',
      timestamp: Date.now(),
      gasFee: estimatedFee
    };

    toast(`Transaction broadcast! ID: ${txHash.slice(0, 20)}...`, 'success');
    document.getElementById('send-to').value = '';
    document.getElementById('send-amount').value = '';
    pendingTx = null;
    backToSendForm();
    activateTab('history');
    pollPendingTransactionStatus(txHash);

  } catch (e) {
    errEl.textContent = e.message;
    toast(e.message, 'error');
  }
}

// ── LOAD HISTORY ─────────────────────────────────────────
async function loadHistory() {
  if (!activeWallet) return;
  renderHistoryWithPending();
}

async function renderHistoryWithPending() {
  if (!activeWallet) return;
  const el = document.getElementById('history-list');

  try {
    const data = await api(`/transaction/history/${activeWallet.address}`);
    const backendTxs = (data.transactions || []).map(tx => ({ ...tx, source: 'backend' }));
    const localSwaps = getSwapHistoryEntries().map(tx => ({ ...tx, source: 'swap' }));

    const allTxs = [];
    const swapHashes = new Set();

    if (currentPendingTx) {
      currentPendingTx.from = currentPendingTx.from.toLowerCase();
      currentPendingTx.to = currentPendingTx.to.toLowerCase();
      allTxs.push(currentPendingTx);
      swapHashes.add(currentPendingTx.hash);
    }

    for (const tx of localSwaps) {
      if (!swapHashes.has(tx.hash)) {
        allTxs.push(tx);
        swapHashes.add(tx.hash);
      }
    }

    const backendSeenKeys = new Set();
    for (const tx of backendTxs) {
      if (swapHashes.has(tx.hash)) continue;

      const key = tx.hash + "_" + (tx.asset || "ETH") + "_" + tx.type;
      if (!backendSeenKeys.has(key)) {
        allTxs.push(tx);
        backendSeenKeys.add(key);
      }
    }

    if (!allTxs.length) {
      el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:20px">No transactions yet.</div>';
      return;
    }

    allTxs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    el.innerHTML = allTxs.map(tx => renderTxItem(tx)).join('');
  } catch (e) {
    el.innerHTML = '<div style="color:var(--red)">Error loading history</div>';
  }
}

async function pollPendingTransactionStatus(txHash) {
  if (!txHash) return;
  if (pendingPollingTimer) clearInterval(pendingPollingTimer);

  const checkStatus = async () => {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt && currentPendingTx && currentPendingTx.hash === txHash) {
        clearInterval(pendingPollingTimer);
        pendingPollingTimer = null;
        const status = receipt.status === 1 ? 'success' : 'failed';
        updateSwapHistoryStatus(txHash, status);
        currentPendingTx = null;
        renderHistoryWithPending();
        refreshAll();
        toast(`Transaction ${status === 'success' ? 'confirmed' : 'failed'} on blockchain.`, status === 'success' ? 'success' : 'error');
      }
    } catch (err) {
      // ignore temporary network errors
    }
  };
  await checkStatus();
  pendingPollingTimer = setInterval(checkStatus, 5000);
}

// ── LOAD TOKENS ──────────────────────────────────────────
async function loadTokens() {
  if (!activeWallet) return;
  const el = document.getElementById('token-list');

  try {
    const data = await getWalletBalance(activeWallet.address);
    const tokens = data.tokens;

    const walletData = await getWallet();
    if (walletData && walletData.customTokens) {
      for (const t of walletData.customTokens) {

        // Get token balance from wallet
        const tokenData = await api(`/wallet/${activeWallet.address}/token-balance?tokenAddress=${t.address}`);
        const tokenBalance = parseFloat(tokenData.balance);

        tokens.push({
          name: t.symbol,
          symbol: t.symbol,
          icon: 'https://assets.coingecko.com/coins/images/279/thumb/ethereum.png',
          price: tokenBalance * data.usdc.priceUSD,
          change24h: data.usdc.change24h,
          balance: tokenBalance,
          badge: 'Custom'
        });
      }
    }

    populateTokenSelects(tokens);
    el.innerHTML = tokens.map(token => renderTokenItem(token)).join('');
    // update swap icons after token list refresh
    try { updateTokenIcons(); } catch (e) { /* ignore if not ready */ }
  } catch (e) {
    el.innerHTML = '<div style="color:var(--red);padding:20px">Error loading tokens</div>';
  }
}

function renderTokenItem(token) {
  const changeClass = token.change24h >= 0 ? 'positive' : 'negative';
  const changeSign = token.change24h >= 0 ? '↑' : '↓';
  const badgeHtml = token.badge ? ` <span class="token-badge">${token.badge}</span>` : '';

  return `
    <div class="token-item">
      <img src="${token.icon}" alt="${token.name}" class="token-icon">
      <div class="token-info">
        <div class="token-name">${token.name}${badgeHtml}</div>
        <div class="token-change ${changeClass}">${changeSign} ${Math.abs(token.change24h).toFixed(2)}%</div>
      </div>
      <div class="token-stats">
        <div class="token-price">$${token.price.toFixed(2)}</div>
        <div class="token-balance">${token.balance.toFixed(4)} ${token.symbol}</div>
      </div>
    </div>
  `;
}

// ── Swap token icons helpers ─────────────────────────────
function getTokenIcon(symbol) {
  if (!symbol) return 'https://assets.coingecko.com/coins/images/279/thumb/ethereum.png';
  const s = String(symbol).toUpperCase();
  if (s === 'ETH' || s === 'ETHEREUM') return 'https://assets.coingecko.com/coins/images/279/thumb/ethereum.png';
  if (s === 'USDC') return 'https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png';
  if (s === 'LINK') return 'https://assets.coingecko.com/coins/images/877/thumb/chainlink-new-logo.png';
  // fallback
  return 'https://assets.coingecko.com/coins/images/279/thumb/ethereum.png';
}

function populateTokenSelects(tokenList) {
  const selects = ['swap-token-in', 'swap-token-out', 'send-token'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = tokenList.map(t => {
      const addrAttr = t.address ? `data-address="${t.address}"` : '';
      const decAttr = t.decimals ? `data-decimals="${t.decimals}"` : 'data-decimals="18"';
      return `<option value="${t.symbol}" data-symbol="${t.symbol}" ${addrAttr} ${decAttr}>${t.symbol}</option>`;
    }).join('');
    const optionExists = Array.from(sel.options).some(o => o.value === currentVal);
    if (optionExists) sel.value = currentVal;
  });
}

function updateTokenIcons() {
  try {
    const selIn = document.getElementById('swap-token-in');
    const selOut = document.getElementById('swap-token-out');
    const selSend = document.getElementById('send-token');

    if (selIn) {
      const opt = selIn.options[selIn.selectedIndex];
      const sym = opt ? (opt.dataset && opt.dataset.symbol ? opt.dataset.symbol : opt.value) : null;
      const img = document.getElementById('swap-token-in-icon');
      if (img) img.src = getTokenIcon(sym);
    }
    if (selOut) {
      const opt = selOut.options[selOut.selectedIndex];
      const sym = opt ? (opt.dataset && opt.dataset.symbol ? opt.dataset.symbol : opt.value) : null;
      const img = document.getElementById('swap-token-out-icon');
      if (img) img.src = getTokenIcon(sym);
    }
    if (selSend) {
      const opt = selSend.options[selSend.selectedIndex];
      const sym = opt ? (opt.dataset && opt.dataset.symbol ? opt.dataset.symbol : opt.value) : null;
      const img = document.getElementById('send-token-icon');
      if (img) img.src = getTokenIcon(sym);
    }
  } catch (e) {
    // ignore
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const selIn = document.getElementById('swap-token-in');
  const selOut = document.getElementById('swap-token-out');
  const selSend = document.getElementById('send-token');
  if (selIn) selIn.addEventListener('change', updateTokenIcons);
  if (selOut) selOut.addEventListener('change', updateTokenIcons);
  if (selSend) selSend.addEventListener('change', updateTokenIcons);
  // initial icon set (delay slightly so DOM inserts finish)
  setTimeout(updateTokenIcons, 120);
});



function renderTxItem(tx) {
  const status = tx.status || 'success';
  const isSwap = tx.type === 'swap';
  const isOut = tx.type === 'out';
  const dir = isSwap ? 'swap' : isOut ? 'out' : 'in';
  const icon = isSwap ? '⇄' : isOut ? '↑' : '↓';
  const statusClass = isSwap ? 'swap' : status === 'pending' ? 'pending' : status === 'success' ? 'confirmed' : 'failed';
  const statusLabel = isSwap ? 'SWAP' : status === 'pending' ? 'PENDING' : status === 'success' ? 'CONFIRMED' : 'FAILED';
  const txJson = JSON.stringify(tx).replace(/"/g, '&quot;');

  const amountLabel = isSwap
    ? `${tx.amount} ${tx.tokenIn || ''} → ${tx.amountOut || '≈'} ${tx.tokenOut || ''}`
    : `${fmtAmt(tx.amount, dir)} ${tx.asset || 'ETH'}`;

  return `
    <div class="tx-item" onclick="showTxDetail(JSON.parse(this.dataset.tx))" data-tx="${txJson}">
      <div class="tx-icon ${dir}">${icon}</div>
      <div class="tx-info">
        <div class="tx-parties">${fmt(tx.from)} → ${fmt(tx.to)}</div>
        <div class="tx-time">${fmtTime(tx.timestamp)}</div>
      </div>
      <div class="tx-amount">
        <div class="tx-amount-val ${dir}">${amountLabel}</div>
        <div class="tx-status ${statusClass}">${statusLabel}</div>
      </div>
    </div>
  `;
}

function showTxDetail(tx) {
  const isSwap = tx.type === 'swap';
  const amountLabel = isSwap
    ? `${tx.amount} ${tx.tokenIn || ''} → ${tx.amountOut || '≈'} ${tx.tokenOut || ''}`
    : `${tx.amount} ${tx.asset || 'ETH'}`;
  const totalLabel = isSwap
    ? `${tx.amount} ${tx.tokenIn || ''} + ${tx.gasFee} ETH fee`
    : `${amountLabel} + ${tx.gasFee} ETH fee`;

  document.getElementById('tx-detail-content').innerHTML = `
    <div class="detail-row"><div class="detail-label">Hash</div><div class="detail-val">${tx.hash || '—'}</div></div>
    <div class="detail-row"><div class="detail-label">From</div><div class="detail-val">${tx.from}</div></div>
    <div class="detail-row"><div class="detail-label">To</div><div class="detail-val">${tx.to}</div></div>
    <div class="detail-row"><div class="detail-label">Amount</div><div class="detail-val">${amountLabel}</div></div>
    <div class="detail-row"><div class="detail-label">Status</div><div class="detail-val">${tx.status || 'confirmed'}</div></div>
    <div class="detail-row"><div class="detail-label">Timestamp</div><div class="detail-val">${fmtTime(tx.timestamp)}</div></div>
    <div class="detail-row"><div class="detail-label">Total gas fee</div><div class="detail-val">${tx.gasFee} ETH</div></div>
    <div class="detail-row"><div class="detail-label">Summary</div><div class="detail-val">${totalLabel}</div></div>
    <div style="margin-top:8px">
      <button class="btn-primary" style="font-size:13px;padding:8px 16px" onclick="window.open('https://sepolia.etherscan.io/tx/${tx.hash}', '_blank')">View on block explorer</button>
    </div>
  `;
  openModal('tx-detail-modal');
}

// LOAD ATTACK DEMO ───────────────────────────────────────────
function loadAttack() {
  if (!activeWallet) return;
  // Auto-fill fields
  const fromEl = document.getElementById('integrity-from');
  if (fromEl) fromEl.value = activeWallet.address;

  // Auto-fill nonce
  provider.getTransactionCount(activeWallet.address).then(nonce => {
    const nonceEl = document.getElementById('integrity-nonce');
    if (nonceEl) nonceEl.value = nonce;
  });
}

// ═══════════════════════════════════════════════════════════════
// 3.4.2 — SIGN ORIGINAL TX (Bước 1 của Integrity Attack)
// ═══════════════════════════════════════════════════════════════
let _integritySignature = null;
let _integrityOriginalData = null;

async function signOriginalTx() {
  if (!activeWallet) { toast('Vui lòng mở khoá ví trước.', 'error'); return; }

  const to = document.getElementById('integrity-to').value.trim() || '0x000000000000000000000000000000000000dEaD';
  const amount = parseFloat(document.getElementById('integrity-original-amount').value) || 0.001;
  let nonce = parseInt(document.getElementById('integrity-nonce').value);
  if (isNaN(nonce)) nonce = await provider.getTransactionCount(activeWallet.address);

  document.getElementById('integrity-to').value = to;
  document.getElementById('integrity-nonce').value = nonce;

  const txData = { from: activeWallet.address, to, amount, nonce, chainId: 11155111 };
  _integrityOriginalData = JSON.stringify(txData);

  _integritySignature = await activeWallet.signMessage(_integrityOriginalData);
  const hash = ethers.hashMessage(_integrityOriginalData);

  document.getElementById('integrity-signature-display').textContent = _integritySignature;
  document.getElementById('integrity-hash-display').textContent = hash;
  document.getElementById('integrity-sign-result').style.display = 'block';

  // Activate step 2
  const m2 = document.getElementById('integrity-marker-2');
  if (m2) m2.classList.add('active');
  const form2 = document.getElementById('integrity-step2-form');
  if (form2) form2.style.display = 'flex';

  toast('Giao dịch đã được ký thành công!', 'success');
}

// ═══════════════════════════════════════════════════════════════
// 3.4.2 — RUN INTEGRITY ATTACK (Bước 2)
// ═══════════════════════════════════════════════════════════════
async function runIntegrityAttack() {
  const resultEl = document.getElementById('integrity-result');
  const tamperAmount = parseFloat(document.getElementById('integrity-tamper-amount').value);

  if (!activeWallet) { resultEl.innerHTML = '<span style="color:var(--yellow)">⚠ Mở khoá ví trước.</span>'; return; }
  if (!_integritySignature) { resultEl.innerHTML = '<span style="color:var(--yellow)">⚠ Hãy ký giao dịch ở bước 1 trước.</span>'; return; }

  // Activate step 3 marker
  const m3 = document.getElementById('integrity-marker-3');
  if (m3) m3.classList.add('active');

  resultEl.innerHTML = '<span style="color:var(--text3)">⏳ Đang xác minh...</span>';

  const originalHash = ethers.hashMessage(_integrityOriginalData);
  const original = JSON.parse(_integrityOriginalData);

  // Kẻ tấn công sửa amount
  const tampered = { ...original, amount: tamperAmount };
  const tamperedData = JSON.stringify(tampered);
  const tamperedHash = ethers.hashMessage(tamperedData);

  // Xác minh chữ ký với dữ liệu bị sửa
  let recoveredAddress, isValid;
  try {
    recoveredAddress = ethers.verifyMessage(tamperedData, _integritySignature);
    isValid = recoveredAddress.toLowerCase() === activeWallet.address.toLowerCase();
  } catch (e) { isValid = false; recoveredAddress = 'ERROR'; }

  const step = (num, cls, label, val) => `
    <div class="integrity-step">
      <div class="step-num ${cls}">${num}</div>
      <div class="step-content">
        <div class="step-label">${label}</div>
        <div class="step-val">${val}</div>
      </div>
    </div>`;

  resultEl.innerHTML = `
    ${step(1, 'ok', '✅ Ký giao dịch gốc (amount = ' + original.amount + ' ETH)', 'Signature: ' + _integritySignature.slice(0, 28) + '...')}
    ${step(2, 'info', '📋 Hash giao dịch gốc', originalHash)}
    ${step(3, 'fail', '💀 Kẻ tấn công sửa amount → ' + tamperAmount + ' ETH', 'Hash bị sửa: ' + tamperedHash)}
    ${step(4, isValid ? 'fail' : 'ok',
    isValid ? '❌ Chữ ký vẫn hợp lệ (lỗi!)' : '🔒 Xác minh: KHÔNG HỢP LỆ',
    'Recovered: ' + recoveredAddress.slice(0, 20) + '...\nWallet: ' + activeWallet.address.slice(0, 20) + '...\nKhớp: ' + (isValid ? 'CÓ (lỗi!)' : 'KHÔNG → TỪ CHỐI')
  )}
    <div class="conclusion-box ${isValid ? 'fail' : 'success'}">
      ${isValid ? '⚠️ Phát hiện lỗi bảo mật!' : '✅ KẾT LUẬN: Dữ liệu bị sửa → Hash thay đổi → Chữ ký ECDSA không khớp → Giao dịch bị TỪ CHỐI.'}
    </div>`;

  if (m3) m3.classList.add(isValid ? 'error' : 'completed');
}

// ═══════════════════════════════════════════════════════════════
// 3.4.3 — NONCE: Bước 1 — Gửi giao dịch gốc
// ═══════════════════════════════════════════════════════════════
let _lastSignedTxHex = null;

async function nonceStepSendTx() {
  const to = document.getElementById('nonce-to').value.trim();
  const amount = document.getElementById('nonce-amount').value.trim();
  const resultEl = document.getElementById('nonce-step1-result');
  const btn = document.getElementById('nonce-send-btn');

  if (!activeWallet) { toast('Mở khoá ví trước.', 'error'); return; }
  if (!ethers.isAddress(to)) { toast('Địa chỉ không hợp lệ.', 'error'); return; }
  if (!amount || parseFloat(amount) <= 0) { toast('Số tiền không hợp lệ.', 'error'); return; }

  btn.disabled = true;
  btn.querySelector('span:last-child').textContent = '⏳ Đang gửi...';
  resultEl.style.display = 'none';

  try {
    const nonce = await provider.getTransactionCount(activeWallet.address);
    const feeData = await provider.getFeeData();
    const gasLimit = await provider.estimateGas({
      from: activeWallet.address, to, value: ethers.parseEther(amount)
    });

    const tx = {
      to, value: ethers.parseEther(amount), nonce, gasLimit,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      chainId: 11155111
    };

    const signedTx = await activeWallet.signTransaction(tx);
    _lastSignedTxHex = signedTx;

    const data = await api('/transaction/send', { method: 'POST', body: JSON.stringify({ signedTx }) });
    const hash = data.result.hash;

    resultEl.style.display = 'block';
    resultEl.innerHTML = `
      <div class="sign-result-item">
        <div class="sign-result-label">✅ Giao dịch đã broadcast</div>
        <div class="sign-result-value">Hash: ${hash}</div>
      </div>
      <div class="sign-result-item">
        <div class="sign-result-label">📋 Nonce sử dụng</div>
        <div class="sign-result-value">${nonce}</div>
      </div>
      <div class="sign-result-item">
        <div class="sign-result-label">🔑 Signed TX Hex (đã tự động điền vào bước 2)</div>
        <div class="sign-result-value" style="max-height:60px;overflow:auto">${signedTx.slice(0, 80)}...</div>
      </div>`;

    // Auto-fill vào bước 2
    document.getElementById('replay-signed-transaction').value = signedTx;
    const m2 = document.getElementById('nonce-marker-2');
    if (m2) m2.classList.add('active');

    toast('Giao dịch gốc đã gửi! Nonce=' + nonce, 'success');
  } catch (e) {
    resultEl.style.display = 'block';
    resultEl.innerHTML = `<div style="color:var(--red)">✗ Lỗi: ${e.message}</div>`;
    resultEl.style.borderColor = 'rgba(255,77,109,0.25)';
  } finally {
    btn.disabled = false;
    btn.querySelector('span:last-child').textContent = 'Gửi giao dịch gốc';
  }
}

// ═══════════════════════════════════════════════════════════════
// 3.4.3 — REPLAY ATTACK (Bước 2)
// ═══════════════════════════════════════════════════════════════
async function runReplayAttack() {
  const signedTx = document.getElementById('replay-signed-transaction').value.trim();
  const resultEl = document.getElementById('ra-result');
  const m3 = document.getElementById('nonce-marker-3');

  if (!signedTx) {
    resultEl.innerHTML = '<span style="color:var(--yellow)">⚠ Dán signed transaction hex vào ô trên hoặc gửi giao dịch gốc ở bước 1.</span>';
    return;
  }

  if (m3) m3.classList.add('active');
  resultEl.innerHTML = '<span style="color:var(--text3)">⏳ Đang phát lại giao dịch...</span>';

  try {
    const data = await api('/transaction/send', { method: 'POST', body: JSON.stringify({ signedTx }) });
    const result = data.result;
    if (m3) m3.classList.add('error');
    resultEl.innerHTML = `<div class="conclusion-box fail">⚠ Giao dịch được chấp nhận! Hash: ${result.hash.slice(0, 20)}...\n→ Nonce chưa bị dùng. Thử lại với signedTx đã broadcast.</div>`;
  } catch (e) {
    if (m3) m3.classList.add('completed');
    resultEl.innerHTML = `
      <div class="integrity-step">
        <div class="step-num ok">✓</div>
        <div class="step-content">
          <div class="step-label">✅ Phòng thủ Replay Attack thành công!</div>
          <div class="step-val">Mạng từ chối: ${e.message}</div>
        </div>
      </div>
      <div class="conclusion-box success">✅ KẾT LUẬN: Nonce trong signedTx đã bị dùng → Ethereum node từ chối giao dịch trùng lặp → Replay Attack thất bại.</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// 3.4.4 — RACE ATTACK / PENDING STATE MONITOR
// Gửi giao dịch thật → Theo dõi trạng thái pending real-time
// UI cảnh báo → ngăn người dùng giao dịch vội (Race Attack defense)
// ═══════════════════════════════════════════════════════════════
let _racePollingTimer = null;

async function runRaceAttackDemo() {
  const to = document.getElementById('race-to').value.trim();
  const amount = document.getElementById('race-amount').value.trim();
  const resultEl = document.getElementById('race-result');
  const btn = document.getElementById('race-send-btn');

  if (!activeWallet) {
    resultEl.innerHTML = '<span style="color:var(--yellow)">⚠ Vui lòng mở khoá ví trước.</span>';
    return;
  }
  if (!ethers.isAddress(to)) {
    resultEl.innerHTML = '<span style="color:var(--red)">✗ Địa chỉ người nhận không hợp lệ.</span>';
    return;
  }
  if (!amount || parseFloat(amount) <= 0) {
    resultEl.innerHTML = '<span style="color:var(--red)">✗ Số lượng ETH không hợp lệ.</span>';
    return;
  }

  // Dừng polling cũ nếu có
  if (_racePollingTimer) { clearInterval(_racePollingTimer); _racePollingTimer = null; }

  btn.disabled = true;
  btn.querySelector('span:last-child').textContent = '⏳ Đang gửi...';
  resultEl.innerHTML = '<span style="color:var(--text3)">📡 Đang ký và phát sóng giao dịch...</span>';

  let txHash = null;
  let startTime = Date.now();

  try {
    // Lấy nonce & fee data
    const nonce = await provider.getTransactionCount(activeWallet.address);
    const feeData = await provider.getFeeData();
    const gasLimit = await provider.estimateGas({
      from: activeWallet.address, to,
      value: ethers.parseEther(amount)
    });

    const tx = {
      to,
      value: ethers.parseEther(amount),
      nonce,
      gasLimit,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      chainId: 11155111
    };

    const signedTx = await activeWallet.signTransaction(tx);

    // Broadcast
    const data = await api('/transaction/send', {
      method: 'POST',
      body: JSON.stringify({ signedTx })
    });

    txHash = data.result.hash;
    startTime = Date.now();

    resultEl.innerHTML = `<span style="color:var(--green)">✅ Giao dịch đã broadcast! Hash: <a href="https://sepolia.etherscan.io/tx/${txHash}" target="_blank" style="color:var(--accent)">${txHash.slice(0, 22)}...</a></span>`;

    // Hiển thị pending card ngay lập tức
    _updatePendingMonitor(txHash, to, amount, nonce, 'pending', startTime);

    // Hiện cảnh báo Race Attack
    document.getElementById('race-warning').style.display = 'flex';

    // ── Bắt đầu polling mỗi 5 giây ──
    _racePollingTimer = setInterval(async () => {
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        if (receipt) {
          clearInterval(_racePollingTimer);
          _racePollingTimer = null;
          const confirmed = receipt.status === 1;
          _updatePendingMonitor(txHash, to, amount, nonce,
            confirmed ? 'confirmed' : 'failed', startTime);
          document.getElementById('race-warning').style.display = 'none';
          document.getElementById('pending-dot').className = 'pending-dot ' + (confirmed ? 'confirmed' : '');
          btn.disabled = false;
          btn.querySelector('span:last-child').textContent = 'Gửi & Monitor Pending';
          resultEl.innerHTML = `<span style="color:${confirmed ? 'var(--green)' : 'var(--red)'}">
            ${confirmed ? '✅' : '❌'} Giao dịch ${confirmed ? 'xác nhận thành công' : 'thất bại'} sau ${elapsed}s. 
            Block #${receipt.blockNumber}</span>`;
        } else {
          // Vẫn pending → cập nhật timer
          _updatePendingMonitor(txHash, to, amount, nonce, 'pending', startTime);
        }
      } catch (e) {
        // Bỏ qua lỗi mạng tạm thời
      }
    }, 5000);

  } catch (e) {
    resultEl.innerHTML = `<span style="color:var(--red)">✗ Lỗi: ${e.message}</span>`;
    btn.disabled = false;
    btn.querySelector('span:last-child').textContent = 'Gửi & Monitor Pending';
  }
}

function _updatePendingMonitor(hash, to, amount, nonce, status, startTime) {
  const dot = document.getElementById('pending-dot');
  const listEl = document.getElementById('pending-tx-list');

  dot.className = 'pending-dot' + (status === 'pending' ? ' active' : status === 'confirmed' ? ' confirmed' : '');

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const badgeLabel = status === 'pending' ? '⏳ PENDING' : status === 'confirmed' ? '✅ CONFIRMED' : '❌ FAILED';

  listEl.innerHTML = `
    <div class="pending-tx-card status-${status}">
      <div class="ptx-header">
        <span class="ptx-badge ${status}">${badgeLabel}</span>
        <a href="https://sepolia.etherscan.io/tx/${hash}" target="_blank"
           style="font-size:10px;color:var(--accent);font-family:var(--mono)">Etherscan ↗</a>
      </div>
      <div class="ptx-hash">${hash.slice(0, 30)}...</div>
      <div class="ptx-row"><span class="ptx-label">To:</span><span class="ptx-val">${to.slice(0, 18)}...</span></div>
      <div class="ptx-row"><span class="ptx-label">Amount:</span><span class="ptx-val">${amount} ETH</span></div>
      <div class="ptx-row"><span class="ptx-label">Nonce:</span><span class="ptx-val">${nonce}</span></div>
      <div class="ptx-timer ${status !== 'pending' ? 'done' : ''}">
        ${status === 'pending'
      ? `⏱ Đã chờ: ${elapsed}s — Mạng đang xử lý...`
      : `✓ Hoàn thành sau ${elapsed}s`}
      </div>
      ${status === 'pending' ? `
      <div style="margin-top:8px;font-size:10px;color:var(--red);font-family:var(--sans)">
        🛡 Cảnh báo Race Attack: Không gửi thêm TX với cùng Nonce ${nonce} trong lúc này!
      </div>` : ''}
    </div>
  `;
}

// ── MULTI-ACCOUNT ───────────────────────────────────────
async function hasActivity(wallet) {
  const balance = await provider.getBalance(wallet.address);

  // từng có ETH
  if (balance > 0n) return true;

  // từng có transaction
  const txCount = await provider.getTransactionCount(wallet.address);

  return txCount > 0;
}

async function reloadWallets() {
  if (!activeWallet) return;

  allWallets = [];

  const walletData = await getWallet();

  // nếu còn local data thì load nhanh
  if (walletData?.accountCount) {
    for (let i = 0; i < walletData.accountCount; i++) {
      const wallet = ethers.HDNodeWallet.fromPhrase(
        activeWallet.mnemonic.phrase,
        null,
        `m/44'/60'/0'/0/${i}`
      );

      allWallets.push(wallet);
    }
  }

  // // mất local data => scan blockchain
  else {
    let emptyCount = 0;
    let index = 0;

    while (emptyCount < 5) { // test trước, sau tăng lên 20
      const wallet = ethers.HDNodeWallet.fromPhrase(
        activeWallet.mnemonic.phrase,
        null,
        `m/44'/60'/0'/0/${index}`
      );

      const used = await hasActivity(wallet);

      if (used) {
        allWallets.push(wallet);
        emptyCount = 0;
      } else {
        emptyCount++;
      }

      index++;
    }

    // ít nhất phải có account 0
    if (allWallets.length === 0) {
      const wallet = ethers.HDNodeWallet.fromPhrase(
        activeWallet.mnemonic.phrase,
        null,
        `m/44'/60'/0'/0/0`
      );

      allWallets.push(wallet);
    }
  }

  if (activeWalletIndex >= allWallets.length) {
    activeWalletIndex = 0;
  }

  activeWallet = allWallets[activeWalletIndex];
}

async function selectAccount(index) {
  activeWalletIndex = index;
  activeWallet = allWallets[activeWalletIndex];
  saveSession(activeWallet, activeWalletIndex);
  showWallet(activeWallet);
  document.querySelector(".tab[data-tab='tokens']").click();
}

async function addNewAccount() {
  if (!activeWallet.mnemonic.phrase) {
    toast('Please unlock your wallet first', 'error');
    return;
  }

  try {
    const newIndex = allWallets.length;

    const wallet = ethers.HDNodeWallet.fromPhrase(
      activeWallet.mnemonic.phrase,
      null,
      `m/44'/60'/0'/0/${newIndex}`
    );

    allWallets.push(wallet);

    // chỉ cache UI thôi
    await updateAccountCount(allWallets.length);

    await selectAccount(newIndex);

    toast(`Account ${newIndex + 1} created!`, 'success');

  } catch (e) {
    toast(e.message, 'error');
  }
}

// // ── REFRESH ──────────────────────────────────────────────
async function refreshAll() {
  try {
    if (activeWallet) {
      const activeWalletData = await getWalletBalance(activeWallet.address);
      tokens = activeWalletData.tokens;
      walletBalanceUSD = activeWalletData.walletBalanceUSD;

      await refreshBalance();
      await getAllWalletBalanceUSD();
      loadTokens();
      renderSidebar();
    }

  } catch (e) {
    toast('Error refreshing data', 'error');
  }
}

// ── INIT ─────────────────────────────────────────────────
async function init() {
  try {
    const exists = await hasWallet();

    if (!exists) {
      showCreateWalletScreen();
      return;
    }

    const session = loadSession();

    if (session?.mnemonic) {
      const currentMnemonic = session.mnemonic;
      activeWalletIndex = session.activeIndex || 0;
      activeWallet = ethers.HDNodeWallet.fromPhrase(
        currentMnemonic,
        null,
        `m/44'/60'/0'/0/${activeWalletIndex}`
      );
      await reloadWallets();

      showWallet(activeWallet);
      toast('Wallet unlocked!', 'success');
    } else {
      showUnlockScreen();
    }

  } catch (err) {
    console.error(err);
    showCreateWalletScreen();
  }
}
init();

// ── OTP VERIFICATION ──────────────────────────────────────
let otpCallback = null;

async function requestOTP(actionCallback) {
  if (!activeWallet) return;
  document.getElementById('otp-code').value = '';
  document.getElementById('otp-error').textContent = '';
  otpCallback = actionCallback;
  closeAllModals();
  openModal('otp-verification-modal');
}

document.getElementById('otp-verify-btn').addEventListener('click', async () => {
  const otp = document.getElementById('otp-code').value.trim();
  const errEl = document.getElementById('otp-error');
  errEl.textContent = '';
  
  if (!otp || otp.length !== 6) {
    errEl.textContent = 'Please enter a 6-digit OTP';
    return;
  }
  
  try {
    const btn = document.getElementById('otp-verify-btn');
    btn.textContent = 'Verifying...';
    btn.disabled = true;
    
    await api('/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ address: activeWallet.address, otp })
    });
    
    // Success
    closeAllModals();
    if (otpCallback) {
      const cb = otpCallback;
      otpCallback = null;
      await cb();
    }
  } catch (e) {
    errEl.textContent = e.message || 'Invalid OTP';
  } finally {
    const btn = document.getElementById('otp-verify-btn');
    btn.textContent = 'Verify & Proceed';
    btn.disabled = false;
  }
});
// ── CUSTOM TOKENS & SWAP ─────────────────────────────────
async function importToken() {
  const address = document.getElementById('import-token-address').value.trim();
  const errEl = document.getElementById('import-token-error');
  errEl.textContent = '';

  if (!ethers.isAddress(address)) {
    errEl.textContent = 'Invalid contract address';
    return;
  }

  const btn = document.getElementById('import-token-btn');
  btn.textContent = 'Importing...';

  try {
    const contract = new ethers.Contract(address, ["function symbol() view returns (string)", "function decimals() view returns (uint8)"], provider);
    const symbol = await contract.symbol();
    const decimals = Number(await contract.decimals());

    await saveCustomToken({ address, symbol, decimals });

    toast(`Imported token: ${symbol}`, 'success');
    closeAllModals();
    loadTokens(); // refresh token list

    // Add to swap options if not already there
    const selectOut = document.getElementById('swap-token-out');
    if (selectOut && !Array.from(selectOut.options).some(o => o.value === address)) {
      const opt = document.createElement('option');
      opt.value = address;
      opt.textContent = symbol;
      opt.dataset.symbol = symbol;
      selectOut.appendChild(opt);
    }

  } catch (err) {
    errEl.textContent = 'Failed to fetch token info. Ensure it is a valid ERC-20 on Sepolia.';
  } finally {
    btn.innerHTML = '<span>Import Token</span>';
  }
}

const swapAmountIn = document.getElementById('swap-amount-in');
const swapAmountOut = document.getElementById('swap-amount-out');
const swapErrEl = document.getElementById('swap-error');
const swapTokenIn = document.getElementById('swap-token-in');
const swapTokenOut = document.getElementById('swap-token-out');

const SWAP_ROUTER_ADDRESS = '0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008';
let SWAP_WETH_ADDRESS = null;
const SWAP_ABI = [
  'function swapExactETHForTokens(uint amountOutMin,address[] calldata path,address to,uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn,uint amountOutMin,address[] calldata path,address to,uint deadline) external returns (uint[] memory amounts)',
  'function swapExactTokensForTokens(uint amountIn,uint amountOutMin,address[] calldata path,address to,uint deadline) external returns (uint[] memory amounts)',
  'function factory() external view returns (address)',
  'function WETH() external view returns (address)',
  'function getAmountsOut(uint amountIn,address[] calldata path) external view returns (uint[] memory amounts)'
];
const FACTORY_ABI = [
  'function getPair(address tokenA,address tokenB) external view returns (address)'
];
const ERC20_ABI = [
  'function approve(address spender,uint256 amount) external returns (bool)'
];
const routerContract = new ethers.Contract(SWAP_ROUTER_ADDRESS, SWAP_ABI, provider);

async function getRouterWETH() {
  if (!SWAP_WETH_ADDRESS) {
    SWAP_WETH_ADDRESS = await routerContract.WETH();
  }
  return SWAP_WETH_ADDRESS;
}


async function validateSwapPath(path) {
  if (!Array.isArray(path) || path.length < 2) return false;

  const routerContract = new ethers.Contract(SWAP_ROUTER_ADDRESS, SWAP_ABI, provider);
  const factoryAddress = await routerContract.factory();
  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);

  for (let i = 0; i < path.length - 1; i++) {
    const tokenA = ethers.getAddress(path[i]);
    const tokenB = ethers.getAddress(path[i + 1]);
    const pair = await factory.getPair(tokenA, tokenB);
    if (!pair || pair === ethers.ZeroAddress) {
      return false;
    }
  }

  return true;
}

swapAmountIn.addEventListener('input', () => {
  validateSwapAmount();
  updateSwapEstimate();
});
if (swapTokenIn) swapTokenIn.addEventListener('change', () => {
  validateSwapAmount();
  updateSwapEstimate();
  updateSwapIcons();
});
if (swapTokenOut) swapTokenOut.addEventListener('change', () => {
  validateSwapAmount();
  updateSwapEstimate();
  updateSwapIcons();
});

function getSwapToken(value) {
  const key = String(value).trim();
  const symbol = key.toUpperCase();
  let token = tokens.find(t => t.symbol?.toUpperCase() === symbol || (t.address && t.address.toLowerCase() === key.toLowerCase()));
  if (token) return token;
  if (symbol === 'ETH') return tokens[0];
  return {
    symbol: symbol,
    address: key,
    decimals: 18,
    icon: getTokenIcon(symbol),
    balance: 0
  };
}

function getTokenUsdPrice(symbol, marketData) {
  if (!marketData) return null;
  const key = String(symbol).toLowerCase();
  if (key === 'eth') return marketData.eth?.priceUSD ?? null;
  if (key === 'usdc') return marketData.usdc?.priceUSD ?? 1;
  if (key === 'link') return marketData.link?.priceUSD ?? null;
  return marketData[key]?.priceUSD ?? null;
}

function validateSwapAmount() {
  const amount = swapAmountIn.value;
  const tokenIn = getSwapToken(swapTokenIn.value);
  const tokenOut = getSwapToken(swapTokenOut.value);
  swapErrEl.textContent = '';

  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
    swapErrEl.textContent = 'Enter a valid amount';
    swapAmountOut.value = '0.0';
    return false;
  }

  if (!tokenIn || !tokenOut) {
    swapErrEl.textContent = 'Select swap tokens';
    swapAmountOut.value = '0.0';
    return false;
  }

  if (tokenIn.symbol === tokenOut.symbol) {
    swapErrEl.textContent = 'Select different tokens';
    swapAmountOut.value = '0.0';
    return false;
  }

  const balance = Number(tokenIn.balance ?? 0);
  if (parseFloat(amount) > balance) {
    swapErrEl.textContent = 'Insufficient balance';
    return false;
  }

  swapErrEl.textContent = '';
  return true;
}

function backToSwapForm() {
  document.getElementById('swap-review').style.display = 'none';
  document.querySelector('.swap-form').classList.remove('hidden');
}

async function prepareSwapReview() {
  const errEl = swapErrEl;
  errEl.textContent = '';

  if (!activeWallet) {
    errEl.textContent = 'Unlock your wallet before swapping';
    return;
  }

  if (!validateSwapAmount()) return;

  const tokenIn = getSwapToken(swapTokenIn.value);
  const tokenOut = getSwapToken(swapTokenOut.value);
  const amountIn = parseFloat(swapAmountIn.value || '0');
  const amountOut = swapAmountOut.value || '0.0';

  document.getElementById('swap-review').style.display = 'block';
  document.getElementById('swap-review-from').textContent = activeWallet.address;
  document.getElementById('swap-review-to').textContent = `${tokenIn.symbol} → ${tokenOut.symbol}`;
  document.getElementById('swap-review-amount').textContent = `${amountIn.toFixed(4)} ${tokenIn.symbol}`;
  document.getElementById('swap-review-receive').textContent = `${amountOut} ${tokenOut.symbol}`;
  document.getElementById('swap-review-network').textContent = 'Sepolia';

  document.querySelector('.swap-form').classList.add('hidden');
  document.getElementById('swap-review').style.display = 'block';
  document.getElementById('swap-review').scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || 0n;
    const fee = ethers.formatEther(210000n * gasPrice);
    document.getElementById('swap-review-fee').textContent = `${fee} ETH`;
  } catch (e) {
    document.getElementById('swap-review-fee').textContent = 'Auto';
  }
}

async function updateSwapEstimate() {
  if (!swapAmountIn.value || isNaN(swapAmountIn.value) || parseFloat(swapAmountIn.value) <= 0) {
    swapAmountOut.value = '0.0';
    return;
  }

  const tokenIn = getSwapToken(swapTokenIn.value);
  const tokenOut = getSwapToken(swapTokenOut.value);
  if (!tokenIn || !tokenOut || tokenIn.symbol === tokenOut.symbol) {
    swapAmountOut.value = '0.0';
    return;
  }

  try {
    const path = await buildSwapPath(tokenIn, tokenOut);
    if (!path || path.length < 2) {
      swapAmountOut.value = '0.0';
      return;
    }

    const amountInWei = tokenIn.symbol === 'ETH'
      ? ethers.parseEther(swapAmountIn.value)
      : ethers.parseUnits(swapAmountIn.value, tokenIn.decimals || 18);

    const amounts = await routerContract.getAmountsOut(amountInWei, path);
    const outAmount = amounts[amounts.length - 1];

    if (tokenOut.symbol === 'ETH') {
      swapAmountOut.value = ethers.formatEther(outAmount);
    } else {
      swapAmountOut.value = ethers.formatUnits(outAmount, tokenOut.decimals || 18);
    }
  } catch (err) {
    swapAmountOut.value = '0.0';
  }
}

async function buildSwapPath(tokenIn, tokenOut) {
  const weth = await getRouterWETH();
  if (!weth) return null;

  if (tokenIn.symbol === 'ETH') {
    return [weth, tokenOut.address];
  }
  if (tokenOut.symbol === 'ETH') {
    return [tokenIn.address, weth];
  }
  return [tokenIn.address, weth, tokenOut.address];
}

async function approveTokenIfNeeded(tokenIn, amountInWei, nonce, feeData) {
  const approveInterface = new ethers.Interface(ERC20_ABI);
  const approveData = approveInterface.encodeFunctionData('approve', [SWAP_ROUTER_ADDRESS, amountInWei]);
  const approveGasLimit = await provider.estimateGas({
    from: activeWallet.address,
    to: tokenIn.address,
    data: approveData
  });

  const approveTx = {
    to: tokenIn.address,
    data: approveData,
    nonce,
    gasLimit: approveGasLimit,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    chainId: 11155111
  };

  const signedApprove = await activeWallet.signTransaction(approveTx);
  const approveRes = await api('/transaction/send', {
    method: 'POST',
    body: JSON.stringify({ signedTx: signedApprove })
  });

  const approveHash = approveRes.result.hash || approveRes.result;
  await provider.waitForTransaction(approveHash, 1, 120000);
  return approveHash;
}

async function executeSwap() {
  const errEl = swapErrEl;
  errEl.textContent = '';

  if (!activeWallet) {
    errEl.textContent = 'Unlock your wallet before swapping';
    return;
  }

  if (!validateSwapAmount()) return;

  const tokenIn = getSwapToken(swapTokenIn.value);
  const tokenOut = getSwapToken(swapTokenOut.value);
  const amountIn = parseFloat(swapAmountIn.value);
  const amountInWei = tokenIn.symbol === 'ETH'
    ? ethers.parseEther(amountIn.toString())
    : ethers.parseUnits(amountIn.toString(), tokenIn.decimals || 18);

  const path = await buildSwapPath(tokenIn, tokenOut);
  if (!path || path.some(p => !p)) {
    errEl.textContent = 'Swap path could not be constructed. Please choose a valid token pair.';
    return;
  }

  const routeOk = await validateSwapPath(path);
  if (!routeOk) {
    errEl.textContent = 'Swap route unavailable on the current router. Please choose a different pair.';
    return;
  }

  const routerInterface = new ethers.Interface(SWAP_ABI);
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
  let txData;
  let txValue = 0n;

  if (tokenIn.symbol === 'ETH') {
    txData = routerInterface.encodeFunctionData('swapExactETHForTokens', [0, path, activeWallet.address, deadline]);
    txValue = amountInWei;
  } else if (tokenOut.symbol === 'ETH') {
    txData = routerInterface.encodeFunctionData('swapExactTokensForETH', [amountInWei, 0, path, activeWallet.address, deadline]);
  } else {
    txData = routerInterface.encodeFunctionData('swapExactTokensForTokens', [amountInWei, 0, path, activeWallet.address, deadline]);
  }

  const btn = document.getElementById('swap-btn');
  btn.disabled = true;
  btn.querySelector('span:last-child').textContent = 'Swapping...';

  try {
    let nonce = await provider.getTransactionCount(activeWallet.address);
    const feeData = await provider.getFeeData();

    if (tokenIn.symbol !== 'ETH') {
      await approveTokenIfNeeded(tokenIn, amountInWei, nonce, feeData);
      nonce += 1;
    }

    const gasEstimate = await provider.estimateGas({
      from: activeWallet.address,
      to: SWAP_ROUTER_ADDRESS,
      data: txData,
      value: txValue
    });

    const tx = {
      to: SWAP_ROUTER_ADDRESS,
      data: txData,
      value: txValue,
      nonce,
      gasLimit: gasEstimate,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      chainId: 11155111
    };

    const signedTx = await activeWallet.signTransaction(tx);
    const res = await api('/transaction/send', {
      method: 'POST',
      body: JSON.stringify({ signedTx })
    });

    const txHash = res.result.hash || res.result;
    currentPendingTx = {
      hash: txHash,
      from: activeWallet.address,
      to: SWAP_ROUTER_ADDRESS,
      amount: amountIn,
      amountOut: swapAmountOut.value || null,
      tokenIn: tokenIn.symbol,
      tokenOut: tokenOut.symbol,
      type: 'swap',
      status: 'pending',
      timestamp: Date.now(),
      gasFee: ethers.formatEther(gasEstimate * (feeData.maxFeePerGas || feeData.gasPrice))
    };

    addSwapHistoryEntry({ ...currentPendingTx });
    document.getElementById('swap-review').style.display = 'none';
    toast(`Swap transaction submitted! Hash: ${txHash.slice(0, 10)}...`, 'success');
    activateTab('history');
    pollPendingTransactionStatus(txHash);
    swapAmountIn.value = '';
    swapAmountOut.value = '0.0';
  } catch (err) {
    console.error(err);
    errEl.textContent = 'Swap failed: ' + (err.reason || err.message);
  } finally {
    btn.disabled = false;
    btn.querySelector('span:last-child').textContent = 'Swap';
  }
}

async function getWalletBalance(address) {
  const marketData = await api('/tokens/market');

  const ethData = await api(`/wallet/${address}/eth-balance`);
  const ethBalance = parseFloat(ethData.balance);

  const tokens = [
    {
      name: 'Ethereum',
      symbol: 'ETH',
      icon: 'https://assets.coingecko.com/coins/images/279/thumb/ethereum.png',
      price: ethBalance * marketData.eth.priceUSD,
      change24h: marketData.eth.change24h,
      balance: ethBalance,
      badge: 'Earn',
      address: '0xDa6F7b67eCBd74fecF96Eb40f24BDdFf1b460465',
      decimals: 18
    },
    {
      name: 'USD Coin',
      symbol: 'USDC',
      icon: 'https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png',
      price: marketData.usdc.priceUSD,
      change24h: marketData.usdc.change24h,
      balance: 0,
      badge: 'Stablecoin',
      address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      decimals: 6
    },
    {
      name: 'Chainlink',
      symbol: 'LINK',
      icon: 'https://assets.coingecko.com/coins/images/877/thumb/chainlink-new-logo.png',
      price: marketData.link.priceUSD,
      change24h: marketData.link.change24h,
      balance: 0,
      badge: '',
      address: '0x779877A7B0D9E8603169DdbD7836e478b4624789',
      decimals: 18
    }
  ];

  for (const t of tokens) {
    if (t.name !== 'Ethereum') {
      const tokenData = await api(`/wallet/${address}/token-balance?tokenAddress=${t.address}`);
      const tokenBalance = parseFloat(tokenData.balance);
      t.price *= tokenBalance;
      t.balance = tokenBalance;
    }
  }

  const walletBalanceUSD = tokens.reduce((acc, t) => acc + t.price, 0);


  return { tokens, walletBalanceUSD };
}

async function getAllWalletBalanceUSD() {
  for (let i = 0; i < allWallets.length; i++) {
    const w = allWallets[i];
    const walletData = await getWalletBalance(w.address)
    w.balanceUSD = walletData.walletBalanceUSD
  }
}

init();
