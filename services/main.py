"""
FastAPI application entry point

Run with:
    cd /Users/olivercho/Desktop/Programming/hack-princeton/hack-princeton
    PYTHONPATH=. uvicorn services.main:app --host 0.0.0.0 --port 8000 --reload
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import weather, planes, websocket, health, tts
from services.planes_service import planes_service

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
app.include_router(health.router)
app.include_router(weather.router)
app.include_router(planes.router)
app.include_router(websocket.router)
app.include_router(tts.router)

@app.on_event("startup")
async def startup_event():
    """Start background tasks on application startup"""
    planes_service.start_polling()
    print("AirGuardian API started - background polling initiated")


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on application shutdown"""
    planes_service.stop_polling()
    print("AirGuardian API shutting down")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
