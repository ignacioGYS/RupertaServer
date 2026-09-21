import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Coins, 
  RefreshCw, 
  Clock, 
  ShieldCheck, 
  Wallet, 
  Sparkles, 
  AlertCircle, 
  ArrowUpRight, 
  ArrowDownRight, 
  ExternalLink, 
  Copy, 
  Check, 
  Edit3, 
  Calculator,
  Info
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine 
} from 'recharts';

function formatUsd(val) {
  if (!Number.isFinite(val)) return '--';
  if (Math.abs(val) >= 1) {
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return val.toFixed(4);
}

function percentileInRange(price, min, max) {
  if (!Number.isFinite(price) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return 50;
  }
  return Math.max(0, Math.min(100, ((price - min) / (max - min)) * 100));
}

function sliceStats(closes, days) {
  const slice = closes.slice(-days);
  if (!slice.length) return { min: 0, max: 0, first: 0, last: 0, closes: [] };
  return {
    min: Math.min(...slice),
    max: Math.max(...slice),
    first: slice[0],
    last: slice[slice.length - 1],
    closes: slice
  };
}

// Un punto por día (último close) para que el RSI sea realmente diario,
// aunque CoinGecko a veces entregue series horarias.
function toDailyCloses(rawPrices) {
  const byDay = new Map();
  for (const [timestamp, price] of rawPrices) {
    const day = new Date(timestamp).toISOString().slice(0, 10);
    byDay.set(day, { timestamp, price });
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, point]) => point);
}

// ── RSI sobre velas diarias (Wilder, 14 períodos) ───────────────────────────
function calculateRSI(prices, period = 14) {
  if (!prices || prices.length <= period) return 50;
  
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - (100 / (1 + rs))) * 10) / 10;
}

function fngWeightFor(coinId) {
  if (coinId === 'bitcoin') return 1;
  if (coinId === 'ethereum') return 0.5;
  if (coinId === 'ergo') return 0.35;
  return 0;
}

// ── Evaluación de zona de entrada (filtro, no orden de compra) ──────────────
function evaluateOpportunity({
  rsi,
  change24h,
  change7d,
  fearAndGreed,
  range14Pct,
  range90Pct,
  avgBuyPrice,
  currentPrice,
  coinId,
  coinName,
  btcChange24h
}) {
  if (coinId === 'tether') {
    return {
      score: null,
      reasons: [
        'USDT es liquidez, no un activo con timing de compra.',
        'El riesgo relevante es depeg o emisor, no sobrecompra/sobreventa.'
      ],
      verdict: {
        level: 'stable',
        label: 'Liquidez / Sin timing',
        color: '#26A17B',
        bg: 'rgba(38, 161, 123, 0.15)',
        actionText: 'No hay zona de compra. Usalo para preservar dólares, no para “entrar barato”.'
      }
    };
  }

  let score = 50;
  const reasons = [];

  // 1. RSI diario (peso alto, pero no único)
  if (rsi <= 25) {
    score += 28;
    reasons.push('RSI diario en sobreventa extrema (<25): zona clásica de acumulación.');
  } else if (rsi <= 35) {
    score += 18;
    reasons.push('RSI diario en sobreventa (<35): descuento técnico favorable.');
  } else if (rsi <= 45) {
    score += 8;
    reasons.push('RSI diario por debajo de la media (35-45): aún hay margen, sin señal extrema.');
  } else if (rsi <= 60) {
    reasons.push('RSI diario en rango neutral (45-60): sin ventaja técnica clara.');
  } else if (rsi <= 70) {
    score -= 12;
    reasons.push('RSI diario elevado (60-70): el impulso comprador empieza a agotarse.');
  } else {
    score -= 24;
    reasons.push('RSI diario en sobrecompra (>70): alto riesgo de corrección de corto plazo.');
  }

  // 2. Posición en el rango de 90 días (señal más accionable)
  if (range90Pct <= 15) {
    score += 18;
    reasons.push(`Precio en el piso de 90 días (${range90Pct.toFixed(0)}% del rango): zona históricamente descontada.`);
  } else if (range90Pct <= 30) {
    score += 12;
    reasons.push(`Precio en el tercio inferior de 90 días (${range90Pct.toFixed(0)}% del rango).`);
  } else if (range90Pct >= 85) {
    score -= 18;
    reasons.push(`Precio en el techo de 90 días (${range90Pct.toFixed(0)}% del rango): poco margen de seguridad.`);
  } else if (range90Pct >= 70) {
    score -= 10;
    reasons.push(`Precio en la parte alta de 90 días (${range90Pct.toFixed(0)}% del rango).`);
  }

  // 3. Confirmación con rango de 14 días
  if (range14Pct <= 15 && range90Pct < 50) {
    score += 8;
    reasons.push('También está cerca del mínimo de 14 días: doble confirmación de piso local.');
  } else if (range14Pct >= 90) {
    score -= 8;
    reasons.push('Máximos locales de 14 días: esperar un retroceso antes de agregar.');
  }

  // 4. Fear & Greed: peso pleno en BTC, reducido en alts (el índice es de Bitcoin)
  const fngVal = fearAndGreed?.value ? parseInt(fearAndGreed.value, 10) : 50;
  const fngW = fngWeightFor(coinId);
  if (fngW > 0) {
    if (fngVal <= 25) {
      const pts = Math.round(18 * fngW);
      score += pts;
      reasons.push(
        coinId === 'bitcoin'
          ? `Miedo extremo en Fear & Greed (${fngVal}): históricamente una de las mejores ventanas para BTC.`
          : `Miedo extremo en el mercado de Bitcoin (índice ${fngVal}): puede arrastrar a ${coinName}, pero no es un indicador nativo de esta moneda.`
      );
    } else if (fngVal <= 45) {
      const pts = Math.round(8 * fngW);
      score += pts;
      if (coinId === 'bitcoin') {
        reasons.push('Sentimiento de cautela/miedo en BTC: precios habitualmente más contenidos.');
      }
    } else if (fngVal >= 75) {
      const pts = Math.round(14 * fngW);
      score -= pts;
      reasons.push(
        coinId === 'bitcoin'
          ? `Codicia extrema en Fear & Greed (${fngVal}): cuidado con entrar por FOMO.`
          : `Codicia extrema en Bitcoin (índice ${fngVal}): el mercado suele estar caliente también para alts.`
      );
    }
  }

  // 5. Precio vs tu costo promedio
  if (avgBuyPrice > 0 && currentPrice > 0) {
    const vsCost = ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100;
    if (vsCost <= -15) {
      score += 10;
      reasons.push(`Está ${Math.abs(vsCost).toFixed(0)}% por debajo de tu precio promedio: el DCA mejora el costo.`);
    } else if (vsCost <= -5) {
      score += 5;
      reasons.push(`Está ${Math.abs(vsCost).toFixed(0)}% bajo tu costo promedio: zona razonable para promediar.`);
    } else if (vsCost >= 25) {
      score -= 8;
      reasons.push(`Está ${vsCost.toFixed(0)}% por encima de tu costo: comprar ahora encarece el promedio.`);
    }
  }

  // 6. Contexto de Bitcoin para alts (evitar cuchillo)
  if (coinId !== 'bitcoin' && Number.isFinite(btcChange24h)) {
    if (btcChange24h <= -5) {
      score -= 12;
      reasons.push(`Bitcoin cae ${btcChange24h.toFixed(1)}% en 24h: las alts suelen seguir. Evitar comprar el cuchillo.`);
    } else if (btcChange24h <= -3) {
      score -= 6;
      reasons.push(`Bitcoin débil (${btcChange24h.toFixed(1)}% en 24h): mejor esperar que se estabilice antes de entrar a ${coinName}.`);
    }
  }

  // 7. Momentum propio 24h / 7d
  if (change24h > 12) {
    score -= 8;
    reasons.push('Rally fuerte en 24h: alto riesgo de entrar por FOMO.');
  } else if (change24h < -10 && !(coinId !== 'bitcoin' && btcChange24h <= -5)) {
    score += 5;
    reasons.push('Caída intradía pronunciada con BTC relativamente estable: posible zona de rebote.');
  }

  if (change7d < -12) {
    score += 8;
    reasons.push('Caída semanal pronunciada: ventana típica de corrección para DCA.');
  } else if (change7d > 25) {
    score -= 8;
    reasons.push('Rally parabólico semanal: esperar un retroceso antes de comprar.');
  }

  score = Math.max(5, Math.min(98, Math.round(score)));

  let verdict = {
    level: 'neutral',
    label: 'Neutral / Mantener',
    color: '#94A3B8',
    bg: 'rgba(148, 163, 184, 0.12)',
    actionText: 'Sin ventaja clara. Esperar un piso de rango o mantener si ya estás posicionado.'
  };

  if (score >= 78) {
    verdict = {
      level: 'strong_buy',
      label: 'Zona Fuerte de Compra',
      color: '#00E676',
      bg: 'rgba(0, 230, 118, 0.15)',
      actionText: 'Filtro alineado: precio descontado vs 90 días y técnico a favor. Seguí con compras escalonadas, no con todo el capital.'
    };
  } else if (score >= 60) {
    verdict = {
      level: 'buy',
      label: 'Acumulación Gradual (DCA)',
      color: '#00F2FE',
      bg: 'rgba(0, 242, 254, 0.15)',
      actionText: 'Zona razonable para compras chicas y repetidas, sin apurarse ni vaciar liquidez.'
    };
  } else if (score < 40) {
    verdict = {
      level: 'caution',
      label: 'Cautela / No Comprar',
      color: '#FF1744',
      bg: 'rgba(255, 23, 68, 0.15)',
      actionText: 'El filtro no favorece entrar ahora. Esperar un retroceso de rango o mejores condiciones técnicas.'
    };
  }

  return { score, reasons, verdict };
}

