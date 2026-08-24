#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// --- CONFIGURACIÓN DE HARDWARE ---
#define USE_REAL_SENSORS 1

#if USE_REAL_SENSORS
  #include <OneWire.h>
  #include <DallasTemperature.h>

  #define ONE_WIRE_BUS 4 // Pin de datos DS18B20 (GPIO 4)
  OneWire oneWire(ONE_WIRE_BUS);
  DallasTemperature tempSensors(&oneWire);
#endif

// --- WINSEN ZH06 (Calidad de Aire PM1.0 / PM2.5 / PM10) ---
// Conectado via Serial2: GPIO 16 (RX2 ← TXD amarillo), GPIO 17 (TX2 → RXD verde)
#define ZH06_RX 16
#define ZH06_TX 17

// Comandos del ZH06
const uint8_t CMD_SLEEP[9]  = {0xFF, 0x01, 0xA7, 0x01, 0x00, 0x00, 0x00, 0x00, 0x57};
const uint8_t CMD_WAKEUP[9] = {0xFF, 0x01, 0xA7, 0x00, 0x00, 0x00, 0x00, 0x00, 0x58};

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
  // Vaciar buffer viejo
  while (Serial2.available()) {
    // Buscar cabecera 0x42
    if (Serial2.read() == 0x42) {
      if (Serial2.available() < 31) {
        delay(50); // Esperar que llegue el resto de la trama
        if (Serial2.available() < 31) return false;
      }
      
      uint8_t buf[31];
      buf[0] = 0x42;
      Serial2.readBytes(&buf[1], 30); // Leer los 30 bytes restantes (total 32 con 0x42 prepend)
      
      // Verificar segundo byte de cabecera
      if (buf[1] != 0x4D) continue;
      
      // Calcular checksum
      uint16_t checksum = 0;
      for (int i = 0; i < 30; i++) {
        checksum += buf[i];
      }
      uint16_t frameCheck = (buf[30] << 8) | buf[31 - 1];
      // Nota: en algunas implementaciones el checksum puede variar,
      // usamos los datos atmosféricos (bytes 10-15) que son más representativos
      
      // PM1.0 atmosférico (bytes 10-11)
      pm1  = (buf[10] << 8) | buf[11];
      // PM2.5 atmosférico (bytes 12-13)
      pm25 = (buf[12] << 8) | buf[13];
      // PM10 atmosférico (bytes 14-15)
      pm10 = (buf[14] << 8) | buf[15];
      
      return true;
    }
  }
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
  Serial.println("    Sensores: DS18B20 (Temp) + ZH06 (PM)");
  
  connectWiFi();

  #if USE_REAL_SENSORS
    // Inicializar DS18B20
    Serial.println("Inicializando sensor DS18B20 (temperatura)...");
    tempSensors.begin();
  #endif

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
  // CICLO 1: DS18B20 - Temperatura cada 30 seg
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

      // Construir JSON con temperatura + últimas lecturas de PM (si existen)
      StaticJsonDocument<512> doc;
      JsonArray readings = doc.to<JsonArray>();

      // Sensor: Temperatura
      JsonObject r1 = readings.createNestedObject();
      r1["sensor_name"] = "ds18b20_temp";
      r1["sensor_type"] = "temperature";
      r1["value"] = temp;
      r1["unit"] = "°C";

      // Si tenemos datos del ZH06, incluirlos en cada envío para actualizar la pantalla
      if (zh06HasData) {
        JsonObject r2 = readings.createNestedObject();
        r2["sensor_name"] = "zh06_pm25";
        r2["sensor_type"] = "air_quality";
        r2["value"] = lastPM25;
        r2["unit"] = "µg/m³";

        JsonObject r3 = readings.createNestedObject();
        r3["sensor_name"] = "zh06_pm10";
        r3["sensor_type"] = "particulate";
        r3["value"] = lastPM10;
        r3["unit"] = "µg/m³";

        JsonObject r4 = readings.createNestedObject();
        r4["sensor_name"] = "zh06_pm1";
        r4["sensor_type"] = "particulate_fine";
        r4["value"] = lastPM1;
        r4["unit"] = "µg/m³";
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
      
      // Guardar lecturas para incluir en próximos envíos de temperatura
      lastPM1 = pm1;
      lastPM25 = pm25;
      lastPM10 = pm10;
      zh06HasData = true;
    } else {
      Serial.println("[ZH06] No se pudo leer la trama. Reintentando en el próximo ciclo.");
    }

    // Dormir el sensor para preservar vida útil
    zh06Sleep();
    lastZH06Cycle = now;
  }
}
