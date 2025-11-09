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
  };
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

export default function Card({ task }: CardProps) {
  const parsed = parseDescription(task.description);

  const getPriorityColor = (priority: string) => {
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

  return (
    <div
      className={`border-l-2 rounded-r p-2.5 bg-gray-900 text-gray-100 shadow-sm hover:shadow-md transition-all font-tech ${getPriorityColor(
        task.priority
      )}`}
    >
      {/* Compact Header Row */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-cyan-400">
            {parsed.callsign || task.aircraft_callsign || task.aircraft_icao24}
          </span>
          {parsed.type && (
            <span className="font-mono text-xs text-gray-500">
              {parsed.type}
            </span>
          )}
          <span className="font-mono text-xs text-gray-500">
            {task.category} • {task.priority}
          </span>
        </div>
        <div className="text-xs font-mono text-gray-600">
          {formatTime(task.created_at)}
        </div>
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
        {parsed.position.lat && parsed.position.lon && (
          <span>
            <span className="text-gray-500">POS:</span>{' '}
            <span className="text-gray-300">
              {parsed.position.lat}, {parsed.position.lon}
            </span>
          </span>
        )}
        {parsed.location && (
          <span className="text-gray-500">
            📍 {parsed.location}
          </span>
        )}
      </div>

      {/* Alert/Issue - Inline */}
      {(parsed.alert || parsed.issue) && (
        <div className="mb-1 font-mono text-xs">
          {parsed.alert && (
            <span>
              <span className="text-red-400">⚠</span>{' '}
              <span className="text-red-300">{parsed.alert}</span>
            </span>
          )}
          {parsed.issue && (
            <span className="text-red-400/80">
              {' '}• {parsed.issue}
            </span>
          )}
        </div>
      )}

      {/* ATC Action - Inline */}
      {parsed.atcAction && (
        <div className="font-mono text-xs">
          <span className="text-cyan-400">ATC:</span>{' '}
          <span className="text-gray-300">{parsed.atcAction}</span>
        </div>
      )}
    </div>
  );
}

