"""
FastAPI application entry point

Run with:
    cd /Users/sainallani/Projects/hack-princeton-1
    PYTHONPATH=. uvicorn services.main:app --host 0.0.0.0 --port 8000 --reload
"""
import sys
from pathlib import Path

# Add project root to Python path for imports
project_root = Path(__file__).parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import asyncio
import json
import redis
import requests
from routers.weather import router as weather_router
from routers.tasks import router as tasks_router
from services.analysis_service import run_analysis

TARGET_LAT = 33.6410564
TARGET_LON = -84.4421781
MAX_DISTANCE_NM = 40  # nautical miles

# Background analysis state
analysis_lock = asyncio.Lock()
analysis_running = False

async def poll_opensky():
    """
    Poll airplanes.live API every 3 seconds and cache filtered planes in Redis
    """
    r = redis.Redis(host='localhost', port=6379)
    while True:
        try:
            response = requests.get(f"https://api.airplanes.live/v2/point/{TARGET_LAT}/{TARGET_LON}/{MAX_DISTANCE_NM}")
            planes = response.json().get('ac', [])

            # Cache in Redis
            r.set('planes', json.dumps(planes), ex=600)  # 10 minutes
            print(f"Cached {len(planes)} planes within {MAX_DISTANCE_NM} nm")

        except Exception as e:
            print(f"Error polling airplanes.live API: {e}")

        await asyncio.sleep(1)


async def continuous_analysis():
    """
    Continuously run analysis in the background for instant API responses.
    This runs analysis immediately after the previous one completes,
    ensuring fresh results are always available when the frontend requests them.
    """
    global analysis_running
    
    # Wait a bit on startup for Redis to populate
    await asyncio.sleep(3)
    
    while True:
        try:
            async with analysis_lock:
                analysis_running = True
                print("🔄 Running pre-emptive analysis...")
                await run_analysis()
                print("✅ Pre-emptive analysis complete, ready for next request")
                analysis_running = False
            
            # Small delay before starting next analysis to avoid overwhelming the API
            await asyncio.sleep(2)
            
        except Exception as e:
            print(f"❌ Error in continuous analysis: {e}")
            analysis_running = False
            await asyncio.sleep(5)  # Wait longer on error


app = FastAPI(
    title="AirGuardian API",
    description="API for monitoring aircraft and weather conditions",
    version="1.0.0"
)

# CORS middleware - very permissive for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins - very permissive for development
    allow_credentials=False,  # Must be False when using allow_origins=["*"]
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

# Include routers
app.include_router(weather_router)
app.include_router(tasks_router)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
    
    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(poll_opensky())
    asyncio.create_task(continuous_analysis())

@app.get("/api/planes")
async def get_planes():
    """
    Return all plane data from Redis cache as returned by airplanes.live API
    """
    r = redis.Redis(host='localhost', port=6379)
    data = r.get("planes")
    if data:
        planes = json.loads(data.decode("utf-8"))
        # Return all data as-is from the airplanes.live API
        return planes
    return []

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            print(f"Received: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
