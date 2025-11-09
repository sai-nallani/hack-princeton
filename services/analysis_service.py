"""
Analysis Service
Analyzes aircraft data from Redis and weather data using Grok AI to generate tasks.
Tasks are saved to tasks.json and retrieved via get_active_tasks().
"""
import json
import os
import redis
import asyncio
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from dedalus_labs import AsyncDedalus, DedalusRunner

# Load environment variables from .env file
load_dotenv()

# Load Dedalus API key from environment
DEDALUS_API_KEY = os.getenv("DEDALUS_API_KEY", "")
# Model configuration - using GPT-4 for strong tool-calling capabilities
DEDALUS_MODEL = os.getenv("DEDALUS_MODEL", "xai/grok-4-fast-non-reasoning")
# MCP servers for web search capabilities
MCP_SERVERS = ["akakak/sonar"]  # Using playwright for web browsing/search

TASKS_JSON_PATH = Path(__file__).parent / "tasks.json"

# Task expiration settings
# Tasks that haven't been seen in this duration are considered stale and removed
TASK_EXPIRY_MINUTES = int(os.getenv("TASK_EXPIRY_MINUTES", "10"))  # Default: 10 minutes
# Resolved tasks older than this duration are pruned from the file
RESOLVED_TASK_RETENTION_HOURS = int(os.getenv("RESOLVED_TASK_RETENTION_HOURS", "1"))  # Default: 1 hour

# Debug logging
DEBUG_AGENT_STEPS = os.getenv("DEBUG_AGENT_STEPS", "true").lower() == "true"
DEBUG_LOG_FILE = Path(__file__).parent / "agent_debug.log"

# Audio storage
AUDIO_DIR = Path(__file__).parent / "audio"
AUDIO_DIR.mkdir(exist_ok=True)


async def generate_audio_for_task(task_id: int, pilot_message: str) -> Optional[str]:
    """
    Generate audio file for a task's pilot message using ElevenLabs TTS.
    
    Args:
        task_id: The task ID
        pilot_message: The message to convert to speech
    
    Returns:
        Filename of the generated audio file, or None if failed
    """
    try:
        from services.tts_api import tts_api
        
        if not tts_api.client:
            print(f"⚠️  Skipping audio generation for task {task_id} - TTS not configured")
            return None
        
        filename = f"task_{task_id}.mp3"
        filepath = AUDIO_DIR / filename
        
        # Generate audio
        print(f"🔊 Generating audio for task {task_id}...")
        audio_generator = tts_api.text_to_speech(pilot_message)
        audio_data = b"".join(audio_generator)
        
        # Save to file
        with open(filepath, 'wb') as f:
            f.write(audio_data)
        
        print(f"✓ Audio saved: {filename}")
        return filename
        
    except Exception as e:
        print(f"❌ Error generating audio for task {task_id}: {e}")
        return None


def get_redis_planes() -> List[Dict]:
    """
    Get all aircraft data from Redis.
    
    Returns:
        List of aircraft dictionaries from Redis, or empty list if error
    """
    r = redis.Redis(host='localhost', port=6379)
    try:
        data = r.get('planes')
        if not data:
            return []
        planes = json.loads(data.decode('utf-8'))
        return planes if isinstance(planes, list) else []
    except Exception as e:
        print(f"Error reading planes from Redis: {e}")
        return []


async def get_weather_for_aircraft(lat: float, lon: float) -> Optional[Dict]:
    """
    Get weather data for aircraft position.
    
    Args:
        lat: Latitude
        lon: Longitude
    
    Returns:
        Weather data dictionary or None
    """
    try:
        # Import here to avoid circular imports
        from services.weather_api import weather_api
        
        # Find nearest airport (simplified - you might want to improve this)
        # For now, we'll use a default airport or fetch METAR for nearest
        # This is a placeholder - you can enhance with nearest airport lookup
        metar = await weather_api.get_metar("KATL")  # Default to Atlanta
        return metar
    except Exception as e:
        print(f"Error fetching weather: {e}")
        return None


