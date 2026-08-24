import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Thermometer, Droplets, Gauge, Wind, RefreshCw, Code, BookOpen, AlertTriangle, CheckCircle, Wifi, Copy, Check, Info, Activity, ShieldAlert, Sparkles } from 'lucide-react';

// Datos descriptivos para los tooltips informativos de calidad de aire
const PM_INFO_DATA = {
  pm25: {
    title: 'PM2.5 (Partículas Finas)',
    definition: 'Las partículas PM2.5 son partículas microscópicas suspendidas en el aire con un diámetro inferior a 2.5 micrómetros (unas 30 veces más delgadas que un cabello humano).',
    sources: 'Se originan principalmente por la combustión en motores (vehículos, motos), estufas a leña, humo de tabaco, velas, sahumerios y cocinar alimentos (especialmente fritos o a la plancha).',
    health: 'Al ser extremadamente pequeñas, evaden los filtros naturales del cuerpo y penetran directamente en los alvéolos pulmonares y el torrente sanguíneo, pudiendo afectar los sistemas cardiovascular y respiratorio. El límite anual recomendado por la OMS es de 5 µg/m³.'
  },
  pm10: {
    title: 'PM10 (Partículas Gruesas)',
    definition: 'Las partículas PM10 tienen un diámetro de entre 2.5 y 10 micrómetros. Son retenidas más arriba en las vías respiratorias que las PM2.5, pero siguen siendo dañinas.',
    sources: 'Provienen del polvo de calles y caminos, polen de flores, cenizas, esporas de moho, actividades de construcción, demolición, agricultura y polvo arrastrado por el viento.',
    health: 'Pueden acumularse en los pulmones e irritar las vías respiratorias superiores, provocando tos, secreción nasal, y empeorando condiciones preexistentes como el asma o la bronquitis crónica. El límite diario recomendado por la OMS es de 45 µg/m³.'
  },
  pm1: {
    title: 'PM1.0 (Partículas Ultrafinas)',
    definition: 'Las partículas PM1.0 son partículas ultrafinas suspendidas en el aire con un diámetro inferior a 1 micrómetro (1 µm).',
    sources: 'Se generan por combustión industrial de alta temperatura, escapes de vehículos diésel, hollín ultra-refinado, humo de incendios, bacterias muy finas y virus en suspensión.',
    health: 'Debido a su escala molecular, tienen la mayor capacidad de atravesar las células del pulmón y viajar directamente a órganos vitales (cerebro, corazón, hígado). Son un indicador crítico de toxicidad química extrema en el aire.'
  }
};

