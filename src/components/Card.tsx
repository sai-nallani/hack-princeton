import { useState } from 'react';

interface CardProps {
  task: {
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
    summary?: string;
    pilot_message?: string;
    audio_file?: string;
  };
  onTaskResolved?: (taskId: number) => void;
}

interface ParsedData {
  callsign: string;
  type: string;
  altitude: string;
  position: { lat: string; lon: string };
  groundspeed: string;
  heading: string;
  squawk: string;
  alert: string;
  issue: string;
  location: string;
  atcAction: string;
}

function parseDescription(description: string): ParsedData {
  const data: ParsedData = {
    callsign: '',
    type: '',
    altitude: '',
    position: { lat: '', lon: '' },
    groundspeed: '',
    heading: '',
    squawk: '',
    alert: '',
    issue: '',
    location: '',
    atcAction: '',
  };

  // Extract callsign and type
  const callsignMatch = description.match(/([A-Z0-9]+),\s*type\s+([A-Z0-9]+)/i);
  if (callsignMatch) {
    data.callsign = callsignMatch[1];
    data.type = callsignMatch[2];
  }

  // Extract altitude
  const altMatch = description.match(/(\d+)\s*ft\s*MSL/i);
  if (altMatch) {
    data.altitude = altMatch[1] + 'ft MSL';
  }

  // Extract position
  const posMatch = description.match(/Lat\s+([\d.-]+)\s+Lon\s+([\d.-]+)/i);
  if (posMatch) {
    data.position.lat = parseFloat(posMatch[1]).toFixed(4);
    data.position.lon = parseFloat(posMatch[2]).toFixed(4);
  }

  // Extract groundspeed
  const speedMatch = description.match(/groundspeed\s+([\d.]+)\s*kt/i);
  if (speedMatch) {
    data.groundspeed = speedMatch[1] + 'kt';
  }

  // Extract heading
  const headingMatch = description.match(/heading\s+([\d.]+)°/i);
  if (headingMatch) {
    data.heading = headingMatch[1] + '°';
  }

  // Extract squawk
  const squawkMatch = description.match(/squawk\s+(\d+)/i);
  if (squawkMatch) {
    data.squawk = squawkMatch[1];
  }

  // Extract alert type - look for "Possible" followed by alert description
  const alertMatch = description.match(/(Possible\s+[^.]*alert[^.]*?)(?:\.|,|$)/i);
  if (alertMatch) {
    data.alert = alertMatch[1].trim();
  } else {
    // Fallback to any alert mention
    const fallbackAlert = description.match(/([^.]*alert[^.]*)/i);
    if (fallbackAlert) {
      data.alert = fallbackAlert[1].trim();
    }
  }

  // Extract issue - look for "below" or safety concerns
  const issueMatch = description.match(/([^.]*below[^.]*)/i);
  if (issueMatch) {
    data.issue = issueMatch[1].trim();
  } else {
    // Look for other safety issues
    const safetyMatch = description.match(/([^.]*less than[^.]*AGL[^.]*)/i);
    if (safetyMatch) {
      data.issue = safetyMatch[1].trim();
    }
  }

  // Extract location (airport code like KPDK/Peachtree City)
  const locationMatch = description.match(/([A-Z]{4}\/[^,)]+)/i);
  if (locationMatch) {
    data.location = locationMatch[1];
  }

  // Extract ATC action - capture everything after "ATC action:" 
  const atcIndex = description.toLowerCase().indexOf('atc action:');
  if (atcIndex !== -1) {
    const atcText = description.substring(atcIndex + 'atc action:'.length).trim();
    // Clean up the text - remove extra whitespace
    data.atcAction = atcText.replace(/\s+/g, ' ').trim();
  }

  return data;
}

