#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BMP280.h>
#include <Adafruit_AHTX0.h>

// --- CONFIGURACIÓN DE HARDWARE ---
#define USE_REAL_SENSORS 1

#if USE_REAL_SENSORS
  #include <OneWire.h>
  #include <DallasTemperature.h>

  #define ONE_WIRE_BUS 4 // Pin de datos DS18B20 (GPIO 4)
  OneWire oneWire(ONE_WIRE_BUS);
  DallasTemperature tempSensors(&oneWire);
#endif

// --- BMP280 + AHT20 (Humedad + Presión Atmosférica) ---
// Conectado via I2C: GPIO 21 (SDA), GPIO 22 (SCL)
Adafruit_BMP280 bmp;
Adafruit_AHTX0 aht;
bool bmpAvailable = false;
bool ahtAvailable = false;

// --- WINSEN ZH06 (Calidad de Aire PM1.0 / PM2.5 / PM10) ---
// Conectado via Serial2: GPIO 16 (RX2 ← TXD amarillo), GPIO 17 (TX2 → RXD verde)
#define ZH06_RX 16
#define ZH06_TX 17

// Comandos del ZH06
const uint8_t CMD_SLEEP[9]  = {0xFF, 0x01, 0xA7, 0x00, 0x00, 0x00, 0x00, 0x00, 0x58};
const uint8_t CMD_WAKEUP[9] = {0xFF, 0x01, 0xA7, 0x01, 0x00, 0x00, 0x00, 0x00, 0x57};

// Variables de estado del ZH06
bool zh06Awake = false;
unsigned long zh06WakeTime = 0;
unsigned long lastZH06Cycle = 0;
const unsigned long ZH06_CYCLE_INTERVAL = 480000;  // 8 minutos entre ciclos
const unsigned long ZH06_WARMUP_TIME = 30000;       // 30 segundos de calentamiento del ventilador

// Últimas lecturas de PM (persisten entre ciclos para mostrar en pantalla)
int lastPM1 = -1;
int lastPM25 = -1;
int lastPM10 = -1;
bool zh06HasData = false;

// --- CONFIGURACIÓN DE RED & SERVIDOR ---
const char* ssid = "Personal-145";
const char* password = "j5zCAcmFA6";
const char* serverUrl = "http://192.168.1.63:3001/api/sensors/data";

// Intervalo de envío de temperatura (30 segundos)
const unsigned long sendInterval = 30000;
unsigned long lastSendTime = 0;

// =============================================
// Funciones auxiliares
// =============================================

void connectWiFi() {
  Serial.print("Conectando a Wi-Fi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(1000);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n¡Wi-Fi Conectado!");
    Serial.print("Dirección IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nError al conectar a Wi-Fi. Reintentando más tarde...");
  }
}

void zh06SendCommand(const uint8_t* cmd) {
  Serial2.write(cmd, 9);
  Serial2.flush();
}

void zh06Sleep() {
  zh06SendCommand(CMD_SLEEP);
  zh06Awake = false;
  Serial.println("[ZH06] Sensor en modo reposo (ventilador apagado).");
}

void zh06Wakeup() {
  zh06SendCommand(CMD_WAKEUP);
  zh06Awake = true;
  zh06WakeTime = millis();
  Serial.println("[ZH06] Sensor despertado. Esperando 30s de estabilización...");
}

// Leer trama del ZH06 (protocolo compatible PMS - cabecera 0x42 0x4D)
bool zh06Read(int &pm1, int &pm25, int &pm10) {
  // 1. Limpiar el buffer acumulado durante los 30 segundos de precalentamiento
  while (Serial2.available() > 0) {
    Serial2.read();
  }
  
  // 2. Esperar una trama nueva y fresca (tiempo límite de 2 segundos)
  unsigned long startTimeout = millis();
  while (millis() - startTimeout < 2000) {
    if (Serial2.available() > 0 && Serial2.read() == 0x42) {
      // Encontró el byte de inicio, esperar a que lleguen los otros 31 bytes de la trama
      unsigned long frameTimeout = millis();
      while (Serial2.available() < 31) {
        if (millis() - frameTimeout > 200) {
          Serial.println("[ZH06] Error: Tiempo de espera agotado para completar la trama.");
          return false;
        }
        delay(5);
      }
      
      uint8_t buf[32];
      buf[0] = 0x42;
      Serial2.readBytes(&buf[1], 31); // Leer los 31 bytes restantes
      
      // Verificar segundo byte de cabecera
      if (buf[1] != 0x4D) {
        Serial.print("[ZH06] Error: Segundo byte incorrecto: 0x");
        Serial.println(buf[1], HEX);
        continue; // Seguir buscando otra trama
      }
      
      // PM1.0 atmosférico (bytes 10-11)
      pm1  = (buf[10] << 8) | buf[11];
      // PM2.5 atmosférico (bytes 12-13)
      pm25 = (buf[12] << 8) | buf[13];
      // PM10 atmosférico (bytes 14-15)
      pm10 = (buf[14] << 8) | buf[15];
      
      return true;
    }
    delay(1);
  }
  Serial.println("[ZH06] Error: No se detectó el byte de inicio 0x42 en 2 segundos.");
  return false;
}