export default function SensorDashboard() {
  const [sensors, setSensors] = useState([]);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({});
  const [infoPopup, setInfoPopup] = useState(null);
  const [timeRange, setTimeRange] = useState(24); // default 24 hours
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedText, setCopiedText] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const isMounted = useRef(true);

  const serverUrl = `http://${window.location.hostname}:3001/api/sensors/data`;

  const fetchLatest = async () => {
    try {
      const res = await fetch(`/api/sensors/latest?_t=${Date.now()}`);
      if (!res.ok) throw new Error('Error al conectar con la API de Ruperta');
      const data = await res.json();
      if (isMounted.current) {
        setSensors(data.sensors || []);
      }
    } catch (e) {
      console.error('Error fetching latest sensor data:', e);
      if (isMounted.current) setError(e.message);
    }
  };

  const fetchHistory = async (hours) => {
    try {
      const res = await fetch(`/api/sensors/history?hours=${hours}&_t=${Date.now()}`);
      if (!res.ok) throw new Error('Error al obtener el historial');
      const data = await res.json();
      if (isMounted.current) {
        setHistory(data.history || []);
      }
    } catch (e) {
      console.error('Error fetching sensor history:', e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`/api/sensors/stats?_t=${Date.now()}`);
      if (!res.ok) throw new Error('Error al obtener estadísticas');
      const data = await res.json();
      if (isMounted.current) {
        const statsMap = {};
        (data.stats || []).forEach(s => {
          statsMap[s.sensor_name] = {
            max_24h: s.max_24h,
            time_24h: s.time_24h,
            max_7d: s.max_7d,
            time_7d: s.time_7d,
            max_historic: s.max_historic,
            time_historic: s.time_historic
          };
        });
        setStats(statsMap);
      }
    } catch (e) {
      console.error('Error fetching sensor stats:', e);
    }
  };

  const loadAllData = async (hours = timeRange) => {
    setLoading(true);
    await Promise.all([fetchLatest(), fetchHistory(hours), fetchStats()]);
    if (isMounted.current) setLoading(false);
  };

  // Poll latest data every 10 seconds, history every 60 seconds
  useEffect(() => {
    isMounted.current = true;
    loadAllData(timeRange);

    const latestInterval = setInterval(fetchLatest, 10000);
    const historyInterval = setInterval(() => {
      fetchHistory(timeRange);
      fetchStats();
    }, 60000);

    return () => {
      isMounted.current = false;
      clearInterval(latestInterval);
      clearInterval(historyInterval);
    };
  }, [timeRange]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(serverUrl);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Helper to find latest value for a specific sensor type or name
  const getLatestSensor = (type) => {
    const sorted = [...sensors].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return sorted.find(s => s.sensor_type === type);
  };

  const isSensorActive = (sensor) => {
    if (!sensor || !sensor.timestamp) return false;
    const readingTime = new Date(sensor.timestamp).getTime();
    const now = Date.now();
    // Tolerancia de 30 minutos (1,800,000 ms) con valor absoluto para tolerar desincronizaciones horarias
    return Math.abs(now - readingTime) < 1800000;
  };

  const formatTime = (tsStr) => {
    if (!tsStr) return 'N/A';
    const d = new Date(tsStr);
    if (isNaN(d.getTime())) return 'N/A';
    
    const now = new Date();
    const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear();
    
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) {
      return `Hoy ${timeStr}`;
    } else if (isYesterday) {
      return `Ayer ${timeStr}`;
    } else {
      const dateStr = d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
      return `${dateStr} ${timeStr}`;
    }
  };

  const renderStatsGrid = (sensorName, unit = '', decimals = 0) => {
    const s = stats[sensorName];
    if (!s) return null;
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '12px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.66rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ color: 'var(--text-secondary)', opacity: 0.7, fontSize: '0.64rem' }}>24h Máx</span>
          <strong style={{ color: '#fff', fontSize: '0.72rem' }}>{s.max_24h !== null && s.max_24h !== undefined ? `${parseFloat(s.max_24h).toFixed(decimals)}${unit}` : 'N/A'}</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.58rem', whiteSpace: 'nowrap' }}>{formatTime(s.time_24h)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ color: 'var(--text-secondary)', opacity: 0.7, fontSize: '0.64rem' }}>7d Máx</span>
          <strong style={{ color: '#fff', fontSize: '0.72rem' }}>{s.max_7d !== null && s.max_7d !== undefined ? `${parseFloat(s.max_7d).toFixed(decimals)}${unit}` : 'N/A'}</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.58rem', whiteSpace: 'nowrap' }}>{formatTime(s.time_7d)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ color: 'var(--text-secondary)', opacity: 0.7, fontSize: '0.64rem' }}>Hist. Máx</span>
          <strong style={{ color: '#fff', fontSize: '0.72rem' }}>{s.max_historic !== null && s.max_historic !== undefined ? `${parseFloat(s.max_historic).toFixed(decimals)}${unit}` : 'N/A'}</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.58rem', whiteSpace: 'nowrap' }}>{formatTime(s.time_historic)}</span>
        </div>
      </div>
    );
  };

  const getAirQualityDiagnosis = () => {
    if (!pm25Sensor || !pm10Sensor || !pm1Sensor) {
      return {
        status: 'Esperando datos',
        desc: 'Se necesitan lecturas activas de todos los sensores PM para diagnosticar el origen.',
        color: 'var(--text-muted)',
        r_uf: 0,
        r_fg: 0
      };
    }
    
    if (!isSensorActive(pm25Sensor) || !isSensorActive(pm10Sensor) || !isSensorActive(pm1Sensor)) {
      return {
        status: 'Sensor Inactivo',
        desc: 'El sensor de calidad de aire ZH06 no ha enviado telemetría reciente.',
        color: 'var(--text-muted)',
        r_uf: 0,
        r_fg: 0
      };
    }

    const pm25 = pm25Sensor.value;
    const pm10 = pm10Sensor.value;
    const pm1 = pm1Sensor.value;

    const r_uf = pm10 > 0 ? (pm1 / pm10) : 0;
    const r_fg = pm10 > 0 ? (pm25 / pm10) : 0;

    // 1. Aire Limpio
    if (pm25 <= 12) {
      return {
        status: 'Aire Limpio',
        desc: 'La calidad del aire es excelente y está dentro de los límites saludables recomendados.',
        color: 'var(--color-success)',
        r_uf,
        r_fg
      };
    }

    // 2. Cocina / Fritura
    if (pm10 >= 250 && pm25 >= 200 && (pm10 - pm25) >= 30) {
      return {
        status: 'Cocina / Fritura',
        desc: 'Se detecta un pico masivo de partículas debido a microgotas de grasa y vapores orgánicos condensados típicos de frituras o cocción.',
        color: '#FF6D00',
        r_uf,
        r_fg
      };
    }

    // 3. Tránsito / Escape Diésel de Avenida
    if (r_uf >= 0.70 && pm25 > 25) {
      return {
        status: 'Tráfico / Escape Diésel de Avenida',
        desc: 'Predominio extremo de partículas ultrafinas (PM1.0). Típico del hollín y combustión fósil de motores en la avenida.',
        color: '#FF1744',
        r_uf,
        r_fg
      };
    }

    // 4. Polvo Ambiental / Tierra de la Calle
    if (r_fg < 0.45 && pm10 > 50) {
      return {
        status: 'Polvo Ambiental / Tierra de la Calle',
        desc: 'Predominio de partículas gruesas levantadas mecánicamente por el viento o por tránsito sobre calles de tierra o secas.',
        color: '#FFD600',
        r_uf,
        r_fg
      };
    }

    // 5. Humo General / Mala Ventilación
    if (pm25 > 25) {
      return {
        status: 'Humo General / Mala Ventilación',
        desc: 'Elevada acumulación general de humo o polvo fino con ventilación deficiente.',
        color: 'var(--color-warning)',
        r_uf,
        r_fg
      };
    }

    // Por defecto
    return {
      status: 'Normal / Aceptable',
      desc: 'Lecturas estables sin clasificar en ninguna categoría de contaminación.',
      color: 'var(--color-success)',
      r_uf,
      r_fg
    };
  };

  // Pivot historical data for Recharts grouping by 5-minute intervals to align asynchronous readings
  const getChartData = () => {
    const grouped = {};
    history.forEach(item => {
      const date = new Date(item.timestamp);
      
      // Round to nearest 5 minutes (300000 ms) for visual alignment
      const roundedTime = Math.round(date.getTime() / 300000) * 300000;
      const roundedDate = new Date(roundedTime);
      const key = roundedDate.toISOString();

      let label = '';
      if (timeRange <= 24) {
        label = roundedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        label = `${roundedDate.getDate()} ${roundedDate.toLocaleDateString([], { month: 'short' })} ${roundedDate.getHours()}:00`;
      }
      
      if (!grouped[key]) {
        grouped[key] = { 
          timestamp: key,
          label: label 
        };
      }
      
      // Keep the latest value if there are multiple readings in the same bucket
      grouped[key][item.sensor_name] = parseFloat(item.value.toFixed(1));
    });
    return Object.values(grouped).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  };

  // Dynamic feedback and color palettes for cards
  // PM2.5 thresholds based on WHO Air Quality Guidelines
  const getPM25Status = (value) => {
    if (value <= 12) return { label: 'Excelente', color: 'var(--color-success)', desc: 'Aire limpio, sin riesgo.' };
    if (value <= 35) return { label: 'Buena', color: '#4FACFE', desc: 'Calidad aceptable para la mayoría.' };
    if (value <= 55) return { label: 'Moderada', color: 'var(--color-warning)', desc: 'Sensibles podrían notar efectos.' };
    if (value <= 150) return { label: 'Mala', color: '#FF6D00', desc: 'Todos podrían notar efectos en la salud.' };
    return { label: 'Peligrosa', color: 'var(--color-danger)', desc: 'Alerta sanitaria: riesgo para todos.' };
  };

  const getPM10Status = (value) => {
    if (value <= 54) return { label: 'Buena', color: 'var(--color-success)' };
    if (value <= 154) return { label: 'Moderada', color: 'var(--color-warning)' };
    return { label: 'Mala', color: 'var(--color-danger)' };
  };

  const getTempColor = (temp) => {
    if (temp < 18) return '#4FACFE'; // Cold
    if (temp <= 27) return '#00E676'; // Comfortable
    return '#FF1744'; // Hot
  };

  const tempSensor = getLatestSensor('temperature');
  const pm25Sensor = sensors.find(s => s.sensor_name === 'zh06_pm25');
  const pm10Sensor = sensors.find(s => s.sensor_name === 'zh06_pm10');
  const pm1Sensor = sensors.find(s => s.sensor_name === 'zh06_pm1');

  const chartData = getChartData();
  const hasData = sensors.length > 0;

  // C++ ESP32 Firmware template
  const esp32Code = `// --- Ruperta Monitor ESP32 Firmware Template ---
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h> // Instalar "ArduinoJson" por Benoit Blanchon en tu gestor de librerías

// Configuración de Wi-Fi
const char* ssid = "TU_WIFI_SSID";
const char* password = "TU_WIFI_PASSWORD";

// API Endpoint de Ruperta
const char* serverName = "${serverUrl}";

// Intervalo de envío de datos (e.g. cada 60 segundos)
const unsigned long sendInterval = 60000;
unsigned long lastSendTime = 0;

void setup() {
  Serial.begin(115200);
  
  // Conectar a Wi-Fi
  Serial.print("Conectando a Wi-Fi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("");
  Serial.println("¡Wi-Fi Conectado!");
  Serial.print("IP del ESP32: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  if (millis() - lastSendTime >= sendInterval) {
    lastSendTime = millis();
    
    if (WiFi.status() == WL_CONNECTED) {
      // 1. Leer Sensores (Simulado para esta prueba. Reemplaza con tus DHT/BMP/etc.)
      float temperature = 22.5 + random(-10, 10) / 10.0;
      float humidity = 55.0 + random(-50, 50) / 10.0;
      float pressure = 1013.25 + random(-20, 20) / 10.0;
      float airQuality = 42.0 + random(0, 120); // AQI o PPM

      // 2. Construir JSON Array (Eficiente para enviar todos los sensores juntos)
      StaticJsonDocument<512> doc;
      JsonArray readings = doc.to<JsonArray>();

      // Sensor de Temperatura (e.g. DHT22)
      JsonObject tempObj = readings.createNestedObject();
      tempObj["sensor_name"] = "dht22_temp";
      tempObj["sensor_type"] = "temperature";
      tempObj["value"] = temperature;
      tempObj["unit"] = "°C";

      // Sensor de Humedad (e.g. DHT22)
      JsonObject humObj = readings.createNestedObject();
      humObj["sensor_name"] = "dht22_hum";
      humObj["sensor_type"] = "humidity";
      humObj["value"] = humidity;
      humObj["unit"] = "%";

      // Sensor de Presión (e.g. BMP280)
      JsonObject pressObj = readings.createNestedObject();
      pressObj["sensor_name"] = "bmp280_press";
      pressObj["sensor_type"] = "pressure";
      pressObj["value"] = pressure;
      pressObj["unit"] = "hPa";

      // Sensor de Calidad del Aire (e.g. MQ135)
      JsonObject co2Obj = readings.createNestedObject();
      co2Obj["sensor_name"] = "mq135_co2";
      co2Obj["sensor_type"] = "air_quality";
      co2Obj["value"] = airQuality;
      co2Obj["unit"] = "PPM";

      // 3. Convertir JSON a string
      String jsonPayload;
      serializeJson(doc, jsonPayload);

      // 4. Enviar Petición HTTP POST
      HTTPClient http;
      http.begin(serverName);
      http.addHeader("Content-Type", "application/json");
      
      Serial.print("Enviando telemetría... Payload: ");
      Serial.println(jsonPayload);
      
      int httpResponseCode = http.POST(jsonPayload);
      
      if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.print("Código de Respuesta HTTP: ");
        Serial.println(httpResponseCode);
        Serial.println("Respuesta del Servidor: " + response);
      } else {
        Serial.print("Error enviando POST: ");
        Serial.println(httpResponseCode);
      }
      
      http.end(); // Cerrar conexión
    } else {
      Serial.println("Wi-Fi Desconectado. Reintentando conectar...");
      WiFi.begin(ssid, password);
    }
  }
}
`;

  return (
    <div className="network-monitor-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '16px' }}>
      
      {/* Top Banner & Dynamic Info Card */}
      <div className="glass-card" style={{ padding: '20px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          <div className="network-status-dot active" style={{ width: '12px', height: '12px' }} />
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>API Ingestion de Telemetría</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Configura tu ESP32 para enviar datos a este nodo.</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0, 0, 0, 0.2)', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <Wifi size={16} style={{ color: 'var(--color-primary)' }} />
          <code style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{serverUrl}</code>
          <button 
            onClick={copyToClipboard} 
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Copiar URL"
          >
            {copiedText ? <Check size={14} style={{ color: 'var(--color-success)' }} /> : <Copy size={14} />}
          </button>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="header-update-btn" 
            onClick={() => loadAllData()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 14px', borderRadius: '8px' }}
          >
            <RefreshCw size={14} className={loading ? 'upload-spin-icon' : ''} />
            <span>Refrescar</span>
          </button>
          <button 
            className="header-update-btn"
            onClick={() => setShowInstructions(prev => !prev)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              cursor: 'pointer', 
              background: 'linear-gradient(135deg, #00F2FE 0%, #4FACFE 100%)', 
              border: 'none', 
              color: '#080B11', 
              fontWeight: 600,
              padding: '8px 14px', 
              borderRadius: '8px' 
            }}
          >
            <Code size={14} />
            <span>{showInstructions ? 'Ocultar Código' : 'Ver Guía ESP32'}</span>
          </button>
        </div>
      </div>

      {/* ESP32 Setup Guide / Code Template Panel */}
      {showInstructions && (
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fadeIn 0.3s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
            <BookOpen size={18} />
            <h4 style={{ fontWeight: 600 }}>Guía Rápida para el ESP32 (Arduino C++)</h4>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            Para integrar tu ESP32, puedes usar el siguiente sketch de Arduino. Asegúrate de instalar la librería <strong>ArduinoJson</strong> desde el Library Manager. Modifica las credenciales de tu red Wi-Fi y carga el código a la placa.
          </p>
          <div style={{ position: 'relative' }}>
            <pre style={{ 
              background: 'rgba(0, 0, 0, 0.4)', 
              padding: '16px', 
              borderRadius: '8px', 
              overflowX: 'auto', 
              fontSize: '0.78rem', 
              fontFamily: 'var(--font-mono)', 
              color: '#A7B5EB',
              border: '1px solid var(--border-color)',
              maxHeight: '350px' 
            }}>
              <code>{esp32Code}</code>
            </pre>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(esp32Code);
                alert('Código copiado al portapapeles');
              }}
              style={{ 
                position: 'absolute', 
                top: '10px', 
                right: '10px', 
                background: 'rgba(255,255,255,0.08)', 
                border: '1px solid rgba(255,255,255,0.15)', 
                color: '#fff', 
                fontSize: '0.7rem', 
                padding: '4px 8px', 
                borderRadius: '6px', 
                cursor: 'pointer' 
              }}
            >
              Copiar Código
            </button>
          </div>
        </div>
      )}

      {/* Empty State when no data has checked in */}
      {!hasData && !loading && (
        <div className="glass-card" style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center' }}>
          <AlertTriangle size={48} style={{ color: 'var(--color-warning)' }} />
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Esperando telemetría del ESP32</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '6px', maxWidth: '500px' }}>
              No se han detectado lecturas en la base de datos de Ruperta. Conecta tu placa ESP32 por USB o Wi-Fi y configúrala con la URL mostrada arriba para comenzar a recibir datos de sensores.
            </p>
          </div>
          <button 
            className="header-update-btn"
            onClick={() => setShowInstructions(true)}
            style={{ background: 'rgba(0, 242, 254, 0.1)', border: '1px solid var(--color-primary)', color: 'var(--color-primary)', cursor: 'pointer', padding: '10px 20px', borderRadius: '8px', fontWeight: 600 }}
          >
            Ver código de ejemplo para ESP32
          </button>
        </div>
      )}

      {/* Main Dashboard Cards (DHT, BMP, Air Quality) */}
      {hasData && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            
            {/* Temperature Card */}
            <div className="glass-card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.05, pointerEvents: 'none' }}>
                <Thermometer size={100} style={{ color: tempSensor ? getTempColor(tempSensor.value) : '#fff' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Temperatura</span>
                <span className="network-speed-badge-tx" style={{ background: 'rgba(0, 242, 254, 0.08)', color: 'var(--color-primary)', border: '1px solid rgba(0, 242, 254, 0.2)' }}>
                  {tempSensor ? tempSensor.sensor_name.replace('_temp', '').toUpperCase() : 'N/A'}
                </span>
              </div>
              {tempSensor && isSensorActive(tempSensor) ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: getTempColor(tempSensor.value) }}>
                      {tempSensor.value.toFixed(1)}
                    </span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{tempSensor.unit || '°C'}</span>
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                    Actualizado: {new Date(tempSensor.timestamp).toLocaleTimeString()}
                  </p>
                  {renderStatsGrid('ds18b20_temp', '°C', 1)}
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-muted)' }}>
                      ---
                    </span>
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px', fontWeight: 500 }}>
                    No se está midiendo
                  </p>
                </div>
              )}
            </div>

            {/* PM2.5 Card (Índice Principal de Calidad de Aire) */}
            <div className="glass-card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.05, pointerEvents: 'none' }}>
                <Wind size={100} style={{ color: pm25Sensor && isSensorActive(pm25Sensor) ? getPM25Status(pm25Sensor.value).color : '#fff' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>PM2.5 (Partículas Finas)</span>
                  <Info 
                    size={14} 
                    style={{ cursor: 'pointer', color: 'var(--color-primary)', opacity: 0.8 }} 
                    onClick={() => setInfoPopup(PM_INFO_DATA.pm25)}
                  />
                </div>
                <span className="network-speed-badge-rx" style={{ background: 'rgba(255, 109, 0, 0.08)', color: '#FF6D00', border: '1px solid rgba(255, 109, 0, 0.2)' }}>ZH06</span>
              </div>
              {pm25Sensor && isSensorActive(pm25Sensor) ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: getPM25Status(pm25Sensor.value).color }}>
                      {pm25Sensor.value.toFixed(0)}
                    </span>
                    <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>µg/m³</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: getPM25Status(pm25Sensor.value).color }}>
                      {getPM25Status(pm25Sensor.value).label}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>— {getPM25Status(pm25Sensor.value).desc}</span>
                  </div>
                  {renderStatsGrid('zh06_pm25', ' µg/m³', 0)}
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-muted)' }}>---</span>
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px', fontWeight: 500 }}>Esperando primera lectura del ZH06...</p>
                </div>
              )}
            </div>

            {/* PM10 Card */}
            <div className="glass-card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.05, pointerEvents: 'none' }}>
                <Gauge size={100} style={{ color: pm10Sensor && isSensorActive(pm10Sensor) ? getPM10Status(pm10Sensor.value).color : '#fff' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>PM10 (Partículas Gruesas)</span>
                  <Info 
                    size={14} 
                    style={{ cursor: 'pointer', color: 'var(--color-primary)', opacity: 0.8 }} 
                    onClick={() => setInfoPopup(PM_INFO_DATA.pm10)}
                  />
                </div>
                <span className="network-speed-badge-tx" style={{ background: 'rgba(0, 242, 254, 0.08)', color: 'var(--color-primary)', border: '1px solid rgba(0, 242, 254, 0.2)' }}>ZH06</span>
              </div>
              {pm10Sensor && isSensorActive(pm10Sensor) ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: getPM10Status(pm10Sensor.value).color }}>
                      {pm10Sensor.value.toFixed(0)}
                    </span>
                    <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>µg/m³</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: getPM10Status(pm10Sensor.value).color }}>
                      {getPM10Status(pm10Sensor.value).label}
                    </span>
                  </div>
                  {renderStatsGrid('zh06_pm10', ' µg/m³', 0)}
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-muted)' }}>---</span>
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px', fontWeight: 500 }}>Esperando primera lectura del ZH06...</p>
                </div>
              )}
            </div>

            {/* PM1.0 Card */}
            <div className="glass-card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.05, pointerEvents: 'none' }}>
                <Droplets size={100} style={{ color: '#E040FB' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>PM1.0 (Ultrafinas)</span>
                  <Info 
                    size={14} 
                    style={{ cursor: 'pointer', color: 'var(--color-primary)', opacity: 0.8 }} 
                    onClick={() => setInfoPopup(PM_INFO_DATA.pm1)}
                  />
                </div>
                <span className="network-speed-badge-rx" style={{ background: 'rgba(224, 64, 251, 0.08)', color: '#E040FB', border: '1px solid rgba(224, 64, 251, 0.2)' }}>ZH06</span>
              </div>
              {pm1Sensor && isSensorActive(pm1Sensor) ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: '#E040FB' }}>
                      {pm1Sensor.value.toFixed(0)}
                    </span>
                    <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>µg/m³</span>
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                    Actualizado: {new Date(pm1Sensor.timestamp).toLocaleTimeString()}
                  </p>
                  {renderStatsGrid('zh06_pm1', ' µg/m³', 0)}
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-muted)' }}>---</span>
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px', fontWeight: 500 }}>Esperando primera lectura del ZH06...</p>
                </div>
              )}
            </div>

          </div>

          {/* Tarjeta de Diagnóstico Inteligente de Origen de Partículas */}
          {(() => {
            const diag = getAirQualityDiagnosis();
            const showDiag = pm25Sensor && pm10Sensor && pm1Sensor;
            if (!showDiag) return null;
            
            return (
              <div className="glass-card" style={{ 
                padding: '20px', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '12px',
                borderLeft: `4px solid ${diag.color === 'var(--color-success)' ? '#00E676' : diag.color}`,
                background: 'rgba(255, 255, 255, 0.02)',
                animation: 'fadeIn 0.3s ease'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ 
                      background: diag.color === 'var(--color-success)' ? 'rgba(0, 230, 118, 0.08)' : diag.color === '#FF6D00' ? 'rgba(255, 109, 0, 0.08)' : diag.color === '#FF1744' ? 'rgba(255, 23, 68, 0.08)' : 'rgba(255, 215, 0, 0.08)',
                      color: diag.color === 'var(--color-success)' ? '#00E676' : diag.color,
                      padding: '8px', 
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {diag.status === 'Aire Limpio' ? <Sparkles size={20} /> : diag.status.includes('Tráfico') ? <ShieldAlert size={20} /> : <Activity size={20} />}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        Diagnóstico de Origen de Partículas
                      </h4>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: diag.color === 'var(--color-success)' ? '#00E676' : diag.color, marginTop: '2px' }}>
                        {diag.status}
                      </h3>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'right', minWidth: '120px' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Ratio Ultrafino (R_uf)</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', justifyContent: 'flex-end' }}>
                        <div style={{ width: '60px', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, diag.r_uf * 100)}%`, height: '100%', background: '#E040FB', borderRadius: '3px' }} />
                        </div>
                        <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#fff', fontFamily: 'var(--font-mono)' }}>
                          {diag.r_uf.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    
                    <div style={{ textAlign: 'right', minWidth: '120px' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Ratio Finas/Gruesas (R_fg)</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', justifyContent: 'flex-end' }}>
                        <div style={{ width: '60px', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, diag.r_fg * 100)}%`, height: '100%', background: '#FF6D00', borderRadius: '3px' }} />
                        </div>
                        <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#fff', fontFamily: 'var(--font-mono)' }}>
                          {diag.r_fg.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: '1.5', margin: 0 }}>
                  {diag.desc}
                </p>
              </div>
            );
          })()}

          {/* Historical Trends Charts */}
          <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Historial de Mediciones</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Evolución temporal de los sensores IoT en casa.</p>
              </div>
              <div style={{ display: 'flex', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '2px' }}>
                {[
                  { value: 1, label: '1 Hora' },
                  { value: 6, label: '6 Horas' },
                  { value: 24, label: '24 Horas' },
                  { value: 168, label: '7 Días' }
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTimeRange(opt.value)}
                    style={{
                      background: timeRange === opt.value ? 'linear-gradient(135deg, #00F2FE 0%, #4FACFE 100%)' : 'none',
                      border: 'none',
                      color: timeRange === opt.value ? '#080B11' : 'var(--text-secondary)',
                      fontWeight: timeRange === opt.value ? 700 : 500,
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {chartData.length === 0 ? (
              <div style={{ height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No hay suficientes datos históricos en este período de tiempo.
              </div>
            ) : (
              <div style={{ height: '320px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 5, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF1744" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#FF1744" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorPM25" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF6D00" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#FF6D00" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorPM10" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4FACFE" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#4FACFE" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                    <XAxis 
                      dataKey="label" 
                      stroke="var(--text-muted)" 
                      fontSize={10} 
                      dy={10}
                      tickLine={false}
                    />
                    {/* Eje Y Izquierdo para Partículas */}
                    <YAxis 
                      yAxisId="left"
                      stroke="var(--text-muted)" 
                      fontSize={10} 
                      dx={-5}
                      tickLine={false}
                      domain={[0, 'auto']}
                    />
                    {/* Eje Y Derecho para Temperatura */}
                    <YAxis 
                      yAxisId="right"
                      orientation="right"
                      stroke="var(--text-muted)" 
                      fontSize={10} 
                      dx={5}
                      tickLine={false}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        background: 'var(--bg-secondary)', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: '12px',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: '0.8rem'
                      }} 
                    />
                    <Legend 
                      verticalAlign="top" 
                      height={36} 
                      wrapperStyle={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}
                    />
                    
                    {/* Temperatura DS18B20 */}
                    {sensors.some(s => s.sensor_name === 'ds18b20_temp') && (
                      <Area 
                        yAxisId="right"
                        name="Temperatura (°C)" 
                        type="monotone" 
                        dataKey="ds18b20_temp" 
                        stroke="#FF1744" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorTemp)" 
                        connectNulls={true}
                      />
                    )}
                    {/* PM2.5 ZH06 */}
                    {sensors.some(s => s.sensor_name === 'zh06_pm25') && (
                      <Area 
                        yAxisId="left"
                        name="PM2.5 (µg/m³)" 
                        type="monotone" 
                        dataKey="zh06_pm25" 
                        stroke="#FF6D00" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorPM25)" 
                        connectNulls={true}
                      />
                    )}
                    {/* PM10 ZH06 */}
                    {sensors.some(s => s.sensor_name === 'zh06_pm10') && (
                      <Area 
                        yAxisId="left"
                        name="PM10 (µg/m³)" 
                        type="monotone" 
                        dataKey="zh06_pm10" 
                        stroke="#4FACFE" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorPM10)" 
                        connectNulls={true}
                      />
                    )}
                    {/* PM1.0 ZH06 como línea */}
                    {sensors.some(s => s.sensor_name === 'zh06_pm1') && (
                      <Line 
                        yAxisId="left"
                        name="PM1.0 (µg/m³)" 
                        type="monotone" 
                        dataKey="zh06_pm1" 
                        stroke="#E040FB" 
                        strokeWidth={2}
                        dot={false}
                        connectNulls={true}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal de información de calidad del aire */}
      {infoPopup && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(8, 11, 17, 0.7)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            maxWidth: '500px',
            width: '100%',
            padding: '24px',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
                <Info size={20} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{infoPopup.title}</h3>
              </div>
              <button 
                onClick={() => setInfoPopup(null)}
                style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', fontSize: '0.8rem', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              >
                Cerrar
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.85rem', lineHeight: '1.5' }}>
              <div>
                <strong style={{ color: 'var(--color-primary)', display: 'block', marginBottom: '4px' }}>¿Qué es?</strong>
                <p style={{ color: 'var(--text-primary)' }}>{infoPopup.definition}</p>
              </div>
              <div>
                <strong style={{ color: 'var(--color-primary)', display: 'block', marginBottom: '4px' }}>Fuentes comunes:</strong>
                <p style={{ color: 'var(--text-secondary)' }}>{infoPopup.sources}</p>
              </div>
              <div>
                <strong style={{ color: 'var(--color-primary)', display: 'block', marginBottom: '4px' }}>Impacto en la Salud:</strong>
                <p style={{ color: 'var(--text-secondary)' }}>{infoPopup.health}</p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
