import { useEffect, useState } from 'react';
import Card from './Card';

interface Task {
  id: number;
  aircraft_icao24: string;
  aircraft_callsign: string;
  priority: string;
  category: string;
  description: string;
  created_at: string;
  resolved: boolean;
  fingerprint?: string;
  last_seen?: string;
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Custom scrollbar styles
  const scrollbarStyles = {
    scrollbarWidth: 'thin' as const,
    scrollbarColor: '#CBD5E0 #F7FAFC',
  };

  const getPriorityRank = (priority: string): number => {
    const ranks: Record<string, number> = {
      'HIGH': 1,
      'MEDIUM': 2,
      'LOW': 3,
    };
    return ranks[priority.toUpperCase()] || 999;
  };

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('http://localhost:8000/api/tasks/');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch tasks: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Sort by priority: HIGH → MEDIUM → LOW
      const sortedData = data.sort((a: Task, b: Task) => {
        return getPriorityRank(a.priority) - getPriorityRank(b.priority);
      });
      
      setTasks(sortedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
      console.error('Error fetching tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch tasks immediately
    fetchTasks();
    
    // Refresh tasks every 10 seconds
    const interval = setInterval(fetchTasks, 10000);
    
    return () => clearInterval(interval);
  }, []);


  return (
    <div className="h-full w-full bg-black flex flex-col">
      <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: 'calc(100vh - 120px)' }}>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
            <p className="font-semibold">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-gray-500">Loading tasks...</div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-center text-gray-500">
              <p className="font-semibold">No active tasks</p>
              <p className="text-sm mt-1">Tasks will appear here when safety risks are detected</p>
            </div>
          </div>
        ) : (
          <div 
            className="space-y-3 max-h-[600px] overflow-y-auto pr-2"
            style={scrollbarStyles}
          >
            {tasks.map((task) => (
              <Card key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