def format_data_for_grok(planes: List[Dict], weather_data: Optional[Dict] = None) -> str:
    """
    Format aircraft and weather data into a prompt for Grok analysis.
    
    Args:
        planes: List of aircraft data from Redis
        weather_data: Optional weather data dictionary
    
    Returns:
        Formatted string for Grok analysis
    """
    context = "AIRCRAFT DATA:\n"
    context += f"Total aircraft: {len(planes)}\n\n"
    
    # Add aircraft details (limit to first 10 for context size)
    for i, plane in enumerate(planes[:10]):
        # Get callsign, registration, or hex as identifier
        callsign = plane.get('flight', '').strip() or None
        registration = plane.get('r', '').strip() or None
        hex_code = plane.get('hex', '') or plane.get('icao', '')
        
        context += f"Aircraft {i+1}:\n"
        context += f"  Hex/ICAO24: {hex_code}\n"
        context += f"  Callsign: {callsign or 'N/A'}\n"
        context += f"  Registration: {registration or 'N/A'}\n"
        context += f"  Type: {plane.get('t', 'UNKNOWN')}\n"
        context += f"  Position: Lat {plane.get('lat', 'N/A')}, Lon {plane.get('lon', 'N/A')}\n"
        context += f"  Altitude: {plane.get('alt_baro', 'N/A')}ft MSL\n"
        context += f"  Groundspeed: {plane.get('gs', 'N/A')}kt\n"
        context += f"  Vertical Rate: {plane.get('baro_rate', 'N/A')}ft/min\n"
        context += f"  Heading: {plane.get('track', 'N/A')}°\n"
        context += f"  Squawk: {plane.get('squawk', 'N/A')}\n\n"
    
    if weather_data:
        context += "\nWEATHER DATA:\n"
        context += f"Station: {weather_data.get('station', 'UNKNOWN')}\n"
        context += f"Visibility: {weather_data.get('visibility', 'UNKNOWN')}sm\n"
        context += f"Ceiling: {weather_data.get('ceiling', 'UNKNOWN')}ft AGL\n"
        context += f"Flight Category: {weather_data.get('flight_category', 'UNKNOWN')}\n"
        context += f"Wind: {weather_data.get('wind_direction', 'UNKNOWN')}° at {weather_data.get('wind_speed', 'UNKNOWN')}kt\n"
        context += f"Temperature: {weather_data.get('temperature', 'UNKNOWN')}°C\n"
        context += f"Conditions: {weather_data.get('conditions', 'UNKNOWN')}\n"
    
    with open("example_context.txt", "w") as f:
        f.write(context)
    return context


