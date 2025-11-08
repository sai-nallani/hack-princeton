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
    
    async def get_session(self):
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
                
                return {
                    "station": taf.get("icaoId"),
                    "issue_time": taf.get("issueTime"),
                    "valid_from": taf.get("validTimeFrom"),
                    "valid_to": taf.get("validTimeTo"),
                    "raw_text": taf.get("rawTAF"),
                    "forecast": taf.get("fcsts", [])
                }
        
        except Exception as e:
            print(f"TAF fetch error: {e}")
            return None
    
    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()

# Singleton instance
weather_api = AviationWeatherAPI()