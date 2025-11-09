import { useEffect, useState } from 'react';

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
    const interval = setInterval(fetchTasks, 60000);
    
    return () => clearInterval(interval);
  }, []);

  const getPriorityColor = (priority: string) => {
    switch (priority.toUpperCase()) {
      case 'HIGH':
        return 'bg-red-500 text-white';
      case 'MEDIUM':
        return 'bg-yellow-500 text-white';
      case 'LOW':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'Weather Hazard': 'bg-orange-100 text-orange-800',
      'Low Altitude': 'bg-red-100 text-red-800',
      'Unusual Pattern': 'bg-purple-100 text-purple-800',
      'Speed Warning': 'bg-yellow-100 text-yellow-800',
      'Altitude Warning': 'bg-pink-100 text-pink-800',
      'Other': 'bg-gray-100 text-gray-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return 'Unknown';
    }
  };

  return (
    <div className="h-full w-full bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500">
            {tasks.length} active task{tasks.length !== 1 ? 's' : ''}
            {tasks.length > 3 && <span className="ml-1">(showing 3, scroll for more)</span>}
          </p>
        </div>
        <button
          onClick={fetchTasks}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Content - Fixed height to show ~3 tasks */}
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
              <div
                key={task.id}
                className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow min-h-[180px]"
              >
                {/* Task Header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`px-2 py-0.5 text-xs font-semibold rounded ${getPriorityColor(
                          task.priority
                        )}`}
                      >
                        {task.priority}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${getCategoryColor(
                          task.category
                        )}`}
                      >
                        {task.category}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900">
                      {task.aircraft_callsign || task.aircraft_icao24 || 'Unknown Aircraft'}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatTime(task.created_at)}
                  </span>
                </div>

                {/* Task Description */}
                <p className="text-sm text-gray-700 mt-2">{task.description}</p>

                {/* Aircraft Info */}
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    ICAO24: <span className="font-mono">{task.aircraft_icao24}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