def create_grok_prompt(context_data: str) -> str:
    """
    Create the analysis prompt for Dedalus AI with web search capabilities.
    
    Args:
        context_data: Formatted aircraft and weather data
    
    Returns:
        Complete prompt string
    """
    prompt = f"""You are an advanced FAA-compliant aviation safety AI assistant with web search capabilities, analyzing real-time flight data in United States airspace. Your job is to identify potential safety risks and generate actionable tasks for US air traffic controllers following FAA regulations and procedures.

{context_data}

IMPORTANT: You have access to web search tools via MCP. Use them to research US-specific aviation data:
1. Check FAA NOTAMs (Notices to Airmen) at https://notams.aim.faa.gov for active alerts
2. Review NWS Aviation Weather Center (aviationweather.gov) for SIGMETs, AIRMETs, and convective SIGMETs
3. Search FAA TFR list (tfr.faa.gov) for Temporary Flight Restrictions - stadium TFRs, VIP TFRs, wildfire TFRs
4. Look up current METAR/TAF reports from nearby airports for actual weather conditions
5. Check FAA Service Difficulty Reports (SDRs) for aircraft type-specific issues
6. Review recent NTSB incidents or FAA safety alerts in the region
7. Verify Class B/C/D airspace restrictions and special use airspace (MOAs, restricted areas)

US AVIATION CONTEXT:
- All altitudes in feet MSL (Mean Sea Level), speeds in knots
- Weather reporting uses US METAR format (visibility in statute miles, ceiling in feet AGL)
- Flight categories: VFR (Visual Flight Rules), MVFR (Marginal VFR), IFR (Instrument Flight Rules), LIFR (Low IFR)
- Squawk codes: 7700 (emergency), 7600 (radio failure), 7500 (hijack), 1200 (VFR)
- Standard instrument departures (SIDs) and standard terminal arrival routes (STARs)

ANALYSIS INSTRUCTIONS:
Based on the aircraft data AND your US aviation web research, generate actionable tasks for safety concerns:

WEATHER-RELATED (verify with NWS Aviation Weather):
- Active FAA weather alerts (SIGMETs, AIRMETs, Convective SIGMETs, G-AIRMETs)
- IMC conditions (Instrument Meteorological Conditions) - visibility < 3 SM or ceiling < 1000 ft AGL
- Severe weather: thunderstorms, icing, turbulence, low-level wind shear (LLWS)
- Approaching frontal systems, squall lines, or convective activity
- Crosswind components exceeding aircraft limitations at nearby airports
- Winter operations: icing conditions, snow/ice on runway (FICON NOTAMs)

FLIGHT PATTERN CONCERNS:
- Unusual flight behavior: rapid altitude/heading changes, erratic patterns
- Potential VFR flight in IMC conditions (cloud penetration without IFR clearance)
- Aircraft below minimum safe altitude (MSA) or minimum vectoring altitude (MVA)
- Traffic conflicts: less than 3nm lateral or 1000ft vertical separation
- Non-standard operations at towered airports

ALTITUDE & SPEED WARNINGS:
- Low altitude alerts: below 500 ft AGL over populated areas (FAR 91.119)
- Terrain proximity: check terrain elevation and CFIT (Controlled Flight Into Terrain) risk
- Stall speed concerns: aircraft below Vs1 for aircraft type
- High-speed descent: excessive vertical rates (> 2000 fpm at low altitude)
- Altitude deviations from expected cruise levels

FAA AIRSPACE & REGULATORY:
- TFR violations (stadium TFRs within 3nm/3000ft, presidential TFRs, wildfire TFRs)
- Class B/C/D airspace penetration without clearance (check transponder mode C/S)
- Special Use Airspace (SUA) violations - MOAs, restricted areas, prohibited areas
- Washington DC Special Flight Rules Area (SFRA) or Flight Restricted Zone (FRZ)
- Active NOTAMs: runway/taxiway closures, navaid outages, airspace restrictions

For each identified risk, generate a task with FAA-compliant terminology:
- Priority: "HIGH" (immediate safety-of-flight concern, requires immediate ATC action), "MEDIUM" (notable concern requiring monitoring), or "LOW" (advisory/informational)
- Category: One of: Weather Hazard, Low Altitude, Unusual Pattern, Speed Warning, Altitude Warning, Airspace Concern, Other
- Description: Clear, actionable FAA-style description INCLUDING:
  * N-number (N registration) or callsign in proper format (e.g., "Southwest 1234", "N12345")
  * Specific issue with FAA terminology (e.g., "possible VFR in IMC", "TFR violation", "minimum safe altitude")
  * Relevant data: altitude in feet MSL, speed in knots, position relative to airports/navaids
  * Web research findings: cite specific NOTAMs, weather products (METAR/TAF), TFRs
  * ATC recommended action: contact aircraft, issue traffic advisory, coordinate with adjacent sector, etc.

Return your response as a JSON object with a "tasks" key containing an array of tasks. Each task should have:
- "aircraft_icao24": string (Hex/ICAO24 code from aircraft data - REQUIRED, never use "UNKNOWN")
- "aircraft_callsign": string (Use N-number if available, airline callsign, or Registration - format as "N12345" or "AAL123" - NEVER "UNKNOWN")
- "priority": string (HIGH/MEDIUM/LOW)
- "category": string (from the categories above)
- "summary": string (VERY brief 5-10 word summary for quick scanning, e.g., "Low altitude - verify MVA clearance" or "Possible Class B penetration without clearance")
- "description": string (detailed FAA-compliant description with web research citations - include aircraft N-number or callsign, full technical details)
- "pilot_message": string (concise ATC radio message to be spoken to pilot, using proper phraseology, e.g., "November 12345, Atlanta Center, low altitude alert, verify you are not below minimum vectoring altitude, advise intentions")

CRITICAL REQUIREMENTS:
- ALWAYS search FAA/NWS sources: notams.aim.faa.gov, aviationweather.gov, tfr.faa.gov
- Use proper US aviation terminology: "MSL" not "AMSL", "AGL" not "above ground", "statute miles" not "kilometers"
- Reference actual NOTAMs, METARs, TFRs, or AIRMETs/SIGMETs in descriptions when found via search
- Format callsigns properly: "United 5432" not "UAL5432", "N12345" not "n12345"
- Include recommended ATC phraseology: "Contact aircraft", "Issue traffic alert", "Advise pilot of weather"
- Prioritize based on FAA safety risk: immediate safety-of-flight = HIGH, deviation from regs = MEDIUM, advisory = LOW
- Only generate tasks for genuine regulatory violations or safety concerns per FAA standards

If no risks are identified, return: {{"tasks": []}}

Return ONLY valid JSON, no markdown, no code blocks, no explanations."""
    
    return prompt