function RangeBar({ label, pct, min, max }) {
  const pos = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 50;
  const zoneColor = pos <= 30 ? '#00E676' : pos >= 70 ? '#FF1744' : '#00F2FE';

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: zoneColor }}>{pos.toFixed(0)}%</span>
      </div>
      <div style={{ position: 'relative', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px' }}>
        <div style={{
          position: 'absolute',
          left: 0,
          width: '30%',
          height: '100%',
          background: 'rgba(0, 230, 118, 0.18)',
          borderRadius: '4px 0 0 4px'
        }} />
        <div style={{
          position: 'absolute',
          right: 0,
          width: '30%',
          height: '100%',
          background: 'rgba(255, 23, 68, 0.18)',
          borderRadius: '0 4px 4px 0'
        }} />
        <div style={{
          position: 'absolute',
          left: `calc(${pos}% - 6px)`,
          top: '-3px',
          width: '12px',
          height: '14px',
          borderRadius: '3px',
          background: zoneColor,
          boxShadow: `0 0 8px ${zoneColor}`
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '6px' }}>
        <span>Piso ${formatUsd(min)}</span>
        <span>Techo ${formatUsd(max)}</span>
      </div>
    </div>
  );
}

const EMPTY_HISTORY = {
  rsi: 50,
  change7d: 0,
  chart: [],
  min14: 0,
  max14: 0,
  min90: 0,
  max90: 0,
  range14Pct: 50,
  range90Pct: 50
};

const DEFAULT_HOLDINGS = {
  bitcoin: { amount: 0, avgBuyPrice: 0 },
  ethereum: { amount: 0, avgBuyPrice: 0 },
  ergo: { amount: 0, avgBuyPrice: 0 }
};

const SUPPORTED_COINS = [
  {
    id: 'ergo',
    name: 'Ergo',
    symbol: 'ERG',
    color: '#EF4B4B',
    badge: 'Σ',
    description: 'Plataforma Proof-of-Work eUTXO con contratos inteligentes y DeFi segura.'
  },
  {
    id: 'bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    color: '#FF9100',
    badge: '₿',
    description: 'Reserva de valor líder del ecosistema cripto y termómetro general del mercado.'
  },
  {
    id: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    color: '#627EEA',
    badge: 'Ξ',
    description: 'Ecosistema de finanzas descentralizadas y computación global por contratos inteligentes.'
  },
  {
    id: 'tether',
    name: 'Tether',
    symbol: 'USDT',
    color: '#26A17B',
    badge: '₮',
    description: 'Stablecoin vinculada 1:1 con el dólar estadounidense para preservar liquidez.'
  }
];

