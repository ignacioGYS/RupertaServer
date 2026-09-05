import React, { useState, useEffect } from 'react';
import { Sun, CloudRain, CloudLightning, Cloud, CloudSun } from 'lucide-react';

const SidebarWeatherWidget = () => {
  const [data, setData] = useState({ temp: null, trend: null, status: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const fetchWeather = async () => {
      try {
        // Fetch latest to get current temp and pressure
        const resLatest = await fetch(`/api/sensors/latest?_t=${Date.now()}`);
        const latestSensors = await resLatest.json();
        
        const tempSensor = latestSensors.find(s => s.sensor_name === 'ds18b20_temp');
        const pressSensor = latestSensors.find(s => s.sensor_type === 'pressure');
        
        if (!tempSensor || !pressSensor) {
          if (isMounted) setLoading(false);
          return;
        }

        const currentP = pressSensor.value;
        const currentT = new Date(pressSensor.timestamp).getTime();

        // Fetch history to calculate trend
        const resHistory = await fetch(`/api/sensors/history?hours=4&_t=${Date.now()}`);
        const historyData = await resHistory.json();
        
        const validHistory = historyData.filter(h => h.bme280_press != null).sort((a, b) => new Date(b.time_bucket) - new Date(a.time_bucket));
        
        let rate = 0;
        let trendStatus = 'stable';
        
        if (validHistory.length >= 2) {
          let pastP = null;
          let pastT = null;

          for (let i = 0; i < validHistory.length; i++) {
            const hTime = new Date(validHistory[i].time_bucket).getTime();
            const diffHours = (currentT - hTime) / 3600000;

            if (diffHours >= 1 && diffHours <= 4) {
              pastP = validHistory[i].bme280_press;
              pastT = hTime;
              break;
            }
          }

          if (!pastP) {
            const oldest = validHistory[validHistory.length - 1];
            const diffHours = (currentT - new Date(oldest.time_bucket).getTime()) / 3600000;
            if (diffHours >= 0.5) {
              pastP = oldest.bme280_press;
              pastT = new Date(oldest.time_bucket).getTime();
            }
          }

          if (pastP) {
            const diffHours = (currentT - pastT) / 3600000;
            const deltaP = currentP - pastP;
            rate = deltaP / diffHours; // hPa por hora

            if (rate <= -2) {
              trendStatus = 'storm';
            } else if (rate <= -0.5) {
              trendStatus = 'rain';
            } else if (rate >= 0.5) {
              trendStatus = 'sunny';
            } else {
              trendStatus = 'stable';
            }
          }
        }

        if (isMounted) {
          setData({
            temp: tempSensor.value,
            trend: rate,
            status: trendStatus
          });
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching weather widget data:', err);
        if (isMounted) setLoading(false);
      }
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 60000); // 1 minute

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading || data.temp === null) return null; // Omit if no data

  let Icon = Cloud;
  let color = 'var(--text-secondary)';
  let text = 'Estable';

  if (data.status === 'storm') {
    Icon = CloudLightning;
    color = '#FF5252';
    text = 'Tormenta';
  } else if (data.status === 'rain') {
    Icon = CloudRain;
    color = '#448AFF';
    text = 'Lluvia';
  } else if (data.status === 'sunny') {
    Icon = Sun;
    color = '#FFC107';
    text = 'Despejado';
  } else {
    Icon = CloudSun;
    color = '#A7B5EB';
    text = 'Estable';
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '10px 14px',
      background: 'rgba(0,0,0,0.2)',
      borderRadius: '10px',
      border: '1px solid rgba(255,255,255,0.05)',
      marginBottom: '12px'
    }}>
      <div style={{ color }}>
        <Icon size={24} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-display)' }}>
          {data.temp.toFixed(1)}°C
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
          {text}
        </span>
      </div>
    </div>
  );
};

export default SidebarWeatherWidget;
