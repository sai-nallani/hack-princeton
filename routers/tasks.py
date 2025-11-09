"""
Tasks Router
FastAPI endpoints for task management

When the frontend calls this endpoint, it:
1. Executes get_active_tasks() from analysis_service
2. get_active_tasks() loads tasks from tasks.json
3. Returns only unresolved tasks to the frontend
"""
from fastapi import APIRouter, HTTPException
from typing import List, Dict
import sys
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from services.analysis_service import get_active_tasks, run_analysis

router = APIRouter(
    prefix="/api/tasks",
    tags=["tasks"]
)


@router.get("/")
async def get_tasks() -> List[Dict]:
    """
    Get active tasks for the frontend.
    This endpoint returns pre-analyzed tasks that are continuously updated in the background.
    No analysis runs on-demand - results are served instantly from the latest background analysis.
    
    Returns:
        List of active (unresolved) task dictionaries
    """
    try:
        # Simply get active tasks - analysis runs continuously in background
        tasks = get_active_tasks()
        print(f"📋 Returning {len(tasks)} active tasks to frontend")
        return tasks
    except Exception as e:
        print(f"❌ Error in get_tasks endpoint: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error getting tasks: {str(e)}")


