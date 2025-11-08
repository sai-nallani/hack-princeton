"""
Service for managing airplane data polling and caching
"""
import asyncio
import json
import redis
import requests
from typing import Optional, List, Dict


class PlanesService:
    """Service for polling and caching airplane data from airplanes.live API"""
    
    def __init__(
        self,
        target_lat: float = 33.6410564,
        target_lon: float = -84.4421781,
        max_distance_nm: int = 40,
        poll_interval: int = 1
    ):
        self.target_lat = target_lat
        self.target_lon = target_lon
        self.max_distance_nm = max_distance_nm
        self.poll_interval = poll_interval
        self.redis_client = redis.Redis()
        self._polling_task: Optional[asyncio.Task] = None
    
    async def poll_opensky(self):
        """
        Poll airplanes.live API and cache filtered planes in Redis
        Runs continuously until stopped
        """
        while True:
            try:
                response = requests.get(
                    f"https://api.airplanes.live/v2/point/"
                    f"{self.target_lat}/{self.target_lon}/{self.max_distance_nm}"
                )
                planes = response.json().get('ac', [])
                
                # Cache in Redis
                self.redis_client.set('planes', json.dumps(planes))
                print(f"Cached {len(planes)} planes within {self.max_distance_nm} nm")
                
            except Exception as e:
                print(f"Error polling airplanes.live API: {e}")
            
            await asyncio.sleep(self.poll_interval)
    
    def start_polling(self):
        """Start the background polling task"""
        if self._polling_task is None or self._polling_task.done():
            self._polling_task = asyncio.create_task(self.poll_opensky())
            return self._polling_task
        return self._polling_task
    
    def stop_polling(self):
        """Stop the background polling task"""
        if self._polling_task and not self._polling_task.done():
            self._polling_task.cancel()
    
    def get_planes(self) -> List[Dict]:
        """
        Get all plane data from Redis cache
        
        Returns:
            List of plane dictionaries from airplanes.live API
        """
        data = self.redis_client.get("planes")
        if data:
            try:
                planes = json.loads(data.decode("utf-8"))
                return planes
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                print(f"Error decoding planes data: {e}")
                return []
        return []


# Singleton instance
planes_service = PlanesService()

