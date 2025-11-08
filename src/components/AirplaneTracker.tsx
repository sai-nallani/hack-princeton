import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function AirplaneTracker() {
  const { data: planes, error } = useSWR('http://localhost:8000/api/planes', fetcher, { refreshInterval: 3000 });

  if (error) return <div>Failed to load planes</div>;
  if (!planes) return <div>Loading...</div>;

  return (
    <div>
      <h1>Airplane Tracker</h1>
      {planes.length === 0 ? (
        <div>No planes found</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #333', textAlign: 'left' }}>
              <th style={{ padding: '10px' }}>Callsign</th>
              <th style={{ padding: '10px' }}>ICAO24</th>
              <th style={{ padding: '10px' }}>Type</th>
              <th style={{ padding: '10px' }}>Registration</th>
              <th style={{ padding: '10px' }}>Latitude</th>
              <th style={{ padding: '10px' }}>Longitude</th>
              <th style={{ padding: '10px' }}>Altitude</th>
              <th style={{ padding: '10px' }}>Speed</th>
              <th style={{ padding: '10px' }}>Operator</th>
            </tr>
          </thead>
          <tbody>
            {planes.map((plane: any) => (
              <tr key={plane.hex || plane.icao24} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '10px' }}>{(plane.flight || plane.callsign || '').trim() || 'Unknown'}</td>
                <td style={{ padding: '10px' }}>{plane.hex || plane.icao24}</td>
                <td style={{ padding: '10px' }}>{plane.t || plane.desc || 'N/A'}</td>
                <td style={{ padding: '10px' }}>{plane.r || 'N/A'}</td>
                <td style={{ padding: '10px' }}>{(plane.lat || plane.latitude)?.toFixed(6) || 'N/A'}</td>
                <td style={{ padding: '10px' }}>{(plane.lon || plane.longitude)?.toFixed(6) || 'N/A'}</td>
                <td style={{ padding: '10px' }}>{plane.alt_baro || plane.altitude || 'N/A'}</td>
                <td style={{ padding: '10px' }}>{plane.gs ? `${plane.gs.toFixed(1)} kts` : 'N/A'}</td>
                <td style={{ padding: '10px' }}>{plane.ownOp || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

