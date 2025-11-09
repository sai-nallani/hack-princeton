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
  baro_rate?: number;
  track?: number;
  mag_heading?: number;
  true_heading?: number;
  t?: string;
  desc?: string;
  r?: string;
  ownOp?: string;
  lastPosition?: {
    lat?: number;
    lon?: number;
  };
}

export function AirplaneTracker() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const updateIntervalRef = useRef<number | null>(null);
  // Store previous positions for rotation (1 second) and trail history (3-5 seconds)
  const previousPositionsRef = useRef<Map<string, { lat: number; lon: number; timestamp: number }>>(new Map());
  const positionHistoryRef = useRef<Map<string, Array<{ lat: number; lon: number; timestamp: number }>>>(new Map());
  const [selectedPlaneId, setSelectedPlaneId] = useState<string | null>(null);
  const selectedPlaneIdRef = useRef<string | null>(null);
  const [selectedPlane, setSelectedPlane] = useState<{ lat: number; lon: number; altitude: number; callsign: string; speed: number; baro_rate: number } | null>(null);

  // Function to get color based on altitude
  const getAltitudeColor = (altitude: number): string => {
    if (altitude < 10000) return '#ff0000'; // Red - Low altitude (danger zone)
    if (altitude < 25000) return '#ffaa00'; // Orange - Medium altitude
    if (altitude < 35000) return '#00ff00'; // Green - Cruising altitude
    return '#0088ff'; // Blue - High altitude
  };

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
        
        console.log('Fetched planes:', planes.length, planes);

        if (!planes || planes.length === 0) {
          console.log('No planes found in response');
          // Set empty GeoJSON if no planes
          const source = map.current.getSource('airplanes') as mapboxgl.GeoJSONSource;
          const trailSource = map.current.getSource('airplanes-trails') as mapboxgl.GeoJSONSource;
          if (source) {
            source.setData({
              type: 'FeatureCollection',
              features: []
            });
          }
          if (trailSource) {
            trailSource.setData({
              type: 'FeatureCollection',
              features: []
            });
          }
          return;
        }

        // Convert planes to GeoJSON point features for airplane icons and trail lines
        const now = Date.now();
        const iconFeatures: GeoJSON.Feature<GeoJSON.Point>[] = [];
        const trailFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];

        planes.forEach((plane: Airplane) => {
            const planeId = plane.hex || plane.icao24 || '';
          // Handle nested lastPosition object from airplanes.live API
          const lat = plane.lat ?? plane.latitude ?? plane.lastPosition?.lat;
          const lon = plane.lon ?? plane.longitude ?? plane.lastPosition?.lon;
            const altitude = plane.alt_baro ?? plane.altitude ?? 0;

            if (!planeId || lat === undefined || lon === undefined) {
            return;
          }

          // Get bearing/rotation for airplane icon
          // Priority: 1) API track (most accurate), 2) API heading, 3) Calculate from position history
          let bearing = 0; // Default bearing (north)
          
          // First try: Use API track (ground track angle - most accurate for direction)
          if (plane.track !== undefined && plane.track !== null) {
            bearing = plane.track;
          }
          // Second try: Use API magnetic heading
          else if (plane.mag_heading !== undefined && plane.mag_heading !== null) {
            bearing = plane.mag_heading;
          }
          // Third try: Use API true heading
          else if (plane.true_heading !== undefined && plane.true_heading !== null) {
            bearing = plane.true_heading;
          }
          // Fallback: Calculate from position history (extend to 10 seconds for better accuracy)
          else {
            const previous = previousPositionsRef.current.get(planeId);
            if (previous && (now - previous.timestamp) <= 10000) {
              // Calculate bearing from previous to current position (accurate formula
              const dLon = (lon - previous.lon) * Math.PI / 180;
              const lat1Rad = previous.lat * Math.PI / 180;
              const lat2Rad = lat * Math.PI / 180;
              
              const y = Math.sin(dLon) * Math.cos(lat2Rad);
              const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
                       Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
              
              bearing = Math.atan2(y, x) * (180 / Math.PI);
              bearing = (bearing + 360) % 360; // Normalize to 0-360
            }
          }
          
          // Normalize bearing to 0-360
          bearing = (bearing + 360) % 360;
          
          // Store current position for rotation calculation (1 second)
          previousPositionsRef.current.set(planeId, { lat, lon, timestamp: now });

          // Store position in history for trail (40 minutes)
          if (!positionHistoryRef.current.has(planeId)) {
            positionHistoryRef.current.set(planeId, []);
          }
          const positionHistory = positionHistoryRef.current.get(planeId)!;
          
          // Add current position to history
          positionHistory.push({ lat, lon, timestamp: now });
          
          // Keep only last 40 minutes of history (40 * 60 * 1000 = 2,400,000 ms)
          const fortyMinutesAgo = now - 2400000;
          const filteredHistory = positionHistory.filter(pos => pos.timestamp >= fortyMinutesAgo);
          positionHistoryRef.current.set(planeId, filteredHistory);

          // Create trail line from position history (40 minutes with opacity fading)
          // Create trail from filtered history (which includes current position)
          // filteredHistory already has current position since we just added it
          if (filteredHistory.length >= 2) {
            const color = getAltitudeColor(altitude);
            // Build trail coordinates from history (already in chronological order)
            const trailCoordinates = filteredHistory.map(pos => [pos.lon, pos.lat] as [number, number]);
            
            // Remove duplicate consecutive coordinates
            const uniqueCoordinates = trailCoordinates.filter((coord, index, self) => 
              index === 0 || Math.abs(coord[0] - self[index - 1][0]) > 0.000001 || Math.abs(coord[1] - self[index - 1][1]) > 0.000001
            );
            
            // Create trail if we have at least 2 distinct points
            if (uniqueCoordinates.length >= 2) {
              // Calculate opacity based on age of positions
              // Recent (0-2 min): 100% opacity
              // Medium (2-10 min): 50-80% opacity  
              // Old (10-40 min): 10-30% opacity
              // We'll use the average age of the trail for opacity calculation
              const oldestTimestamp = filteredHistory[0].timestamp;
              const newestTimestamp = filteredHistory[filteredHistory.length - 1].timestamp;
              const trailAge = now - oldestTimestamp; // Age of oldest point in trail
              const trailDuration = newestTimestamp - oldestTimestamp; // Total duration of trail
              
              // Calculate opacity: fade based on how old the trail is
              // Recent trails (0-2 min) = 100% opacity
              // Medium trails (2-10 min) = 50-80% opacity
              // Old trails (10-40 min) = 10-30% opacity
              let opacity = 1.0;
              const twoMinutes = 120000; // 2 minutes in ms
              const tenMinutes = 600000; // 10 minutes in ms
              const fortyMinutes = 2400000; // 40 minutes in ms
              
              if (trailAge <= twoMinutes) {
                // Recent: 100% opacity
                opacity = 1.0;
              } else if (trailAge <= tenMinutes) {
                // Medium: fade from 80% to 50%
                const fadeRange = tenMinutes - twoMinutes;
                const ageInRange = trailAge - twoMinutes;
                opacity = 0.8 - (ageInRange / fadeRange) * 0.3; // 0.8 to 0.5
              } else {
                // Old: fade from 35% to 25%
                const fadeRange = fortyMinutes - tenMinutes;
                const ageInRange = trailAge - tenMinutes;
                opacity = 0.35 - (ageInRange / fadeRange) * 0.1; // 0.35 to 0.25
                if (opacity < 0.25) opacity = 0.25; // Minimum 25% opacity
              }
              
              trailFeatures.push({
                type: 'Feature',
                id: `trail-${planeId}`,
                geometry: {
                  type: 'LineString',
                  coordinates: uniqueCoordinates
                },
                properties: {
                  color: color,
                  id: planeId,
                  opacity: opacity
                }
              });
            }
          } else if (filteredHistory.length === 1 && previousPositionsRef.current.has(planeId)) {
            // If we only have current position but have a previous position, create short trail
            const previous = previousPositionsRef.current.get(planeId)!;
            const color = getAltitudeColor(altitude);
            trailFeatures.push({
              type: 'Feature',
              id: `trail-${planeId}`,
              geometry: {
                type: 'LineString',
                coordinates: [
                  [previous.lon, previous.lat],
                  [lon, lat]
                ]
              },
              properties: {
                color: color,
                id: planeId,
                opacity: 1.0 // Recent trail = full opacity
              }
            });
          }

          // Get color based on altitude
          const color = getAltitudeColor(altitude);

          // Create airplane icon feature
          iconFeatures.push({
            type: 'Feature',
            id: planeId,
              geometry: {
              type: 'Point',
                coordinates: [lon, lat]
              },
              properties: {
                id: planeId,
                altitude: altitude,
                callsign: plane.callsign || plane.flight || '',
              speed: plane.gs || 0,
              baro_rate: plane.baro_rate || 0,
              color: color,
              bearing: bearing,
              lat: lat,
              lon: lon
            }
          });
        });

        // Update the airplane icons source
        const source = map.current.getSource('airplanes') as mapboxgl.GeoJSONSource;
        if (source) {
          source.setData({
            type: 'FeatureCollection',
            features: iconFeatures
          });
        }

        // Update the trail lines source
        const trailSource = map.current.getSource('airplanes-trails') as mapboxgl.GeoJSONSource;
        if (trailSource) {
          trailSource.setData({
            type: 'FeatureCollection',
            features: trailFeatures
          });
        }

        // Update selected plane data dynamically if a plane is selected
        const currentSelectedId = selectedPlaneIdRef.current;
        if (currentSelectedId) {
          const selectedPlaneFeature = iconFeatures.find(f => f.id === currentSelectedId);
          if (selectedPlaneFeature && selectedPlaneFeature.properties) {
            const props = selectedPlaneFeature.properties;
            setSelectedPlane({
              lat: props.lat,
              lon: props.lon,
              altitude: props.altitude,
              callsign: props.callsign || '',
              speed: props.speed || 0,
              baro_rate: props.baro_rate || 0
            });
          } else {
            // Plane no longer in data, close the card
            selectedPlaneIdRef.current = null;
            setSelectedPlaneId(null);
            setSelectedPlane(null);
          }
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

      // Initialize with empty GeoJSON for airplane icons
      map.current.addSource('airplanes', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Initialize with empty GeoJSON for trail lines
      map.current.addSource('airplanes-trails', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Add trail lines layer immediately after source is created
      // Add it after sky layer but before airplane icons
      // Use opacity from properties for fading effect
      if (map.current.getLayer('sky')) {
        map.current.addLayer({
          id: 'airplanes-trails',
          type: 'line',
          source: 'airplanes-trails',
          paint: {
            'line-width': 2.5,
            'line-color': ['get', 'color'],
            'line-opacity': ['get', 'opacity'] // Use opacity from properties for fading
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          }
        }, 'sky'); // Add after sky layer
      } else {
        map.current.addLayer({
          id: 'airplanes-trails',
          type: 'line',
          source: 'airplanes-trails',
          paint: {
            'line-width': 2.5,
            'line-color': ['get', 'color'],
            'line-opacity': ['get', 'opacity'] // Use opacity from properties for fading
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          }
        });
      }

      // Create airplane icons for each color dynamically
      const createAirplaneIcon = (color: string): string => {
        const canvas = document.createElement('canvas');
        canvas.width = 40;
        canvas.height = 40;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Draw clean, professional airplane silhouette pointing up (will be rotated based on bearing)
          const centerX = 20;
          const centerY = 20;
          
          // Main fuselage (simple elongated oval)
          ctx.beginPath();
          ctx.ellipse(centerX, centerY, 1.5, 8, 0, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
          
          // Nose (pointed triangle)
          ctx.beginPath();
          ctx.moveTo(centerX, 4);
          ctx.lineTo(centerX - 1.5, 8);
          ctx.lineTo(centerX + 1.5, 8);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
          
          // Main wings (simple swept shape)
          ctx.beginPath();
          ctx.moveTo(6, 16); // Left wing tip
          ctx.lineTo(centerX - 1, 14);
          ctx.lineTo(centerX - 1, 18);
          ctx.lineTo(8, 20);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
          
          ctx.beginPath();
          ctx.moveTo(34, 16); // Right wing tip
          ctx.lineTo(centerX + 1, 14);
          ctx.lineTo(centerX + 1, 18);
          ctx.lineTo(32, 20);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
          
          // Tail fin (simple triangle)
          ctx.beginPath();
          ctx.moveTo(centerX, 28);
          ctx.lineTo(centerX - 2.5, 36);
          ctx.lineTo(centerX, 36);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
          
          // Horizontal stabilizer (small tail wings)
          ctx.beginPath();
          ctx.moveTo(10, 30);
          ctx.lineTo(centerX - 1, 29);
          ctx.lineTo(centerX - 1, 31);
          ctx.lineTo(12, 32);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
          
          ctx.beginPath();
          ctx.moveTo(30, 30);
          ctx.lineTo(centerX + 1, 29);
          ctx.lineTo(centerX + 1, 31);
          ctx.lineTo(28, 32);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
        }
        return canvas.toDataURL();
      };

      // Add airplane icons to map for each color (wait for all to load)
      const colors = ['#ff0000', '#ffaa00', '#00ff00', '#0088ff'];
      const iconPromises = colors.map(color => {
        return new Promise<void>((resolve, reject) => {
          const iconId = `airplane-icon-${color}`;
          const iconUrl = createAirplaneIcon(color);
          map.current!.loadImage(iconUrl, (error, image) => {
            if (error) {
              reject(error);
              return;
            }
            if (image && map.current) {
              map.current.addImage(iconId, image);
            }
            resolve();
          });
        });
      });

      // Wait for all icons to load before adding the icon layer
      Promise.all(iconPromises).then(() => {
        if (!map.current) return;

        // Add airplane icons as symbol layer with rotation
      map.current.addLayer({
          id: 'airplanes-icons',
          type: 'symbol',
        source: 'airplanes',
          layout: {
            'icon-image': [
              'case',
              ['==', ['get', 'color'], '#ff0000'], 'airplane-icon-#ff0000',
              ['==', ['get', 'color'], '#ffaa00'], 'airplane-icon-#ffaa00',
              ['==', ['get', 'color'], '#00ff00'], 'airplane-icon-#00ff00',
              'airplane-icon-#0088ff'
            ],
            'icon-size': 1.5,
            'icon-rotate': ['get', 'bearing'],
            'icon-rotation-alignment': 'map',
            'icon-pitch-alignment': 'map',
            'icon-allow-overlap': false,
            'icon-ignore-placement': false
          }
        });
      }).catch(error => {
        console.error('Error loading airplane icons:', error);
      });

      // Add click handler for single click (show info) and double-click (zoom)
      let clickTimeout: NodeJS.Timeout | null = null;
      map.current.on('click', 'airplanes-icons', (e) => {
        if (!e.features || e.features.length === 0) return;
        
        const feature = e.features[0];
        const props = feature.properties;
        if (!props) return;

        if (clickTimeout) {
          // Double click detected - zoom in only (no card)
          clearTimeout(clickTimeout);
          clickTimeout = null;
          
          const coordinates = (feature.geometry as GeoJSON.Point).coordinates;
          const [lon, lat] = coordinates;
          
          // Zoom to level 17 centered on the airplane
          map.current?.flyTo({
            center: [lon, lat],
            zoom: 17,
            duration: 1000
          });
        } else {
          // First click - wait to see if there's a second click
          clickTimeout = setTimeout(() => {
            // Single click - show info card (set ID for dynamic updates)
            const planeId = props.id as string;
            selectedPlaneIdRef.current = planeId;
            setSelectedPlaneId(planeId);
            setSelectedPlane({
              lat: props.lat,
              lon: props.lon,
              altitude: props.altitude,
              callsign: props.callsign || '',
              speed: props.speed || 0,
              baro_rate: props.baro_rate || 0
            });
            clickTimeout = null;
          }, 300); // 300ms window for double-click
        }
      });

      // Change cursor on hover
      map.current.on('mouseenter', 'airplanes-icons', () => {
        if (map.current) {
          map.current.getCanvas().style.cursor = 'pointer';
        }
      });

      map.current.on('mouseleave', 'airplanes-icons', () => {
        if (map.current) {
          map.current.getCanvas().style.cursor = '';
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

    // Navigation controls removed - using double-click to zoom instead

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

      {/* Info card - appears when airplane is clicked */}
      {selectedPlane && (
        <div className="absolute top-4 left-4 bg-gray-900 bg-opacity-95 text-white p-4 rounded-lg shadow-xl max-w-xs z-20 border border-gray-700">
        <div className="text-sm space-y-2">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-base">Aircraft Info</h3>
              <button
                onClick={() => {
                  selectedPlaneIdRef.current = null;
                  setSelectedPlaneId(null);
                  setSelectedPlane(null);
                }}
                className="text-gray-400 hover:text-white text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="space-y-2 border-t border-gray-700 pt-2">
              {selectedPlane.callsign && (
                <div>
                  <span className="text-gray-400">Callsign:</span>
                  <span className="ml-2 font-mono">{selectedPlane.callsign}</span>
                </div>
              )}
              <div>
                <span className="text-gray-400">Altitude:</span>
                <span className="ml-2 font-mono">{selectedPlane.altitude.toLocaleString()} ft</span>
              </div>
              <div>
                <span className="text-gray-400">Ground Speed:</span>
                <span className="ml-2 font-mono">{Math.round(selectedPlane.speed)} kts</span>
              </div>
              <div>
                <span className="text-gray-400">Descent Velocity:</span>
                <span className="ml-2 font-mono">
                  {selectedPlane.baro_rate > 0 ? '+' : ''}{Math.round(selectedPlane.baro_rate)} ft/min
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

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