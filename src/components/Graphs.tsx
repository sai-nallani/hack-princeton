import { useEffect, useState, useRef } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ComposedChart, Bar, Line } from 'recharts';

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
  wind_direction?: number | string; // Can be degrees (number) or cardinal direction (string)
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
  // METAR actuals
  metarWindSpeed?: number;
  metarVisibility?: number;
  metarFlightCategory?: string;
  // TAF forecast
  tafWindSpeed?: number;
  tafVisibility?: number;
  tafFlightCategory?: string;
  // Combined values for color bands (prefer METAR for past, TAF for future)
  windSpeed: number;
  visibility: number;
  flightCategory?: string; // VFR, MVFR, IFR, LIFR
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
        
        // Only update timestamp when count changes (indicating new tracking data)
        // or on first load (when prevCountRef.current is null)
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

    // Fetch immediately
    fetchPlaneCount();

    // Poll every 1 second to match backend polling frequency
    const interval = setInterval(fetchPlaneCount, 1000);

    return () => clearInterval(interval);
  }, []);

  // Helper function to parse TAF timestamp (format: "YYYY-MM-DDTHH:MM:SSZ")
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
    
    // If no exact match, find the closest forecast period
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
    
    // Generate points from 1 hour ago to 24 hours in the future
    // Use hourly intervals
    const startTime = currentTime - (1 * 60 * 60 * 1000); // 1 hour ago
    const endTime = currentTime + (24 * 60 * 60 * 1000); // 24 hours ahead
    const intervalMs = 60 * 60 * 1000; // 1 hour intervals
    
    for (let time = startTime; time <= endTime; time += intervalMs) {
      const date = new Date(time);
      const isPast = time < currentTime;
      const isCurrent = Math.abs(time - currentTime) < 30 * 60 * 1000; // Within 30 minutes of now
      
      // METAR actuals (for past/current)
      let metarWindSpeed: number | undefined = undefined;
      let metarVisibility: number | undefined = undefined;
      let metarFlightCategory: string | undefined = undefined;
      
      // TAF forecast (for all times if available)
      let tafWindSpeed: number | undefined = undefined;
      let tafVisibility: number | undefined = undefined;
      let tafFlightCategory: string | undefined = undefined;
      
      // Combined values (for color bands)
      let windSpeed = 0;
      let visibility = 0;
      let flightCategory: string | undefined = undefined;
      
      // Get METAR data ONLY for current time point
      if (isCurrent && metarData) {
        metarWindSpeed = metarData.wind_speed ?? 0;
        metarVisibility = metarData.visibility ?? 0;
        metarFlightCategory = metarData.flight_category;
        // Use METAR for combined values at current time
        windSpeed = metarWindSpeed;
        visibility = metarVisibility;
        flightCategory = metarFlightCategory;
      }
      
      // Get TAF forecast for all times (past and future) - used for line chart
      if (weatherData && weatherData.forecast && weatherData.forecast.length > 0) {
        const forecast = findForecastForTime(weatherData.forecast, date);
        if (forecast) {
          tafWindSpeed = forecast.wind_speed ?? 0;
          tafVisibility = forecast.visibility ?? 0;
          tafFlightCategory = forecast.flight_category;
          // Use TAF for combined values in future (for color bands)
          if (!isPast && !isCurrent) {
            windSpeed = tafWindSpeed;
            visibility = tafVisibility;
            flightCategory = tafFlightCategory;
          } else if (isCurrent) {
            // At current time, use METAR if available, otherwise TAF
            if (!metarData) {
              windSpeed = tafWindSpeed;
              visibility = tafVisibility;
              flightCategory = tafFlightCategory;
            }
          }
        } else {
          // If no exact forecast found, try to use the closest one
          const lastForecast = weatherData.forecast[weatherData.forecast.length - 1];
          if (lastForecast) {
            tafWindSpeed = lastForecast.wind_speed ?? 0;
            tafVisibility = lastForecast.visibility ?? 0;
            tafFlightCategory = lastForecast.flight_category;
            if (!isPast && !isCurrent) {
              windSpeed = tafWindSpeed;
              visibility = tafVisibility;
              flightCategory = tafFlightCategory;
            } else if (isCurrent && !metarData) {
              windSpeed = tafWindSpeed;
              visibility = tafVisibility;
              flightCategory = tafFlightCategory;
            }
          }
        }
      }
      
      // Fallback: if no TAF and in future, use current METAR for forecast
      if ((!isPast && !isCurrent) && !tafWindSpeed && metarData) {
        tafWindSpeed = metarData.wind_speed ?? 0;
        tafVisibility = metarData.visibility ?? 0;
        tafFlightCategory = metarData.flight_category;
        windSpeed = tafWindSpeed;
        visibility = tafVisibility;
        flightCategory = tafFlightCategory;
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
        metarFlightCategory,
        tafWindSpeed,
        tafVisibility,
        tafFlightCategory,
        windSpeed,
        visibility,
        flightCategory,
      });
    }
    
    setTimelineData(points);
  }, [metarData, weatherData]);

  // Fetch METAR data (real-time observations) - used for "Now"
  useEffect(() => {
    const fetchMETAR = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/weather/metar/KATL');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
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

    // Fetch immediately
    fetchMETAR();

    // Poll every 10 minutes for METAR updates
    const interval = setInterval(fetchMETAR, 600000);

    return () => clearInterval(interval);
  }, []);

  // Fetch TAF data (forecasts) - used for +1 hour and +6 hours
  useEffect(() => {
    const fetchTAF = async () => {
      try {
        // Using KATL (Atlanta Hartsfield-Jackson) as default airport
        const response = await fetch('http://localhost:8000/api/weather/taf/KATL');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data: WeatherData = await response.json();
        
        console.log('TAF data received:', data);
        
        if (data && data.forecast && data.forecast.length > 0) {
          setWeatherData(data);
          console.log(`Loaded ${data.forecast.length} forecast periods`);
        } else if (data && data.station) {
          // Even if no forecast, keep the data object so we can show station info
          setWeatherData(data);
          console.log('TAF data received but no forecast periods');
        } else {
          setWeatherData(null);
          console.log('No TAF data available');
        }
        
        setWeatherLoading(false);
      } catch (error) {
        console.error('Error fetching TAF:', error);
        setWeatherData(null);
        setWeatherLoading(false);
      }
    };

    // Fetch immediately
    fetchTAF();

    // Poll every 10 minutes for TAF updates
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

  // Helper function to convert wind direction (degrees or string) to cardinal direction
  const getCardinalDirection = (direction: number | string | undefined): string => {
    if (direction === undefined || direction === null) return 'N';
    
    // If it's already a string direction, validate and return it
    if (typeof direction === 'string') {
      const upper = direction.toUpperCase().trim();
      const validDirections = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      if (validDirections.includes(upper)) {
        return upper;
      }
      // Try to parse as number string
      const num = parseFloat(upper);
      if (!isNaN(num)) {
        direction = num;
      } else {
        return 'N'; // Default if can't parse
      }
    }
    
    // Convert numeric degrees to cardinal direction
    if (typeof direction === 'number') {
      // Normalize to 0-360
      const normalized = ((direction % 360) + 360) % 360;
      // Convert to cardinal/intercardinal (8 directions)
      const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const index = Math.round(normalized / 45) % 8;
      return directions[index];
    }
    
    return 'N';
  };

  // Get the next forecast period from TAF
  const getNextForecast = (): ForecastPeriod | null => {
    if (!weatherData || !weatherData.forecast || weatherData.forecast.length === 0) {
      return null;
    }
    
    const now = new Date();
    
    // First, try to find a currently active forecast (now is between valid_from and valid_to)
    for (const period of weatherData.forecast) {
      const validFrom = parseTAFTime(period.valid_from || '');
      const validTo = parseTAFTime(period.valid_to || '');
      
      if (validFrom) {
        // Check if now is within this period's validity
        // If validTo is missing, assume the period is still valid if validFrom is in the past
        const isActive = validTo 
          ? (now >= validFrom && now <= validTo)
          : (now >= validFrom);
        
        if (isActive) {
          // Only return if it has wind data
          if (period.wind_direction !== undefined && period.wind_speed !== undefined) {
            return period;
          }
        }
      }
    }
    
    // If no active forecast, find the first forecast period that starts in the future
    for (const period of weatherData.forecast) {
      const validFrom = parseTAFTime(period.valid_from || '');
      if (validFrom && validFrom > now) {
        // Only return if it has wind data
        if (period.wind_direction !== undefined && period.wind_speed !== undefined) {
          return period;
        }
      }
    }
    
    // If no future forecast with wind data, try to find any forecast with wind data
    for (const period of weatherData.forecast) {
      if (period.wind_direction !== undefined && period.wind_speed !== undefined) {
        return period;
      }
    }
    
    // Last resort: return the last forecast period even without wind data
    return weatherData.forecast[weatherData.forecast.length - 1] || null;
  };

  // Prepare radar chart data from wind direction and speed (current + forecast)
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
      
      // Wind direction indicates where wind is coming FROM
      // Convert to the closest cardinal/intercardinal direction
      const cardinalDir = getCardinalDirection(windDir);
      
      // Find the index of the cardinal direction
      const dirIndex = directions.indexOf(cardinalDir);
      if (dirIndex !== -1 && windSpeed > 0) {
        baseData[dirIndex].currentWindSpeed = windSpeed;
      }
    }
    
    // Get forecast wind data from TAF
    const nextForecast = getNextForecast();
    if (nextForecast) {
      // Check if forecast has wind data (wind_direction can be null for variable winds, but wind_speed should exist)
      const forecastWindSpeed = nextForecast.wind_speed ?? 0;
      const forecastWindDir = nextForecast.wind_direction;
      
      // Only display forecast if we have wind speed > 0 and a valid direction
      if (forecastWindSpeed > 0 && forecastWindDir !== undefined && forecastWindDir !== null) {
        // Convert to cardinal direction (handles both numbers and strings)
        const forecastCardinalDir = getCardinalDirection(forecastWindDir);
        const forecastDirIndex = directions.indexOf(forecastCardinalDir);
        
        if (forecastDirIndex !== -1) {
          baseData[forecastDirIndex].forecastWindSpeed = forecastWindSpeed;
        } else {
          // Debug: log if direction conversion failed
          console.warn('Forecast wind direction not found in directions array:', {
            originalDirection: forecastWindDir,
            convertedCardinal: forecastCardinalDir,
            availableDirections: directions,
            forecastData: nextForecast
          });
        }
      }
    }
    
    return baseData;
  };

  // Calculate max wind speed for radar chart domain (considering both current and forecast)
  const getMaxWindSpeed = () => {
    let maxSpeed = 0;
    
    if (metarData && metarData.wind_speed !== undefined) {
      maxSpeed = Math.max(maxSpeed, metarData.wind_speed || 0);
    }
    
    const nextForecast = getNextForecast();
    if (nextForecast && nextForecast.wind_speed !== undefined) {
      maxSpeed = Math.max(maxSpeed, nextForecast.wind_speed || 0);
    }
    
    // Round up to nearest 10, with minimum of 20
    return Math.max(20, Math.ceil(maxSpeed / 10) * 10);
  };

  // Get current flight category and future changes
  const getFlightCategoryStatus = () => {
    const now = new Date();
    // Try to get current category from METAR first, then from currently active TAF period
    let currentCategory = metarData?.flight_category || null;
    
    // If no METAR category, try to get it from currently active TAF forecast period
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
    
    const futureChanges: Array<{ category: string; time: Date; validTo?: Date }> = [];
    
    if (!weatherData || !weatherData.forecast || weatherData.forecast.length === 0) {
      return { current: currentCategory, changes: [] };
    }
    
    // Get all future forecast periods sorted by time
    const futurePeriods = weatherData.forecast
      .map(period => ({
        period,
        validFrom: parseTAFTime(period.valid_from || ''),
        validTo: parseTAFTime(period.valid_to || '')
      }))
      .filter(item => item.validFrom && item.validFrom > now)
      .sort((a, b) => a.validFrom!.getTime() - b.validFrom!.getTime());
    
    // Track the last category we've seen to detect changes
    // Start with current category, then track through future periods
    let lastCategory = currentCategory;
    
    for (const { period, validFrom, validTo } of futurePeriods) {
      const periodCategory = period.flight_category;
      
      // If this period has a different category than the last one we saw, it's a change
      if (periodCategory && periodCategory !== lastCategory) {
        futureChanges.push({
          category: periodCategory,
          time: validFrom!,
          validTo: validTo || undefined
        });
        lastCategory = periodCategory;
      } else if (periodCategory) {
        // Update lastCategory even if it's the same, so we track the sequence correctly
        lastCategory = periodCategory;
      }
    }
    
    return { current: currentCategory, changes: futureChanges };
  };

  // Helper function to get flight category display color
  const getFlightCategoryDisplayColor = (category?: string | null): string => {
    if (!category) return '#9ca3af';
    const upper = category.toUpperCase();
    if (upper === 'VFR') return '#22c55e'; // Green
    if (upper === 'MVFR') return '#eab308'; // Yellow
    if (upper === 'IFR' || upper === 'LIFR') return '#ef4444'; // Red
    return '#9ca3af'; // Gray
  };

  const flightCategoryStatus = getFlightCategoryStatus();

  return (
    <div className="h-full w-full flex flex-col gap-4 p-4 relative bg-black">

      {/* Top Row: All Weather Components */}
      <div className="flex gap-4 w-full">
        {/* Wind Speed Chart Box */}
        <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-sm p-3 flex flex-col gap-2" style={{ width: '22%' }}>
          <div className="text-xs font-semibold text-gray-200 mb-1">
            Wind Speed (kt) - {metarData?.station || weatherData?.station || 'KATL'}
          </div>
        
          {weatherLoading ? (
            <div className="text-gray-400 text-xs">Loading weather data...</div>
          ) : timelineData.length > 0 ? (
            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 8, fill: '#9ca3af' }}
                    stroke="#6b7280"
                    interval="preserveStartEnd"
                    angle={-45}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis 
                    tick={{ fontSize: 8, fill: '#9ca3af' }}
                    stroke="#6b7280"
                    width={40}
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
                    formatter={(value: any, name: string) => {
                      if (name === 'metarWindSpeed' || name === 'tafWindSpeed') return [`${value} kt`, name.includes('metar') ? 'METAR Wind' : 'TAF Wind'];
                      return [value, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '9px', color: '#d1d5db' }} />
                  
                  {/* Current time marker */}
                  {(() => {
                    const now = new Date();
                    const currentTime = now.getTime();
                    const currentPoint = timelineData.find(p => Math.abs(p.timestamp - currentTime) < 30 * 60 * 1000);
                    if (currentPoint) {
                      return (
                        <ReferenceLine
                          x={currentPoint.time}
                          stroke="#fbbf24"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          label={{ value: "Now", position: "top", fill: "#fbbf24", fontSize: 9 }}
                        />
                      );
                    }
                    return null;
                  })()}
                  
                  {/* METAR Wind Speed Bar (Current value only) */}
                  <Bar 
                    dataKey="metarWindSpeed" 
                    fill="#82ca9d" 
                    name="METAR Wind (kt)"
                    radius={[4, 4, 0, 0]}
                  />
                  
                  {/* TAF Wind Speed Line (Forecast) */}
                  <Line 
                    type="monotone" 
                    dataKey="tafWindSpeed" 
                    stroke="#82ca9d" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name="TAF Wind (kt)"
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-gray-400 text-xs">
              No weather data available
            </div>
          )}
        </div>

        {/* Visibility Chart Box */}
        <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-sm p-3 flex flex-col gap-2" style={{ width: '22%' }}>
          <div className="text-xs font-semibold text-gray-200 mb-1">
            Visibility (mi) - {metarData?.station || weatherData?.station || 'KATL'}
          </div>
          
          {weatherLoading ? (
            <div className="text-gray-400 text-xs">Loading weather data...</div>
          ) : timelineData.length > 0 ? (
            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 8, fill: '#9ca3af' }}
                    stroke="#6b7280"
                    interval="preserveStartEnd"
                    angle={-45}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis 
                    tick={{ fontSize: 8, fill: '#9ca3af' }}
                    stroke="#6b7280"
                    width={40}
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
                    formatter={(value: any, name: string) => {
                      if (name === 'metarVisibility' || name === 'tafVisibility') return [`${value} mi`, name.includes('metar') ? 'METAR Visibility' : 'TAF Visibility'];
                      return [value, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '9px', color: '#d1d5db' }} />
                  
                  {/* Current time marker */}
                  {(() => {
                    const now = new Date();
                    const currentTime = now.getTime();
                    const currentPoint = timelineData.find(p => Math.abs(p.timestamp - currentTime) < 30 * 60 * 1000);
                    if (currentPoint) {
                      return (
                        <ReferenceLine
                          x={currentPoint.time}
                          stroke="#fbbf24"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          label={{ value: "Now", position: "top", fill: "#fbbf24", fontSize: 9 }}
                        />
                      );
                    }
                    return null;
                  })()}
                  
                  {/* METAR Visibility Bar (Current value only) */}
                  <Bar 
                    dataKey="metarVisibility" 
                    fill="#8884d8" 
                    name="METAR Visibility (mi)"
                    radius={[4, 4, 0, 0]}
                  />
                  
                  {/* TAF Visibility Line (Forecast) */}
                  <Line 
                    type="monotone" 
                    dataKey="tafVisibility" 
                    stroke="#8884d8" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name="TAF Visibility (mi)"
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-gray-400 text-xs">
              No weather data available
            </div>
          )}
        </div>

          {/* Airplane Count Box */}
        <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-sm p-4 flex flex-col gap-2">
          <div className="text-2xl font-bold text-gray-100">
            {isLoading ? '...' : planeCount}
          </div>
          <div className="text-xs text-gray-400">
            # of airplanes
          </div>
          <div className="text-xs text-gray-400">
            Last updated: {formatTime(lastUpdate)}
          </div>
        </div>

        {/* Flight Category Status Box */}
        <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-sm p-4 flex flex-col gap-2" style={{ width: '18%', minWidth: '180px' }}>
        <div className="text-sm font-semibold text-gray-200 mb-2">
          Flight Category
        </div>
        
        {flightCategoryStatus.current || flightCategoryStatus.changes.length > 0 ? (
          <div className="flex flex-col gap-3">
            {/* Current Status */}
            {flightCategoryStatus.current ? (
            <div className="flex flex-col gap-1">
                <div className="text-xs text-gray-400">Current</div>
                <div 
                  className="text-2xl font-bold"
                  style={{ color: getFlightCategoryDisplayColor(flightCategoryStatus.current) }}
                >
                  {flightCategoryStatus.current}
              </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="text-xs text-gray-400">Current</div>
                <div className="text-sm text-gray-500 italic">
                  Unknown
                </div>
              </div>
            )}
            
            {/* Future Changes */}
            {flightCategoryStatus.changes.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-xs text-gray-400">Upcoming Changes</div>
                <div className="space-y-2">
                  {flightCategoryStatus.changes.map((change, idx) => {
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
                    
                    const timeStr = formatChangeTime(change.time);
                    const dateStr = change.time.toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit', 
                      minute: '2-digit', 
                      hour12: false 
                    });
                    
                    return (
                      <div key={idx} className="flex flex-col gap-1 p-2 bg-gray-800 rounded border border-gray-700">
                        <div className="flex items-center gap-2">
                          <div 
                            className="text-lg font-bold"
                            style={{ color: getFlightCategoryDisplayColor(change.category) }}
                          >
                            {change.category}
                          </div>
                          <div className="text-xs text-gray-400">
                            {timeStr}
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 font-mono">
                          {dateStr}
                        </div>
                        {change.validTo && (
                          <div className="text-xs text-gray-500">
                            Until {change.validTo.toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {flightCategoryStatus.changes.length === 0 && flightCategoryStatus.current && (
              <div className="text-xs text-gray-500 italic">
                No changes forecasted
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-400 text-sm">
            No flight category data available
          </div>
        )}
      </div>

        {/* Wind Radar Chart Box */}
        <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-sm p-3 flex flex-col gap-2" style={{ width: '18%' }}>
        <div className="text-xs font-semibold text-gray-200 mb-1">
          Wind Direction & Speed
        </div>
        
        {metarData && metarData.wind_direction !== undefined && metarData.wind_speed !== undefined ? (
          <div className="flex gap-3 items-center">
            {/* Text on the left */}
            <div className="flex flex-col gap-2 flex-shrink-0" style={{ width: '100px' }}>
              <div className="text-xs text-gray-400">
                <span className="font-semibold text-gray-300">Current:</span>
                <div className="mt-1">{metarData.wind_direction}° @ {metarData.wind_speed}kt</div>
              </div>
              {(() => {
                const nextForecast = getNextForecast();
                if (nextForecast && nextForecast.wind_direction !== undefined && nextForecast.wind_speed !== undefined) {
                  // Format wind direction for display
                  const formatWindDirection = (dir: number | string | undefined): string => {
                    if (dir === undefined || dir === null) return 'Variable';
                    if (typeof dir === 'string') {
                      // If it's already a cardinal direction, return it
                      const upper = dir.toUpperCase().trim();
                      if (['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].includes(upper)) {
                        return upper;
                      }
                      // Try to parse as number
                      const num = parseFloat(dir);
                      if (!isNaN(num)) {
                        return `${Math.round(num)}°`;
                      }
                      return dir;
                    }
                    return `${Math.round(dir)}°`;
                  };
                  
                  return (
                    <div className="text-xs text-gray-400">
                      <span className="font-semibold text-yellow-400">Forecast:</span>
                      <div className="mt-1">{formatWindDirection(nextForecast.wind_direction)} @ {nextForecast.wind_speed}kt</div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            
            {/* Radar chart on the right - wider and shorter */}
            <div className="h-24 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={getRadarChartData()}>
                  <PolarGrid stroke="#374151" />
                  <PolarAngleAxis 
                    dataKey="direction" 
                    tick={{ fontSize: 8, fill: '#9ca3af' }}
                    stroke="#6b7280"
                  />
                  <PolarRadiusAxis 
                    angle={90} 
                    domain={[0, getMaxWindSpeed()]}
                    tick={{ fontSize: 7, fill: '#9ca3af' }}
                    stroke="#6b7280"
                  />
                  {/* Current wind (METAR) */}
                  <Radar
                    name="Current Wind"
                    dataKey="currentWindSpeed"
                    stroke="#82ca9d"
                    fill="#82ca9d"
                    fillOpacity={0.6}
                    strokeWidth={2}
                  />
                  {/* Forecast wind (TAF) */}
                  <Radar
                    name="Forecast Wind"
                    dataKey="forecastWindSpeed"
                    stroke="#fbbf24"
                    fill="#fbbf24"
                    fillOpacity={0.4}
                    strokeWidth={2}
                    strokeDasharray="5 5"
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
                    formatter={(value: any, name: string) => {
                      if (value === 0) return null;
                      if (name === 'currentWindSpeed') {
                        return [`${value} kt`, 'Current Wind (METAR)'];
                      } else if (name === 'forecastWindSpeed') {
                        return [`${value} kt`, 'Forecast Wind (TAF)'];
                      }
                      return [`${value} kt`, name];
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="text-gray-400 text-xs">
            No wind data available
          </div>
        )}
      </div>
      </div>
    </div>
  );
}