void sendToRuperta(const String& payload) {
  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");

  Serial.print("Enviando JSON a Ruperta: ");
  Serial.println(payload);

  int httpResponseCode = http.POST(payload);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print("Código de Respuesta HTTP: ");
    Serial.println(httpResponseCode);
    Serial.println("Respuesta del Servidor: " + response);
  } else {
    Serial.print("Error al realizar POST. Código: ");
    Serial.println(httpResponseCode);
  }

  http.end();
}

// =============================================
// Setup
// =============================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("--- Iniciando ESP32 Ruperta Node ---");
  Serial.println("    Sensores: DS18B20 (Temp) + BME280 (Hum/Press) + ZH06 (PM)");
  
  connectWiFi();

  #if USE_REAL_SENSORS
    // Inicializar DS18B20
    Serial.println("Inicializando sensor DS18B20 (temperatura)...");
    tempSensors.begin();
  #endif

  // Inicializar BMP280 via I2C (presión)
  Serial.println("Inicializando sensor BMP280 (presión)...");
  if (bmp.begin(0x76)) {
    bmpAvailable = true;
    Serial.println("[BMP280] Sensor detectado en dirección 0x76.");
  } else if (bmp.begin(0x77)) {
    bmpAvailable = true;
    Serial.println("[BMP280] Sensor detectado en dirección 0x77.");
  } else {
    bmpAvailable = false;
    Serial.println("[BMP280] ¡ERROR! No se detectó el sensor. Verificar conexiones.");
  }

  // Inicializar AHT20 via I2C (humedad)
  Serial.println("Inicializando sensor AHT20 (humedad)...");
  if (aht.begin()) {
    ahtAvailable = true;
    Serial.println("[AHT20] Sensor detectado (0x38).");
  } else {
    ahtAvailable = false;
    Serial.println("[AHT20] ¡ERROR! No se detectó el sensor de humedad.");
  }

  // Inicializar Serial2 para ZH06 (9600 baudios)
  Serial2.begin(9600, SERIAL_8N1, ZH06_RX, ZH06_TX);
  delay(500);
  
  // Poner ZH06 en modo reposo al iniciar (ahorro de vida útil)
  zh06Sleep();
  
  // Forzar primer ciclo del ZH06 después de 10 segundos
  lastZH06Cycle = millis() - ZH06_CYCLE_INTERVAL + 10000;
  
  Serial.println("--- Setup completo. Comenzando monitoreo ---");
}