export default function Card({ task, onTaskResolved }: CardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const parsed = parseDescription(task.description);

  const getPriorityColor = (priority: string | undefined) => {
    if (!priority) return 'border-l-gray-500';
    switch (priority.toUpperCase()) {
      case 'HIGH':
        return 'border-l-red-500';
      case 'MEDIUM':
        return 'border-l-yellow-500';
      case 'LOW':
        return 'border-l-blue-500';
      default:
        return 'border-l-gray-500';
    }
  };

  const formatCallsign = (callsign: string): string => {
    try {
      if (!callsign || typeof callsign !== 'string') return 'N/A';
      
      // Map of spelled-out numbers to digits
      const numberMap: Record<string, string> = {
        'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
        'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
        'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13',
        'fourteen': '14', 'fifteen': '15', 'sixteen': '16', 'seventeen': '17',
        'eighteen': '18', 'nineteen': '19', 'twenty': '20', 'thirty': '30',
        'forty': '40', 'fifty': '50', 'sixty': '60', 'seventy': '70',
        'eighty': '80', 'ninety': '90', 'hundred': '00'
      };

      const trimmed = callsign.trim();
      if (!trimmed) return 'N/A';
      
      const words = trimmed.split(/\s+/);
      const result: string[] = [];

      for (const word of words) {
        if (!word || typeof word !== 'string' || word.trim().length === 0) continue;
        
        const lowerWord = word.toLowerCase();
        
        // Check if it's a spelled-out number
        if (numberMap[lowerWord]) {
          result.push(numberMap[lowerWord]);
        } 
        // Check if it's already all digits
        else if (/^\d+$/.test(word)) {
          result.push(word);
        }
        // Check if it's a mixed alphanumeric string (like "DAL3119" or "AAL123")
        else if (/[A-Za-z]/.test(word) && /\d/.test(word)) {
          // Extract letters and numbers separately
          const letterMatch = word.match(/[A-Za-z]+/);
          const numberMatch = word.match(/\d+/);
          
          if (letterMatch && letterMatch[0] && letterMatch[0].length > 0) {
            // Take first letter of the letter group
            const firstLetter = letterMatch[0].charAt(0);
            if (firstLetter && typeof firstLetter === 'string') {
              result.push(firstLetter.toUpperCase());
            }
          }
          if (numberMatch && numberMatch[0]) {
            result.push(numberMatch[0]);
          }
        }
        // Otherwise, take the first letter (uppercase)
        else if (word.length > 0) {
          const firstLetter = word.charAt(0);
          if (firstLetter && typeof firstLetter === 'string') {
            result.push(firstLetter.toUpperCase());
          }
        }
      }

      const formatted = result.join('');
      return formatted || 'N/A';
    } catch (error) {
      console.error('Error formatting callsign:', error, callsign);
      return 'N/A';
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '--:--';
    }
  };

  const resolveTask = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/tasks/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ task_id: task.id }),
      });

      if (!response.ok) {
        throw new Error('Failed to resolve task');
      }

      if (onTaskResolved) {
        onTaskResolved(task.id);
      }
    } catch (err) {
      console.error('Error resolving task:', err);
      alert(`Failed to resolve task: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAccept = async () => {
    setIsProcessing(true);
    
    try {
      if (task.audio_file) {
        // Play audio first, then resolve
        const audioUrl = `http://localhost:8000/api/tasks/audio/${task.audio_file}`;
        const audio = new Audio(audioUrl);
        
        audio.onended = async () => {
          console.log(`✓ Task ${task.id} audio playback completed`);
          await resolveTask();
        };

        audio.onerror = () => {
          console.error('Failed to play audio');
          // Resolve anyway even if audio fails
          resolveTask();
        };

        await audio.play();
        console.log('🔊 Playing audio for task', task.id);
      } else if (task.pilot_message) {
        // If no audio file but we have a message, try to generate/play it
        // For now, just resolve - could add TTS endpoint call here if needed
        await resolveTask();
      } else {
        // No audio or message, just resolve
        await resolveTask();
      }
    } catch (err) {
      console.error('Error accepting task:', err);
      alert(`Failed to play message: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    await resolveTask();
  };

  return (
    <div
      className={`border-l-2 rounded-r p-2.5 bg-gray-900 text-gray-100 shadow-sm hover:shadow-md transition-all font-tech ${getPriorityColor(
        task.priority
      )}`}
    >

      {/* Compact Header Row */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="mb-2">
            <span className="font-mono text-lg font-bold text-cyan-400">
              {formatCallsign(task.aircraft_callsign || parsed.callsign || '')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {parsed.type && (
            <span className="font-mono text-xs text-gray-500">
              {parsed.type}
            </span>
          )}
          <span className="font-mono text-xs text-gray-500">
            {task.category} • {task.priority}
          </span>
        </div>
        {/* <div className="text-xs font-mono text-gray-600">
          {formatTime(task.created_at)}
        </div> */}
      </div>

      {/* Inline Metrics */}
      <div className="flex items-center gap-3 mb-1 font-mono text-xs flex-wrap">
        {parsed.altitude && (
          <span>
            <span className="text-gray-500">ALT:</span>{' '}
            <span className="text-cyan-300">{parsed.altitude}</span>
          </span>
        )}
        {parsed.groundspeed && (
          <span>
            <span className="text-gray-500">SPD:</span>{' '}
            <span className="text-green-300">{parsed.groundspeed}</span>
          </span>
        )}
        {parsed.heading && (
          <span>
            <span className="text-gray-500">HDG:</span>{' '}
            <span className="text-yellow-300">{parsed.heading}</span>
          </span>
        )}
        {parsed.squawk && (
          <span>
            <span className="text-gray-500">SQK:</span>{' '}
            <span className="text-purple-300">{parsed.squawk}</span>
          </span>
        )}
        {/* {parsed.position.lat && parsed.position.lon && ( */}
        {/* <span>
          //   <span className="text-gray-500">POS:</span>{' '}
          //   <span className="text-gray-300">
          //     {parsed.position.lat}, {parsed.position.lon}
          //   </span>
          // </span>
        // )} */}
        {parsed.location && (
          <span className="text-gray-500">
            📍 {parsed.location}
          </span>
        )}
      </div>

      {/* Alert/Issue - Always visible */}
      <div className="mb-1 font-mono text-xs">
        <span>
          <span className="text-red-400">⚠</span>{' '}
          {task.summary ? (
            <span className="text-red-300">{task.summary}</span>
          ) : (
            <span className="text-gray-600">No alerts</span>
          )}
        </span>
      </div>

      {/* ATC Action - Always visible */}
      <div className="font-mono text-xs mb-2">
        <span className="text-cyan-400">ATC:</span>{' '}
        {task.pilot_message ? (
          <span className="text-gray-300">{task.pilot_message}</span>
        ) : (
          <span className="text-gray-600">No action required</span>
        )}
      </div>

      {/* Accept/Reject Buttons */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={handleAccept}
          disabled={isProcessing}
          className={`flex-1 px-3 py-1.5 text-xs font-mono rounded transition-colors ${
            isProcessing
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isProcessing && task.audio_file ? '🔊 Playing...' : '✓ Accept'}
        </button>
        <button
          onClick={handleReject}
          disabled={isProcessing}
          className={`flex-1 px-3 py-1.5 text-xs font-mono rounded transition-colors ${
            isProcessing
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
        >
          ✗ Reject
        </button>
      </div>
    </div>
  );
}

