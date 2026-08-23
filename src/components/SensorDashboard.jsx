import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Thermometer, Droplets, Gauge, Wind, RefreshCw, Code, BookOpen, AlertTriangle, CheckCircle, Wifi, Copy, Check } from 'lucide-react';

export default function SensorDashboard() {
  const [sensors, setSensors] = useState([]);
  const [history, setHistory] = useState([]);
  const [timeRange, setTimeRange] = useState(24); // default 24 hours
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedText, setCopiedText] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const isMounted = useRef(true);

  const serverUrl = `http://${window.location.hostname}:3001/api/sensors/data`;

  const fetchLatest = async () => {
    try {
      const res = await fetch('/api/sensors/latest');
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
      const res = await fetch(`/api/sensors/history?hours=${hours}`);
      if (!res.ok) throw new Error('Error al obtener el historial');
      const data = await res.json();
      if (isMounted.current) {
        setHistory(data.history || []);
      }
    } catch (e) {
      console.error('Error fetching sensor history:', e);
    }
  };

  const loadAllData = async (hours = timeRange) => {
    setLoading(true);
    await Promise.all([fetchLatest(), fetchHistory(hours)]);
    if (isMounted.current) setLoading(false);
  };

  // Poll latest data every 10 seconds
  useEffect(() => {
    isMounted.current = true;
    loadAllData();

    const interval = setInterval(fetchLatest, 10000);
    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, []);

  // Reload history when timeRange changes
  useEffect(() => {
    fetchHistory(timeRange);
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
    // Consider active if updated in the last 3 minutes (180,000 ms)
    return (now - readingTime) < 180000;
  };

  // Pivot historical data for Recharts
  const getChartData = () => {
    const grouped = {};
    history.forEach(item => {
      const date = new Date(item.timestamp);
      // Format X-axis depending on time range
      let label = '';
      if (timeRange <= 24) {
        label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        label = `${date.getDate()} ${date.toLocaleDateString([], { month: 'short' })} ${date.getHours()}:00`;
      }
      
      if (!grouped[item.timestamp]) {
        grouped[item.timestamp] = { 
          timestamp: item.timestamp,
          label: label 
        };
      }
      grouped[item.timestamp][item.sensor_name] = parseFloat(item.value.toFixed(1));
    });
    return Object.values(grouped).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  };

  // Dynamic feedback and color palettes for cards
  const getAirQualityStatus = (value) => {
    if (value <= 50) return { label: 'Excelente', color: 'var(--color-success)', desc: 'Calidad de aire óptima.' };
    if (value <= 100) return { label: 'Moderada', color: 'var(--color-warning)', desc: 'Aceptable, pero con algo de polución.' };
    return { label: 'Pobre', color: 'var(--color-danger)', desc: 'Calidad de aire insalubre o alta concentración de gases.' };
  };

  const getTempColor = (temp) => {
    if (temp < 18) return '#4FACFE'; // Cold
    if (temp <= 27) return '#00E676'; // Comfortable
    return '#FF1744'; // Hot
  };

  const tempSensor = getLatestSensor('temperature');
  const humiditySensor = getLatestSensor('humidity');
  const pressureSensor = getLatestSensor('pressure');
  const co2Sensor = getLatestSensor('air_quality');

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

            {/* Humidity Card */}
            <div className="glass-card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.05, pointerEvents: 'none' }}>
                <Droplets size={100} style={{ color: '#4FACFE' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Humedad Relativa</span>
                <span className="network-speed-badge-rx" style={{ background: 'rgba(0, 230, 118, 0.08)', color: 'var(--color-success)', border: '1px solid rgba(0, 230, 118, 0.2)' }}>
                  {humiditySensor ? humiditySensor.sensor_name.replace('_hum', '').toUpperCase() : 'N/A'}
                </span>
              </div>
              {humiditySensor && isSensorActive(humiditySensor) ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--color-secondary)' }}>
                      {humiditySensor.value.toFixed(1)}
                    </span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{humiditySensor.unit || '%'}</span>
                  </div>
                  {/* Visual gauge representation */}
                  <div style={{ background: 'rgba(255,255,255,0.05)', width: '100%', height: '4px', borderRadius: '2px', marginTop: '8px' }}>
                    <div style={{ background: 'var(--color-secondary)', width: `${Math.min(100, Math.max(0, humiditySensor.value))}%`, height: '100%', borderRadius: '2px' }} />
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                    Actualizado: {new Date(humiditySensor.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-muted)' }}>
                      ---
                    </span>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', width: '100%', height: '4px', borderRadius: '2px', marginTop: '8px' }} />
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px', fontWeight: 500 }}>
                    No se está midiendo
                  </p>
                </div>
              )}
            </div>

            {/* Atmospheric Pressure Card */}
            <div className="glass-card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.05, pointerEvents: 'none' }}>
                <Gauge size={100} style={{ color: 'var(--color-primary)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Presión Atmosférica</span>
                <span className="network-speed-badge-tx" style={{ background: 'rgba(0, 242, 254, 0.08)', color: 'var(--color-primary)', border: '1px solid rgba(0, 242, 254, 0.2)' }}>
                  {pressureSensor ? pressureSensor.sensor_name.replace('_press', '').toUpperCase() : 'N/A'}
                </span>
              </div>
              {pressureSensor && isSensorActive(pressureSensor) ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                      {pressureSensor.value.toFixed(1)}
                    </span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{pressureSensor.unit || 'hPa'}</span>
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                    Actualizado: {new Date(pressureSensor.timestamp).toLocaleTimeString()}
                  </p>
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

            {/* Air Quality Card */}
            <div className="glass-card" style={{ padding: '20px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.05, pointerEvents: 'none' }}>
                <Wind size={100} style={{ color: co2Sensor ? getAirQualityStatus(co2Sensor.value).color : '#fff' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Calidad del Aire</span>
                <span className="network-speed-badge-rx" style={{ background: 'rgba(0, 230, 118, 0.08)', color: 'var(--color-success)', border: '1px solid rgba(0, 230, 118, 0.2)' }}>
                  {co2Sensor ? co2Sensor.sensor_name.replace('_co2', '').toUpperCase() : 'N/A'}
                </span>
              </div>
              {co2Sensor && isSensorActive(co2Sensor) ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ 
                      fontSize: '2.5rem', 
                      fontWeight: 800, 
                      fontFamily: 'var(--font-display)', 
                      color: getAirQualityStatus(co2Sensor.value).color 
                    }}>
                      {co2Sensor.value.toFixed(0)}
                    </span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{co2Sensor.unit || 'PPM'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: getAirQualityStatus(co2Sensor.value).color }}>
                      {getAirQualityStatus(co2Sensor.value).label}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>— {getAirQualityStatus(co2Sensor.value).desc}</span>
                  </div>
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

          </div>

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
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF1744" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#FF1744" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorHum" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4FACFE" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#4FACFE" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorAir" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00E676" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#00E676" stopOpacity={0}/>
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
                    <YAxis 
                      stroke="var(--text-muted)" 
                      fontSize={10} 
                      dx={-5}
                      tickLine={false}
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
                    
                    {/* Render line for sensors if they exist in dataset */}
                    {sensors.some(s => s.sensor_name === 'dht22_temp') && (
                      <Area 
                        name="Temperatura (°C)" 
                        type="monotone" 
                        dataKey="dht22_temp" 
                        stroke="#FF1744" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorTemp)" 
                      />
                    )}
                    {sensors.some(s => s.sensor_name === 'ds18b20_temp') && (
                      <Area 
                        name="Temperatura (°C)" 
                        type="monotone" 
                        dataKey="ds18b20_temp" 
                        stroke="#FF1744" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorTemp)" 
                      />
                    )}
                    {sensors.some(s => s.sensor_name === 'dht22_hum') && (
                      <Area 
                        name="Humedad (%)" 
                        type="monotone" 
                        dataKey="dht22_hum" 
                        stroke="#4FACFE" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorHum)" 
                      />
                    )}
                    {sensors.some(s => s.sensor_name === 'mq135_co2') && (
                      <Area 
                        name="Partículas MQ135 (PPM)" 
                        type="monotone" 
                        dataKey="mq135_co2" 
                        stroke="#00E676" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorAir)" 
                      />
                    )}
                    {/* BMP280 pressure can be plotted as a separate line */}
                    {sensors.some(s => s.sensor_name === 'bmp280_press') && (
                      <Line 
                        name="Presión (hPa)" 
                        type="monotone" 
                        dataKey="bmp280_press" 
                        stroke="#FF9100" 
                        strokeWidth={2}
                        dot={false}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}

    </div>
  );
}
