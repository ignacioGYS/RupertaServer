import React, { useState, useEffect } from 'react';
import { DollarSign, Bitcoin, Sun, Sunrise, Sunset, Navigation, RefreshCw } from 'lucide-react';

function getMoonPhase() {
  const L = 29.530588853;
  const knownNewMoon = new Date('2024-01-11T11:57:00Z');
  const date = new Date();
  const daysSince = (date - knownNewMoon) / (1000 * 60 * 60 * 24);
  let phase = (daysSince % L) / L;
  if (phase < 0) phase += 1;
  return phase;
}

function getMoonPhaseDetails(phase) {
  if (phase < 0.03 || phase > 0.97) return { icon: '🌑', name: 'Luna Nueva' };
  if (phase < 0.22) return { icon: '🌒', name: 'Cuarto Creciente' };
  if (phase < 0.28) return { icon: '🌓', name: 'Creciente' };
  if (phase < 0.47) return { icon: '🌔', name: 'Gibosa Creciente' };
  if (phase < 0.53) return { icon: '🌕', name: 'Luna Llena' };
  if (phase < 0.72) return { icon: '🌖', name: 'Gibosa Menguante' };
  if (phase < 0.78) return { icon: '🌗', name: 'Cuarto Menguante' };
  return { icon: '🌘', name: 'Menguante' };
}

export default function DailyInfo() {
  const [dolares, setDolares] = useState([]);
  const [crypto, setCrypto] = useState({});
  const [astro, setAstro] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [location] = useState(() => {
    try {
      const saved = localStorage.getItem('ruperta-weather-location');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { lat: -34.649673, lon: -58.418540, name: 'Mi Casa (CABA)', country: 'Argentina' };
  });

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Dólar
      const resDolar = await fetch('https://dolarapi.com/v1/dolares');
      const dataDolar = await resDolar.json();
      
      // Filtramos Oficial, Blue, MEP y Tarjeta
      const wanted = ['Oficial', 'Blue', 'MEP', 'Tarjeta'];
      const filteredDolares = dataDolar.filter(d => wanted.includes(d.nombre));
      setDolares(filteredDolares);

      // Cripto
      const resCrypto = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,ergo&vs_currencies=usd');
      const dataCrypto = await resCrypto.json();
      setCrypto(dataCrypto);

      // Astronomía
      const resAstro = await fetch(`https://api.sunrise-sunset.org/json?lat=${location.lat}&lng=${location.lon}&formatted=0`);
      const dataAstro = await resAstro.json();
      setAstro(dataAstro.results);

    } catch (err) {
      setError('Error al obtener la información diaria');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, [location.lat, location.lon]);

  const moonPhase = getMoonPhase();
  const moonDetails = getMoonPhaseDetails(moonPhase);

  const formatTime = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Cabecera */}
      {loading && !dolares.length && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 10px auto' }}></div>
          Cargando Información Diaria...
        </div>
      )}

      {error && (
        <div style={{ padding: '16px', background: 'rgba(255, 82, 82, 0.1)', color: '#FF5252', borderRadius: '12px', border: '1px solid rgba(255, 82, 82, 0.2)' }}>
          {error}
          <button className="btn" onClick={fetchData} style={{ marginTop: '10px' }}>Reintentar</button>
        </div>
      )}

      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
        {/* Tarjeta Finanzas: Dólar */}
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DollarSign size={18} style={{ color: '#00E676' }} />
              Cotización del Dólar
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ARS</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {dolares.map(d => (
              <div key={d.casa} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontWeight: 600, color: '#fff' }}>Dólar {d.nombre}</span>
                <div style={{ display: 'flex', gap: '16px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Compra</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-muted)' }}>${d.compra}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Venta</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#00E676' }}>${d.venta}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tarjeta Finanzas: Cripto */}
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bitcoin size={18} style={{ color: '#FF9100' }} />
              Criptomonedas
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>USD</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, justifyContent: 'center' }}>
            {crypto.bitcoin && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', background: '#FF9100', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>₿</div>
                  <div>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: '0.95rem' }}>Bitcoin</span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>BTC</span>
                  </div>
                </div>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>${crypto.bitcoin.usd.toLocaleString('en-US')}</span>
              </div>
            )}
            
            {crypto.ethereum && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', background: '#627EEA', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>Ξ</div>
                  <div>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: '0.95rem' }}>Ethereum</span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ETH</span>
                  </div>
                </div>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>${crypto.ethereum.usd.toLocaleString('en-US')}</span>
              </div>
            )}

            {crypto.tether && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', background: '#26A17B', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>₮</div>
                  <div>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: '0.95rem' }}>Tether</span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>USDT</span>
                  </div>
                </div>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>${crypto.tether.usd.toLocaleString('en-US', { minimumFractionDigits: 3 })}</span>
              </div>
            )}

            {crypto.ergo && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', background: '#EF4B4B', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>Σ</div>
                  <div>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: '0.95rem' }}>Ergo</span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ERG</span>
                  </div>
                </div>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>${crypto.ergo.usd.toLocaleString('en-US', { minimumFractionDigits: 3 })}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tarjeta Astronomía */}
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sun size={18} style={{ color: '#FFD700' }} />
              Ciclo Solar y Lunar
            </h3>
          </div>

          <div style={{ display: 'flex', flex: 1, gap: '20px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'rgba(255,145,0,0.1)', padding: '10px', borderRadius: '12px', color: '#FF9100' }}>
                  <Sunrise size={24} />
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>AMANECER</span>
                  <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                    {astro ? formatTime(astro.sunrise) : '--:--'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'rgba(79,172,254,0.1)', padding: '10px', borderRadius: '12px', color: '#4FACFE' }}>
                  <Sunset size={24} />
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>OCASO</span>
                  <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                    {astro ? formatTime(astro.sunset) : '--:--'}
                  </span>
                </div>
              </div>
            </div>
            
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', height: '100%' }}></div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <span style={{ fontSize: '3rem', lineHeight: 1 }}>{moonDetails.icon}</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', textAlign: 'center' }}>{moonDetails.name}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Fase {(moonPhase * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>

      </div>

      {/* Tarjeta Mapa Tráfico */}
      <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: '400px' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, marginBottom: '16px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Navigation size={18} style={{ color: '#FF3D00' }} />
          Tráfico en Vivo (Waze)
        </h3>
        <div style={{ flex: 1, width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
          <iframe 
            src={`https://embed.waze.com/iframe?zoom=13&lat=${location.lat}&lon=${location.lon}&pin=1&desc=1`}
            width="100%" 
            height="100%"
            style={{ border: 'none' }}
            title="Waze Traffic Map"
          ></iframe>
        </div>
      </div>

    </div>
  );
}
