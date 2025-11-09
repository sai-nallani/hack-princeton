"""
Tasks Router
FastAPI endpoints for task management

When the frontend calls this endpoint, it:
1. Executes get_active_tasks() from analysis_service
2. get_active_tasks() loads tasks from tasks.json
3. Returns only unresolved tasks to the frontend
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from typing import List, Dict
from pydantic import BaseModel
import sys
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from services.analysis_service import get_active_tasks, run_analysis, load_tasks, save_tasks, AUDIO_DIR

router = APIRouter(
    prefix="/api/tasks",
    tags=["tasks"]
)


class ResolveTaskRequest(BaseModel):
    task_id: int


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


@router.post("/resolve")
async def resolve_task(request: ResolveTaskRequest):
    """
    Mark a task as resolved and remove it from active tasks.
    
    Args:
        request: Request containing task_id to resolve
    """
    try:
        all_tasks = load_tasks()
        task_found = False
        
        for task in all_tasks:
            if task.get('id') == request.task_id:
                task['resolved'] = True
                task_found = True
                print(f"✓ Task {request.task_id} marked as resolved")
                break
        
        if not task_found:
            raise HTTPException(status_code=404, detail=f"Task {request.task_id} not found")
        
        save_tasks(all_tasks)
        return {"status": "success", "task_id": request.task_id}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error resolving task: {str(e)}")


@router.get("/audio/{filename}")
async def get_task_audio(filename: str):
    """
    Serve pre-generated audio file for a task.
    
    Args:
        filename: Audio filename (e.g., task_12345.mp3)
    """
    try:
        filepath = AUDIO_DIR / filename
        
        if not filepath.exists():
            raise HTTPException(status_code=404, detail="Audio file not found")
        
        return FileResponse(
            path=filepath,
            media_type="audio/mpeg",
            filename=filename
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error serving audio: {str(e)}")



