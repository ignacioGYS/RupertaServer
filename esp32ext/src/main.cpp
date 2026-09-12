#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---------------------------------------------------------
// CONFIGURACIÓN DE RED Y SERVIDOR
// ---------------------------------------------------------
const char* ssid = "Personal-145";
const char* password = "j5zCAcmFA6";
const char* serverUrl = "http://192.168.1.63:3001/api/sensors/data";

// ---------------------------------------------------------
// CONFIGURACIÓN PANTALLA OLED
// ---------------------------------------------------------
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
// SDA = 21, SCL = 22 por defecto en ESP32
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Variables de animación
unsigned long lastBlinkTime = 0;
int blinkInterval = 3000; // Parpadea cada 3s en promedio
bool isBlinking = false;
unsigned long blinkStart = 0;

// ---------------------------------------------------------
// CONFIGURACIÓN SENSOR ULTRASONIDO (Agua AC)
// ---------------------------------------------------------
#define TRIG_PIN 5
#define ECHO_PIN 18

// Medidas del tanque (en cm)
const float DISTANCE_EMPTY = 100.0;
const float DISTANCE_FULL = 10.0;

// Envío de datos
const unsigned long sendInterval = 30000;
unsigned long lastSendTime = 0;

void drawFace(bool blinking) {
  display.clearDisplay();
  
  // Coordenadas de los ojos
  int leftEyeX = 40;
  int rightEyeX = 88;
  int eyeY = 28;
  int eyeWidth = 14;
  int eyeHeight = 20;

  if (blinking) {
    // Ojos cerrados (líneas horizontales)
    display.fillRect(leftEyeX - eyeWidth/2, eyeY + eyeHeight/2 - 2, eyeWidth, 4, SSD1306_WHITE);
    display.fillRect(rightEyeX - eyeWidth/2, eyeY + eyeHeight/2 - 2, eyeWidth, 4, SSD1306_WHITE);
  } else {
    // Ojos abiertos (círculos rellenos o rectángulos redondeados)
    display.fillRoundRect(leftEyeX - eyeWidth/2, eyeY - eyeHeight/2, eyeWidth, eyeHeight, 5, SSD1306_WHITE);
    display.fillRoundRect(rightEyeX - eyeWidth/2, eyeY - eyeHeight/2, eyeWidth, eyeHeight, 5, SSD1306_WHITE);
    
    // Pupila mirando un poquito de lado para que tenga onda
    display.fillCircle(leftEyeX + 2, eyeY - 2, 3, SSD1306_BLACK);
    display.fillCircle(rightEyeX + 2, eyeY - 2, 3, SSD1306_BLACK);
  }

  // Sonrisa grande
  display.drawPixel(53, 46, SSD1306_WHITE);
  display.drawPixel(54, 48, SSD1306_WHITE);
  display.drawFastHLine(55, 49, 18, SSD1306_WHITE);
  display.drawPixel(73, 48, SSD1306_WHITE);
  display.drawPixel(74, 46, SSD1306_WHITE);

  // Texto "Hola Gaby!"
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(34, 4);
  display.print("Hola Gaby!");

  display.display();
}

void setup() {
  Serial.begin(115200);

  // Iniciar OLED
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { // Dirección 0x3C es la más común
    Serial.println(F("Error al iniciar SSD1306 OLED"));
  } else {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(10, 20);
    display.println("Iniciando...");
    display.display();
    delay(1000);
  }

  // Iniciar Sensor
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // Conectar Wi-Fi
  Serial.print("Conectando a Wi-Fi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Conectado!");
}

void loop() {
  // Lógica de Animación No-bloqueante
  unsigned long currentMillis = millis();
  
  if (!isBlinking && (currentMillis - lastBlinkTime > blinkInterval)) {
    isBlinking = true;
    blinkStart = currentMillis;
    drawFace(true); // Cierra los ojos
  }
  
  if (isBlinking && (currentMillis - blinkStart > 150)) { // Parpadeo de 150ms
    isBlinking = false;
    lastBlinkTime = currentMillis;
    blinkInterval = random(2000, 6000); // Randomiza el próximo parpadeo
    drawFace(false); // Abre los ojos
  }
  
  // Dibujar cara por defecto si acaba de iniciar y no parpadea
  if (currentMillis < 1000) {
    drawFace(false);
  }

  // Enviar telemetría periódicamente
  if (currentMillis - lastSendTime >= sendInterval) {
    lastSendTime = currentMillis;

    // Disparar ultrasonido
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);

    long duration = pulseIn(ECHO_PIN, HIGH, 30000);
    if (duration == 0) {
      Serial.println("Error de lectura: timeout del HC-SR04 (no hay eco).");
      return;
    }

    float distance_cm = duration * 0.034 / 2.0;
    float level_pct = 0.0;
    if (distance_cm <= DISTANCE_FULL) {
      level_pct = 100.0;
    } else if (distance_cm >= DISTANCE_EMPTY) {
      level_pct = 0.0;
    } else {
      level_pct = 100.0 - ((distance_cm - DISTANCE_FULL) / (DISTANCE_EMPTY - DISTANCE_FULL) * 100.0);
    }

    Serial.print("Distancia: "); Serial.print(distance_cm); Serial.println(" cm");
    Serial.print("Nivel: "); Serial.print(level_pct); Serial.println(" %");

    if (WiFi.status() == WL_CONNECTED) {
      StaticJsonDocument<256> doc;
      JsonArray readings = doc.to<JsonArray>();

      JsonObject acWater = readings.createNestedObject();
      acWater["sensor_name"] = "ac_water_level";
      acWater["sensor_type"] = "water_level";
      acWater["value"] = level_pct;
      acWater["unit"] = "%";

      String payload;
      serializeJson(doc, payload);

      HTTPClient http;
      http.begin(serverUrl);
      http.addHeader("Content-Type", "application/json");
      int httpCode = http.POST(payload);
      http.end();
      
      Serial.print("POST a Ruperta - HTTP Code: "); Serial.println(httpCode);
    }
  }
}
