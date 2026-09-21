import React, { useState, useEffect, useMemo } from 'react';
import { 
  Coins, 
  TrendingUp, 
  TrendingDown, 
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
  ChevronRight,
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

// ── Helper: Cálculo de RSI (Relative Strength Index) ────────────────────────
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

// ── Helper: Evaluación Inteligente de Oportunidad ────────────────────────────
function evaluateOpportunity(rsi, change24h, change7d, fearAndGreed) {
  let score = 50; // Base neutral
  const reasons = [];

  // 1. Evaluación por RSI (Peso fuerte: ±35 pts)
  if (rsi <= 25) {
    score += 35;
    reasons.push('RSI en sobreventa extrema (<25): los compradores suelen entrar con fuerza.');
  } else if (rsi <= 35) {
    score += 25;
    reasons.push('RSI en sobreventa favorable (<35): excelente zona de descuento.');
  } else if (rsi <= 45) {
    score += 15;
    reasons.push('RSI por debajo de la media (35-45): precio con margen de crecimiento.');
  } else if (rsi <= 60) {
    score += 0;
    reasons.push('RSI en rango neutral (45-60): consolidación sin señales extremas.');
  } else if (rsi <= 70) {
    score -= 15;
    reasons.push('RSI elevado (60-70): el impulso comprador comienza a agotarse.');
  } else {
    score -= 30;
    reasons.push('RSI en sobrecompra (>70): alto riesgo de corrección o toma de ganancias.');
  }

  // 2. Evaluación por Sentimiento de Mercado (Fear & Greed: ±20 pts)
  const fngVal = fearAndGreed?.value ? parseInt(fearAndGreed.value, 10) : 50;
  if (fngVal <= 25) {
    score += 20;
    reasons.push('Miedo extremo en el mercado: históricamente la mejor ventana para comprar barato.');
  } else if (fngVal <= 45) {
    score += 10;
    reasons.push('Sentimiento de cautela/miedo: precios contenidos.');
  } else if (fngVal >= 75) {
    score -= 15;
    reasons.push('Codicia extrema en el mercado: cuidado con entrar por FOMO.');
  }

  // 3. Evaluación de momentum semanal (Dip buying)
  if (change7d < -12) {
    score += 10;
    reasons.push('Caída semanal pronunciada: oportunidad de comprar la corrección.');
  } else if (change7d > 25) {
    score -= 10;
    reasons.push('Rally parabólico semanal: esperar un retroceso antes de comprar.');
  }

  // Normalizar entre 5 y 98
  score = Math.max(5, Math.min(98, Math.round(score)));

  // Veredicto
  let verdict = {
    level: 'neutral',
    label: 'Neutral / Mantener',
    color: '#94A3B8',
    bg: 'rgba(148, 163, 184, 0.12)',
    actionText: 'Esperar confirmación de tendencia o mantener posición.'
  };

  if (score >= 78) {
    verdict = {
      level: 'strong_buy',
      label: 'Zona Fuerte de Compra',
      color: '#00E676',
      bg: 'rgba(0, 230, 118, 0.15)',
      actionText: 'Condiciones ideales de descuento. Alta relación beneficio/riesgo.'
    };
  } else if (score >= 60) {
    verdict = {
      level: 'buy',
      label: 'Acumulación Gradual (DCA)',
      color: '#00F2FE',
      bg: 'rgba(0, 242, 254, 0.15)',
      actionText: 'Buen momento para compras escalonadas sin comprometer todo el capital.'
    };
  } else if (score < 40) {
    verdict = {
      level: 'caution',
      label: 'Cautela / No Comprar',
      color: '#FF1744',
      bg: 'rgba(255, 23, 68, 0.15)',
      actionText: 'Riesgo alto de corrección a corto plazo. Es preferible esperar un retroceso.'
    };
  }

  return { score, reasons, verdict };
}

// ── Lista de Monedas Soportadas ──────────────────────────────────────────────
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

export default function CryptoRadar() {
  const [selectedCoinId, setSelectedCoinId] = useState('ergo');
  const [prices, setPrices] = useState({});
  const [chartDataMap, setChartDataMap] = useState({});
  const [fearAndGreed, setFearAndGreed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);

  // ── Estado Billetera Ergo ────────────────────────────────────────────────
  const [ergoAddress, setErgoAddress] = useState(() => {
    return localStorage.getItem('ruperta-ergo-wallet') || '';
  });
  const [inputAddress, setInputAddress] = useState('');
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [ergoBalance, setErgoBalance] = useState(null);
  const [ergoLoading, setErgoLoading] = useState(false);
  const [ergoError, setErgoError] = useState(null);
  const [copied, setCopied] = useState(false);

  // ── Estado Portafolio Manual ─────────────────────────────────────────────
  const [holdings, setHoldings] = useState(() => {
    try {
      const saved = localStorage.getItem('ruperta-crypto-holdings');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return {
      bitcoin: { amount: 0, avgBuyPrice: 0 },
      ethereum: { amount: 0, avgBuyPrice: 0 },
      ergo: { amount: 0, avgBuyPrice: 0 }
    };
  });
  const [isEditingHoldings, setIsEditingHoldings] = useState(false);

  // ── Calculadora DCA ──────────────────────────────────────────────────────
  const [dcaAmount, setDcaAmount] = useState('');
  const [dcaUsd, setDcaUsd] = useState('100');

  // Guardar holdings en localStorage
  const saveHoldings = (newHoldings) => {
    setHoldings(newHoldings);
    localStorage.setItem('ruperta-crypto-holdings', JSON.stringify(newHoldings));
    setIsEditingHoldings(false);
  };

  // ── Fetch de Precios y Fear & Greed ──────────────────────────────────────
  const fetchMarketData = async () => {
    try {
      setError(null);

      // 1. Fear & Greed Index
      try {
        const fngRes = await fetch('https://api.alternative.me/fng/?limit=1');
        const fngJson = await fngRes.json();
        if (fngJson?.data?.[0]) {
          setFearAndGreed(fngJson.data[0]);
        }
      } catch (e) {
        console.warn('Error fetching Fear & Greed:', e);
      }

      // 2. Precios simples con variación 24h
      const coinIds = SUPPORTED_COINS.map(c => c.id).join(',');
      const priceRes = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd&include_24hr_change=true&include_7d_change=true`
      );
      if (!priceRes.ok) throw new Error('No se pudieron obtener las cotizaciones de CoinGecko');
      const priceJson = await priceRes.json();
      setPrices(priceJson);

      // 3. Histórico de 14 días para la moneda seleccionada (y las principales)
      fetchHistoricalChart(selectedCoinId);

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error in fetchMarketData:', err);
      setError('Error al sincronizar datos del mercado cripto');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch de historial de precios para calcular RSI y graficar
  const fetchHistoricalChart = async (coinId) => {
    if (coinId === 'tether') return; // Stablecoin no requiere análisis técnico complejo
    try {
      const chartRes = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=14`
      );
      if (!chartRes.ok) return;
      const chartJson = await chartRes.json();

      if (chartJson?.prices?.length) {
        // Mapear puntos para el gráfico (tomando muestras equidistantes para fluidez)
        const rawPrices = chartJson.prices;
        const step = Math.max(1, Math.floor(rawPrices.length / 40));
        const formattedData = [];

        for (let i = 0; i < rawPrices.length; i += step) {
          const [timestamp, val] = rawPrices[i];
          const date = new Date(timestamp);
          formattedData.push({
            date: `${date.getDate()}/${date.getMonth() + 1} ${date.getHours()}:00`,
            rawTime: timestamp,
            price: Number(val >= 1 ? val.toFixed(2) : val.toFixed(4)),
            fullPrice: val
          });
        }

        // Asegurar que el último punto esté incluido
        const lastRaw = rawPrices[rawPrices.length - 1];
        const lastDate = new Date(lastRaw[0]);
        formattedData.push({
          date: `${lastDate.getDate()}/${lastDate.getMonth() + 1} ${lastDate.getHours()}:00`,
          rawTime: lastRaw[0],
          price: Number(lastRaw[1] >= 1 ? lastRaw[1].toFixed(2) : lastRaw[1].toFixed(4)),
          fullPrice: lastRaw[1]
        });

        // Calcular serie para RSI (usar todos los precios raw)
        const priceSeries = rawPrices.map(p => p[1]);
        const rsiValue = calculateRSI(priceSeries, 14);

        // Calcular variación de 7 días aproximada
        const firstPrice = rawPrices[0][1];
        const currentPrice = rawPrices[rawPrices.length - 1][1];
        const change7dApprox = ((currentPrice - firstPrice) / firstPrice) * 100;

        setChartDataMap(prev => ({
          ...prev,
          [coinId]: {
            chart: formattedData,
            rsi: rsiValue,
            change7d: change7dApprox,
            minPrice: Math.min(...priceSeries),
            maxPrice: Math.max(...priceSeries)
          }
        }));
      }
    } catch (e) {
      console.warn(`Error fetching chart for ${coinId}:`, e);
    }
  };

  // ── Fetch de Billetera Ergo (Watch-Only) ──────────────────────────────────
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

      // Si el usuario no tenía configurada manualmente la cantidad de ERG en holdings, actualizarla
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

  // Guardar dirección Ergo
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

  // Carga inicial
  useEffect(() => {
    fetchMarketData();
    if (ergoAddress) {
      fetchErgoWalletBalance(ergoAddress);
    }

    // Auto-refresh cada 3 minutos
    const interval = setInterval(() => {
      fetchMarketData();
      if (ergoAddress) fetchErgoWalletBalance(ergoAddress);
    }, 3 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Cuando cambia la moneda seleccionada, asegurar que tenemos su gráfico
  useEffect(() => {
    if (selectedCoinId && !chartDataMap[selectedCoinId]) {
      fetchHistoricalChart(selectedCoinId);
    }
  }, [selectedCoinId]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchMarketData();
    if (ergoAddress) fetchErgoWalletBalance(ergoAddress);
  };

  // ── Métricas calculadas para la moneda activa ─────────────────────────────
  const activeCoinMeta = SUPPORTED_COINS.find(c => c.id === selectedCoinId) || SUPPORTED_COINS[0];
  const activeCoinPrice = prices[selectedCoinId]?.usd || 0;
  const activeCoin24hChange = prices[selectedCoinId]?.usd_24h_change || 0;
  const activeCoinHistory = chartDataMap[selectedCoinId] || { rsi: 50, change7d: 0, chart: [] };

  const opportunityAnalysis = useMemo(() => {
    return evaluateOpportunity(
      activeCoinHistory.rsi,
      activeCoin24hChange,
      activeCoinHistory.change7d,
      fearAndGreed
    );
  }, [activeCoinHistory.rsi, activeCoin24hChange, activeCoinHistory.change7d, fearAndGreed]);

  // ── Portafolio Total en USD ──────────────────────────────────────────────
  const portfolioSummary = useMemo(() => {
    let totalUsd = 0;
    let totalCostUsd = 0;

    SUPPORTED_COINS.forEach(coin => {
      if (coin.id === 'tether') return;
      const h = holdings[coin.id] || { amount: 0, avgBuyPrice: 0 };
      const currentP = prices[coin.id]?.usd || 0;
      const value = h.amount * currentP;
      const cost = h.amount * h.avgBuyPrice;
      totalUsd += value;
      totalCostUsd += cost;
    });

    const pnlUsd = totalUsd - totalCostUsd;
    const pnlPercent = totalCostUsd > 0 ? (pnlUsd / totalCostUsd) * 100 : 0;

    return { totalUsd, totalCostUsd, pnlUsd, pnlPercent };
  }, [holdings, prices]);

  // ── Simulación de DCA ────────────────────────────────────────────────────
  const dcaSimulation = useMemo(() => {
    const currentH = holdings[selectedCoinId] || { amount: 0, avgBuyPrice: 0 };
    const currentP = activeCoinPrice;
    const addUsd = parseFloat(dcaUsd) || 0;
    if (currentP <= 0 || addUsd <= 0) return null;

    const coinsBought = addUsd / currentP;
    const newTotalAmount = currentH.amount + coinsBought;
    const newTotalCost = (currentH.amount * currentH.avgBuyPrice) + addUsd;
    const newAvgPrice = newTotalCost / newTotalAmount;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '30px' }}>
      
      {/* ── BARRA SUPERIOR: Portafolio Total, Sentimiento y Refresco ──────── */}
      <div className="glass-card" style={{ padding: '20px', display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'space-between', alignItems: 'center' }}>
        
        {/* Total Cartera */}
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
                ${portfolioSummary.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                  {portfolioSummary.pnlUsd >= 0 ? '+' : ''}${portfolioSummary.pnlUsd.toFixed(2)} ({portfolioSummary.pnlPercent.toFixed(1)}%)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Fear & Greed Index Gauge */}
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
              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Índice Fear & Greed</span>
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

        {/* Acciones de Actualización */}
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

      {/* ── SELECTOR DE CRIPTOMONEDAS (Cards Horizontales) ─────────────── */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
        gap: '16px' 
      }}>
        {SUPPORTED_COINS.map(coin => {
          const priceObj = prices[coin.id];
          const isSelected = selectedCoinId === coin.id;
          const currentP = priceObj?.usd || 0;
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
                    ${currentP >= 1 ? currentP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : currentP.toFixed(4)}
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

      {/* ── SECCIÓN PRINCIPAL: Evaluador Inteligente de Compra & Gráficos ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
        {/* Panel Izquierdo: Diagnóstico Inteligente Ruperta */}
        <div className="glass-card" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                Evaluador Inteligente: {activeCoinMeta.name}
              </h3>
            </div>

            {/* Veredicto Badge */}
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

          {/* Termómetro de Oportunidad (Score 0-100) */}
          <div style={{ background: 'rgba(0,0,0,0.25)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Score de Oportunidad de Entrada
              </span>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: opportunityAnalysis.verdict.color }}>
                {opportunityAnalysis.score} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ 100</span>
              </span>
            </div>

            {/* Barra de progreso con gradiente */}
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
              <span>0 (Riesgo Alto / Sobrecompra)</span>
              <span>50 (Neutral)</span>
              <span>100 (Compra Fuerte)</span>
            </div>
          </div>

          {/* Explicación en lenguaje natural */}
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

            {/* Lista de razones calculadas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
              {opportunityAnalysis.reasons.map((reason, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--color-primary)', marginTop: '2px' }}>•</span>
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Indicadores Clave (RSI y Variación) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>RSI (14 días)</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: activeCoinHistory.rsi < 35 ? '#00E676' : activeCoinHistory.rsi > 65 ? '#FF1744' : '#fff' }}>
                  {activeCoinHistory.rsi || '--'}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {activeCoinHistory.rsi < 35 ? 'Sobreventa' : activeCoinHistory.rsi > 65 ? 'Sobrecompra' : 'Rango Medio'}
                </span>
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>Variación 7 Días</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
                <span style={{ 
                  fontSize: '1.2rem', 
                  fontWeight: 800, 
                  color: activeCoinHistory.change7d >= 0 ? '#00E676' : '#FF1744' 
                }}>
                  {activeCoinHistory.change7d ? `${activeCoinHistory.change7d >= 0 ? '+' : ''}${activeCoinHistory.change7d.toFixed(1)}%` : '--'}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Tendencia</span>
              </div>
            </div>
          </div>

        </div>

        {/* Panel Derecho: Gráfico Interactivo de Precios (Recharts) */}
        <div className="glass-card" style={{ padding: '22px', display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                Evolución de Precio (14 Días)
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {activeCoinMeta.name} cotizado en USD
              </span>
            </div>

            {activeCoinHistory.minPrice && (
              <div style={{ display: 'flex', gap: '14px', fontSize: '0.75rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Mínimo 14d</span>
                  <span style={{ fontWeight: 700, color: '#fff' }}>${activeCoinHistory.minPrice < 1 ? activeCoinHistory.minPrice.toFixed(4) : activeCoinHistory.minPrice.toFixed(2)}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Máximo 14d</span>
                  <span style={{ fontWeight: 700, color: '#fff' }}>${activeCoinHistory.maxPrice < 1 ? activeCoinHistory.maxPrice.toFixed(4) : activeCoinHistory.maxPrice.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 1, minHeight: '260px', width: '100%' }}>
            {activeCoinHistory.chart && activeCoinHistory.chart.length > 0 ? (
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

          <div style={{ marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', padding: '10px 14px', borderRadius: '8px' }}>
            💡 <strong>Estrategia sugerida:</strong> Si el precio se aproxima al piso de los últimos 14 días y el RSI permanece bajo, las probabilidades de rebote aumentan notablemente.
          </div>

        </div>

      </div>

      {/* ── BILLETERA ERGO WATCH-ONLY (Modo Seguro de Lectura) ──────────── */}
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

        {/* Formulario de Entrada de Dirección (si no hay guardada o si está editando) */}
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
          /* Visualización del Saldo Confirmado de Ergo */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            
            {/* Tarjeta de Saldo en ERG y USD */}
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

            {/* Dirección Pública y Enlace a Explorador */}
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

      {/* ── CALCULADORA INTELIGENTE DE ENTRADA / DCA ────────────────────── */}
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
              Simula una compra al precio actual (${activeCoinPrice < 1 ? activeCoinPrice.toFixed(4) : activeCoinPrice.toFixed(2)}) para ver cómo mejora tu costo promedio
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
                  ${dcaSimulation.newAvgPrice > 0 ? (dcaSimulation.newAvgPrice < 1 ? dcaSimulation.newAvgPrice.toFixed(4) : dcaSimulation.newAvgPrice.toFixed(2)) : activeCoinPrice.toFixed(2)}
                </span>
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  );
}