const HOLDING_COINS = SUPPORTED_COINS.filter(c => c.id !== 'tether');

const PRICE_CACHE_KEY = 'ruperta-crypto-price-cache';

function loadPriceCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(PRICE_CACHE_KEY) || 'null');
    if (saved?.prices && typeof saved.prices === 'object') return saved.prices;
  } catch (_) {}
  return null;
}

function savePriceCache(prices) {
  try {
    localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({ prices, ts: Date.now() }));
  } catch (_) {}
}

export default function CryptoRadar() {
  const [selectedCoinId, setSelectedCoinId] = useState('ergo');
  const [prices, setPrices] = useState(() => loadPriceCache() || {});
  const [chartDataMap, setChartDataMap] = useState({});
  const [fearAndGreed, setFearAndGreed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);

  const [ergoAddress, setErgoAddress] = useState(() => {
    return localStorage.getItem('ruperta-ergo-wallet') || '';
  });
  const [inputAddress, setInputAddress] = useState('');
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [ergoBalance, setErgoBalance] = useState(null);
  const [ergoLoading, setErgoLoading] = useState(false);
  const [ergoError, setErgoError] = useState(null);
  const [copied, setCopied] = useState(false);

  const [holdings, setHoldings] = useState(() => {
    try {
      const saved = localStorage.getItem('ruperta-crypto-holdings');
      if (saved) return { ...DEFAULT_HOLDINGS, ...JSON.parse(saved) };
    } catch (_) {}
    return { ...DEFAULT_HOLDINGS };
  });
  const [isEditingHoldings, setIsEditingHoldings] = useState(false);
  const [draftHoldings, setDraftHoldings] = useState(null);

  const [dcaUsd, setDcaUsd] = useState('100');
  const selectedCoinIdRef = useRef(selectedCoinId);
  selectedCoinIdRef.current = selectedCoinId;

  const persistHoldings = (next) => {
    setHoldings(next);
    localStorage.setItem('ruperta-crypto-holdings', JSON.stringify(next));
  };

  const startEditingHoldings = () => {
    setDraftHoldings({
      bitcoin: { amount: holdings.bitcoin?.amount || 0, avgBuyPrice: holdings.bitcoin?.avgBuyPrice || 0 },
      ethereum: { amount: holdings.ethereum?.amount || 0, avgBuyPrice: holdings.ethereum?.avgBuyPrice || 0 },
      ergo: {
        amount: holdings.ergo?.amount || 0,
        avgBuyPrice: holdings.ergo?.avgBuyPrice || 0,
        autoSynced: holdings.ergo?.autoSynced
      }
    });
    setIsEditingHoldings(true);
  };

  const saveHoldings = () => {
    if (!draftHoldings) return;
    persistHoldings({
      bitcoin: {
        amount: Number(draftHoldings.bitcoin?.amount) || 0,
        avgBuyPrice: Number(draftHoldings.bitcoin?.avgBuyPrice) || 0
      },
      ethereum: {
        amount: Number(draftHoldings.ethereum?.amount) || 0,
        avgBuyPrice: Number(draftHoldings.ethereum?.avgBuyPrice) || 0
      },
      ergo: {
        amount: Number(draftHoldings.ergo?.amount) || 0,
        avgBuyPrice: Number(draftHoldings.ergo?.avgBuyPrice) || 0,
        autoSynced: false
      }
    });
    setIsEditingHoldings(false);
    setDraftHoldings(null);
  };

  const updateDraft = (coinId, field, value) => {
    setDraftHoldings(prev => ({
      ...prev,
      [coinId]: {
        ...prev[coinId],
        [field]: value,
        ...(coinId === 'ergo' ? { autoSynced: false } : {})
      }
    }));
  };

  const fetchMarketData = async () => {
    try {
      setError(null);

      try {
        const fngRes = await fetch('https://api.alternative.me/fng/?limit=1');
        const fngJson = await fngRes.json();
        if (fngJson?.data?.[0]) {
          setFearAndGreed(fngJson.data[0]);
        }
      } catch (e) {
        console.warn('Error fetching Fear & Greed:', e);
      }

      const coinIds = SUPPORTED_COINS.map(c => c.id).join(',');
      try {
        const priceRes = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd&include_24hr_change=true`
        );
        if (!priceRes.ok) throw new Error(`CoinGecko precios HTTP ${priceRes.status}`);
        const priceJson = await priceRes.json();
        setPrices(priceJson);
        savePriceCache(priceJson);
      } catch (priceErr) {
        console.warn('Error fetching live prices:', priceErr);
        const cached = loadPriceCache();
        if (cached) {
          setPrices(cached);
          setError('Cotización en vivo limitada; se muestra el último precio conocido más el histórico.');
        } else {
          setError('CoinGecko limitó las cotizaciones en vivo. El evaluador usa el cierre diario del gráfico.');
        }
      }

      await fetchHistoricalChart(selectedCoinIdRef.current);

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error in fetchMarketData:', err);
      setError('Error al sincronizar datos del mercado cripto');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // days=91 fuerza velas diarias en CoinGecko (≤90 días viene horario)
  const fetchHistoricalChart = async (coinId) => {
    if (coinId === 'tether') return;
    try {
      const chartRes = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=91`
      );
      if (!chartRes.ok) return;
      const chartJson = await chartRes.json();
      const rawPrices = chartJson?.prices;
      if (!rawPrices?.length) return;

      const daily = toDailyCloses(rawPrices);
      const dailyCloses = daily.map(d => d.price);
      const rsiValue = calculateRSI(dailyCloses, 14);
      const stats14 = sliceStats(dailyCloses, 14);
      const stats90 = sliceStats(dailyCloses, dailyCloses.length);
      const currentClose = dailyCloses[dailyCloses.length - 1];
      const sevenAgo = dailyCloses[Math.max(0, dailyCloses.length - 8)];
      const change7d = sevenAgo > 0 ? ((currentClose - sevenAgo) / sevenAgo) * 100 : 0;

      const formattedData = daily.map(({ timestamp, price }) => {
        const date = new Date(timestamp);
        return {
          date: `${date.getDate()}/${date.getMonth() + 1}`,
          rawTime: timestamp,
          price: Number(price >= 1 ? price.toFixed(2) : price.toFixed(4)),
          fullPrice: price
        };
      });

      setChartDataMap(prev => ({
        ...prev,
        [coinId]: {
          chart: formattedData,
          rsi: rsiValue,
          change7d,
          min14: stats14.min,
          max14: stats14.max,
          min90: stats90.min,
          max90: stats90.max,
          range14Pct: percentileInRange(currentClose, stats14.min, stats14.max),
          range90Pct: percentileInRange(currentClose, stats90.min, stats90.max)
        }
      }));

      const prevDay = dailyCloses[Math.max(0, dailyCloses.length - 2)];
      const dayChange = prevDay > 0 ? ((currentClose - prevDay) / prevDay) * 100 : 0;
      setPrices(prev => {
        if (prev[coinId]?.usd) return prev;
        return {
          ...prev,
          [coinId]: {
            usd: currentClose,
            usd_24h_change: Number.isFinite(prev[coinId]?.usd_24h_change) ? prev[coinId].usd_24h_change : dayChange
          }
        };
      });
    } catch (e) {
      console.warn(`Error fetching chart for ${coinId}:`, e);
    }
  };

  const fetchErgoWalletBalance = async (addressToQuery) => {
    const addr = (addressToQuery || ergoAddress).trim();
    if (!addr) {
      setErgoBalance(null);
      return;
    }

    setErgoLoading(true);
    setErgoError(null);
    try {
      const res = await fetch(`https://api.ergoplatform.com/api/v1/addresses/${addr}/balance/confirmed`);
      if (!res.ok) {
        throw new Error('Dirección de Ergo no encontrada o checksum inválido.');
      }
      const data = await res.json();
      
      const nanoErgs = Number(data.nanoErgs || 0);
      const ergs = nanoErgs / 1e9;
      
      setErgoBalance({
        ergs,
        nanoErgs,
        tokens: data.tokens || []
      });

      setHoldings(prev => {
        if (prev.ergo.amount === 0 || prev.ergo.autoSynced) {
          const updated = {
            ...prev,
            ergo: { ...prev.ergo, amount: ergs, autoSynced: true }
          };
          localStorage.setItem('ruperta-crypto-holdings', JSON.stringify(updated));
          return updated;
        }
        return prev;
      });

    } catch (err) {
      console.error('Error fetching Ergo balance:', err);
      setErgoError(err.message || 'Error al consultar el saldo en Ergo Explorer');
      setErgoBalance(null);
    } finally {
      setErgoLoading(false);
    }
  };

  const handleSaveErgoAddress = () => {
    const cleaned = inputAddress.trim();
    if (!cleaned) return;
    setErgoAddress(cleaned);
    localStorage.setItem('ruperta-ergo-wallet', cleaned);
    setIsEditingAddress(false);
    fetchErgoWalletBalance(cleaned);
  };

  const handleCopyAddress = () => {
    if (!ergoAddress) return;
    navigator.clipboard.writeText(ergoAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    fetchMarketData();
    if (ergoAddress) {
      fetchErgoWalletBalance(ergoAddress);
    }

    const interval = setInterval(() => {
      fetchMarketData();
      if (ergoAddress) fetchErgoWalletBalance(ergoAddress);
    }, 3 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedCoinId && selectedCoinId !== 'tether' && !chartDataMap[selectedCoinId]) {
      fetchHistoricalChart(selectedCoinId);
    }
  }, [selectedCoinId]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchMarketData();
    if (ergoAddress) fetchErgoWalletBalance(ergoAddress);
  };

  const activeCoinMeta = SUPPORTED_COINS.find(c => c.id === selectedCoinId) || SUPPORTED_COINS[0];
  const activeCoinHistory = chartDataMap[selectedCoinId] || EMPTY_HISTORY;
  const chartLastPrice = activeCoinHistory.chart?.[activeCoinHistory.chart.length - 1]?.fullPrice;
  const activeCoinPrice = prices[selectedCoinId]?.usd || chartLastPrice || 0;
  const activeCoin24hChange = prices[selectedCoinId]?.usd_24h_change || 0;
  const btcChange24h = prices.bitcoin?.usd_24h_change;
  const activeHolding = holdings[selectedCoinId] || { amount: 0, avgBuyPrice: 0 };
  const vsCostPct = activeHolding.avgBuyPrice > 0 && activeCoinPrice > 0
    ? ((activeCoinPrice - activeHolding.avgBuyPrice) / activeHolding.avgBuyPrice) * 100
    : null;
  const showBtcWarning = selectedCoinId !== 'bitcoin' && selectedCoinId !== 'tether' && Number.isFinite(btcChange24h) && btcChange24h <= -3;

  const historyReady = selectedCoinId === 'tether' || Boolean(chartDataMap[selectedCoinId]);

  const opportunityAnalysis = useMemo(() => {
    if (!historyReady) {
      return {
        score: null,
        reasons: ['Sincronizando velas diarias de 90 días para RSI y rangos.'],
        verdict: {
          level: 'neutral',
          label: 'Cargando...',
          color: '#94A3B8',
          bg: 'rgba(148, 163, 184, 0.12)',
          actionText: 'Esperá a que llegue el histórico antes de leer el veredicto.'
        }
      };
    }
    return evaluateOpportunity({
      rsi: activeCoinHistory.rsi,
      change24h: activeCoin24hChange,
      change7d: activeCoinHistory.change7d,
      fearAndGreed,
      range14Pct: activeCoinHistory.range14Pct,
      range90Pct: activeCoinHistory.range90Pct,
      avgBuyPrice: activeHolding.avgBuyPrice || 0,
      currentPrice: activeCoinPrice,
      coinId: selectedCoinId,
      coinName: activeCoinMeta.name,
      btcChange24h
    });
  }, [
    activeCoinHistory.rsi,
    activeCoinHistory.change7d,
    activeCoinHistory.range14Pct,
    activeCoinHistory.range90Pct,
    activeCoin24hChange,
    fearAndGreed,
    activeHolding.avgBuyPrice,
    activeCoinPrice,
    selectedCoinId,
    activeCoinMeta.name,
    btcChange24h,
    historyReady
  ]);

  const portfolioSummary = useMemo(() => {
    let totalUsd = 0;
    let totalCostUsd = 0;

    HOLDING_COINS.forEach(coin => {
      const h = holdings[coin.id] || { amount: 0, avgBuyPrice: 0 };
      const currentP = prices[coin.id]?.usd || chartDataMap[coin.id]?.chart?.[chartDataMap[coin.id].chart.length - 1]?.fullPrice || 0;
      totalUsd += h.amount * currentP;
      totalCostUsd += h.amount * h.avgBuyPrice;
    });

    const pnlUsd = totalUsd - totalCostUsd;
    const pnlPercent = totalCostUsd > 0 ? (pnlUsd / totalCostUsd) * 100 : 0;

    return { totalUsd, totalCostUsd, pnlUsd, pnlPercent };
  }, [holdings, prices, chartDataMap]);

  const dcaSimulation = useMemo(() => {
    if (selectedCoinId === 'tether') return null;
    const currentH = holdings[selectedCoinId] || { amount: 0, avgBuyPrice: 0 };
    const currentP = activeCoinPrice;
    const addUsd = parseFloat(dcaUsd) || 0;
    if (currentP <= 0 || addUsd <= 0) return null;

    const coinsBought = addUsd / currentP;
    const newTotalAmount = currentH.amount + coinsBought;
    const newTotalCost = (currentH.amount * currentH.avgBuyPrice) + addUsd;
    const newAvgPrice = newTotalAmount > 0 ? newTotalCost / newTotalAmount : currentP;
    const priceDiffPct = currentH.avgBuyPrice > 0 
      ? ((newAvgPrice - currentH.avgBuyPrice) / currentH.avgBuyPrice) * 100 
      : 0;

    return {
      coinsBought,
      newTotalAmount,
      newAvgPrice,
      priceDiffPct
    };
  }, [selectedCoinId, activeCoinPrice, holdings, dcaUsd]);

  const inputStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    padding: '8px 10px',
    color: '#fff',
    fontSize: '0.85rem',
    fontWeight: 600
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '30px' }}>
      
      <div className="glass-card" style={{ padding: '20px', display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'space-between', alignItems: 'center' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ 
            width: '46px', 
            height: '46px', 
            borderRadius: '12px', 
            background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.2) 0%, rgba(79, 172, 254, 0.2) 100%)',
            border: '1px solid rgba(0, 242, 254, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-primary)'
          }}>
            <Coins size={24} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
              Valor Total de Cartera
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
              <span style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: '#fff' }}>
                ${formatUsd(portfolioSummary.totalUsd)}
              </span>
              {portfolioSummary.totalCostUsd > 0 && (
                <span style={{ 
                  fontSize: '0.85rem', 
                  fontWeight: 700, 
                  color: portfolioSummary.pnlUsd >= 0 ? '#00E676' : '#FF1744',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px'
                }}>
                  {portfolioSummary.pnlUsd >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {portfolioSummary.pnlUsd >= 0 ? '+' : ''}${formatUsd(portfolioSummary.pnlUsd)} ({portfolioSummary.pnlPercent.toFixed(1)}%)
                </span>
              )}
            </div>
          </div>
        </div>

        {fearAndGreed && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '14px', 
            background: 'rgba(0,0,0,0.25)', 
            padding: '10px 18px', 
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.06)'
          }}>
            <div style={{ textAlign: 'right' }}>
              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Fear & Greed (Bitcoin)</span>
              <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                {fearAndGreed.value_classification}
              </span>
            </div>
            <div style={{ 
              width: '42px', 
              height: '42px', 
              borderRadius: '50%', 
              background: parseInt(fearAndGreed.value, 10) >= 70 ? 'rgba(255, 145, 0, 0.2)' : parseInt(fearAndGreed.value, 10) <= 30 ? 'rgba(0, 230, 118, 0.2)' : 'rgba(0, 242, 254, 0.2)',
              border: `2px solid ${parseInt(fearAndGreed.value, 10) >= 70 ? '#FF9100' : parseInt(fearAndGreed.value, 10) <= 30 ? '#00E676' : '#00F2FE'}`,
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              fontWeight: 800,
              fontSize: '0.95rem',
              color: '#fff'
            }}>
              {fearAndGreed.value}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {lastUpdated && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} /> {lastUpdated.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button 
            onClick={handleManualRefresh} 
            disabled={refreshing}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              background: 'rgba(255,255,255,0.06)', 
              border: '1px solid rgba(255,255,255,0.1)', 
              borderRadius: '8px', 
              padding: '8px 14px', 
              color: 'var(--text-primary)', 
              fontSize: '0.8rem', 
              cursor: refreshing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <RefreshCw size={14} className={refreshing ? 'upload-spin-icon' : ''} />
            <span>{refreshing ? 'Analizando...' : 'Actualizar'}</span>
          </button>
        </div>

      </div>

      {error && (
        <div className="glass-card" style={{ padding: '12px 16px', color: '#FF1744', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
        gap: '16px' 
      }}>
        {SUPPORTED_COINS.map(coin => {
          const priceObj = prices[coin.id];
          const isSelected = selectedCoinId === coin.id;
          const liveP = prices[coin.id]?.usd;
          const chartP = chartDataMap[coin.id]?.chart?.[chartDataMap[coin.id].chart.length - 1]?.fullPrice;
          const currentP = liveP || chartP || 0;
          const ch24h = priceObj?.usd_24h_change || 0;
          const holding = holdings[coin.id];
          const hasHolding = holding && holding.amount > 0;

          return (
            <div 
              key={coin.id}
              onClick={() => setSelectedCoinId(coin.id)}
              className="glass-card"
              style={{ 
                padding: '16px 18px', 
                cursor: 'pointer',
                border: isSelected ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                boxShadow: isSelected ? '0 0 20px rgba(0, 242, 254, 0.2)' : 'none',
                position: 'relative',
                overflow: 'hidden',
                background: isSelected ? 'rgba(0, 242, 254, 0.05)' : 'var(--bg-card)'
              }}
            >
              {isSelected && (
                <div style={{ 
                  position: 'absolute', 
                  top: 0, 
                  left: 0, 
                  right: 0, 
                  height: '3px', 
                  background: 'var(--color-gradient)' 
                }} />
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ 
                    width: '34px', 
                    height: '34px', 
                    borderRadius: '50%', 
                    background: coin.color, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    color: '#fff', 
                    fontWeight: 800,
                    fontSize: '1.05rem',
                    boxShadow: `0 0 12px ${coin.color}55`
                  }}>
                    {coin.badge}
                  </div>
                  <div>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>
                      {coin.name}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      {coin.symbol}
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: 700, 
                    color: ch24h >= 0 ? '#00E676' : '#FF1744',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    justifyContent: 'flex-end'
                  }}>
                    {ch24h >= 0 ? '+' : ''}{ch24h.toFixed(2)}%
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>24h</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
                    ${formatUsd(currentP)}
                  </span>
                </div>

                {hasHolding && (
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block' }}>En cartera</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {holding.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} {coin.symbol}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="glass-card" style={{ padding: '22px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
              Mi posición (cantidad y costo promedio)
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Sin tu precio de entrada el evaluador no sabe si estás promediando a la baja o encareciendo
            </span>
          </div>
          {!isEditingHoldings ? (
            <button
              onClick={startEditingHoldings}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '6px 12px',
                color: 'var(--text-secondary)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Edit3 size={13} /> Cargar / editar costos
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={saveHoldings}
                style={{
                  background: 'var(--color-primary)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '6px 14px',
                  color: '#080B11',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Guardar
              </button>
              <button
                onClick={() => { setIsEditingHoldings(false); setDraftHoldings(null); }}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          {HOLDING_COINS.map(coin => {
            const live = holdings[coin.id] || { amount: 0, avgBuyPrice: 0 };
            const row = isEditingHoldings ? (draftHoldings?.[coin.id] || live) : live;
            const px = prices[coin.id]?.usd || chartDataMap[coin.id]?.chart?.[chartDataMap[coin.id].chart.length - 1]?.fullPrice || 0;
            const value = (Number(row.amount) || 0) * px;
            const cost = (Number(row.amount) || 0) * (Number(row.avgBuyPrice) || 0);
            const pnl = cost > 0 ? value - cost : null;
            const vs = Number(row.avgBuyPrice) > 0 && px > 0
              ? ((px - Number(row.avgBuyPrice)) / Number(row.avgBuyPrice)) * 100
              : null;

            return (
              <div key={coin.id} style={{ background: 'rgba(0,0,0,0.25)', padding: '14px', borderRadius: '12px', border: selectedCoinId === coin.id ? `1px solid ${coin.color}66` : '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontWeight: 700, color: '#fff' }}>{coin.symbol}</span>
                  {vs != null && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: vs >= 0 ? '#00E676' : '#FF1744' }}>
                      {vs >= 0 ? '+' : ''}{vs.toFixed(1)}% vs costo
                    </span>
                  )}
                </div>
                {isEditingHoldings ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <label style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                      Cantidad
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={row.amount}
                        onChange={(e) => updateDraft(coin.id, 'amount', e.target.value)}
                        style={{ ...inputStyle, marginTop: '4px' }}
                      />
                    </label>
                    <label style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                      Precio promedio USD
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={row.avgBuyPrice}
                        onChange={(e) => updateDraft(coin.id, 'avgBuyPrice', e.target.value)}
                        style={{ ...inputStyle, marginTop: '4px' }}
                      />
                    </label>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span>{(Number(row.amount) || 0).toLocaleString('en-US', { maximumFractionDigits: 6 })} {coin.symbol}</span>
                    <span>Costo prom. ${formatUsd(Number(row.avgBuyPrice) || 0)}</span>
                    <span style={{ color: '#fff', fontWeight: 700 }}>≈ ${formatUsd(value)}</span>
                    {pnl != null && (
                      <span style={{ color: pnl >= 0 ? '#00E676' : '#FF1744', fontWeight: 700 }}>
                        {pnl >= 0 ? '+' : ''}${formatUsd(pnl)}
                      </span>
                    )}
                    {coin.id === 'ergo' && live.autoSynced && (
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Cantidad sincronizada con la billetera</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showBtcWarning && (
        <div className="glass-card" style={{
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          border: '1px solid rgba(255, 145, 0, 0.35)',
          background: 'rgba(255, 145, 0, 0.08)'
        }}>
          <AlertCircle size={18} color="#FF9100" />
          <span style={{ fontSize: '0.85rem', color: '#fff' }}>
            Bitcoin cae {btcChange24h.toFixed(1)}% en 24h. Aunque {activeCoinMeta.name} se vea barato, las alts suelen seguir a BTC: el evaluador penaliza esta entrada.
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
        <div className="glass-card" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ 
                width: '32px', 
                height: '32px', 
                borderRadius: '8px', 
                background: 'rgba(0, 242, 254, 0.15)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: 'var(--color-primary)'
              }}>
                <Sparkles size={18} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                Evaluador: {activeCoinMeta.name}
              </h3>
            </div>

            <div style={{ 
              padding: '6px 14px', 
              borderRadius: '20px', 
              background: opportunityAnalysis.verdict.bg,
              border: `1px solid ${opportunityAnalysis.verdict.color}44`,
              color: opportunityAnalysis.verdict.color,
              fontWeight: 700,
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: opportunityAnalysis.verdict.color }} />
              {opportunityAnalysis.verdict.label}
            </div>
          </div>

          {opportunityAnalysis.score != null && (
            <div style={{ background: 'rgba(0,0,0,0.25)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Score de zona de entrada
                </span>
                <span style={{ fontSize: '1.4rem', fontWeight: 800, color: opportunityAnalysis.verdict.color }}>
                  {opportunityAnalysis.score} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ 100</span>
                </span>
              </div>

              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    width: `${opportunityAnalysis.score}%`, 
                    height: '100%', 
                    background: `linear-gradient(90deg, #00F2FE 0%, ${opportunityAnalysis.verdict.color} 100%)`,
                    borderRadius: '4px',
                    transition: 'width 0.5s ease'
                  }} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                <span>No comprar</span>
                <span>Neutral</span>
                <span>Acumular</span>
              </div>
            </div>
          )}

          <div style={{ 
            background: 'rgba(255,255,255,0.03)', 
            border: '1px solid rgba(255,255,255,0.07)', 
            borderRadius: '12px', 
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)', fontWeight: 600, fontSize: '0.85rem' }}>
              <Info size={16} />
              <span>Diagnóstico de Ruperta:</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#fff', lineHeight: 1.5, fontWeight: 500 }}>
              {opportunityAnalysis.verdict.actionText}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
              {opportunityAnalysis.reasons.map((reason, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--color-primary)', marginTop: '2px' }}>•</span>
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          </div>

          {selectedCoinId !== 'tether' && historyReady && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <RangeBar
                  label="Rango 90 días"
                  pct={activeCoinHistory.range90Pct}
                  min={activeCoinHistory.min90}
                  max={activeCoinHistory.max90}
                />
                <RangeBar
                  label="Rango 14 días"
                  pct={activeCoinHistory.range14Pct}
                  min={activeCoinHistory.min14}
                  max={activeCoinHistory.max14}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: vsCostPct != null ? '1fr 1fr 1fr' : '1fr 1fr', gap: '12px' }}>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>RSI diario (14)</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
                    <span style={{ fontSize: '1.2rem', fontWeight: 800, color: activeCoinHistory.rsi < 35 ? '#00E676' : activeCoinHistory.rsi > 65 ? '#FF1744' : '#fff' }}>
                      {loading && !chartDataMap[selectedCoinId] ? '--' : activeCoinHistory.rsi}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {activeCoinHistory.rsi < 35 ? 'Sobreventa' : activeCoinHistory.rsi > 70 ? 'Sobrecompra' : activeCoinHistory.rsi > 60 ? 'Elevado' : 'Rango medio'}
                    </span>
                  </div>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>Variación 7 días</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
                    <span style={{ 
                      fontSize: '1.2rem', 
                      fontWeight: 800, 
                      color: activeCoinHistory.change7d >= 0 ? '#00E676' : '#FF1744' 
                    }}>
                      {Number.isFinite(activeCoinHistory.change7d) ? `${activeCoinHistory.change7d >= 0 ? '+' : ''}${activeCoinHistory.change7d.toFixed(1)}%` : '--'}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Cierres diarios</span>
                  </div>
                </div>

                {vsCostPct != null && (
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>Vs tu costo</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
                      <span style={{ fontSize: '1.2rem', fontWeight: 800, color: vsCostPct >= 0 ? '#00E676' : '#FF1744' }}>
                        {vsCostPct >= 0 ? '+' : ''}{vsCostPct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
            Esto es un filtro de zona (rango, RSI diario, tu costo y contexto de BTC), no una orden de compra ni asesoramiento financiero.
          </p>

        </div>

        <div className="glass-card" style={{ padding: '22px', display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                {selectedCoinId === 'tether' ? 'Tether no usa gráfico técnico' : 'Evolución de precio (90 días)'}
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {selectedCoinId === 'tether' ? 'Precio anclado al dólar' : `${activeCoinMeta.name} · velas diarias en USD`}
              </span>
            </div>

            {selectedCoinId !== 'tether' && activeCoinHistory.min90 > 0 && (
              <div style={{ display: 'flex', gap: '14px', fontSize: '0.75rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Mín 90d</span>
                  <span style={{ fontWeight: 700, color: '#fff' }}>${formatUsd(activeCoinHistory.min90)}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Máx 90d</span>
                  <span style={{ fontWeight: 700, color: '#fff' }}>${formatUsd(activeCoinHistory.max90)}</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 1, minHeight: '260px', width: '100%' }}>
            {selectedCoinId === 'tether' ? (
              <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
                USDT se evalúa por paridad (~$1), no por RSI ni rangos de compra.
              </div>
            ) : activeCoinHistory.chart && activeCoinHistory.chart.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={activeCoinHistory.chart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cryptoGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={activeCoinMeta.color} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={activeCoinMeta.color} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="date" 
                    tick={{ fill: '#64748B', fontSize: 10 }} 
                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    domain={['auto', 'auto']}
                    tick={{ fill: '#64748B', fontSize: 10 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    tickLine={false}
                    tickFormatter={val => `$${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#101524', 
                      borderColor: 'rgba(255,255,255,0.1)', 
                      borderRadius: '8px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                      color: '#fff',
                      fontSize: '0.8rem'
                    }}
                    formatter={(val) => [`$${val}`, 'Precio']}
                  />
                  {activeHolding.avgBuyPrice > 0 && (
                    <ReferenceLine
                      y={activeHolding.avgBuyPrice}
                      stroke="#00F2FE"
                      strokeDasharray="4 4"
                      label={{ value: 'Tu costo', fill: '#00F2FE', fontSize: 10, position: 'insideTopRight' }}
                    />
                  )}
                  <Area 
                    type="monotone" 
                    dataKey="price" 
                    stroke={activeCoinMeta.color} 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#cryptoGradient)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                Cargando gráfico histórico...
              </div>
            )}
          </div>

          {selectedCoinId !== 'tether' && (
            <div style={{ marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', padding: '10px 14px', borderRadius: '8px' }}>
              Si el precio está cerca del piso de 90 días, el RSI diario está bajo y BTC no está en caída fuerte, el filtro favorece acumular. La línea punteada es tu costo promedio, si lo cargaste.
            </div>
          )}

        </div>

      </div>

      <div className="glass-card" style={{ padding: '24px', border: '1px solid rgba(239, 75, 75, 0.3)', background: 'linear-gradient(180deg, rgba(239, 75, 75, 0.04) 0%, rgba(16, 21, 36, 0.6) 100%)' }}>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '10px', 
              background: '#EF4B4B', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: '#fff', 
              fontWeight: 800, 
              fontSize: '1.2rem',
              boxShadow: '0 0 15px rgba(239, 75, 75, 0.4)'
            }}>
              Σ
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                  Mi Billetera Ergo
                </h3>
                <span style={{ 
                  background: 'rgba(0, 230, 118, 0.15)', 
                  color: '#00E676', 
                  fontSize: '0.68rem', 
                  padding: '2px 8px', 
                  borderRadius: '12px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <ShieldCheck size={12} /> Watch-Only Seguro
                </span>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Sincronización en tiempo real vía Ergo Explorer (Solo Lectura, sin claves privadas)
              </span>
            </div>
          </div>

          {ergoAddress && !isEditingAddress && (
            <button 
              onClick={() => {
                setInputAddress(ergoAddress);
                setIsEditingAddress(true);
              }}
              style={{ 
                background: 'rgba(255,255,255,0.06)', 
                border: '1px solid rgba(255,255,255,0.1)', 
                borderRadius: '8px', 
                padding: '6px 12px', 
                color: 'var(--text-secondary)', 
                fontSize: '0.75rem', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Edit3 size={13} /> Cambiar Dirección
            </button>
          )}
        </div>

        {(!ergoAddress || isEditingAddress) ? (
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Wallet size={16} style={{ color: 'var(--color-primary)' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                Ingresá tu Dirección Pública de Ergo
              </span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.4 }}>
              Copia y pega la dirección pública de tu billetera (ej: Nautilus, Terminus, Satergo). Comienza con <code style={{ color: 'var(--color-primary)', background: 'rgba(0,242,254,0.1)', padding: '2px 5px', borderRadius: '4px' }}>9...</code>. 
              <strong> Nunca ingreses tu frase de recuperación ni contraseñas.</strong>
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input 
                type="text" 
                value={inputAddress} 
                onChange={(e) => setInputAddress(e.target.value)}
                placeholder="Ej: 9f4QF8AD1n8yU3ngwLevgTVggx14nS9Xnhy8j9s82H2sK1c..." 
                style={{ 
                  flex: 1, 
                  minWidth: '280px',
                  background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid rgba(255,255,255,0.15)', 
                  borderRadius: '8px', 
                  padding: '10px 14px', 
                  color: '#fff', 
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-mono)'
                }}
              />
              <button 
                onClick={handleSaveErgoAddress}
                style={{ 
                  background: 'linear-gradient(135deg, #EF4B4B 0%, #FF9100 100%)', 
                  border: 'none', 
                  borderRadius: '8px', 
                  padding: '10px 20px', 
                  color: '#fff', 
                  fontWeight: 700, 
                  fontSize: '0.85rem', 
                  cursor: 'pointer' 
                }}
              >
                Vincular y Consultar Saldo
              </button>
              {isEditingAddress && (
                <button 
                  onClick={() => setIsEditingAddress(false)}
                  style={{ 
                    background: 'transparent', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    borderRadius: '8px', 
                    padding: '10px 14px', 
                    color: 'var(--text-muted)', 
                    fontSize: '0.85rem', 
                    cursor: 'pointer' 
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
            {ergoError && (
              <div style={{ marginTop: '12px', color: '#FF1744', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={14} /> {ergoError}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '18px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                Saldo Total Confirmado
              </span>
              <div style={{ marginTop: '6px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)' }}>
                  {ergoLoading ? 'Consultando...' : (ergoBalance?.ergs ? ergoBalance.ergs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '0.00')}
                </span>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: '#EF4B4B' }}>ERG</span>
              </div>
              <div style={{ marginTop: '4px', fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                ≈ ${(ergoBalance?.ergs ? (ergoBalance.ergs * (prices.ergo?.usd || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00')} USD
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '18px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                  Dirección Vinculada
                </span>
                <div style={{ 
                  marginTop: '8px', 
                  fontSize: '0.75rem', 
                  fontFamily: 'var(--font-mono)', 
                  color: '#fff', 
                  background: 'rgba(255,255,255,0.04)', 
                  padding: '8px 12px', 
                  borderRadius: '6px', 
                  wordBreak: 'break-all',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>{ergoAddress.slice(0, 14)}...{ergoAddress.slice(-10)}</span>
                  <button 
                    onClick={handleCopyAddress} 
                    title="Copiar dirección" 
                    style={{ background: 'none', border: 'none', color: copied ? '#00E676' : 'var(--text-secondary)', cursor: 'pointer', padding: '2px' }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <a 
                  href={`https://explorer.ergoplatform.com/en/addresses/${ergoAddress}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ color: 'var(--color-primary)', textDecoration: 'none', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                >
                  <span>Ver en Ergo Explorer oficial</span>
                  <ExternalLink size={12} />
                </a>

                {ergoBalance?.tokens && ergoBalance.tokens.length > 0 && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {ergoBalance.tokens.length} token(s) nativo(s)
                  </span>
                )}
              </div>
            </div>

          </div>
        )}

      </div>

      {selectedCoinId !== 'tether' && (
        <div className="glass-card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(0, 230, 118, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00E676' }}>
              <Calculator size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                Simulador DCA: Promediar a la Baja ({activeCoinMeta.symbol})
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Simula una compra al precio actual (${formatUsd(activeCoinPrice)}) para ver cómo cambia tu costo promedio
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', alignItems: 'center' }}>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                ¿Cuánto querés invertir hoy? (USD)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="number" 
                  value={dcaUsd} 
                  onChange={(e) => setDcaUsd(e.target.value)}
                  placeholder="100" 
                  style={{ 
                    flex: 1, 
                    background: 'rgba(255,255,255,0.05)', 
                    border: '1px solid rgba(255,255,255,0.15)', 
                    borderRadius: '8px', 
                    padding: '10px 14px', 
                    color: '#fff', 
                    fontSize: '0.9rem',
                    fontWeight: 700
                  }}
                />
                {['50', '100', '250', '500'].map(preset => (
                  <button 
                    key={preset}
                    onClick={() => setDcaUsd(preset)}
                    style={{ 
                      background: dcaUsd === preset ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)', 
                      color: dcaUsd === preset ? '#080B11' : 'var(--text-secondary)',
                      border: 'none', 
                      borderRadius: '6px', 
                      padding: '8px 12px', 
                      fontSize: '0.75rem', 
                      fontWeight: 700, 
                      cursor: 'pointer' 
                    }}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            {dcaSimulation && (
              <div style={{ 
                background: 'rgba(0,0,0,0.25)', 
                padding: '14px 18px', 
                borderRadius: '10px', 
                border: '1px solid rgba(0, 242, 254, 0.2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>Recibirías</span>
                  <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>
                    ≈ {dcaSimulation.coinsBought.toLocaleString('en-US', { maximumFractionDigits: 4 })} {activeCoinMeta.symbol}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>Nuevo Precio Promedio</span>
                  <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-primary)' }}>
                    ${formatUsd(dcaSimulation.newAvgPrice || activeCoinPrice)}
                  </span>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
