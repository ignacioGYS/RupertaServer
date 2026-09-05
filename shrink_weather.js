import fs from 'fs';
let code = fs.readFileSync('src/components/Weather.jsx', 'utf8');

// Reduce general paddings in glass-card
code = code.replaceAll("padding: '20px'", "padding: '16px'");
code = code.replaceAll("padding: '24px'", "padding: '16px'");

// Clima Actual
code = code.replaceAll("fontSize: '3.5rem'", "fontSize: '3rem'");
code = code.replaceAll("padding: '16px', borderRadius: '16px'", "padding: '12px 16px', borderRadius: '12px'");
code = code.replaceAll("gap: '16px', background", "gap: '12px', background");

// Próximas 24 horas
code = code.replaceAll("padding: '12px 8px'", "padding: '10px 8px'");
code = code.replaceAll("getWeatherIcon(h.code, h.isDay, 28)", "getWeatherIcon(h.code, h.isDay, 24)");

// Pronóstico 7 Días
code = code.replaceAll("padding: '6px 0'", "padding: '4px 0'");
code = code.replaceAll("getWeatherIcon(daily.weather_code[idx], 1, 24)", "getWeatherIcon(daily.weather_code[idx], 1, 20)");

// Tendencia de Temperaturas
code = code.replaceAll("minHeight: '220px'", "minHeight: '190px'");
code = code.replaceAll("height: '220px'", "height: '190px'");

// Mapa Animado
code = code.replaceAll("height: '280px'", "height: '220px'");

// Webcams
code = code.replaceAll("maxHeight: '280px'", "maxHeight: '220px'");
code = code.replaceAll("padding: '30px'", "padding: '20px'");
code = code.replaceAll("padding: '40px'", "padding: '20px'");

fs.writeFileSync('src/components/Weather.jsx', code);
console.log("Weather components shrunk successfully.");
