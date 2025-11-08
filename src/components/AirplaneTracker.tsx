import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Set your Mapbox access token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';

interface Airplane {
  hex?: string;
  icao24?: string;
  flight?: string;
  callsign?: string;
  lat?: number;
  latitude?: number;
  lon?: number;
  longitude?: number;
  alt_baro?: number;
  altitude?: number;
  gs?: number;
  t?: string;
  desc?: string;
  r?: string;
  ownOp?: string;
}

export function AirplaneTracker() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const updateIntervalRef = useRef<number | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Check if access token is set
    if (!mapboxgl.accessToken || mapboxgl.accessToken === 'your_mapbox_token_here') {
      console.error('Please set VITE_MAPBOX_ACCESS_TOKEN in your .env file');
      return;
    }

    // Function to fetch and update airplane positions
    const updateAirplanePositions = async () => {
      if (!map.current) return;

      try {
        const response = await fetch('http://localhost:8000/api/planes');
        const planes: Airplane[] = await response.json();

        if (!planes || planes.length === 0) {
          // Set empty GeoJSON if no planes
          const source = map.current.getSource('airplanes') as mapboxgl.GeoJSONSource;
          const groundSource = map.current.getSource('airplanes-ground') as mapboxgl.GeoJSONSource;
          if (source) {
            source.setData({
              type: 'FeatureCollection',
              features: []
            });
          }
          if (groundSource) {
            groundSource.setData({
              type: 'FeatureCollection',
              features: []
            });
          }
          return;
        }

        // Helper function to create a 100m x 100m square polygon around a point
        // At Atlanta's latitude (~33.64°): 1° lat ≈ 111,320m, 1° lon ≈ 92,700m
        // For 100m: lat offset ≈ 0.0009°, lon offset ≈ 0.00108°
        const createSquarePolygon = (lon: number, lat: number) => {
          const size = 0.0008; // Approximately 100 meters in degrees
          return [
            [lon - size, lat - size],
            [lon + size, lat - size],
            [lon + size, lat + size],
            [lon - size, lat + size],
            [lon - size, lat - size]
          ];
        };

        // Convert planes to GeoJSON features
        const features = planes
          .map((plane: Airplane) => {
            const planeId = plane.hex || plane.icao24 || '';
            const lat = plane.lat ?? plane.latitude;
            const lon = plane.lon ?? plane.longitude;
            const altitude = plane.alt_baro ?? plane.altitude ?? 0;

            if (!planeId || lat === undefined || lon === undefined) {
              return null;
            }

            // Create a 100m x 100m polygon for 3D cube extrusion
            const polygon = createSquarePolygon(lon, lat);

            return {
              type: 'Feature' as const,
              id: planeId,
              geometry: {
                type: 'Polygon' as const,
                coordinates: [polygon]
              },
              properties: {
                id: planeId,
                altitude: altitude,
                callsign: plane.callsign || plane.flight || '',
                speed: plane.gs || 0,
                // Also store point coordinates for the ground circle layer
                lon: lon,
                lat: lat
              }
            };
          })
          .filter((feature): feature is NonNullable<typeof feature> => feature !== null);

        // Create separate point features for the ground circle layer
        const pointFeatures = planes
          .map((plane: Airplane) => {
            const planeId = plane.hex || plane.icao24 || '';
            const lat = plane.lat ?? plane.latitude;
            const lon = plane.lon ?? plane.longitude;
            const altitude = plane.alt_baro ?? plane.altitude ?? 0;

            if (!planeId || lat === undefined || lon === undefined) {
              return null;
            }

            return {
              type: 'Feature' as const,
              id: `point-${planeId}`,
              geometry: {
                type: 'Point' as const,
                coordinates: [lon, lat]
              },
              properties: {
                id: planeId,
                altitude: altitude,
                callsign: plane.callsign || plane.flight || '',
                speed: plane.gs || 0
              }
            };
          })
          .filter((feature): feature is NonNullable<typeof feature> => feature !== null);

        // Update the 3D extrusion source with polygon features
        const source = map.current.getSource('airplanes') as mapboxgl.GeoJSONSource;
        if (source) {
          source.setData({
            type: 'FeatureCollection',
            features: features
          });
        }

        // Update the ground circle source with point features
        const groundSource = map.current.getSource('airplanes-ground') as mapboxgl.GeoJSONSource;
        if (groundSource) {
          groundSource.setData({
            type: 'FeatureCollection',
            features: pointFeatures
          });
        }
      } catch (error) {
        console.error('Error updating airplane positions:', error);
      }
    };

    // Initialize the map centered on Atlanta, GA with 3D view
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-84.425, 33.6410564], // Atlanta coordinates
      zoom: 12,
      pitch: 60, // Tilt the map for 3D view
      bearing: 0,
      antialias: true
    });

    map.current.on('load', async () => {
      if (!map.current) return;

      // Add 3D terrain
      map.current.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      });

      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

      // Add sky layer for atmosphere
      map.current.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 90.0],
          'sky-atmosphere-sun-intensity': 15
        }
      });

      // Initialize with empty GeoJSON for 3D extrusions (polygons)
      map.current.addSource('airplanes', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Initialize with empty GeoJSON for ground markers (points)
      map.current.addSource('airplanes-ground', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Add 3D fill-extrusion layer for airplanes at their altitude
      map.current.addLayer({
        id: 'airplanes-3d',
        type: 'fill-extrusion',
        source: 'airplanes',
        paint: {
          // Base height is the altitude in meters (convert from feet)
          'fill-extrusion-base': [
            '*',
            ['get', 'altitude'],
            0.3048  // Convert feet to meters
          ],
          // Height of the cube: 100 meters tall, positioned at altitude
          'fill-extrusion-height': [
            '+',
            ['*', ['get', 'altitude'], 0.3048],  // Base at altitude in meters
            100  // 100 meters tall (cube height)
          ],
          // All planes are green
          'fill-extrusion-color': '#00ff00',
          'fill-extrusion-opacity': 0.9
        }
      });

      // Also add a circle layer on the ground for reference
      map.current.addLayer({
        id: 'airplanes-ground',
        type: 'circle',
        source: 'airplanes-ground',
        paint: {
          'circle-radius': 4,
          'circle-color': '#00ff00',  // All planes are green
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',  // White stroke for green circles
          'circle-opacity': 0.7
        }
      });

      setMapLoaded(true);

      // Start updating airplane positions
      await updateAirplanePositions();
      
      // Update every 2 seconds (similar to ISS example)
      updateIntervalRef.current = window.setInterval(async () => {
        await updateAirplanePositions();
      }, 2000);
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
      map.current?.remove();
      map.current = null;
    };
  }, []);

  if (!mapboxgl.accessToken || mapboxgl.accessToken === 'your_mapbox_token_here') {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center max-w-2xl p-8">
          <h2 className="text-2xl font-bold mb-4">Mapbox Access Token Required</h2>
          <p className="text-gray-400 mb-4">
            Please add your Mapbox access token to the .env file:
          </p>
          <pre className="bg-gray-800 p-4 rounded text-left text-sm">
            VITE_MAPBOX_ACCESS_TOKEN=your_actual_token_here
          </pre>
          <p className="text-gray-400 mt-4 text-sm">
            Get a free token at{' '}
            <a
              href="https://account.mapbox.com/access-tokens/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300"
            >
              mapbox.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Info panel with altitude legend */}
      <div className="absolute top-4 left-4 bg-gray-900 bg-opacity-90 text-white p-4 rounded-lg shadow-lg max-w-xs z-10">
        <div className="text-sm space-y-2">
          <h3 className="font-bold mb-2">Live Aircraft Tracking</h3>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#00ff00' }}></div>
              <span>Aircraft (100m × 100m × 100m cubes)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Loading indicator */}
      {!mapLoaded && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-900 bg-opacity-90 text-white p-6 rounded-lg z-10">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400"></div>
            <span>Loading map...</span>
          </div>
        </div>
      )}
    </div>
  );
}