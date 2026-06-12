require('dotenv').config();
const axios = require('axios');

const url = `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;

function normalizeHistoryTransaction(tx, fallbackGasFee = '0') {
  const amount = tx.amount ?? tx.value ?? '0';
  const tokenIn = tx.tokenIn || tx.asset || 'ETH';
  const tokenOut = tx.tokenOut || tx.asset || 'ETH';
  const amountOut = tx.amountOut ?? tx.value ?? '0';

  return {
    hash: tx.hash,
    from: tx.from || '',
    to: tx.to || '',
    amount: String(amount),
    amountOut: String(amountOut),
    asset: tx.asset || tokenIn,
    tokenIn,
    tokenOut,
    type: tx.type || 'transfer',
    status: tx.status || 'success',
    timestamp: tx.timestamp || (tx.metadata?.blockTimestamp ? new Date(tx.metadata.blockTimestamp).getTime() : Date.now()),
    gasFee: tx.gasFee ?? fallbackGasFee,
    metadata: tx.metadata || {}
  };
}

function groupSwapTransactions(transfers, walletAddress = null) {
  const grouped = new Map();

  for (const tx of transfers) {
    const timestamp = tx.metadata?.blockTimestamp || 0;
    const key = `${tx.hash || 'unknown'}:${String(timestamp)}`;

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    grouped.get(key).push(tx);
  }

  const merged = [];

  for (const items of grouped.values()) {
    if (items.length < 2) {
      merged.push(...items);
      continue;
    }

    const normalizedWallet = walletAddress?.toLowerCase();
    const fromWalletTx = normalizedWallet
      ? items.find((item) => item.from?.toLowerCase() === normalizedWallet)
      : null;
    const toWalletTx = normalizedWallet
      ? items.find((item) => item.to?.toLowerCase() === normalizedWallet)
      : null;
    const inTx = items.find((item) => item.type === 'in');
    const outTx = items.find((item) => item.type === 'out');

    const hasWalletDirection = Boolean(fromWalletTx && toWalletTx);
    const inputTx = hasWalletDirection ? fromWalletTx : inTx || items[0];
    const outputTx = hasWalletDirection ? toWalletTx : outTx || items[1];

    const isSwapCandidate = inputTx && outputTx && inputTx !== outputTx;

    if (isSwapCandidate) {
      const timestamp = new Date(inputTx.metadata?.blockTimestamp || outputTx.metadata?.blockTimestamp || 0).getTime();

      merged.push({
        hash: inputTx.hash || outputTx.hash,
        from: inputTx.from || outputTx.from || '',
        to: outputTx.to || inputTx.to || '',
        amount: inputTx.value ? String(inputTx.value) : '0',
        amountOut: outputTx.value ? String(outputTx.value) : '0',
        asset: inputTx.asset || outputTx.asset || 'ETH',
        tokenIn: inputTx.asset || 'ETH',
        tokenOut: outputTx.asset || 'ETH',
        type: 'swap',
        status: 'success',
        timestamp,
        metadata: inputTx.metadata || outputTx.metadata || {},
        value: inputTx.value || outputTx.value || '0'
      });
      continue;
    }

    merged.push(...items);

    merged.push(...items);
  }

  return merged.sort((a, b) => {
    const t1 = a.timestamp || new Date(a.metadata?.blockTimestamp || 0).getTime();
    const t2 = b.timestamp || new Date(b.metadata?.blockTimestamp || 0).getTime();
    return t2 - t1;
  });
}

async function getTransactions(address) {
  if (!process.env.ALCHEMY_API_KEY) {
    console.warn("⚠️ ALCHEMY_API_KEY is missing. Returning empty history.");
    return [];
  }

  const baseBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "alchemy_getAssetTransfers"
  };

  const [inRes, outRes] = await Promise.all([
    axios.post(url, {
      ...baseBody,
      params: [{
        fromBlock: "0x0",
        toAddress: address,
        category: ["external", "erc20"],
        withMetadata: true
      }]
    }),
    axios.post(url, {
      ...baseBody,
      params: [{
        fromBlock: "0x0",
        fromAddress: address,
        category: ["external", "erc20"],
        withMetadata: true
      }]
    })
  ]);

  const inTxs = (inRes.data.result?.transfers || []).map(tx => ({
    ...tx,
    type: "in"
  }));

  const outTxs = (outRes.data.result?.transfers || []).map(tx => ({
    ...tx,
    type: "out"
  }));

  const allTxs = [...inTxs, ...outTxs];

  return groupSwapTransactions(allTxs, address);
}

async function getGasFeeTransaction(txHash) {
  if (!process.env.ALCHEMY_API_KEY) return {};
  
  const res = await axios.post(url, {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getTransactionReceipt",
    params: [txHash]
  });

  return res.data.result;
}

module.exports = {
    getTransactions,
    getGasFeeTransaction,
    groupSwapTransactions,
    normalizeHistoryTransaction
};