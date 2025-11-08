from fastapi import APIRouter, HTTPException
from services.weather_api import AviationWeatherAPI

router = APIRouter(
    prefix="/api/weather",
    tags=["weather"]
)

@router.get("/metar/{station_id}")
async def get_weather(station_id: str):
    station_id = station_id.upper()

    metar = await AviationWeatherAPI().get_metar(station_id)

    return metar

@router.get("/sigmets")
async def get_sigmets(hazard: str = None):
    sigmets = await AviationWeatherAPI().get_sigmets(hazard)
    return sigmets

@router.get("/taf/{station_id}")
async def get_taf(station_id: str):
    station_id = station_id.upper()

    taf = await AviationWeatherAPI().get_taf(station_id)
    return taf