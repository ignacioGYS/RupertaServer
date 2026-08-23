#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// --- CONFIGURACIÓN DE HARDWARE ---
// Define si quieres usar sensores reales o simulados para probar la API rápidamente
#define USE_REAL_SENSORS 1 // Cambia a 1 para usar sensores reales

#if USE_REAL_SENSORS
  #include <OneWire.h>
  #include <DallasTemperature.h>

  #define ONE_WIRE_BUS 4 // Pin de datos (GPIO 4)
  OneWire oneWire(ONE_WIRE_BUS);
  DallasTemperature sensors(&oneWire);
#endif

// --- CONFIGURACIÓN DE RED & SERVIDOR ---
const char* ssid = "Personal-145";
const char* password = "j5zCAcmFA6";

// Reemplaza con la IP de tu servidor Ruperta. 
// - Usa 192.168.1.63 si estás conectando al servidor principal
// - Usa 192.168.1.72 si estás corriendo el servidor de pruebas en esta máquina local
const char* serverUrl = "http://192.168.1.63:3001/api/sensors/data";

// Intervalo de envío en milisegundos (ej: 30000 ms = 30 segundos)
const unsigned long sendInterval = 30000; // 30 segundos
unsigned long lastSendTime = 0;

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

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("--- Iniciando ESP32 Ruperta Node ---");
  
  connectWiFi();

  #if USE_REAL_SENSORS
    Serial.println("Inicializando sensores físicos (DS18B20)...");
    sensors.begin();
  #else
    Serial.println("Corriendo en MODO SIMULACIÓN (sensores desactivados)");
  #endif
}

void loop() {
  // Intentar reconectar Wi-Fi si se pierde la conexión
  if (WiFi.status() != WL_CONNECTED && (millis() - lastSendTime > 15000)) {
    Serial.println("Conexión perdida. Reconectando...");
    connectWiFi();
  }

  // Bucle de lectura y transmisión
  if (millis() - lastSendTime >= sendInterval) {
    lastSendTime = millis();

    if (WiFi.status() == WL_CONNECTED) {
      float temp = 0.0;
      float hum = 0.0;
      float press = 0.0;
      float co2 = 0.0;

      #if USE_REAL_SENSORS
        // 1. Lectura del sensor DS18B20 real
        sensors.requestTemperatures();
        temp = sensors.getTempCByIndex(0);
        
        if (temp == DEVICE_DISCONNECTED_C) {
          Serial.println("¡Error: Sensor DS18B20 no detectado! Usando valor fallback.");
          temp = 22.0;
        } else {
          Serial.print("Lectura DS18B20: ");
          Serial.print(temp);
          Serial.println(" °C");
        }
      #else
        // 2. Lecturas simuladas para testing
        temp = 22.0 + random(-20, 20) / 10.0;
      #endif

      // 3. Crear el documento JSON (solo con temperatura)
      StaticJsonDocument<256> doc;
      JsonArray readings = doc.to<JsonArray>();

      // Sensor: Temperatura
      JsonObject r1 = readings.createNestedObject();
      #if USE_REAL_SENSORS
        r1["sensor_name"] = "ds18b20_temp";
      #else
        r1["sensor_name"] = "dht22_temp";
      #endif
      r1["sensor_type"] = "temperature";
      r1["value"] = temp;
      r1["unit"] = "°C";

      String payload;
      serializeJson(doc, payload);

      // 4. Enviar petición HTTP POST
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
    } else {
      Serial.println("No se puede enviar telemetría: Sin conexión Wi-Fi.");
    }
  }
}
