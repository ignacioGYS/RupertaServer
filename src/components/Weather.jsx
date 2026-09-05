import React, { useState, useEffect } from 'react';
import { 
  Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning, 
  Thermometer, Wind, Droplets, MapPin, Search, Settings, Check, X, Map, Camera, Video, ExternalLink, Play
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Weather() {
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const [windyApiKey, setWindyApiKey] = useState(() => localStorage.getItem('ruperta-windy-api-key') || 'NKiKVRA4DYhrEpJBxf7QDCSQB7920tcD');
  const [webcams, setWebcams] = useState([]);
  const [loadingWebcams, setLoadingWebcams] = useState(false);
  const [webcamError, setWebcamError] = useState(null);
  const [selectedWebcam, setSelectedWebcam] = useState(null);
  
  const [location, setLocation] = useState(() => {
    try {
      const saved = localStorage.getItem('ruperta-weather-location');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Si el usuario tenía el viejo default genérico, forzamos la actualización a su casa
        if (parsed.name === 'Buenos Aires' && parsed.lat === -34.61315) {
           const myHouse = { lat: -34.649673, lon: -58.418540, name: 'Mi Casa (CABA)', country: 'Argentina' };
           localStorage.setItem('ruperta-weather-location', JSON.stringify(myHouse));
           return myHouse;
        }
        return parsed;
      }
      return { lat: -34.649673, lon: -58.418540, name: 'Mi Casa (CABA)', country: 'Argentina' };
    } catch {
      return { lat: -34.649673, lon: -58.418540, name: 'Mi Casa (CABA)', country: 'Argentina' };
    }
  });

  const fetchWeather = async (lat, lon) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`);
      if (!res.ok) throw new Error('Error al obtener datos del clima');
      const data = await res.json();
      setWeatherData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeather(location.lat, location.lon);
  }, [location]);

  useEffect(() => {
    if (windyApiKey) {
      localStorage.setItem('ruperta-windy-api-key', windyApiKey);
    }
  }, [windyApiKey]);

  useEffect(() => {
    if (!windyApiKey) return;
    const fetchWebcams = async () => {
      setLoadingWebcams(true);
      setWebcamError(null);
      try {
        const res = await fetch(`https://api.windy.com/webcams/api/v3/webcams?nearby=${location.lat},${location.lon},25&include=images,urls,player&limit=6`, {
          headers: {
            'x-windy-api-key': windyApiKey
          }
        });
        if (!res.ok) throw new Error('Error al conectar con Windy Webcams API');
        const data = await res.json();
        setWebcams(data.webcams || []);
      } catch (err) {
        setWebcamError(err.message);
      } finally {
        setLoadingWebcams(false);
      }
    };
    fetchWebcams();
  }, [location, windyApiKey]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchQuery)}&count=5&language=es&format=json`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const selectLocation = (result) => {
    const newLoc = { lat: result.latitude, lon: result.longitude, name: result.name, country: result.country };
    setLocation(newLoc);
    localStorage.setItem('ruperta-weather-location', JSON.stringify(newLoc));
    setIsConfiguring(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const getWeatherIcon = (code, isDay = 1, size = 24, color = '#fff') => {
    if (code === 0) return <Sun size={size} color={isDay ? '#FFC107' : '#A7B5EB'} />;
    if (code === 1 || code === 2) return <CloudSun size={size} color={isDay ? '#FFC107' : '#A7B5EB'} />;
    if (code === 3) return <Cloud size={size} color="#A7B5EB" />;
    if (code >= 45 && code <= 48) return <CloudFog size={size} color="#A7B5EB" />;
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return <CloudRain size={size} color="#4FACFE" />;
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow size={size} color="#E0F7FA" />;
    if (code >= 95 && code <= 99) return <CloudLightning size={size} color="#FF5252" />;
    return <Cloud size={size} color={color} />;
  };

  const getWeatherDescription = (code) => {
    if (code === 0) return 'Despejado';
    if (code === 1 || code === 2) return 'Parcialmente nublado';
    if (code === 3) return 'Nublado';
    if (code >= 45 && code <= 48) return 'Niebla';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'Lluvia';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Nieve';
    if (code >= 95 && code <= 99) return 'Tormenta';
    return 'Desconocido';
  };

  const formatDay = (timeStr) => {
    const date = new Date(timeStr);
    date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
    return new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric' }).format(date);
  };

  if (isConfiguring) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <MapPin style={{ color: '#00F2FE' }} size={20} />
              Configurar Ubicación
            </h2>
            <button onClick={() => setIsConfiguring(false)} className="btn" style={{ background: 'rgba(255,255,255,0.05)', border: 'none', padding: '8px' }}>
              <X size={18} />
            </button>
          </div>
          
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ej: Buenos Aires, Madrid, Bogotá..."
              style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '1rem' }}
            />
            <button type="submit" disabled={isSearching} className="btn btn-primary" style={{ padding: '0 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isSearching ? <div className="spinner" style={{ width: '18px', height: '18px' }} /> : <Search size={18} />}
              Buscar
            </button>
          </form>

          {searchResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Resultados:</h3>
              {searchResults.map((res) => (
                <button 
                  key={res.id} 
                  onClick={() => selectLocation(res)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', textAlign: 'left', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 600, color: '#fff' }}>{res.name}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{res.admin1 ? `${res.admin1}, ` : ''}{res.country}</span>
                  </div>
                  <Check size={18} style={{ color: '#00E676', opacity: 0 }} className="check-icon" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading && !weatherData) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Obteniendo datos del clima...</p>
      </div>
    );
  }

  if (error && !weatherData) {
    return (
      <div className="error-container">
        <CloudLightning size={48} />
        <h3>Error al obtener clima</h3>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => fetchWeather(location.lat, location.lon)}>Reintentar</button>
        <button className="btn" onClick={() => setIsConfiguring(true)} style={{ marginTop: '10px' }}>Cambiar Ubicación</button>
      </div>
    );
  }

  const { current, daily } = weatherData;
  const isDay = current.is_day === 1;

  // Preparar datos para el gráfico de 7 días
  const chartData = daily.time.map((t, idx) => ({
    name: formatDay(t),
    max: daily.temperature_2m_max[idx],
    min: daily.temperature_2m_min[idx]
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header de ubicación */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <MapPin style={{ color: '#FF5252' }} size={24} />
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.2 }}>{location.name}</h2>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{location.country}</span>
          </div>
        </div>
        <button onClick={() => setIsConfiguring(true)} className="btn" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)' }}>
          <Settings size={16} />
          <span>Cambiar</span>
        </button>
      </div>

      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {/* Clima Actual */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
          {/* Fondo sutil según clima */}
          <div style={{ position: 'absolute', top: '-50%', right: '-20%', width: '150%', height: '150%', background: isDay ? 'radial-gradient(circle, rgba(255,193,7,0.1) 0%, rgba(0,0,0,0) 70%)' : 'radial-gradient(circle, rgba(167,181,235,0.1) 0%, rgba(0,0,0,0) 70%)', zIndex: 0, pointerEvents: 'none' }}></div>
          
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>CLIMA ACTUAL</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>
                {Math.round(current.temperature_2m)}°C
              </span>
              <span style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>
                {getWeatherDescription(current.weather_code)}
              </span>
            </div>
            <div style={{ padding: '10px' }}>
              {getWeatherIcon(current.weather_code, current.is_day, 64)}
            </div>
          </div>
          
          <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Thermometer size={18} style={{ color: '#FF9100' }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Sensación Térm.</span>
                <span style={{ fontSize: '1rem', fontWeight: 600 }}>{Math.round(current.apparent_temperature)}°C</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Droplets size={18} style={{ color: '#00F2FE' }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Humedad</span>
                <span style={{ fontSize: '1rem', fontWeight: 600 }}>{current.relative_humidity_2m}%</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Wind size={18} style={{ color: '#A7B5EB' }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Viento</span>
                <span style={{ fontSize: '1rem', fontWeight: 600 }}>{current.wind_speed_10m} km/h</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CloudRain size={18} style={{ color: '#4FACFE' }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Precipitación</span>
                <span style={{ fontSize: '1rem', fontWeight: 600 }}>{current.precipitation} mm</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pronóstico 7 Días (Lista) */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Map size={18} style={{ color: '#00F2FE' }} />
            Pronóstico 7 Días
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
            {daily.time.map((time, idx) => (
              <div key={time} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: idx < daily.time.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                  <div style={{ width: '40px' }}>{getWeatherIcon(daily.weather_code[idx], 1, 24)}</div>
                  <span style={{ fontSize: '0.95rem', fontWeight: idx === 0 ? 700 : 500, color: idx === 0 ? '#00F2FE' : '#fff' }}>
                    {idx === 0 ? 'Hoy' : formatDay(time)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '40px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Max</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#FF5252' }}>{Math.round(daily.temperature_2m_max[idx])}°</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '40px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Min</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#4FACFE' }}>{Math.round(daily.temperature_2m_min[idx])}°</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gráfico de Temperaturas */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, marginBottom: '20px' }}>Tendencia de Temperaturas</h3>
        <div style={{ height: '260px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="maxTempGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FF5252" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#FF5252" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="minTempGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4FACFE" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#4FACFE" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} axisLine={false} tickLine={false} />
              <YAxis stroke="var(--text-muted)" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(val) => `${val}°`} />
              <Tooltip 
                contentStyle={{ background: '#101524', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} 
                itemStyle={{ fontWeight: 600 }}
              />
              <Area type="monotone" dataKey="max" stroke="#FF5252" strokeWidth={3} fillOpacity={1} fill="url(#maxTempGrad)" name="Máxima" />
              <Area type="monotone" dataKey="min" stroke="#4FACFE" strokeWidth={3} fillOpacity={1} fill="url(#minTempGrad)" name="Mínima" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Webcams (Windy) */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={18} style={{ color: '#00E676' }} />
            Cámaras en Vivo (25 km)
          </h3>
        </div>
        
        {!windyApiKey ? (
          <div style={{ padding: '30px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
            <Video size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
            <h4 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Activar Webcams</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>Ingresa tu API Key de Windy Webcams para ver cámaras cerca de tu casa.</p>
            <input 
              type="text" 
              placeholder="Pega tu API Key aquí..."
              onChange={(e) => setWindyApiKey(e.target.value)}
              style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff', width: '100%', maxWidth: '300px' }}
            />
          </div>
        ) : loadingWebcams ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 16px auto' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Buscando cámaras cercanas...</p>
          </div>
        ) : webcamError ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#FF5252', background: 'rgba(255, 82, 82, 0.1)', borderRadius: '8px' }}>
            <p style={{ fontSize: '0.9rem' }}>{webcamError}</p>
            <button onClick={() => setWindyApiKey('')} className="btn" style={{ marginTop: '10px' }}>Cambiar API Key</button>
          </div>
        ) : webcams.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Camera size={32} style={{ opacity: 0.5, margin: '0 auto 12px auto' }} />
            <p style={{ fontSize: '0.9rem' }}>No se encontraron webcams activas en este radio.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {webcams.map(cam => (
              <div 
                key={cam.webcamId} 
                style={{ 
                  display: 'block', 
                  borderRadius: '12px', 
                  overflow: 'hidden', 
                  background: 'rgba(0,0,0,0.3)', 
                  border: '1px solid rgba(255,255,255,0.05)',
                  transition: 'transform 0.2s, border-color 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}
              >
                <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: '#000' }}>
                  {cam.images?.current?.thumbnail && (
                    <img 
                      src={cam.images.current.thumbnail} 
                      alt={cam.title} 
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      loading="lazy"
                    />
                  )}
                  {/* Play Button Overlay */}
                  <button 
                    onClick={() => setSelectedWebcam(cam)}
                    title="Reproducir timelapse"
                    style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,242,254,0.8)', border: 'none', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform 0.2s' }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)'}
                  >
                    <Play fill="#fff" color="#fff" size={24} style={{ marginLeft: '4px' }} />
                  </button>
                  <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', pointerEvents: 'none' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00E676', boxShadow: '0 0 4px #00E676' }} />
                    <span style={{ fontSize: '0.65rem', color: '#fff', fontWeight: 600 }}>LIVE</span>
                  </div>
                </div>
                <a 
                  href={cam.urls?.detail || '#'} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{ overflow: 'hidden' }}>
                    <h4 style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>{cam.title}</h4>
                    {cam.location && (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', margin: '2px 0 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cam.location.city}
                      </p>
                    )}
                  </div>
                  <ExternalLink size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: '8px' }} />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Reproductor */}
      {selectedWebcam && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#111827', border: '1px solid var(--border-color)', borderRadius: '16px', overflow: 'hidden', width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Video size={16} style={{ color: '#00F2FE' }} />
                {selectedWebcam.title}
              </h3>
              <button onClick={() => setSelectedWebcam(null)} className="btn btn-secondary btn-icon" style={{ borderRadius: '50%' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ width: '100%', position: 'relative', paddingTop: '56.25%', background: '#000' }}>
              <iframe 
                src={selectedWebcam.player?.day} 
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                allowFullScreen
                title={selectedWebcam.title}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
