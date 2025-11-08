from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import asyncio
import json
import redis
import requests

TARGET_LAT = 33.6410564
TARGET_LON = -84.4421781
MAX_DISTANCE_NM = 40  # nautical miles

async def poll_opensky():
    """
    Poll airplanes.live API every 3 seconds and cache filtered planes in Redis
    """
    r = redis.Redis()
    while True:
        try:
            response = requests.get(f"https://api.airplanes.live/v2/point/{TARGET_LAT}/{TARGET_LON}/{MAX_DISTANCE_NM}")
            planes = response.json().get('ac', [])

            # Cache in Redis
            r.set('planes', json.dumps(planes))
            print(f"Cached {len(planes)} planes within {MAX_DISTANCE_NM} nm")

        except Exception as e:
            print(f"Error polling airplanes.live API: {e}")

        await asyncio.sleep(1)

app = FastAPI(title="AirGuardian API")

# CORS for frontend - very permissive for development (allows all origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins - very permissive for development
    allow_credentials=False,  # Must be False when using allow_origins=["*"]
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

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

@app.get("/api/planes")
async def get_planes():
    """
    Return all plane data from Redis cache as returned by airplanes.live API
    """
    r = redis.Redis()
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
