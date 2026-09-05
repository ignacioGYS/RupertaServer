import fs from 'fs';
let code = fs.readFileSync('src/components/Weather.jsx', 'utf8');

// Delete everything from `<div className="metrics-grid"` down to just before `{/* Modal Reproductor */}`
const startRegex = /<div className="metrics-grid" style=\{\{ gridTemplateColumns: 'repeat\(auto-fit, minmax\(350px, 1fr\)\)', gap: '20px', marginTop: '20px' \}\}>\n\s*\{\/\* Clima Actual \*\/\}/;
const endStr = "{/* Modal Reproductor */}\n      {selectedWebcam && (";

let startIndex = code.search(startRegex);
let endIndex = code.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
    let before = code.substring(0, startIndex);
    let after = code.substring(endIndex);

    let replacement = `      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
        {/* Clima Actual */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
          {/* Fondo sutil según clima */}
          <div style={{ position: 'absolute', top: '-50%', right: '-20%', width: '150%', height: '150%', background: isDay ? 'radial-gradient(circle, rgba(255,193,7,0.1) 0%, rgba(0,0,0,0) 70%)' : 'radial-gradient(circle, rgba(167,181,235,0.1) 0%, rgba(0,0,0,0) 70%)', zIndex: 0, pointerEvents: 'none' }}></div>
          
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', gap: '20px' }}>
            
            {/* Temperatura e Icono */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>CLIMA ACTUAL</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '3.5rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>
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
            
            {/* 4 Métricas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Thermometer size={24} style={{ color: '#FF9100' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Sensación</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{Math.round(current.apparent_temperature)}°C</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Droplets size={24} style={{ color: '#00F2FE' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Humedad</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{current.relative_humidity_2m}%</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Wind size={24} style={{ color: '#A7B5EB' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Viento</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{current.wind_speed_10m} km/h</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CloudRain size={24} style={{ color: '#4FACFE' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Lluvia</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{current.precipitation} mm</span>
                </div>
              </div>
            </div>
            
          </div>
        </div>

        {/* Pronóstico por Hora (Scroll Horizontal) */}
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, marginBottom: '16px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock4 size={18} style={{ color: '#00F2FE' }} />
            Próximas 24 Horas
          </h3>
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px', marginTop: '16px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.2) transparent', flex: 1, alignItems: 'center' }}>
            {next24Hours.map((h, i) => (
              <div key={i} style={{ 
                display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px', padding: '12px 8px',
                background: i === 0 ? 'rgba(0,242,254,0.1)' : 'rgba(255,255,255,0.03)', 
                borderRadius: '12px', border: i === 0 ? '1px solid rgba(0,242,254,0.3)' : '1px solid rgba(255,255,255,0.05)'
              }}>
                <span style={{ fontSize: '0.85rem', fontWeight: i === 0 ? 700 : 500, color: i === 0 ? '#00F2FE' : 'var(--text-secondary)' }}>
                  {i === 0 ? 'Ahora' : h.time.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div style={{ margin: '8px 0' }}>
                  {getWeatherIcon(h.code, h.isDay, 28)}
                </div>
                <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{h.temp}°</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', opacity: h.precipProb > 0 ? 1 : 0.2 }}>
                  <Droplets size={10} color="#00F2FE" />
                  <span style={{ fontSize: '0.7rem', color: '#00F2FE', fontWeight: 600 }}>{h.precipProb}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px', marginTop: '20px' }}>
        {/* Pronóstico 7 Días (Lista) */}
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Map size={18} style={{ color: '#00F2FE' }} />
            Pronóstico 7 Días
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, paddingRight: '4px' }}>
            {daily.time.map((time, idx) => (
              <div key={time} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: idx < daily.time.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
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

        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, marginBottom: '16px', margin: 0 }}>Tendencia de Temperaturas</h3>
          <div style={{ flex: 1, width: '100%', minHeight: '220px', marginTop: '16px' }}>
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
                <YAxis stroke="var(--text-muted)" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(val) => \`\${val}°\`} />
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
      </div>

      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px', marginTop: '20px' }}>
        {/* Mapa Animado de Vientos (Windy) */}
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, marginBottom: '16px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Map size={18} style={{ color: '#00F2FE' }} />
            Mapa Meteorológico en Vivo
          </h3>
          <div style={{ width: '100%', height: '280px', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', marginTop: '16px', flex: 1 }}>
            <iframe 
              width="100%" 
              height="100%" 
              src={\`https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=km/h&zoom=10&overlay=wind&product=ecmwf&level=surface&lat=\${location.lat}&lon=\${location.lon}\`}
              frameBorder="0" 
              title="Windy Map Forecast"
            ></iframe>
          </div>
        </div>

        {/* Webcams (Windy) */}
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Camera size={18} style={{ color: '#00E676' }} />
              Cámaras en Vivo (25 km)
            </h3>
          </div>
          
          {!windyApiKey ? (
            <div style={{ padding: '30px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
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
            <div style={{ padding: '40px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto 16px auto' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Buscando cámaras cercanas...</p>
            </div>
          ) : webcamError ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#FF5252', background: 'rgba(255, 82, 82, 0.1)', borderRadius: '8px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <p style={{ fontSize: '0.9rem' }}>{webcamError}</p>
              <button onClick={() => setWindyApiKey('')} className="btn" style={{ marginTop: '10px' }}>Cambiar API Key</button>
            </div>
          ) : webcams.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Camera size={32} style={{ opacity: 0.5, margin: '0 auto 12px auto' }} />
              <p style={{ fontSize: '0.9rem' }}>No se encontraron webcams activas en este radio.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', overflowY: 'auto', maxHeight: '280px', paddingRight: '4px', scrollbarWidth: 'thin' }}>
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
                      style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,242,254,0.8)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)'}
                    >
                      <Play fill="#fff" color="#fff" size={18} style={{ marginLeft: '2px' }} />
                    </button>
                    <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', pointerEvents: 'none' }}>
                      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#00E676', boxShadow: '0 0 4px #00E676' }} />
                      <span style={{ fontSize: '0.55rem', color: '#fff', fontWeight: 600 }}>LIVE</span>
                    </div>
                  </div>
                  <a 
                    href={cam.urls?.detail || '#'} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}
                  >
                    <div style={{ overflow: 'hidden' }}>
                      <h4 style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>{cam.title}</h4>
                      {cam.location && (
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.65rem', margin: '2px 0 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {cam.location.city}
                        </p>
                      )}
                    </div>
                    <ExternalLink size={12} style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: '6px' }} />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>\n`;

    fs.writeFileSync('src/components/Weather.jsx', before + replacement + after);
    console.log("Layout fixed successfully");
} else {
    console.log("Could not find start or end index");
}
