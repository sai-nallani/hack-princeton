"""
Test script to demonstrate task expiration logic.
Shows how outdated tasks are automatically pruned.
"""
from datetime import datetime, timezone, timedelta

def prune_outdated_tasks(tasks, task_expiry_minutes=10, resolved_retention_hours=1):
    """
    Remove outdated tasks from the task list.
    
    Pruning rules:
    1. Unresolved tasks: Remove if last_seen is older than task_expiry_minutes
    2. Resolved tasks: Remove if created_at is older than resolved_retention_hours
    """
    now = datetime.now(timezone.utc)
    task_expiry_cutoff = now - timedelta(minutes=task_expiry_minutes)
    resolved_retention_cutoff = now - timedelta(hours=resolved_retention_hours)
    
    pruned_tasks = []
    removed_tasks = []
    
    for task in tasks:
        is_resolved = task.get("resolved", False)
        
        if not is_resolved:
            # For unresolved tasks, check last_seen timestamp
            last_seen_str = task.get("last_seen") or task.get("created_at")
            if last_seen_str:
                last_seen = datetime.fromisoformat(last_seen_str.replace('Z', '+00:00'))
                if last_seen.tzinfo is None:
                    last_seen = last_seen.replace(tzinfo=timezone.utc)
                
                if last_seen < task_expiry_cutoff:
                    removed_tasks.append((task, "stale", last_seen))
                    continue
        else:
            # For resolved tasks, check created_at timestamp
            created_at_str = task.get("created_at")
            if created_at_str:
                created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                
                if created_at < resolved_retention_cutoff:
                    removed_tasks.append((task, "old resolved", created_at))
                    continue
        
        pruned_tasks.append(task)
    
    return pruned_tasks, removed_tasks


if __name__ == "__main__":
    print("=" * 70)
    print("Task Expiration Test")
    print("=" * 70)
    print()
    
    now = datetime.now(timezone.utc)
    
    # Create sample tasks with various timestamps
    test_tasks = [
        {
            "id": 1,
            "aircraft_callsign": "AAL123",
            "category": "Low Altitude",
            "priority": "HIGH",
            "created_at": (now - timedelta(minutes=2)).isoformat(),
            "last_seen": (now - timedelta(minutes=1)).isoformat(),  # Recent
            "resolved": False
        },
        {
            "id": 2,
            "aircraft_callsign": "DAL456",
            "category": "Weather Hazard",
            "priority": "MEDIUM",
            "created_at": (now - timedelta(minutes=15)).isoformat(),
            "last_seen": (now - timedelta(minutes=12)).isoformat(),  # Stale (>10 min)
            "resolved": False
        },
        {
            "id": 3,
            "aircraft_callsign": "UAL789",
            "category": "Speed Warning",
            "priority": "HIGH",
            "created_at": (now - timedelta(minutes=30)).isoformat(),
            "last_seen": (now - timedelta(seconds=30)).isoformat(),  # Recently updated
            "resolved": False
        },
        {
            "id": 4,
            "aircraft_callsign": "SWA321",
            "category": "Altitude Warning",
            "priority": "LOW",
            "created_at": (now - timedelta(hours=2)).isoformat(),
            "last_seen": (now - timedelta(hours=2)).isoformat(),
            "resolved": True  # Old resolved task (>1 hour)
        },
        {
            "id": 5,
            "aircraft_callsign": "JBU654",
            "category": "Other",
            "priority": "MEDIUM",
            "created_at": (now - timedelta(minutes=30)).isoformat(),
            "last_seen": (now - timedelta(minutes=30)).isoformat(),
            "resolved": True  # Recent resolved task
        },
    ]
    
    print("📋 Initial tasks:")
    for task in test_tasks:
        status = "✓ Resolved" if task.get("resolved") else "⚠ Active"
        last_seen_delta = now - datetime.fromisoformat(task["last_seen"].replace('Z', '+00:00'))
        mins_ago = int(last_seen_delta.total_seconds() / 60)
        print(f"  {task['aircraft_callsign']}: {task['category']} ({task['priority']}) [{status}] - last seen {mins_ago}m ago")
    print()
    
    print("🔄 Running expiration cleanup...")
    print(f"  • Expiry threshold: 10 minutes")
    print(f"  • Resolved retention: 1 hour")
    print()
    
    pruned, removed = prune_outdated_tasks(test_tasks)
    
    print("❌ Removed tasks:")
    if removed:
        for task, reason, timestamp in removed:
            time_delta = now - timestamp
            mins_ago = int(time_delta.total_seconds() / 60)
            hours_ago = mins_ago / 60
            time_str = f"{mins_ago}m" if mins_ago < 60 else f"{hours_ago:.1f}h"
            print(f"  - {task['aircraft_callsign']}: {task['category']} ({reason}) - {time_str} ago")
    else:
        print("  (none)")
    print()
    
    print("✅ Remaining tasks:")
    for task in pruned:
        status = "✓ Resolved" if task.get("resolved") else "⚠ Active"
        print(f"  - {task['aircraft_callsign']}: {task['category']} ({task['priority']}) [{status}]")
    print()
    
    print("📊 Summary:")
    print(f"  Original tasks: {len(test_tasks)}")
    print(f"  Removed: {len(removed)}")
    print(f"  Remaining: {len(pruned)}")
    print()
    
    print("💡 Key points:")
    print("  • Active tasks expire after 10 minutes without updates")
    print("  • If an issue persists, last_seen keeps updating → task stays active")
    print("  • Resolved tasks are kept for 1 hour as history")
    print("  • This prevents stale warnings from cluttering the UI")
    print()
    print("=" * 70)