// =============================================
// Loop principal
// =============================================
void loop() {
  unsigned long now = millis();

  // --- Reconexión Wi-Fi si se pierde ---
  if (WiFi.status() != WL_CONNECTED && (now - lastSendTime > 15000)) {
    Serial.println("Conexión perdida. Reconectando...");
    connectWiFi();
  }

  // ============================================
  // CICLO 1: Sensores periódicos cada 30 seg
  //   - DS18B20: Temperatura
  //   - BME280:  Humedad + Presión Atmosférica
  // ============================================
  if (now - lastSendTime >= sendInterval) {
    lastSendTime = now;

    if (WiFi.status() == WL_CONNECTED) {
      float temp = 0.0;

      #if USE_REAL_SENSORS
        tempSensors.requestTemperatures();
        temp = tempSensors.getTempCByIndex(0);
        
        if (temp == DEVICE_DISCONNECTED_C) {
          Serial.println("¡Error: DS18B20 no detectado! Usando fallback.");
          temp = 22.0;
        } else {
          Serial.print("Lectura DS18B20: ");
          Serial.print(temp);
          Serial.println(" °C");
        }
      #else
        temp = 22.0 + random(-20, 20) / 10.0;
      #endif

      // Construir JSON con temperatura + humedad + presión
      StaticJsonDocument<512> doc;
      JsonArray readings = doc.to<JsonArray>();

      // Sensor: Temperatura (DS18B20 — más preciso que BME280)
      JsonObject r1 = readings.createNestedObject();
      r1["sensor_name"] = "ds18b20_temp";
      r1["sensor_type"] = "temperature";
      r1["value"] = temp;
      r1["unit"] = "°C";

      // Sensor: Humedad + Presión (BMP280 + AHT20 via I2C)
      if (bmpAvailable || ahtAvailable) {
        float humidity = NAN;
        float pressure = NAN;
        
        if (bmpAvailable) {
            pressure = bmp.readPressure() / 100.0F; // Pa → hPa
        }
        if (ahtAvailable) {
            sensors_event_t humidityEvent, tempEvent;
            aht.getEvent(&humidityEvent, &tempEvent);
            humidity = humidityEvent.relative_humidity;
        }

        if (bmpAvailable && !isnan(pressure)) {
          Serial.print("Lectura BMP280 — Presión: ");
          Serial.print(pressure);
          Serial.println(" hPa");

          // Presión atmosférica
          JsonObject rPress = readings.createNestedObject();
          rPress["sensor_name"] = "bme280_press"; // Mantenemos mismo nombre para que Ruperta no pierda historia
          rPress["sensor_type"] = "pressure";
          rPress["value"] = pressure;
          rPress["unit"] = "hPa";
        }
        
        if (ahtAvailable && !isnan(humidity)) {
          Serial.print("Lectura AHT20 — Humedad: ");
          Serial.print(humidity);
          Serial.println("%");

          // Humedad relativa
          JsonObject rHum = readings.createNestedObject();
          rHum["sensor_name"] = "bme280_hum"; // Mantenemos mismo nombre para Ruperta
          rHum["sensor_type"] = "humidity";
          rHum["value"] = humidity;
          rHum["unit"] = "%";
        }
      }

      String payload;
      serializeJson(doc, payload);
      sendToRuperta(payload);
    } else {
      Serial.println("No se puede enviar telemetría: Sin conexión Wi-Fi.");
    }
  }

  // ============================================
  // CICLO 2: ZH06 - Calidad de Aire cada 8 min
  // ============================================

  // Paso A: ¿Es hora de despertar el ZH06?
  if (!zh06Awake && (now - lastZH06Cycle >= ZH06_CYCLE_INTERVAL)) {
    zh06Wakeup();
  }

  // Paso B: ¿Ya pasaron los 30 segundos de calentamiento?
  if (zh06Awake && (now - zh06WakeTime >= ZH06_WARMUP_TIME)) {
    int pm1, pm25, pm10;
    
    if (zh06Read(pm1, pm25, pm10)) {
      Serial.println("═══════════════════════════════════════");
      Serial.println("[ZH06] Lectura exitosa de calidad de aire:");
      Serial.print("  PM1.0:  "); Serial.print(pm1);  Serial.println(" µg/m³");
      Serial.print("  PM2.5:  "); Serial.print(pm25); Serial.println(" µg/m³");
      Serial.print("  PM10:   "); Serial.print(pm10); Serial.println(" µg/m³");
      Serial.println("═══════════════════════════════════════");
      
      // Guardar lecturas en memoria
      lastPM1 = pm1;
      lastPM25 = pm25;
      lastPM10 = pm10;
      zh06HasData = true;

      // Enviar inmediatamente a Ruperta el reporte de calidad de aire
      if (WiFi.status() == WL_CONNECTED) {
        StaticJsonDocument<512> pmDoc;
        JsonArray pmReadings = pmDoc.to<JsonArray>();

        JsonObject r2 = pmReadings.createNestedObject();
        r2["sensor_name"] = "zh06_pm25";
        r2["sensor_type"] = "air_quality";
        r2["value"] = pm25;
        r2["unit"] = "µg/m³";

        JsonObject r3 = pmReadings.createNestedObject();
        r3["sensor_name"] = "zh06_pm10";
        r3["sensor_type"] = "particulate";
        r3["value"] = pm10;
        r3["unit"] = "µg/m³";

        JsonObject r4 = pmReadings.createNestedObject();
        r4["sensor_name"] = "zh06_pm1";
        r4["sensor_type"] = "particulate_fine";
        r4["value"] = pm1;
        r4["unit"] = "µg/m³";

        String pmPayload;
        serializeJson(pmDoc, pmPayload);
        sendToRuperta(pmPayload);
      }
    } else {
      Serial.println("[ZH06] No se pudo leer la trama. Reintentando en el próximo ciclo.");
    }

    // Dormir el sensor para preservar vida útil
    zh06Sleep();
    lastZH06Cycle = now;
  }
}
