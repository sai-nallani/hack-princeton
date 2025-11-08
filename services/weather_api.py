import aiohttp
import ssl
from typing import List, Dict, Optional
from datetime import datetime, timedelta

class AviationWeatherAPI:
    """
    Aviation Weather Center API client
    Docs: https://aviationweather.gov/data/api/
    """
    
    BASE_URL = "https://aviationweather.gov/api/data"
    
    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        # Create SSL context that doesn't verify certificates
        self.ssl_context = ssl.create_default_context()
        self.ssl_context.check_hostname = False
        self.ssl_context.verify_mode = ssl.CERT_NONE
    
    async def get_session(self):
        if self.session is None or self.session.closed:
            # Create connector with SSL verification disabled
            connector = aiohttp.TCPConnector(ssl=self.ssl_context)
            self.session = aiohttp.ClientSession(connector=connector)
        return self.session
    
    async def get_metar(self, station_id: str) -> Optional[Dict]:
        """
        Get current METAR (weather observation) for airport
        
        Args:
            station_id: Airport ICAO code (e.g., "KJFK", "KEWR", "KLGA")
        
        Returns:
            Dict with parsed METAR data or None if unavailable
        """
        session = await self.get_session()
        
        # Get most recent METAR from last 2 hours
        params = {
            "ids": station_id,
            "format": "json",
            "taf": "false",
            "hours": 2,
            "bbox": ""
        }
        
        try:
            url = f"{self.BASE_URL}/metar"
            async with session.get(url, params=params, timeout=10) as response:
                if response.status != 200:
                    print(f"Weather API error: {response.status}")
                    return None
                
                data = await response.json()
                
                if not data or len(data) == 0:
                    return None
                
                # Get most recent METAR
                metar = data[0]
                
                return {
                    "station": metar.get("icaoId"),
                    "observation_time": metar.get("obsTime"),
                    "raw_text": metar.get("rawOb"),
                    "temperature": metar.get("temp"),  # Celsius
                    "dewpoint": metar.get("dewp"),     # Celsius
                    "wind_speed": metar.get("wspd"),   # Knots
                    "wind_direction": metar.get("wdir"), # Degrees
                    "visibility": metar.get("visib"),  # Statute miles
                    "ceiling": metar.get("cig"),       # Feet AGL
                    "flight_category": metar.get("fltcat"),  # VFR, MVFR, IFR, LIFR
                    "conditions": metar.get("wxString", ""),  # Weather phenomena
                }
        
        except Exception as e:
            print(f"METAR fetch error: {e}")
            return None
    
    async def get_sigmets(self, hazard: str = None) -> List[Dict]:
        """
        Get SIGMETs (Significant Meteorological Information)
        
        Args:
            hazard: Optional filter (e.g., "CONVECTIVE", "TURB", "ICE")
        
        Returns:
            List of active SIGMETs
        """
        session = await self.get_session()
        
        params = {
            "format": "json",
            "date": datetime.utcnow().strftime("%Y%m%d%H")
        }
        
        if hazard:
            params["hazard"] = hazard
        
        try:
            url = f"{self.BASE_URL}/sigmet"
            async with session.get(url, params=params, timeout=10) as response:
                if response.status != 200:
                    return []
                
                data = await response.json()
                
                sigmets = []
                for sigmet in data:
                    sigmets.append({
                        "id": sigmet.get("sigmetId"),
                        "hazard": sigmet.get("hazard"),
                        "severity": sigmet.get("severity"),
                        "type": sigmet.get("airsigType"),
                        "valid_from": sigmet.get("validTimeFrom"),
                        "valid_to": sigmet.get("validTimeTo"),
                        "altitude_low": sigmet.get("altitudeLow1"),
                        "altitude_high": sigmet.get("altitudeHi1"),
                        "raw_text": sigmet.get("rawSigmet"),
                    })
                
                return sigmets
        
        except Exception as e:
            print(f"SIGMET fetch error: {e}")
            return []
    
    async def get_taf(self, station_id: str) -> Optional[Dict]:
        """
        Get TAF (Terminal Aerodrome Forecast) for airport
        
        Args:
            station_id: Airport ICAO code
        
        Returns:
            Dict with TAF data or None if unavailable
        """
        session = await self.get_session()
        
        params = {
            "ids": station_id,
            "format": "json",
            "taf": "true",
            "hours": 6,
            "bbox": ""
        }
        
        try:
            url = f"{self.BASE_URL}/taf"
            async with session.get(url, params=params, timeout=10) as response:
                if response.status != 200:
                    return None
                
                data = await response.json()
                
                if not data or len(data) == 0:
                    return None
                
                taf = data[0]
                forecasts = taf.get("fcsts", [])
                
                # Extract first forecast period for current conditions
                first_forecast = forecasts[0] if forecasts else {}
                
                # Parse forecast periods for predictive graph
                forecast_periods = []
                for fcst in forecasts:
                    # Format time from validTimeFrom
                    valid_from = fcst.get("validTimeFrom", "")
                    time_str = ""
                    if valid_from:
                        try:
                            # Parse ISO format datetime and format as time
                            dt = datetime.fromisoformat(valid_from.replace("Z", "+00:00"))
                            time_str = dt.strftime("%H:%M")
                        except:
                            time_str = valid_from[:5] if len(valid_from) >= 5 else valid_from
                    
                    forecast_periods.append({
                        "time": time_str,
                        "temperature": fcst.get("temp"),
                        "wind_speed": fcst.get("wspd"),
                        "wind_direction": fcst.get("wdir"),
                        "visibility": fcst.get("visib"),
                        "ceiling": fcst.get("cig"),
                        "flight_category": fcst.get("fltcat"),
                        "conditions": fcst.get("wxString", ""),
                        "valid_from": fcst.get("validTimeFrom"),
                        "valid_to": fcst.get("validTimeTo"),
                    })
                
                return {
                    "station": taf.get("icaoId"),
                    "observation_time": taf.get("issueTime"),  # For compatibility
                    "issue_time": taf.get("issueTime"),
                    "valid_from": taf.get("validTimeFrom"),
                    "valid_to": taf.get("validTimeTo"),
                    "raw_text": taf.get("rawTAF"),
                    "temperature": first_forecast.get("temp"),  # Current/First forecast
                    "wind_speed": first_forecast.get("wspd"),
                    "wind_direction": first_forecast.get("wdir"),
                    "visibility": first_forecast.get("visib"),
                    "ceiling": first_forecast.get("cig"),
                    "flight_category": first_forecast.get("fltcat"),
                    "conditions": first_forecast.get("wxString", ""),
                    "forecast": forecast_periods  # Array of forecast periods for graph
                }
        
        except Exception as e:
            print(f"TAF fetch error: {e}")
            return None
    
    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()

# Singleton instance
weather_api = AviationWeatherAPI()