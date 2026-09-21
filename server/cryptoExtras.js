const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { ts: 0, data: null };

async function fetchJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function oiChangePct(hist) {
  if (!Array.isArray(hist) || hist.length < 2) return null;
  const first = Number(hist[0]?.sumOpenInterest || hist[0]?.openInterest || 0);
  const last = Number(hist[hist.length - 1]?.sumOpenInterest || hist[hist.length - 1]?.openInterest || 0);
  if (first <= 0 || last <= 0) return null;
  return ((last - first) / first) * 100;
}

function latestMvrv(payload) {
  const rows = payload?.data;
  if (!Array.isArray(rows) || !rows.length) return null;
  const last = rows[rows.length - 1];
  const val = Number(last?.CapMVRVCur);
  return Number.isFinite(val) ? val : null;
}

function packDerivatives(premium, openInterest, oiHist) {
  const fundingRate = Number(premium?.lastFundingRate);
  const markPrice = Number(premium?.markPrice);
  const oi = Number(openInterest?.openInterest);
  return {
    fundingRate: Number.isFinite(fundingRate) ? fundingRate : null,
    fundingPct: Number.isFinite(fundingRate) ? fundingRate * 100 : null,
    markPrice: Number.isFinite(markPrice) ? markPrice : null,
    openInterest: Number.isFinite(oi) ? oi : null,
    oiChangePct: oiChangePct(oiHist)
  };
}

export async function getCryptoMarketExtras() {
  if (cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.data;
  }

  const [
    btcPrem, ethPrem, btcOi, ethOi, btcOiHist, ethOiHist, btcMvrv, ethMvrv
  ] = await Promise.allSettled([
    fetchJson('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT'),
    fetchJson('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=ETHUSDT'),
    fetchJson('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT'),
    fetchJson('https://fapi.binance.com/fapi/v1/openInterest?symbol=ETHUSDT'),
    fetchJson('https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1d&limit=2'),
    fetchJson('https://fapi.binance.com/futures/data/openInterestHist?symbol=ETHUSDT&period=1d&limit=2'),
    fetchJson('https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur&frequency=1d&paging_from=end&page_size=1'),
    fetchJson('https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=eth&metrics=CapMVRVCur&frequency=1d&paging_from=end&page_size=1')
  ]);

  const value = (result) => (result.status === 'fulfilled' ? result.value : null);

  const data = {
    updatedAt: new Date().toISOString(),
    bitcoin: {
      ...packDerivatives(value(btcPrem), value(btcOi), value(btcOiHist)),
      mvrv: latestMvrv(value(btcMvrv))
    },
    ethereum: {
      ...packDerivatives(value(ethPrem), value(ethOi), value(ethOiHist)),
      mvrv: latestMvrv(value(ethMvrv))
    }
  };

  cache = { ts: Date.now(), data };
  return data;
}
