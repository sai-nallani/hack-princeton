# Hack Princeton Project Context

## Project Overview
This is a hackathon project focused on building a real-time airplane tracking application to assist air traffic controllers with agentic AI. The app polls aircraft data from the airplanes.live API, filters for planes within a 5 nautical mile radius of a specific location (latitude 33.637, longitude -84.4333, near Atlanta, GA), caches the data in Redis, and displays it in a React-based frontend. The system updates every 3 seconds to provide near-real-time tracking. Additionally, the app uses various agentic AI agents to analyze the data in real-time to provide live feedback on the frontend dashboard including warnings. Warnings are categorized by type and contain a phrase that the air traffic controller typically says to redirect the airspace using standard airspace controller phraseology. Each warning is presented with a "cmd+enter" shortcut that uses ElevenLabs voice model to play the audio and clears the warning.

### Aims and Goals
- Create a functional airplane tracker that demonstrates real-time data polling and caching
- Integrate with the airplanes.live API (an independent ADS-B aircraft tracking service)
- Implement a full-stack application with FastAPI backend and React/TypeScript frontend
- Handle data filtering, caching, and real-time updates
- Provide a simple UI for displaying aircraft information (callsign, latitude, longitude)

## Technology Stack
### Backend
- **FastAPI**: Modern Python web framework for building APIs
- **Redis**: In-memory data structure store used for caching aircraft data
- **Python Libraries**:
  - `requests`: For HTTP API calls to airplanes.live
  - `asyncio`: For asynchronous background tasks (polling)
  - `json`: For data serialization
  - `redis`: Redis client library

### Frontend
- **React**: JavaScript library for building user interfaces
- **TypeScript**: Typed superset of JavaScript for better code quality
- **Vite**: Fast build tool and development server
- **SWR**: React library for data fetching with caching and real-time updates
- **Tailwind CSS**: Utility-first CSS framework for styling

### Development Tools
- **Node.js/npm**: For managing frontend dependencies
- **Python/pip**: For managing backend dependencies
- **ESLint**: Code linting for JavaScript/TypeScript
- **PostCSS**: CSS processing

## File Structure
```
/Users/olivercho/Desktop/Programming/hack-princeton/hack-princeton/
├── .env                    # Environment variables
├── .eslintrc.cjs           # ESLint configuration
├── .gitignore              # Git ignore rules
├── .grok/                  # Grok-specific data
├── README.md               # Project readme
├── airplanes.md            # Aircraft-related documentation
├── airguardian.db          # SQLite database (likely for other features)
├── context.md              # API documentation from airplanes.live
├── database/               # Database-related files
├── index.html              # HTML entry point
├── llm-context.md          # This file
├── models/                 # Data models (likely Python classes)
├── node_modules/           # Node.js dependencies
├── package-lock.json       # NPM lockfile
├── package.json            # NPM configuration
├── postcss.config.js       # PostCSS configuration
├── requirements.txt        # Python dependencies
├── routers/                # API route handlers
├── services/               # Backend services
│   ├── __init__.py
│   ├── collision.py        # Collision detection logic
│   ├── main.py             # Main FastAPI application with airplane polling
│   ├── weather_api.py      # Weather API integration
│   └── (opensky.py removed, merged into main.py)
├── src/                    # Frontend source code
│   ├── components/
│   │   ├── AirplaneTracker.tsx  # Main airplane tracking component
│   │   └── VibeKanbanProvider.tsx  # Kanban board provider
│   └── ... (other React components)
├── tailwind.config.ts      # Tailwind CSS configuration
├── tsconfig.json           # TypeScript configuration
├── tsconfig.node.json      # TypeScript config for Node.js
└── vite.config.ts          # Vite configuration
```

## Key Components and Features

### Backend (services/main.py)
- **FastAPI Application**: Main web server running on port 8000
- **Background Polling**: `poll_opensky()` function runs every 3 seconds to fetch data from airplanes.live
- **Data Filtering**: Uses airplanes.live's `/point/{lat}/{lon}/{radius}` endpoint to get planes within 5 nm
- **Redis Caching**: Stores raw aircraft data in Redis under key 'planes'
- **API Endpoints**:
  - `GET /api/planes`: Returns filtered aircraft data as JSON
  - `GET /health`: Health check endpoint
  - WebSocket `/ws`: Real-time communication (for other features)

### Frontend (src/components/AirplaneTracker.tsx)
- **Real-time Updates**: Uses SWR to fetch from backend every 3 seconds
- **Data Display**: Shows a list of aircraft with callsign, latitude, and longitude
- **Error Handling**: Displays loading states and error messages
- **CORS**: Backend allows requests from localhost:5173 (Vite dev server)

### Airplane Data Structure
Each aircraft object contains:
- `icao24`: ICAO 24-bit address (hex identifier)
- `callsign`: Flight callsign (may be null)
- `latitude`: Current latitude
- `longitude`: Current longitude

### Raw API Data from airplanes.live
The airplanes.live API returns data in this format:
```json
{
  "ac": [
    {
      "hex": "icao24",
      "flight": "callsign",
      "lastPosition": {
        "lat": 33.123,
        "lon": -84.456
      },
      // ... other fields like alt_baro, gs, etc.
    }
  ],
  "msg": "No error",
  "now": timestamp,
  "total": count,
  "ctime": timestamp,
  "ptime": 0
}
```

## API Details
- **Base URL**: https://api.airplanes.live/v2/
- **Rate Limiting**: 1 request per second (we poll every 3 seconds to stay under limit)
- **Endpoint Used**: `/point/{lat}/{lon}/{radius}` where radius is in nautical miles
- **Authentication**: None required
- **Data Source**: ADS-B and MLAT aircraft tracking

## Setup and Running Instructions
1. **Install Backend Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Install Frontend Dependencies**:
   ```bash
   npm install
   ```

3. **Start Redis**:
   ```bash
   redis-server
   ```

4. **Start Backend** (in one terminal):
   ```bash
   python -m services.main
   ```
   - Runs on http://localhost:8000
   - Starts polling airplanes.live API immediately

5. **Start Frontend** (in another terminal):
   ```bash
   npm run dev
   ```
   - Runs on http://localhost:5173
   - Access the airplane tracker component

## Important Notes for Development
- The backend uses deprecated `@app.on_event("startup")` - this works but may need updating to FastAPI's lifespan events in production
- Redis must be running for caching to work; data is stored as JSON strings
- The frontend fetches from the full backend URL (http://localhost:8000/api/planes) due to CORS
- Aircraft data may be empty if no planes are within the 5 nm radius of the target location
- The polling runs indefinitely in the background; errors are printed to console but don't stop the process
- The project appears to have additional features (collision detection, weather API, kanban board) not directly related to airplane tracking

## Potential Improvements
- Update to FastAPI's modern lifespan event system
- Add more aircraft details to the frontend display
- Implement proper error handling and retry logic for API calls
- Add configuration for target location and radius
- Consider using WebSockets for real-time updates instead of polling
- Add tests for both backend and frontend components