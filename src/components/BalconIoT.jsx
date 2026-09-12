import React, { useState, useEffect, useRef } from 'react';
import { Droplet, RefreshCw, AlertTriangle, AlertCircle } from 'lucide-react';

export default function BalconIoT() {
  const [waterLevel, setWaterLevel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMounted = useRef(true);

  const fetchWaterLevel = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/sensors/latest?_t=${Date.now()}`);
      if (!res.ok) throw new Error('Error al conectar con la API de Ruperta');
      
      const data = await res.json();
      if (isMounted.current) {
        // Buscar el sensor de nivel de agua del aire acondicionado
        const acSensor = (data.sensors || []).find(s => s.sensor_name === 'ac_water_level');
        if (acSensor) {
          setWaterLevel(acSensor);
        }
        setError(null);
      }
    } catch (e) {
      console.error('Error fetching water level:', e);
      if (isMounted.current) setError(e.message);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  useEffect(() => {
    isMounted.current = true;
    fetchWaterLevel();

    // Consultar cada 10 segundos
    const interval = setInterval(fetchWaterLevel, 10000);

    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, []);

  // Para testear la UI cuando el sensor está roto, descomentar esta línea:
  // const simLevel = 65; 
  const currentLevel = waterLevel ? waterLevel.value : 0; 
  // const currentLevel = simLevel; // <-- Útil para debug visual

  // Determinar color en base al nivel (0% es seguro, 100% es alerta de rebalse)
  const getLevelColor = (level) => {
    if (level < 50) return '#00F2FE'; // Celeste lindo
    if (level < 80) return '#FFD600'; // Amarillo (Ojo)
    return '#FF1744';                 // Rojo (Lleno/Rebalse)
  };

  const getLevelText = (level) => {
    if (level < 20) return 'Casi Vacío';
    if (level < 50) return 'Nivel Seguro';
    if (level < 80) return 'Nivel Medio-Alto';
    if (level < 95) return 'Próximo a Llenarse';
    return '¡LLENO! Vaciar Tanque';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Sensores del Balcón</h2>
        <button 
          onClick={fetchWaterLevel}
          style={{ 
            display: 'flex', alignItems: 'center', gap: '6px', 
            background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', 
            color: '#fff', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <RefreshCw size={14} className={loading ? 'upload-spin-icon' : ''} />
          <span>Refrescar</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
        {/* Tarjeta del Tanque de Agua */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ background: 'rgba(0, 242, 254, 0.1)', padding: '8px', borderRadius: '8px', color: '#00F2FE' }}>
                <Droplet size={20} />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Agua del Aire Acond.</h3>
            </div>
            <span className="network-speed-badge-tx" style={{ background: 'rgba(0, 242, 254, 0.08)', color: '#00F2FE', border: '1px solid rgba(0, 242, 254, 0.2)' }}>
              HC-SR04
            </span>
          </div>

          {!waterLevel && !error && (
            <div style={{ padding: '16px', background: 'rgba(255, 214, 0, 0.1)', border: '1px solid rgba(255, 214, 0, 0.2)', borderRadius: '8px', color: '#FFD600', display: 'flex', gap: '10px' }}>
              <AlertCircle size={20} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                Sensor inactivo. Posible fallo de hardware (Timeout del ECHO). Cambiar sensor HC-SR04.
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '30px', alignItems: 'center', marginTop: '10px' }}>
            
            {/* Animación Visual del Tanque */}
            <div style={{
              width: '100px',
              height: '180px',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '3px solid rgba(255, 255, 255, 0.1)',
              borderTop: 'none',
              borderRadius: '0 0 16px 16px',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 10px 30px -10px rgba(0, 242, 254, 0.2)',
              flexShrink: 0
            }}>
              {/* Marcas de nivel */}
              <div style={{ position: 'absolute', top: '20%', left: 0, width: '10px', height: '2px', background: 'rgba(255,255,255,0.2)', zIndex: 10 }} />
              <div style={{ position: 'absolute', top: '50%', left: 0, width: '15px', height: '2px', background: 'rgba(255,255,255,0.3)', zIndex: 10 }} />
              <div style={{ position: 'absolute', top: '80%', left: 0, width: '10px', height: '2px', background: 'rgba(255,255,255,0.2)', zIndex: 10 }} />

              {/* El agua */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: '100%',
                height: `${Math.max(5, currentLevel)}%`, // Mínimo 5% para que siempre se vea un fondito si hay sensor
                background: `linear-gradient(180deg, ${getLevelColor(currentLevel)} 0%, rgba(0, 150, 255, 0.8) 100%)`,
                transition: 'height 1.5s cubic-bezier(0.4, 0, 0.2, 1), background 1s ease',
                boxShadow: `0 -5px 15px ${getLevelColor(currentLevel)}40`
              }}>
                {/* Olitas animadas con CSS puro (requiere keyframes globales, lo simulamos estático/suave) */}
                <div style={{
                  position: 'absolute', top: '-10px', left: '-50%', width: '200%', height: '20px',
                  background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 70%)',
                  borderRadius: '50%', opacity: 0.5
                }} />
              </div>
            </div>

            {/* Datos y Texto */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Nivel de Llenado</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '3.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: getLevelColor(currentLevel) }}>
                  {currentLevel.toFixed(1)}
                </span>
                <span style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-secondary)' }}>%</span>
              </div>
              
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '8px', borderLeft: `4px solid ${getLevelColor(currentLevel)}`, marginTop: '8px' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff', display: 'block' }}>
                  {getLevelText(currentLevel)}
                </span>
                {waterLevel && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    Última medición: {new Date(waterLevel.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
