import { useEffect, useState, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
  wind_direction?: number;
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

interface WeatherHistoryPoint {
  time: string;
  temperature: number;
  windSpeed: number;
  visibility: number;
}

export default function Graphs() {
  const [planeCount, setPlaneCount] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const prevCountRef = useRef<number | null>(null);

  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [weatherHistory, setWeatherHistory] = useState<WeatherHistoryPoint[]>([]);
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

  // Fetch weather data
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        // Using KATL (Atlanta Hartsfield-Jackson) as default airport
        // Using TAF for predictive forecast data
        const response = await fetch('http://localhost:8000/api/weather/taf/KATL');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data: WeatherData = await response.json();
        
        if (data && data.forecast && data.forecast.length > 0) {
          setWeatherData(data);
          
          // Convert forecast periods to graph data points
          const forecastPoints: WeatherHistoryPoint[] = data.forecast
            .filter(fcst => fcst.temperature !== undefined && fcst.temperature !== null)
            .map(fcst => ({
              time: fcst.time || '',
              temperature: fcst.temperature || 0,
              windSpeed: fcst.wind_speed || 0,
              visibility: fcst.visibility || 0,
            }));
          
          setWeatherHistory(forecastPoints);
        } else if (data && data.temperature !== undefined && data.temperature !== null) {
          // Fallback: use current data if no forecast available
          setWeatherData(data);
          const now = new Date();
          const timeStr = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
          });
          
          setWeatherHistory([{
            time: timeStr,
            temperature: data.temperature || 0,
            windSpeed: data.wind_speed || 0,
            visibility: data.visibility || 0,
          }]);
        } else {
          setWeatherData(null);
          setWeatherHistory([]);
        }
        
        setWeatherLoading(false);
      } catch (error) {
        console.error('Error fetching weather:', error);
        setWeatherData(null);
        setWeatherHistory([]);
        setWeatherLoading(false);
      }
    };

    // Fetch immediately
    fetchWeather();

    // Poll every 30 seconds for weather updates
    const interval = setInterval(fetchWeather, 30000);

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

  return (
    <div className="h-full w-full flex items-start justify-start gap-4 p-4">
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

      {/* Weather Graph Box */}
      <div className="bg-gray-900 rounded-lg border border-gray-700 shadow-sm p-4 flex flex-col gap-2 flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-200 mb-2">
          Weather Forecast (TAF) - {weatherData?.station || 'KATL'}
        </div>
        
        {weatherLoading ? (
          <div className="text-gray-400 text-sm">Loading weather forecast...</div>
        ) : weatherData && weatherHistory.length > 0 ? (
          <div className="flex flex-col gap-3">
            {/* Current Conditions */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-gray-400">Temp</div>
                <div className="font-semibold text-gray-100">{weatherData.temperature}°C</div>
              </div>
              <div>
                <div className="text-gray-400">Wind</div>
                <div className="font-semibold text-gray-100">{weatherData.wind_speed} kt</div>
              </div>
              <div>
                <div className="text-gray-400">Visibility</div>
                <div className="font-semibold text-gray-100">{weatherData.visibility} mi</div>
              </div>
            </div>

            {/* Weather Graph */}
            {weatherHistory.length > 0 && (
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weatherHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis 
                      dataKey="time" 
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      stroke="#6b7280"
                      interval="preserveStartEnd"
                    />
                    <YAxis 
                      yAxisId="left"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      stroke="#6b7280"
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      stroke="#6b7280"
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1f2937', 
                        border: '1px solid #374151',
                        borderRadius: '6px',
                        color: '#f3f4f6'
                      }}
                      labelStyle={{ color: '#d1d5db' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', color: '#d1d5db' }} />
                    <Line 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="temperature" 
                      stroke="#8884d8" 
                      strokeWidth={2}
                      name="Temp (°C)"
                      dot={{ r: 3 }}
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="windSpeed" 
                      stroke="#82ca9d" 
                      strokeWidth={2}
                      name="Wind (kt)"
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Flight Category */}
            {weatherData.flight_category && (
              <div className="text-xs text-gray-400">
                Category: <span className="font-semibold text-gray-200">{weatherData.flight_category}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-400 text-sm">
            No weather data available. The weather API may be temporarily unavailable or the station may not have recent data.
          </div>
        )}
      </div>
    </div>
  );
}