import { useEffect, useState, useRef } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, AreaChart, Area, Cell } from 'recharts';

interface Airplane {
  hex?: string;
  icao24?: string;
  flight?: string;
  callsign?: string;
  lat?: number;
  latitude?: number;
  lon?: number;
  longitude?: number;
  alt_baro?: number;
  altitude?: number;
  gs?: number;
  t?: string;
  desc?: string;
  r?: string;
  ownOp?: string;
}

interface ForecastPeriod {
  time: string;
  temperature?: number;
  wind_speed?: number;
  wind_direction?: number | string;
  visibility?: number;
  ceiling?: number;
  flight_category?: string;
  conditions?: string;
  valid_from?: string;
  valid_to?: string;
}

interface WeatherData {
  station?: string;
  observation_time?: string;
  temperature?: number;
  dewpoint?: number;
  wind_speed?: number;
  wind_direction?: number;
  visibility?: number;
  ceiling?: number;
  flight_category?: string;
  conditions?: string;
  forecast?: ForecastPeriod[];
}

interface TimelineDataPoint {
  time: string;
  timestamp: number;
  metarWindSpeed?: number;
  metarVisibility?: number;
  metarTemperature?: number;
  metarFlightCategory?: string;
  tafWindSpeed?: number;
  tafVisibility?: number;
  tafTemperature?: number;
  tafFlightCategory?: string;
  flightCategory?: string; // Combined: METAR for past/current, TAF for future
}

