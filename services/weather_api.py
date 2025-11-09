import aiohttp
import ssl
import re
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from metar_taf_parser.parser.parser import TAFParser
import pandas as pd

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
    
    def parse_wind_from_raw(self, raw_text: str) -> Optional[Dict[str, Optional[float]]]:
        """
        Parse wind speed and direction from raw METAR text
        
        METAR wind format examples:
        - "12015KT" -> direction 120, speed 15 knots
        - "VRB05KT" -> variable direction, speed 5 knots
        - "00000KT" -> calm winds (0 knots)
        - "12015G25KT" -> direction 120, speed 15 knots, gusts 25 knots
        
        Returns:
            Dict with 'speed' and 'direction' keys, or None if not found
        """
        if not raw_text or not isinstance(raw_text, str):
            return None
        
        # Pattern: 3-digit direction (or VRB), 2-3 digit speed, optional G (gusts), KT
        # Examples: "12015KT", "VRB05KT", "00000KT", "12015G25KT"
        wind_pattern = r'\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b'
        match = re.search(wind_pattern, raw_text)
        
        if match:
            direction_str = match.group(1)
            speed_str = match.group(2)
            
            try:
                speed = float(speed_str)
                direction = None if direction_str == "VRB" else float(direction_str)
                return {"speed": speed, "direction": direction}
            except ValueError:
                pass
        
        return None
    
    def parse_visibility(self, visib) -> Optional[float]:
        """
        Parse visibility string to float (statute miles)
        
        Handles formats like:
        - "10+" -> 10.0
        - "6+" -> 6.0
        - "1/2" -> 0.5
        - "1 1/2" -> 1.5
        - "M1/4" -> 0.25
        - "P6SM" -> 6.0
        """
        if visib is None:
            return None
        
        # If already a number, return it
        if isinstance(visib, (int, float)):
            return float(visib)
        
        # If not a string, return None
        if not isinstance(visib, str):
            return None
        
        visib = visib.strip()
        
        # Handle "10+", "6+" format (remove + and convert)
        if visib.endswith('+'):
            try:
                return float(visib[:-1])
            except ValueError:
                pass
        
        # Handle "P6SM" format (P means "plus", SM is statute miles)
        if visib.startswith('P') and 'SM' in visib:
            match = re.search(r'P(\d+)SM', visib)
            if match:
                try:
                    return float(match.group(1))
                except ValueError:
                    pass
        
        # Handle "M1/4" format (M means "less than")
        if visib.startswith('M'):
            visib = visib[1:]  # Remove M prefix
        
        # Handle fractions like "1/2", "1 1/2"
        # Pattern: optional whole number, space, fraction
        fraction_match = re.match(r'(\d+)?\s*(\d+)/(\d+)', visib)
        if fraction_match:
            whole = int(fraction_match.group(1) or 0)
            numerator = int(fraction_match.group(2))
            denominator = int(fraction_match.group(3))
            if denominator > 0:
                return float(whole + (numerator / denominator))
        
        # Try to parse as float directly
        try:
            return float(visib)
        except ValueError:
            pass
        
        return None
    
    def visibility_to_miles(self, vis_str: Optional[str]) -> Optional[float]:
        """
        Convert visibility string to numeric (e.g., 'P6SM' -> 6, '3SM' -> 3, '9999' -> 10)
        Used for TAF parsing
        """
        if vis_str is None:
            return None
        if isinstance(vis_str, (int, float)):
            return float(vis_str)
        if not isinstance(vis_str, str):
            return None
        
        if 'SM' in vis_str:
            # Remove SM, P (plus), M (minus) prefixes
            cleaned = vis_str.replace('SM', '').replace('P', '').replace('M', '')
            try:
                return float(cleaned)
            except ValueError:
                pass
        elif vis_str.isdigit():
            meters = int(vis_str)
            return meters / 1609.34  # Convert meters to statute miles
        
        return None
    
    def parse_taf_with_change_groups(self, taf_string: str) -> Optional[List[Dict]]:
        """
        Parse TAF string using metar_taf_parser to extract detailed forecast data
        with change groups (FM, TEMPO, BECMG, PROB)
        
        Returns a list of forecast data points with time series information
        """
        if not taf_string or not isinstance(taf_string, str):
            return None
        
        try:
            # Parse the TAF
            taf = TAFParser().parse(taf_string)
            
            if not taf or not hasattr(taf, 'validity'):
                return None
            
            # Get current date/time for base validity period
            now = datetime.utcnow()
            # Extract day and hour from TAF validity
            validity_start_day = taf.validity.start_day if hasattr(taf.validity, 'start_day') else now.day
            validity_start_hour = taf.validity.start_hour if hasattr(taf.validity, 'start_hour') else now.hour
            
            # Adjust year/month if TAF day is in the past (next month)
            base_year = now.year
            base_month = now.month
            if validity_start_day < now.day:
                base_month += 1
                if base_month > 12:
                    base_month = 1
                    base_year += 1
            
            base_start = datetime(base_year, base_month, validity_start_day, validity_start_hour)
            
            # Get end time
            validity_end_day = taf.validity.end_day if hasattr(taf.validity, 'end_day') else validity_start_day
            validity_end_hour = taf.validity.end_hour if hasattr(taf.validity, 'end_hour') else validity_start_hour
            
            # Handle day rollover
            if validity_end_day < validity_start_day or (validity_end_day == validity_start_day and validity_end_hour < validity_start_hour):
                validity_end_day += 1
            
            base_end = datetime(base_year, base_month, validity_end_day, validity_end_hour)
            
            # Collect data points: time and visibility for base + each trend
            data = []
            
            # Extract base forecast values
            base_vis = self.visibility_to_miles(
                taf.visibility.distance if hasattr(taf, 'visibility') and taf.visibility else None
            )
            base_wind_speed = None
            base_wind_dir = None
            if hasattr(taf, 'wind') and taf.wind:
                if hasattr(taf.wind, 'speed'):
                    base_wind_speed = taf.wind.speed
                if hasattr(taf.wind, 'direction'):
                    base_wind_dir = taf.wind.direction
            
            # Add base forecast
            data.append({
                'time': base_start,
                'end_time': base_end,
                'vis': base_vis,
                'wind_speed': base_wind_speed,
                'wind_direction': base_wind_dir,
                'type': 'BASE',
                'prob': None,
                'ceiling': None,
                'flight_category': None
            })
            
            # Process trends (change groups)
            if hasattr(taf, 'trends') and taf.trends:
                for trend in taf.trends:
                    if not hasattr(trend, 'validity'):
                        continue
                    
                    # Get trend start time
                    trend_start_day = trend.validity.start_day if hasattr(trend.validity, 'start_day') else validity_start_day
                    trend_start_hour = trend.validity.start_hour if hasattr(trend.validity, 'start_hour') else validity_start_hour
                    trend_start_minutes = trend.validity.start_minutes if hasattr(trend.validity, 'start_minutes') else 0
                    
                    # Adjust for day rollover
                    trend_year = base_year
                    trend_month = base_month
                    if trend_start_day < validity_start_day:
                        trend_month += 1
                        if trend_month > 12:
                            trend_month = 1
                            trend_year += 1
                    
                    trend_start = datetime(trend_year, trend_month, trend_start_day, trend_start_hour, trend_start_minutes)
                    
                    # Get end time if applicable
                    trend_end = trend_start
                    if hasattr(trend.validity, 'end_hour'):
                        trend_end_day = trend.validity.end_day if hasattr(trend.validity, 'end_day') else trend_start_day
                        trend_end_hour = trend.validity.end_hour
                        trend_end_minutes = trend.validity.end_minutes if hasattr(trend.validity, 'end_minutes') else 0
                        
                        if trend_end_day < trend_start_day or (trend_end_day == trend_start_day and trend_end_hour < trend_start_hour):
                            trend_end_day += 1
                        
                        trend_end = datetime(trend_year, trend_month, trend_end_day, trend_end_hour, trend_end_minutes)
                    
                    # Extract trend values
                    trend_vis = self.visibility_to_miles(
                        trend.visibility.distance if hasattr(trend, 'visibility') and trend.visibility else None
                    ) or base_vis
                    
                    trend_wind_speed = None
                    trend_wind_dir = None
                    if hasattr(trend, 'wind') and trend.wind:
                        if hasattr(trend.wind, 'speed'):
                            trend_wind_speed = trend.wind.speed
                        if hasattr(trend.wind, 'direction'):
                            trend_wind_dir = trend.wind.direction
                    
                    trend_ceiling = None
                    if hasattr(trend, 'clouds') and trend.clouds:
                        # Get lowest ceiling
                        for cloud in trend.clouds:
                            if hasattr(cloud, 'base') and cloud.base:
                                if trend_ceiling is None or cloud.base < trend_ceiling:
                                    trend_ceiling = cloud.base
                    
                    data.append({
                        'time': trend_start,
                        'end_time': trend_end,
                        'vis': trend_vis,
                        'wind_speed': trend_wind_speed or base_wind_speed,
                        'wind_direction': trend_wind_dir or base_wind_dir,
                        'type': trend.type if hasattr(trend, 'type') else 'UNKNOWN',
                        'prob': trend.probability if hasattr(trend, 'probability') else None,
                        'ceiling': trend_ceiling,
                        'flight_category': None  # Could be calculated from vis/ceiling
                    })
            
            # Create a pandas DataFrame for time series
            df = pd.DataFrame(data)
            df['time'] = pd.to_datetime(df['time'])
            df['end_time'] = pd.to_datetime(df['end_time'])
            df = df.sort_values('time')
            
            # Generate a full timeline (hourly for smoothness)
            timeline = pd.date_range(base_start, base_end, freq='h')
            forecast_points = []
            
            # Apply changes over time (simple step for FM/TEMPO; interpolate for BECMG)
            current_vis = base_vis
            current_wind_speed = base_wind_speed
            current_wind_dir = base_wind_dir
            current_ceiling = None
            
            for t in timeline:
                # Find active trends at this time
                active_trends = df[(df['time'] <= t) & ((pd.isna(df['end_time'])) | (df['end_time'] >= t))]
                if not active_trends.empty:
                    latest = active_trends.iloc[-1]  # Last applicable
                    
                    if latest['type'] == 'FM':
                        # Abrupt change
                        current_vis = latest['vis']
                        current_wind_speed = latest['wind_speed']
                        current_wind_dir = latest['wind_direction']
                        current_ceiling = latest['ceiling']
                    elif latest['type'] == 'BECMG':
                        # Gradual change - simple linear interpolation
                        if pd.notna(latest['end_time']) and pd.notna(latest['time']) and latest['end_time'] > latest['time']:
                            frac = (t - latest['time']) / (latest['end_time'] - latest['time'])
                            frac = max(0, min(1, frac))  # Clamp between 0 and 1
                            
                            prev_vis = current_vis or 0
                            new_vis = latest['vis'] or 0
                            current_vis = prev_vis + frac * (new_vis - prev_vis)
                            
                            if latest['wind_speed'] is not None:
                                prev_wind = current_wind_speed or 0
                                new_wind = latest['wind_speed'] or 0
                                current_wind_speed = prev_wind + frac * (new_wind - prev_wind)
                            
                            if latest['wind_direction'] is not None:
                                prev_dir = current_wind_dir or 0
                                new_dir = latest['wind_direction'] or 0
                                # Handle direction wrap-around
                                diff = new_dir - prev_dir
                                if diff > 180:
                                    diff -= 360
                                elif diff < -180:
                                    diff += 360
                                current_wind_dir = prev_dir + frac * diff
                        else:
                            current_vis = latest['vis']
                            current_wind_speed = latest['wind_speed']
                            current_wind_dir = latest['wind_direction']
                            current_ceiling = latest['ceiling']
                    elif latest['type'] in ['TEMPO', 'PROB']:
                        # Temporary override
                        current_vis = latest['vis']
                        current_wind_speed = latest['wind_speed']
                        current_wind_dir = latest['wind_direction']
                        current_ceiling = latest['ceiling']
                
                # Calculate flight category from visibility and ceiling
                flight_category = None
                if current_vis is not None and current_ceiling is not None:
                    if current_vis >= 5.0 and current_ceiling >= 3000:
                        flight_category = 'VFR'
                    elif current_vis >= 3.0 and current_ceiling >= 1000:
                        flight_category = 'MVFR'
                    elif current_vis >= 1.0 and current_ceiling >= 500:
                        flight_category = 'IFR'
                    else:
                        flight_category = 'LIFR'
                elif current_vis is not None:
                    if current_vis >= 5.0:
                        flight_category = 'VFR'
                    elif current_vis >= 3.0:
                        flight_category = 'MVFR'
                    elif current_vis >= 1.0:
                        flight_category = 'IFR'
                    else:
                        flight_category = 'LIFR'
                
                forecast_points.append({
                    'time': t.isoformat() + 'Z',
                    'valid_from': t.isoformat() + 'Z',
                    'valid_to': (t + timedelta(hours=1)).isoformat() + 'Z',
                    'temperature': None,
                    'wind_speed': current_wind_speed,
                    'wind_direction': current_wind_dir,
                    'visibility': current_vis,
                    'ceiling': current_ceiling,
                    'flight_category': flight_category,
                    'conditions': ''
                })
            
            return forecast_points
            
        except Exception as e:
            print(f"TAF parsing error: {e}")
            import traceback
            traceback.print_exc()
            return None
    
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
                
                # Debug: Print the raw METAR response to see available fields
                print(f"DEBUG: Raw METAR response keys: {list(metar.keys())}")
                print(f"DEBUG: METAR wspd value: {metar.get('wspd')}")
                print(f"DEBUG: METAR wdir value: {metar.get('wdir')}")
                print(f"DEBUG: METAR rawOb: {metar.get('rawOb')}")
                
                # Get wind speed from API response
                wind_speed = metar.get("wspd")
                wind_direction = metar.get("wdir")
                
                print(f"DEBUG: wind_speed type: {type(wind_speed)}, value: {wind_speed}")
                print(f"DEBUG: wind_direction type: {type(wind_direction)}, value: {wind_direction}")
                
                # Convert string values to float if needed
                if isinstance(wind_speed, str):
                    try:
                        wind_speed = float(wind_speed)
                        print(f"DEBUG: Converted wind_speed from string to float: {wind_speed}")
                    except (ValueError, TypeError):
                        wind_speed = None
                        print(f"DEBUG: Failed to convert wind_speed string to float")
                elif wind_speed is not None:
                    # Ensure it's a number type
                    try:
                        wind_speed = float(wind_speed)
                    except (ValueError, TypeError):
                        print(f"DEBUG: Failed to convert wind_speed to float, keeping as: {wind_speed}")
                
                if isinstance(wind_direction, str):
                    try:
                        wind_direction = float(wind_direction)
                    except (ValueError, TypeError):
                        wind_direction = None
                elif wind_direction is not None:
                    try:
                        wind_direction = float(wind_direction)
                    except (ValueError, TypeError):
                        pass
                
                # If wind speed is None or 0, try to parse from raw METAR text as fallback
                raw_text = metar.get("rawOb", "")
                if raw_text:
                    parsed_wind = self.parse_wind_from_raw(raw_text)
                    if parsed_wind and parsed_wind.get("speed") is not None:
                        # Use parsed value if API value is None, or if API says 0 but raw shows non-zero
                        if wind_speed is None:
                            wind_speed = parsed_wind["speed"]
                            if wind_direction is None and parsed_wind.get("direction") is not None:
                                wind_direction = parsed_wind["direction"]
                            print(f"DEBUG: Parsed wind from raw METAR (wspd was None): speed={wind_speed}, direction={wind_direction}")
                        elif wind_speed == 0 and parsed_wind["speed"] > 0:
                            # API says 0 but raw METAR shows non-zero wind - use raw value
                            wind_speed = parsed_wind["speed"]
                            if wind_direction is None and parsed_wind.get("direction") is not None:
                                wind_direction = parsed_wind["direction"]
                            print(f"DEBUG: Parsed wind from raw METAR (wspd was 0 but raw shows {wind_speed}): speed={wind_speed}, direction={wind_direction}")
                
                # Check for alternative wind speed field names as last resort
                if wind_speed is None:
                    wind_speed = metar.get("windSpeed") or metar.get("wind_speed") or metar.get("windspeed")
                    if wind_speed is not None:
                        print(f"DEBUG: Found wind speed in alternative field: {wind_speed}")
                
                return {
                    "station": metar.get("icaoId"),
                    "observation_time": metar.get("obsTime"),
                    "raw_text": metar.get("rawOb"),
                    "temperature": metar.get("temp"),  # Celsius
                    "dewpoint": metar.get("dewp"),     # Celsius
                    "wind_speed": wind_speed,   # Knots
                    "wind_direction": wind_direction, # Degrees
                    "visibility": self.parse_visibility(metar.get("visib")),  # Statute miles
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
                raw_taf_text = taf.get("rawTAF", "")
                
                # Try to parse TAF with change groups using metar_taf_parser
                parsed_forecasts = None
                if raw_taf_text:
                    parsed_forecasts = self.parse_taf_with_change_groups(raw_taf_text)
                    if parsed_forecasts:
                        print(f"TAF parsed with change groups: station={taf.get('icaoId')}, forecast_points={len(parsed_forecasts)}")
                
                # Fallback to API parsing if parser didn't work
                if not parsed_forecasts:
                    parsed_forecasts = []
                    fcsts = taf.get("fcsts", [])
                    
                    if not isinstance(fcsts, list):
                        fcsts = []
                    
                    for fcst in fcsts:
                        if not isinstance(fcst, dict):
                            continue
                        parsed_forecasts.append({
                            "time": fcst.get("fcstTimeFrom", ""),
                            "valid_from": fcst.get("fcstTimeFrom"),
                            "valid_to": fcst.get("fcstTimeTo"),
                            "temperature": fcst.get("temp"),  # Celsius
                            "wind_speed": fcst.get("wspd"),     # Knots
                            "wind_direction": fcst.get("wdir"), # Degrees
                            "visibility": self.parse_visibility(fcst.get("visib")),    # Statute miles
                            "ceiling": fcst.get("cig"),          # Feet AGL
                            "flight_category": fcst.get("fltcat"),  # VFR, MVFR, IFR, LIFR
                            "conditions": fcst.get("wxString", ""),  # Weather phenomena
                        })
                    print(f"TAF parsed from API: station={taf.get('icaoId')}, forecast_count={len(parsed_forecasts)}")
                
                result = {
                    "station": taf.get("icaoId"),
                    "issue_time": taf.get("issueTime"),
                    "valid_from": taf.get("validTimeFrom"),
                    "valid_to": taf.get("validTimeTo"),
                    "raw_text": raw_taf_text,
                    "forecast": parsed_forecasts
                }
                
                return result
        
        except Exception as e:
            print(f"TAF fetch error: {e}")
            return None
    
    async def close(self):
        if self.session and not self.session.closed:
            await self.session.close()

# Singleton instance
weather_api = AviationWeatherAPI()