async def analyze_with_dedalus(planes: List[Dict], weather_data: Optional[Dict] = None) -> List[Dict]:
    """
    Analyze aircraft and weather data using Dedalus AI with web search capabilities.
    
    Args:
        planes: List of aircraft data from Redis
        weather_data: Optional weather data dictionary
    
    Returns:
        List of task dictionaries generated by Dedalus
    """
    if not DEDALUS_API_KEY:
        print("Warning: DEDALUS_API_KEY not set. Skipping AI analysis.")
        return []
    
    # Format data for analysis
    context_data = format_data_for_grok(planes, weather_data)
    prompt = create_grok_prompt(context_data)
    
    try:
        # Initialize Dedalus client and runner
        client = AsyncDedalus(api_key=DEDALUS_API_KEY)
        runner = DedalusRunner(client)
        
        # Initialize debug log buffer
        debug_log = []
        
        if DEBUG_AGENT_STEPS:
            debug_log.append("\n" + "="*80)
            debug_log.append("🤖 DEDALUS AGENT EXECUTION - INTERMEDIATE STEPS")
            debug_log.append(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
            debug_log.append(f"Model: {DEDALUS_MODEL}")
            debug_log.append(f"MCP Servers: {MCP_SERVERS}")
            debug_log.append("="*80)
            print("\n".join(debug_log))
        
        # Run analysis with MCP servers for web search capabilities
        response = await runner.run(
            input=prompt,
            model=DEDALUS_MODEL,
            mcp_servers=MCP_SERVERS  # playwright-mcp for web browsing/search
        )
        
        # Log intermediate steps for debugging
        if DEBUG_AGENT_STEPS and hasattr(response, 'steps') and response.steps:
            step_log = [f"\n📊 Total Steps: {len(response.steps)}"]
            print(step_log[0])
            
            for i, step in enumerate(response.steps, 1):
                step_lines = [f"\n--- Step {i} ---"]
                
                # Log the step type and role
                if hasattr(step, 'role'):
                    step_lines.append(f"Role: {step.role}")
                
                # Log tool calls (web searches, etc.)
                if hasattr(step, 'tool_calls') and step.tool_calls:
                    step_lines.append(f"🔧 Tool Calls: {len(step.tool_calls)}")
                    for j, tool_call in enumerate(step.tool_calls, 1):
                        step_lines.append(f"  Tool {j}:")
                        if hasattr(tool_call, 'function'):
                            step_lines.append(f"    Function: {tool_call.function.name}")
                            if hasattr(tool_call.function, 'arguments'):
                                # Parse arguments if they're JSON
                                try:
                                    args = json.loads(tool_call.function.arguments)
                                    step_lines.append(f"    Arguments: {json.dumps(args, indent=6)}")
                                except:
                                    step_lines.append(f"    Arguments: {tool_call.function.arguments[:200]}...")
                        elif hasattr(tool_call, 'name'):
                            step_lines.append(f"    Name: {tool_call.name}")
                
                # Log content/reasoning
                if hasattr(step, 'content') and step.content:
                    content_str = str(step.content)
                    content_preview = content_str[:300]
                    step_lines.append(f"💭 Content: {content_preview}{'...' if len(content_str) > 300 else ''}")
                
                # Log tool responses
                if hasattr(step, 'tool_call_id'):
                    step_lines.append(f"🔄 Tool Response ID: {step.tool_call_id}")
                    if hasattr(step, 'content'):
                        response_str = str(step.content)
                        response_preview = response_str[:200]
                        step_lines.append(f"   Response: {response_preview}{'...' if len(response_str) > 200 else ''}")
                
                # Print and save to log
                step_text = "\n".join(step_lines)
                print(step_text)
                debug_log.extend(step_lines)
            
            completion_msg = [
                "\n" + "="*80,
                "✅ DEDALUS AGENT COMPLETED",
                "="*80 + "\n"
            ]
            print("\n".join(completion_msg))
            debug_log.extend(completion_msg)
            
            # Save to log file
            try:
                with open(DEBUG_LOG_FILE, 'a') as f:
                    f.write("\n".join(debug_log) + "\n\n")
                print(f"📝 Debug log saved to: {DEBUG_LOG_FILE}")
            except Exception as e:
                print(f"Warning: Could not save debug log: {e}")
        
        # Extract the final output
        content = response.final_output
        
        # Parse JSON response
        parsed = json.loads(content)
        tasks = parsed.get("tasks", [])
        
        # Add metadata to each task and ensure proper identification
        # Create a lookup map for hex codes by registration/callsign for fixing UNKNOWN values
        plane_lookup = {}
        for plane in planes:
            hex_code = plane.get('hex', '')
            callsign = plane.get('flight', '').strip()
            registration = plane.get('r', '').strip()
            if hex_code:
                if callsign:
                    plane_lookup[callsign] = {'hex': hex_code, 'registration': registration}
                if registration:
                    plane_lookup[registration] = {'hex': hex_code, 'callsign': callsign}
        
        for task in tasks:
            # Try to fix UNKNOWN aircraft_icao24 by looking up from planes data
            icao24 = task.get('aircraft_icao24', '').strip()
            callsign = task.get('aircraft_callsign', '').strip()
            
            if not icao24 or icao24 == 'UNKNOWN':
                # Try to find hex code using callsign
                if callsign and callsign in plane_lookup:
                    icao24 = plane_lookup[callsign]['hex']
                else:
                    icao24 = 'UNIDENTIFIED'
            
            task['aircraft_icao24'] = icao24
            
            # Ensure aircraft_callsign uses registration or ICAO24 as fallback
            if not callsign or callsign == 'UNKNOWN':
                if icao24 in plane_lookup:
                    callsign = plane_lookup[icao24].get('callsign') or plane_lookup[icao24].get('registration') or icao24
                else:
                    callsign = icao24
                task['aircraft_callsign'] = callsign
            
            # Create a stable fingerprint for deduplication
            # Based on aircraft + category + priority (the core issue identifier)
            fingerprint = f"{icao24}_{task.get('category', 'Other')}_{task.get('priority', 'LOW')}"
            task["fingerprint"] = fingerprint
            task["id"] = abs(hash(fingerprint)) % 1000000  # Stable ID from fingerprint
            task["created_at"] = datetime.now(timezone.utc).isoformat()
            task["resolved"] = False
            
            # Mark that audio is not yet generated
            task["audio_file"] = None
        
        # Generate audio ONLY for the first 3 HIGH priority tasks
        # First, sort tasks by priority (HIGH first)
        high_priority_tasks = [t for t in tasks if t.get('priority', '').upper() == 'HIGH']
        
        # Count how many high priority tasks already have audio from existing tasks
        existing_tasks = load_tasks()
        existing_high_with_audio = sum(
            1 for t in existing_tasks 
            if not t.get("resolved", False) 
            and t.get('priority', '').upper() == 'HIGH' 
            and t.get('audio_file') is not None
        )
        
        # Calculate how many more audio files we can generate
        audio_slots_available = max(0, 3 - existing_high_with_audio)
        
        print(f"🎵 Audio generation: {existing_high_with_audio} high priority tasks with audio, {audio_slots_available} slots available")
        
        # Generate audio for up to the available slots
        audio_generated = 0
        for task in high_priority_tasks:
            if audio_generated >= audio_slots_available:
                print(f"⏸️  Skipping audio for task {task['id']} - already have 3 high priority tasks with audio")
                break
            
            pilot_message = task.get('pilot_message')
            if pilot_message:
                audio_filename = await generate_audio_for_task(task["id"], pilot_message)
                if audio_filename:
                    task["audio_file"] = audio_filename
                    audio_generated += 1
                    print(f"✓ Generated audio {audio_generated}/{audio_slots_available} for HIGH priority task {task['id']}")
        
        print(f"Dedalus AI generated {len(tasks)} tasks ({audio_generated} with audio)")
        return tasks
        
    except Exception as e:
        print(f"Error calling Dedalus API: {e}")
        import traceback
        traceback.print_exc()
        return []


async def run_analysis() -> List[Dict]:
    """
    Run analysis on current aircraft data and weather data using Grok AI.
    This function:
    1. Gets aircraft data from Redis
    2. Gets weather data for the area
    3. Analyzes with Grok AI
    4. Saves tasks to tasks.json
    
    Returns:
        List of newly generated task dictionaries
    """
    # Get aircraft data from Redis
    planes = get_redis_planes()
    
    if not planes:
        print("⚠️ No aircraft data in Redis - skipping analysis")
        return []
    
    print(f"🔄 Running analysis on {len(planes)} aircraft...")
    # Get weather data (using first aircraft's position as reference)
    weather_data = None
    if planes and planes[0].get('lat') and planes[0].get('lon'):
        weather_data = await get_weather_for_aircraft(
            planes[0].get('lat'),
            planes[0].get('lon')
        )
    
    # Analyze with Dedalus (with web search capabilities)
    tasks = await analyze_with_dedalus(planes, weather_data)
    
    # Merge with existing tasks using fingerprint-based deduplication
    existing_tasks = load_tasks()
    
    # Create a map of existing task fingerprints to indices (for unresolved tasks only)
    existing_fingerprints = {}
    for i, task in enumerate(existing_tasks):
        if not task.get("resolved", False):
            fingerprint = task.get("fingerprint")
            if fingerprint:
                existing_fingerprints[fingerprint] = i
    
    new_tasks = []
    updated_indices = set()
    
    for task in tasks:
        fingerprint = task.get("fingerprint")
        if fingerprint and fingerprint in existing_fingerprints:
            # Task already exists - update its timestamp to show it's still active
            idx = existing_fingerprints[fingerprint]
            existing_tasks[idx]["last_seen"] = datetime.now(timezone.utc).isoformat()
            # Update description if it's more detailed
            if len(task.get("description", "")) > len(existing_tasks[idx].get("description", "")):
                existing_tasks[idx]["description"] = task["description"]
            # Preserve existing audio file if it exists, otherwise use new one
            if not existing_tasks[idx].get("audio_file") and task.get("audio_file"):
                existing_tasks[idx]["audio_file"] = task["audio_file"]
            updated_indices.add(idx)
        else:
            # New task - add it
            task["last_seen"] = task["created_at"]
            new_tasks.append(task)
    
    # Combine all tasks: existing (with updates) + new
    all_tasks = existing_tasks + new_tasks
    
    # Clean up outdated tasks
    all_tasks = prune_outdated_tasks(all_tasks)
    
    # Save to tasks.json
    save_tasks(all_tasks)
    
    print(f"Analysis complete: {len(new_tasks)} new, {len(updated_indices)} updated")
    return new_tasks


def prune_outdated_tasks(tasks: List[Dict]) -> List[Dict]:
    """
    Remove outdated tasks from the task list.
    
    Pruning rules:
    1. Unresolved tasks: Remove if last_seen is older than TASK_EXPIRY_MINUTES
    2. Resolved tasks: Remove if created_at is older than RESOLVED_TASK_RETENTION_HOURS
    
    Args:
        tasks: List of task dictionaries
        
    Returns:
        List of tasks with outdated tasks removed
    """
    now = datetime.now(timezone.utc)
    task_expiry_cutoff = now - timedelta(minutes=TASK_EXPIRY_MINUTES)
    resolved_retention_cutoff = now - timedelta(hours=RESOLVED_TASK_RETENTION_HOURS)
    
    pruned_tasks = []
    removed_count = 0
    
    for task in tasks:
        try:
            is_resolved = task.get("resolved", False)
            
            if not is_resolved:
                # For unresolved tasks, check last_seen timestamp
                last_seen_str = task.get("last_seen") or task.get("created_at")
                if last_seen_str:
                    # Handle both formats: with and without timezone info
                    last_seen = datetime.fromisoformat(last_seen_str.replace('Z', '+00:00'))
                    # Make timezone-aware if naive
                    if last_seen.tzinfo is None:
                        last_seen = last_seen.replace(tzinfo=timezone.utc)
                    
                    if last_seen < task_expiry_cutoff:
                        # Task is stale - hasn't been seen recently
                        removed_count += 1
                        print(f"  Pruned stale task: {task.get('aircraft_callsign', 'UNKNOWN')} - {task.get('category', 'UNKNOWN')} (last seen: {last_seen_str})")
                        continue
            else:
                # For resolved tasks, check created_at timestamp
                created_at_str = task.get("created_at")
                if created_at_str:
                    created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
                    if created_at.tzinfo is None:
                        created_at = created_at.replace(tzinfo=timezone.utc)
                    
                    if created_at < resolved_retention_cutoff:
                        # Resolved task is too old - prune it
                        removed_count += 1
                        continue
            
            # Task is still valid - keep it
            pruned_tasks.append(task)
            
        except Exception as e:
            # If there's an error parsing timestamps, keep the task to be safe
            print(f"  Warning: Could not parse timestamp for task {task.get('id')}: {e}")
            pruned_tasks.append(task)
    
    if removed_count > 0:
        print(f"  Pruned {removed_count} outdated task(s)")
    
    return pruned_tasks


def save_tasks(tasks: List[Dict]):
    """
    Save tasks to tasks.json file.
    
    Args:
        tasks: List of task dictionaries
    """
    try:
        with open(TASKS_JSON_PATH, 'w') as f:
            json.dump(tasks, f, indent=2)
        print(f"Saved {len(tasks)} tasks to {TASKS_JSON_PATH}")
    except Exception as e:
        print(f"Error saving tasks to JSON: {e}")


def load_tasks() -> List[Dict]:
    """
    Load tasks from tasks.json file.
    
    Returns:
        List of task dictionaries, or empty list if file doesn't exist
    """
    try:
        if not TASKS_JSON_PATH.exists():
            return []
        
        with open(TASKS_JSON_PATH, 'r') as f:
            tasks = json.load(f)
            return tasks if isinstance(tasks, list) else []
    except Exception as e:
        print(f"Error loading tasks from JSON: {e}")
        return []


def get_active_tasks() -> List[Dict]:
    """
    Get only active (unresolved) tasks.
    This is called by the tasks.py endpoint when the frontend requests tasks.
    
    Returns:
        List of unresolved task dictionaries
    """
    all_tasks = load_tasks()
    return [task for task in all_tasks if not task.get('resolved', False)]
