"""
Test script to demonstrate task deduplication logic.
This shows how the fingerprint-based deduplication prevents duplicate tasks.
"""
from datetime import datetime

def create_fingerprint(task):
    """Create a unique fingerprint for a task."""
    return f"{task.get('aircraft_icao24', 'UNKNOWN')}_{task.get('category', 'Other')}_{task.get('priority', 'LOW')}"

def deduplicate_tasks(new_tasks, existing_tasks):
    """
    Deduplicate tasks using fingerprint-based matching.
    
    Args:
        new_tasks: Newly generated tasks
        existing_tasks: Tasks already in the system
        
    Returns:
        tuple: (tasks_to_add, tasks_updated)
    """
    # Create a map of existing unresolved task fingerprints
    existing_fingerprints = {
        create_fingerprint(task): task 
        for task in existing_tasks 
        if not task.get("resolved", False)
    }
    
    tasks_to_add = []
    tasks_updated = []
    
    for task in new_tasks:
        fingerprint = create_fingerprint(task)
        if fingerprint in existing_fingerprints:
            # Task already exists - mark as updated
            existing_task = existing_fingerprints[fingerprint]
            existing_task["last_seen"] = datetime.utcnow().isoformat()
            tasks_updated.append(existing_task)
            print(f"  ✓ Updated: {task['aircraft_callsign']} - {task['category']}")
        else:
            # New task - will be added
            task["fingerprint"] = fingerprint
            task["last_seen"] = task["created_at"]
            tasks_to_add.append(task)
            print(f"  + New: {task['aircraft_callsign']} - {task['category']}")
    
    return tasks_to_add, tasks_updated


# Example usage
if __name__ == "__main__":
    print("=" * 70)
    print("Task Deduplication Test")
    print("=" * 70)
    print()
    
    # Simulate existing tasks in the system
    existing_tasks = [
        {
            "id": 123,
            "aircraft_icao24": "A12345",
            "aircraft_callsign": "AAL123",
            "priority": "HIGH",
            "category": "Low Altitude",
            "description": "Aircraft at dangerously low altitude",
            "created_at": "2025-11-08T10:00:00",
            "resolved": False,
            "fingerprint": "A12345_Low Altitude_HIGH"
        },
        {
            "id": 456,
            "aircraft_icao24": "B67890",
            "aircraft_callsign": "DAL456",
            "priority": "MEDIUM",
            "category": "Weather Hazard",
            "description": "Flying through severe weather",
            "created_at": "2025-11-08T10:05:00",
            "resolved": True  # This one is resolved
        }
    ]
    
    # Simulate new tasks from Grok API
    new_tasks_from_grok = [
        {
            "aircraft_icao24": "A12345",
            "aircraft_callsign": "AAL123",
            "priority": "HIGH",
            "category": "Low Altitude",
            "description": "Aircraft still at dangerously low altitude - continuing to monitor",
            "created_at": "2025-11-08T10:10:00",
            "resolved": False
        },
        {
            "aircraft_icao24": "C11111",
            "aircraft_callsign": "UAL789",
            "priority": "HIGH",
            "category": "Speed Warning",
            "description": "Aircraft exceeding safe speed limits",
            "created_at": "2025-11-08T10:10:00",
            "resolved": False
        },
        {
            "aircraft_icao24": "B67890",
            "aircraft_callsign": "DAL456",
            "priority": "MEDIUM",
            "category": "Weather Hazard",
            "description": "Weather hazard still present",
            "created_at": "2025-11-08T10:10:00",
            "resolved": False
        }
    ]
    
    print("📋 Existing tasks in system:")
    for task in existing_tasks:
        status = "✓ Resolved" if task.get("resolved") else "⚠ Active"
        print(f"  - {task['aircraft_callsign']}: {task['category']} ({task['priority']}) [{status}]")
    print()
    
    print("📡 New tasks from Grok API:")
    for task in new_tasks_from_grok:
        print(f"  - {task['aircraft_callsign']}: {task['category']} ({task['priority']})")
    print()
    
    print("🔄 Running deduplication...")
    to_add, updated = deduplicate_tasks(new_tasks_from_grok, existing_tasks)
    print()
    
    print("📊 Results:")
    print(f"  New tasks to add: {len(to_add)}")
    print(f"  Existing tasks updated: {len(updated)}")
    print()
    
    print("✨ Final task list would contain:")
    # Resolved tasks stay
    resolved = [t for t in existing_tasks if t.get("resolved")]
    print(f"  - {len(resolved)} resolved task(s)")
    print(f"  - {len(updated)} updated active task(s)")
    print(f"  - {len(to_add)} new active task(s)")
    print(f"  Total: {len(resolved) + len(updated) + len(to_add)} tasks")
    print()
    
    print("💡 Key points:")
    print("  • Tasks are identified by: aircraft + category + priority")
    print("  • Same issue for same aircraft = UPDATE, not duplicate")
    print("  • Resolved tasks can reappear if issue returns")
    print("  • Each task gets a 'last_seen' timestamp")
    print()
    print("=" * 70)
