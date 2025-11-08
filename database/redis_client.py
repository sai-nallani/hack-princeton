import redis.asyncio as redis
import json
from typing import Optional, List

class RedisClient:
    def __init__(self, url: str = "redis://localhost:6379"):
        self.redis = redis.from_url(url, decode_responses=True)
    
    async def set_flight(self, icao24: str, data: dict, ttl: int = 30):
        """Store flight data with 30-second expiry"""
        await self.redis.setex(f"flight:{icao24}", ttl, json.dumps(data))
    
    async def get_flight(self, icao24: str) -> Optional[dict]:
        """Get flight data"""
        data = await self.redis.get(f"flight:{icao24}")
        return json.loads(data) if data else None
    
    async def get_all_flights(self) -> List[dict]:
        """Get all active flights"""
        keys = await self.redis.keys("flight:*")
        flights = []
        for key in keys:
            data = await self.redis.get(key)
            if data:
                flights.append(json.loads(data))
        return flights
    
    async def publish(self, channel: str, message: dict):
        """Publish message to channel"""
        await self.redis.publish(channel, json.dumps(message))

redis_client = RedisClient()