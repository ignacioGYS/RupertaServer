#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// --- CONFIGURACIÓN DE HARDWARE ---
// Define si quieres usar sensores reales o simulados para probar la API rápidamente
#define USE_REAL_SENSORS 0 // Cambia a 1 para usar sensores reales

#if USE_REAL_SENSORS
  #include <DHT.h>
  #include <Adafruit_BME280.h>
  #include <Wire.h>

  #define DHTPIN 4
  #define DHTTYPE DHT22
  DHT dht(DHTPIN, DHTTYPE);
  Adafruit_BME280 bme;
#endif

// --- CONFIGURACIÓN DE RED & SERVIDOR ---
const char* ssid = "Personal-145";
const char* password = "j5zCAcmFA6";

// Reemplaza con la IP de tu servidor Ruperta. 
// - Usa 192.168.1.63 si estás conectando al servidor principal
// - Usa 192.168.1.72 si estás corriendo el servidor de pruebas en esta máquina local
const char* serverUrl = "http://192.168.1.63:3001/api/sensors/data";

// Intervalo de envío en milisegundos (ej: 30000 ms = 30 segundos)
const unsigned long sendInterval = 30000;
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
    Serial.println("Inicializando sensores físicos...");
    dht.begin();
    if (!bme.begin(0x76)) {  // Dirección I2C común para BME280
      Serial.println("¡No se encontró el sensor BME280! Revisa la conexión I2C.");
    }
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
        // 1. Lectura de sensores físicos
        temp = dht.readTemperature();
        hum = dht.readHumidity();
        press = bme.readPressure() / 100.0F; // Convertir Pa a hPa
        
        // Sensor de calidad del aire analógico (MQ135 en pin A0/GPIO36)
        int mqValue = analogRead(36);
        co2 = map(mqValue, 0, 4095, 350, 2000); // Mapeo simulado de PPM

        // Validar lecturas
        if (isnan(temp) || isnan(hum)) {
          Serial.println("¡Error al leer del sensor DHT!");
          temp = 20.0; // Valores fallback
          hum = 50.0;
        }
      #else
        // 2. Lecturas simuladas para testing
        temp = 22.0 + random(-20, 20) / 10.0;
        hum = 60.0 + random(-50, 50) / 10.0;
        press = 1013.2 + random(-10, 10) / 10.0;
        co2 = 400.0 + random(0, 300);
      #endif

      // 3. Crear el documento JSON
      StaticJsonDocument<1024> doc;
      JsonArray readings = doc.to<JsonArray>();

      // Sensor 1: Temperatura
      JsonObject r1 = readings.createNestedObject();
      r1["sensor_name"] = "dht22_temp";
      r1["sensor_type"] = "temperature";
      r1["value"] = temp;
      r1["unit"] = "°C";

      // Sensor 2: Humedad
      JsonObject r2 = readings.createNestedObject();
      r2["sensor_name"] = "dht22_hum";
      r2["sensor_type"] = "humidity";
      r2["value"] = hum;
      r2["unit"] = "%";

      // Sensor 3: Presión
      JsonObject r3 = readings.createNestedObject();
      r3["sensor_name"] = "bmp280_press";
      r3["sensor_type"] = "pressure";
      r3["value"] = press;
      r3["unit"] = "hPa";

      // Sensor 4: Calidad del aire
      JsonObject r4 = readings.createNestedObject();
      r4["sensor_name"] = "mq135_co2";
      r4["sensor_type"] = "air_quality";
      r4["value"] = co2;
      r4["unit"] = "PPM";

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
