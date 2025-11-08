"""
Router for airplane/flight data endpoints
"""
from fastapi import APIRouter
from services.planes_service import planes_service

router = APIRouter(
    prefix="/api/planes",
    tags=["planes"]
)


@router.get("")
async def get_planes():
    """
    Return all plane data from Redis cache as returned by airplanes.live API
    
    Returns:
        List of plane dictionaries with flight information
    """
    return planes_service.get_planes()

