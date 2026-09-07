# Firmware ESP32 para Ruperta

Este proyecto contiene el código base en C++ (Arduino framework) para configurar un ESP32 que recopila lecturas de sensores (físicos o simulados) y las transmite al servidor de **Ruperta** a través de la red local.

## Sensores Soportados
Por defecto, la plantilla está configurada para:
1. **DHT22** (Temperatura y Humedad en Pin 4)
2. **BMP280 / BME280** (Presión Atmosférica en pines I2C estándar SDA/SCL)
3. **MQ-135** (Calidad de Aire / Gases en pin analógico GPIO36)

## Cómo empezar (Modo Simulación)
Si aún no tienes los sensores conectados físicamente, la placa enviará lecturas aleatorias simuladas válidas para que puedas ver el panel y los gráficos funcionando de inmediato.

1. Abre el archivo [src/main.cpp](src/main.cpp).
2. Asegúrate de que `#define USE_REAL_SENSORS` esté en `0`.
3. Introduce el nombre y contraseña de tu red Wi-Fi en `ssid` y `password`.
4. Introduce la IP del servidor de Ruperta en `serverUrl` (puedes ver la URL exacta desde la nueva pestaña **Sensores IoT** en la interfaz de Ruperta).
5. Sube el código a tu placa ESP32.

---

## Cómo programar el ESP32 desde este IDE

Puedes compilar y subir el código directamente desde la terminal integrada en este entorno usando **PlatformIO Core**:

### 1. Instalar PlatformIO Core en tu sistema
Ejecuta en la terminal de tu máquina:
```bash
pip install -U platformio
```

### 2. Compilar el código
Para verificar que el código compila perfectamente sin errores:
```bash
cd esp32
pio run
```

### 3. Subir el código al ESP32 (con la placa conectada por USB)
Conecta tu ESP32 a la máquina a través de USB y ejecuta:
```bash
pio run --target upload
```
*(Nota: Si usas Linux y te da error de permisos del puerto USB, ejecuta `sudo usermod -a -G dialout $USER` y reinicia sesión, o dale permisos temporales con `sudo chmod 666 /dev/ttyUSB0` / `sudo chmod 666 /dev/ttyACM0`).*

### 4. Abrir el Monitor Serie
Para ver el log y depurar en tiempo real las lecturas que realiza el ESP32:
```bash
pio device monitor
```