export default function Graphs() {
  const [planeCount, setPlaneCount] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const prevCountRef = useRef<number | null>(null);

  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [metarData, setMetarData] = useState<WeatherData | null>(null);
  const [timelineData, setTimelineData] = useState<TimelineDataPoint[]>([]);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(true);

  // Fetch airplane count
  useEffect(() => {
    const fetchPlaneCount = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/planes');
        const planes: Airplane[] = await response.json();
        const count = planes ? planes.length : 0;
        
        if (prevCountRef.current === null || prevCountRef.current !== count) {
          setLastUpdate(new Date());
        }
        
        prevCountRef.current = count;
        setPlaneCount(count);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching plane count:', error);
        setIsLoading(false);
      }
    };

    fetchPlaneCount();
    const interval = setInterval(fetchPlaneCount, 1000);
    return () => clearInterval(interval);
  }, []);

  // Helper function to parse TAF timestamp
  const parseTAFTime = (timeStr: string): Date | null => {
    if (!timeStr) return null;
    try {
      return new Date(timeStr);
    } catch {
      return null;
    }
  };

  // Helper function to find forecast period for a given time
  const findForecastForTime = (forecast: ForecastPeriod[], targetTime: Date): ForecastPeriod | null => {
    if (!forecast || forecast.length === 0) return null;
    
    for (const period of forecast) {
      const validFrom = parseTAFTime(period.valid_from || '');
      const validTo = parseTAFTime(period.valid_to || '');
      
      if (validFrom && validTo && targetTime >= validFrom && targetTime <= validTo) {
        return period;
      }
    }
    
    let closestPeriod: ForecastPeriod | null = null;
    let minDiff = Infinity;
    
    for (const period of forecast) {
      const validFrom = parseTAFTime(period.valid_from || '');
      if (validFrom) {
        const diff = Math.abs(validFrom.getTime() - targetTime.getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closestPeriod = period;
        }
      }
    }
    
    return closestPeriod;
  };

  // Process timeline data: past 1 hour to next 24 hours
  useEffect(() => {
    const points: TimelineDataPoint[] = [];
    const now = new Date();
    const currentTime = now.getTime();
    
    const startTime = currentTime - (1 * 60 * 60 * 1000);
    const endTime = currentTime + (24 * 60 * 60 * 1000);
    const intervalMs = 60 * 60 * 1000;
    
    for (let time = startTime; time <= endTime; time += intervalMs) {
      const date = new Date(time);
      const isCurrent = Math.abs(time - currentTime) < 30 * 60 * 1000;
      
      let metarWindSpeed: number | undefined = undefined;
      let metarVisibility: number | undefined = undefined;
      let metarTemperature: number | undefined = undefined;
      let metarFlightCategory: string | undefined = undefined;
      let tafWindSpeed: number | undefined = undefined;
      let tafVisibility: number | undefined = undefined;
      let tafTemperature: number | undefined = undefined;
      let tafFlightCategory: string | undefined = undefined;
      let flightCategory: string | undefined = undefined;
      
      if (isCurrent && metarData) {
        metarWindSpeed = metarData.wind_speed ?? 0;
        metarVisibility = metarData.visibility ?? 0;
        metarTemperature = metarData.temperature;
        metarFlightCategory = metarData.flight_category;
        flightCategory = metarData.flight_category;
      }
      
      if (weatherData && weatherData.forecast && weatherData.forecast.length > 0) {
        const forecast = findForecastForTime(weatherData.forecast, date);
        if (forecast) {
          tafWindSpeed = forecast.wind_speed ?? 0;
          tafVisibility = forecast.visibility ?? 0;
          tafTemperature = forecast.temperature;
          tafFlightCategory = forecast.flight_category;
          // Use TAF category for future periods, or if no METAR for current
          if (!isCurrent || !metarData) {
            flightCategory = forecast.flight_category;
          }
        }
      }
      
      const timeLabel = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      
      points.push({
        time: timeLabel,
        timestamp: time,
        metarWindSpeed,
        metarVisibility,
        metarTemperature,
        metarFlightCategory,
        tafWindSpeed,
        tafVisibility,
        tafTemperature,
        tafFlightCategory,
        flightCategory,
      });
    }
    
    setTimelineData(points);
  }, [metarData, weatherData]);

  // Fetch METAR data
  useEffect(() => {
    const fetchMETAR = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/weather/metar/KATL');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data: WeatherData = await response.json();
        if (data && data.station) {
          setMetarData(data);
        } else {
          setMetarData(null);
        }
      } catch (error) {
        console.error('Error fetching METAR:', error);
        setMetarData(null);
      }
    };

    fetchMETAR();
    const interval = setInterval(fetchMETAR, 600000);
    return () => clearInterval(interval);
  }, []);

  // Fetch TAF data
  useEffect(() => {
    const fetchTAF = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/weather/taf/KATL');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data: WeatherData = await response.json();
        if (data && data.forecast && data.forecast.length > 0) {
          setWeatherData(data);
        } else if (data && data.station) {
          setWeatherData(data);
        } else {
          setWeatherData(null);
        }
        setWeatherLoading(false);
      } catch (error) {
        console.error('Error fetching TAF:', error);
        setWeatherData(null);
        setWeatherLoading(false);
      }
    };

    fetchTAF();
    const interval = setInterval(fetchTAF, 600000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date | null) => {
    if (!date) return 'Never';
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  // Get the next forecast period from TAF
  const getNextForecast = (): ForecastPeriod | null => {
    if (!weatherData || !weatherData.forecast || weatherData.forecast.length === 0) {
      return null;
    }
    
    const now = new Date();
    
    for (const period of weatherData.forecast) {
      const validFrom = parseTAFTime(period.valid_from || '');
      const validTo = parseTAFTime(period.valid_to || '');
      
      if (validFrom) {
        const isActive = validTo 
          ? (now >= validFrom && now <= validTo)
          : (now >= validFrom);
        
        if (isActive && period.wind_direction !== undefined && period.wind_speed !== undefined) {
            return period;
        }
      }
    }
    
    for (const period of weatherData.forecast) {
      const validFrom = parseTAFTime(period.valid_from || '');
      if (validFrom && validFrom > now) {
        if (period.wind_direction !== undefined && period.wind_speed !== undefined) {
          return period;
        }
      }
    }
    
    return weatherData.forecast[weatherData.forecast.length - 1] || null;
  };

  // Get current flight category and future changes
  const getFlightCategoryStatus = () => {
    const now = new Date();
    let currentCategory = metarData?.flight_category || null;
    
    if (!currentCategory && weatherData && weatherData.forecast) {
    for (const period of weatherData.forecast) {
        const validFrom = parseTAFTime(period.valid_from || '');
        const validTo = parseTAFTime(period.valid_to || '');
        
        if (validFrom && validFrom <= now && (!validTo || validTo >= now)) {
          if (period.flight_category) {
            currentCategory = period.flight_category;
            break;
          }
        }
      }
    }
    
    const futureChanges: Array<{ category: string; time: Date }> = [];
    
    if (weatherData && weatherData.forecast) {
      const futurePeriods = weatherData.forecast
        .map(period => ({
          period,
          validFrom: parseTAFTime(period.valid_from || '')
        }))
        .filter(item => item.validFrom && item.validFrom > now)
        .sort((a, b) => a.validFrom!.getTime() - b.validFrom!.getTime());
      
      let lastCategory = currentCategory;
      for (const { period, validFrom } of futurePeriods) {
        const periodCategory = period.flight_category;
        if (periodCategory && periodCategory !== lastCategory) {
          futureChanges.push({
            category: periodCategory,
            time: validFrom!
          });
          lastCategory = periodCategory;
        } else if (periodCategory) {
          lastCategory = periodCategory;
        }
      }
    }
    
    return { current: currentCategory, changes: futureChanges };
  };

  // Helper function to get flight category display color
  const getFlightCategoryDisplayColor = (category?: string | null): string => {
    if (!category) return '#9ca3af';
    const upper = category.toUpperCase();
    if (upper === 'VFR') return '#86efac';
    if (upper === 'MVFR') return '#fde047';
    if (upper === 'IFR' || upper === 'LIFR') return '#f87171';
    return '#9ca3af';
  };

  // Helper to format wind direction
  const formatWindDirection = (dir: number | string | undefined): string => {
    if (dir === undefined || dir === null) return 'Variable';
    if (typeof dir === 'string') {
      const upper = dir.toUpperCase().trim();
      if (['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].includes(upper)) {
        return upper;
      }
      const num = parseFloat(dir);
      if (!isNaN(num)) {
        return `${Math.round(num)}°`;
      }
      return dir;
    }
    return `${Math.round(dir)}°`;
  };

  // Helper function to convert wind direction to cardinal direction
  const getCardinalDirection = (direction: number | string | undefined): string => {
    if (direction === undefined || direction === null) return 'N';
    
    if (typeof direction === 'string') {
      const upper = direction.toUpperCase().trim();
      const validDirections = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      if (validDirections.includes(upper)) {
        return upper;
      }
      const num = parseFloat(upper);
      if (!isNaN(num)) {
        direction = num;
      } else {
        return 'N';
      }
    }
    
    if (typeof direction === 'number') {
      const normalized = ((direction % 360) + 360) % 360;
      const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const index = Math.round(normalized / 45) % 8;
      return directions[index];
    }
    
    return 'N';
  };

  // Prepare radar chart data from wind direction and speed
  const getRadarChartData = () => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const baseData = directions.map(dir => ({ 
      direction: dir, 
      currentWindSpeed: 0,
      forecastWindSpeed: 0
    }));
    
    // Get current wind data from METAR
    if (metarData && metarData.wind_direction !== undefined && metarData.wind_speed !== undefined) {
      const windDir = metarData.wind_direction;
      const windSpeed = metarData.wind_speed || 0;
      const cardinalDir = getCardinalDirection(windDir);
      const dirIndex = directions.indexOf(cardinalDir);
      if (dirIndex !== -1 && windSpeed > 0) {
        baseData[dirIndex].currentWindSpeed = windSpeed;
      }
    }
    
    // Get forecast wind data from TAF
    if (nextForecast) {
      const forecastWindSpeed = nextForecast.wind_speed ?? 0;
      const forecastWindDir = nextForecast.wind_direction;
      
      if (forecastWindSpeed > 0 && forecastWindDir !== undefined && forecastWindDir !== null) {
        const forecastCardinalDir = getCardinalDirection(forecastWindDir);
        const forecastDirIndex = directions.indexOf(forecastCardinalDir);
        if (forecastDirIndex !== -1) {
          baseData[forecastDirIndex].forecastWindSpeed = forecastWindSpeed;
        }
      }
    }
    
    return baseData;
  };

  // Calculate max wind speed for radar chart domain
  const getMaxWindSpeed = () => {
    let maxSpeed = 0;
    
    if (metarData && metarData.wind_speed !== undefined) {
      maxSpeed = Math.max(maxSpeed, metarData.wind_speed || 0);
    }
    
    if (nextForecast && nextForecast.wind_speed !== undefined) {
      maxSpeed = Math.max(maxSpeed, nextForecast.wind_speed || 0);
    }
    
    return Math.max(10, Math.ceil(maxSpeed / 5) * 5);
  };

  // Get wind speed status color
  const getWindSpeedColor = (speed: number | undefined): string => {
    if (speed === undefined) return '#9ca3af';
    if (speed < 10) return '#86efac'; // Green
    if (speed <= 20) return '#fde047'; // Yellow
    return '#f87171'; // Red
  };

  // Get visibility status color
  const getVisibilityColor = (vis: number | undefined): string => {
    if (vis === undefined) return '#9ca3af';
    if (vis >= 10) return '#86efac'; // Green
    if (vis >= 3) return '#fde047'; // Yellow
    return '#f87171'; // Red
  };

  // Get flight category color for timeline bands
  const getFlightCategoryColor = (category?: string | null): string => {
    if (!category) return '#6b7280'; // gray-500
    const upper = category.toUpperCase();
    if (upper === 'VFR') return '#86efac'; // green-300
    if (upper === 'MVFR') return '#fde047'; // yellow-300
    if (upper === 'IFR' || upper === 'LIFR') return '#f87171'; // red-400
    return '#6b7280';
  };

  // Get flight category numeric value for chart (for area height)
  const getFlightCategoryValue = (category?: string | null): number => {
    if (!category) return 0;
    const upper = category.toUpperCase();
    if (upper === 'VFR') return 3;
    if (upper === 'MVFR') return 2;
    if (upper === 'IFR' || upper === 'LIFR') return 1;
    return 0;
  };

  const flightCategoryStatus = getFlightCategoryStatus();
  const nextForecast = getNextForecast();

  // Format change time
  const formatChangeTime = (date: Date) => {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours > 0) {
      return `in ${diffHours}h ${diffMinutes}m`;
    } else if (diffMinutes > 0) {
      return `in ${diffMinutes}m`;
    } else {
      return 'soon';
    }
  };

  return (
    <div className="h-auto w-full flex items-center p-2 relative">
      {/* Black backdrop for better contrast */}
      <div 
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.25)',
        }}
      />
      {/* Single Row: Sleek Minimalist Dashboard */}
      <div className="flex w-full items-stretch gap-0 relative z-10">
        {/* 1. Aircraft Count - Compact */}
        <div className="flex-shrink-0 w-24 p-3 flex flex-col justify-center items-center border-r border-white/20">
          <div className="text-[10px] font-mono text-white uppercase mb-1">Aircraft</div>
          <div className="flex items-center gap-2">
            <div className="text-2xl font-mono font-bold text-white">
              {isLoading ? '...' : planeCount}
            </div>
            <div 
              className={`w-1.5 h-1.5 rounded-full ${
                planeCount > 0 ? 'bg-green-500' : planeCount === 0 ? 'bg-red-500' : 'bg-yellow-500'
              }`}
              style={{
                boxShadow: planeCount > 0 
                  ? '0 0 6px rgba(34, 197, 94, 0.6)' 
                  : planeCount === 0 
                    ? '0 0 6px rgba(239, 68, 68, 0.6)' 
                    : '0 0 6px rgba(234, 179, 8, 0.6)'
              }}
            />
          </div>
        </div>

        {/* 2. Flight Category (VFR/MVFR/IFR) - Compact */}
        <div className="flex-shrink-0 w-32 p-3 flex flex-col justify-center border-r border-white/20">
          <div className="flex flex-col gap-2">
            {/* VFR Light */}
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full border-2 transition-all flex-shrink-0 ${
                  flightCategoryStatus.current === 'VFR' ? 'animate-pulse' : 'opacity-30'
                }`}
                style={{
                  backgroundColor: flightCategoryStatus.current === 'VFR' ? '#86efac' : '#4a5568',
                  borderColor: flightCategoryStatus.current === 'VFR' ? '#86efac' : '#6b7280',
                  boxShadow: flightCategoryStatus.current === 'VFR' 
                    ? '0 0 10px rgba(134, 239, 172, 0.6)' : 'none',
                }}
              />
              <span className="text-[10px] font-mono text-white">VFR</span>
            </div>
            {/* MVFR Light */}
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full border-2 transition-all flex-shrink-0 ${
                  flightCategoryStatus.current === 'MVFR' ? 'animate-pulse' : 'opacity-30'
                }`}
                style={{
                  backgroundColor: flightCategoryStatus.current === 'MVFR' ? '#fde047' : '#4a5568',
                  borderColor: flightCategoryStatus.current === 'MVFR' ? '#fde047' : '#6b7280',
                  boxShadow: flightCategoryStatus.current === 'MVFR' 
                    ? '0 0 10px rgba(253, 224, 71, 0.6)' : 'none',
                }}
              />
              <span className="text-[10px] font-mono text-white">MVFR</span>
            </div>
            {/* IFR Light */}
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full border-2 transition-all flex-shrink-0 ${
                  (flightCategoryStatus.current === 'IFR' || flightCategoryStatus.current === 'LIFR') 
                    ? 'animate-pulse' : 'opacity-30'
                }`}
                style={{
                  backgroundColor: (flightCategoryStatus.current === 'IFR' || flightCategoryStatus.current === 'LIFR') 
                    ? '#f87171' : '#4a5568',
                  borderColor: (flightCategoryStatus.current === 'IFR' || flightCategoryStatus.current === 'LIFR') 
                    ? '#f87171' : '#6b7280',
                  boxShadow: (flightCategoryStatus.current === 'IFR' || flightCategoryStatus.current === 'LIFR')
                    ? '0 0 10px rgba(248, 113, 113, 0.6)' : 'none',
                }}
              />
              <span className="text-[10px] font-mono text-white">IFR</span>
            </div>
          </div>
        </div>

        {/* 3. Wind Speed - Compact */}
        <div className="flex-shrink-0 w-40 p-3 flex flex-col justify-center border-r border-white/20">
          {metarData && metarData.wind_direction !== undefined && metarData.wind_speed !== undefined ? (
            <div className="flex flex-col gap-1">
              {/* <div className="text-[10px] font-mono text-white uppercase mb-1">Wind</div> */}
              <div className="flex items-center gap-2">
                <div className="text-sm font-mono font-bold text-white">
                  {formatWindDirection(metarData.wind_direction)} @ {metarData.wind_speed}kt
                </div>
                <div 
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: getWindSpeedColor(metarData.wind_speed),
                    boxShadow: `0 0 4px ${getWindSpeedColor(metarData.wind_speed)}80`
                  }}
                />
              </div>
              {/* Compact Radar Chart */}
              <div className="h-16 w-full mt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={getRadarChartData()}>
                    <PolarGrid stroke="#374151" strokeWidth={0.5} />
                    <PolarAngleAxis 
                      dataKey="direction" 
                      tick={{ fontSize: 6, fill: '#6b7280' }}
                      stroke="#6b7280"
                    />
                    <PolarRadiusAxis 
                      angle={90} 
                      domain={[0, getMaxWindSpeed()]}
                      tick={false}
                      stroke="#6b7280"
                    />
                    <Radar
                      name="Current Wind"
                      dataKey="currentWindSpeed"
                      stroke="#67e8f9"
                      fill="#67e8f9"
                      fillOpacity={0.5}
                      strokeWidth={1.5}
                    />
                    <Radar
                      name="Forecast Wind"
                      dataKey="forecastWindSpeed"
                      stroke="#fde047"
                      fill="#fde047"
                      fillOpacity={0.3}
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1f2937', 
                        border: '1px solid #374151',
                        borderRadius: '4px',
                        color: '#f3f4f6',
                        fontSize: '9px'
                      }}
                      labelStyle={{ color: '#d1d5db', fontSize: '9px' }}
                      formatter={(value: any, name: string) => {
                        if (value === 0) return null;
                        if (name === 'currentWindSpeed') {
                          return [`${value} kt`, 'Current'];
                        } else if (name === 'forecastWindSpeed') {
                          return [`${value} kt`, 'Forecast'];
                        }
                        return [`${value} kt`, name];
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-[10px] font-mono text-center">No wind</div>
          )}
        </div>

        {/* 4. Weather/Visibility - Compact */}
        <div className="flex-shrink-0 w-32 p-3 flex flex-col justify-center border-r border-white/20">
          {/* <div className="text-[10px] font-mono text-white uppercase mb-1">Weather</div> */}
          {metarData ? (
            <div className="flex flex-col gap-1">
              {metarData.temperature !== undefined && (
                <div className="text-xs font-mono text-white">
                  {metarData.temperature}°C
                </div>
              )}
              {metarData.visibility !== undefined && (
                <div className="flex items-center gap-1.5 text-xs font-mono text-white">
                  <span>{metarData.visibility}mi</span>
                  <div 
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: getVisibilityColor(metarData.visibility),
                      boxShadow: `0 0 4px ${getVisibilityColor(metarData.visibility)}80`
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="text-white text-[10px] font-mono">No data</div>
          )}
        </div>

        {/* 5. Weather Timeline - Large */}
        <div className="flex-1 min-w-[500px] p-3 flex flex-col gap-2">

          {weatherLoading ? (
            <div className="text-white text-xs font-mono">Loading...</div>
          ) : timelineData.length > 0 ? (
            <div className="h-24 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart 
                  data={timelineData.map(d => ({
                    ...d,
                    categoryValue: getFlightCategoryValue(d.flightCategory)
                  }))}
                >
                  <defs>
                    <linearGradient id="vfrGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#86efac" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#86efac" stopOpacity={0.3} />
                    </linearGradient>
                    <linearGradient id="mvfrGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fde047" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#fde047" stopOpacity={0.3} />
                    </linearGradient>
                    <linearGradient id="ifrGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f87171" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#f87171" stopOpacity={0.3} />
                    </linearGradient>
                    <linearGradient id="unknownGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6b7280" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#6b7280" stopOpacity={0.2} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 9, fill: '#9ca3af' }}
                    stroke="#6b7280"
                    interval="preserveStartEnd"
                    angle={-45}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis 
                    domain={[0, 3]}
                    tick={{ fontSize: 9, fill: '#9ca3af' }}
                    stroke="#6b7280"
                    width={35}
                    tickFormatter={(value) => {
                      if (value === 3) return 'VFR';
                      if (value === 2) return 'MVFR';
                      if (value === 1) return 'IFR';
                      return '';
                    }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '6px',
                      color: '#f3f4f6',
                      fontSize: '11px'
                    }}
                    labelStyle={{ color: '#d1d5db', fontSize: '11px' }}
                    formatter={(_value: any, _name: string, props: any) => {
                      const category = props.payload.flightCategory;
                      if (category) {
                        return [category, 'Flight Category'];
                      }
                      return ['Unknown', 'Flight Category'];
                    }}
                  />
                  
                  {/* Current time marker */}
                  {(() => {
                    const now = new Date();
                    const currentTime = now.getTime();
                    const currentPoint = timelineData.find(p => Math.abs(p.timestamp - currentTime) < 30 * 60 * 1000);
                    if (currentPoint) {
                      return (
                        <ReferenceLine
                          x={currentPoint.time}
                          stroke="#fde047"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          label={{ value: "Now", position: "top", fill: "#fde047", fontSize: 10 }}
                        />
                      );
                    }
                    return null;
                  })()}
                  
                  {/* Flight Category Area - colored by category */}
                  <Area
                    type="stepAfter"
                    dataKey="categoryValue"
                    stroke="none"
                    fillOpacity={0.6}
                  >
                    {timelineData.map((entry, index) => {
                      const category = entry.flightCategory;
                      const upper = category?.toUpperCase() || '';
                      let fill = '#6b7280';
                      if (upper === 'VFR') fill = 'url(#vfrGradient)';
                      else if (upper === 'MVFR') fill = 'url(#mvfrGradient)';
                      else if (upper === 'IFR' || upper === 'LIFR') fill = 'url(#ifrGradient)';
                      else fill = 'url(#unknownGradient)';
                      
                      return <Cell key={`cell-${index}`} fill={fill} />;
                    })}
                  </Area>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )
          : (
            <div className="text-white text-xs font-mono">
              No weather data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

