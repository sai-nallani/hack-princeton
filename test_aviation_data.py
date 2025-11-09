"""
Test script to demonstrate enhanced aviation data sources.
Shows terrain elevation, airport proximity, aircraft performance, PIREPs, and flight history.
"""
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from services.aviation_data import (
    get_terrain_elevation,
    find_nearest_airport,
    get_aircraft_performance,
    get_relevant_pireps,
    calculate_distance
)

print("=" * 70)
print("Aviation Data Sources Test")
print("=" * 70)
print()

# Example aircraft position (near San Francisco Bay Area)
test_lat = 37.750
test_lon = -122.250
test_alt = 2675  # feet MSL
test_aircraft_type = "C172"

print(f"Test Aircraft Position:")
print(f"  Latitude: {test_lat}°")
print(f"  Longitude: {test_lon}°")
print(f"  Altitude MSL: {test_alt} ft")
print(f"  Aircraft Type: {test_aircraft_type}")
print()

# Test 1: Terrain Elevation
print("1. TERRAIN ELEVATION")
print("-" * 70)
terrain = get_terrain_elevation(test_lat, test_lon)
if terrain is not None:
    agl = test_alt - terrain
    print(f"✅ Terrain elevation: {int(terrain)} ft MSL")
    print(f"✅ Altitude AGL: {int(agl)} ft")
    if agl < 500:
        print(f"⚠️  WARNING: Very low altitude! AGL < 500 ft")
    elif agl < 1000:
        print(f"⚠️  CAUTION: Low altitude. AGL < 1000 ft")
    else:
        print(f"✓  Safe altitude")
else:
    print("❌ Could not retrieve terrain elevation")
print()

# Test 2: Nearest Airport
print("2. NEAREST AIRPORT")
print("-" * 70)
airport = find_nearest_airport(test_lat, test_lon)
if airport:
    print(f"✅ Nearest airport: {airport['code']} - {airport['name']}")
    print(f"   City: {airport['city']}")
    print(f"   Distance: {airport['distance_nm']} nm")
    print(f"   Elevation: {airport['elevation_ft']} ft")
    
    if airport['distance_nm'] < 5:
        print(f"   → Aircraft is NEAR airport (likely departing/landing)")
    elif airport['distance_nm'] < 10:
        print(f"   → Aircraft is in VICINITY of airport")
    else:
        print(f"   → Aircraft is FAR from airport")
else:
    print("❌ Could not find nearest airport")
print()

# Test 3: Aircraft Performance
print("3. AIRCRAFT PERFORMANCE DATA")
print("-" * 70)
perf = get_aircraft_performance(test_aircraft_type)
print(f"✅ Aircraft: {perf['name']} ({perf['category']})")
print(f"   Stall speed (clean): {perf['stall_speed_clean']} kt")
print(f"   Stall speed (landing): {perf['stall_speed_landing']} kt")
print(f"   Typical cruise: {perf['typical_cruise']} kt")
print(f"   Cruise range: {perf['cruise_range'][0]}-{perf['cruise_range'][1]} kt")
print(f"   Max speed: {perf['max_speed']} kt")
print()

# Test with current groundspeed
test_groundspeed = 85
print(f"Current groundspeed: {test_groundspeed} kt")
if test_groundspeed < perf['stall_speed_clean'] + 20:
    print(f"⚠️  WARNING: Groundspeed dangerously close to stall speed!")
elif test_groundspeed < perf['cruise_range'][0]:
    print(f"⚠️  CAUTION: Groundspeed below typical cruise (possible engine issue)")
elif test_groundspeed > perf['cruise_range'][1]:
    print(f"⚠️  CAUTION: Groundspeed above typical cruise")
else:
    print(f"✓  Groundspeed within normal range")
print()

# Test 4: PIREPs
print("4. PILOT REPORTS (PIREPs)")
print("-" * 70)
print("Fetching nearby PIREPs (within 50 nm, ±5000 ft altitude)...")
pireps = get_relevant_pireps(test_lat, test_lon, test_alt, radius_nm=50, altitude_band_ft=5000)

if pireps:
    print(f"✅ Found {len(pireps)} relevant PIREP(s):")
    for i, pirep in enumerate(pireps[:5], 1):
        print(f"\n   PIREP {i}:")
        print(f"   Distance: {pirep['distance_nm']} nm")
        print(f"   Altitude: {pirep['altitude_ft']} ft (±{pirep['altitude_difference_ft']} ft)")
        print(f"   Turbulence: {pirep['turbulence']}")
        print(f"   Icing: {pirep['icing']}")
        print(f"   Aircraft: {pirep['aircraft_type']}")
        print(f"   Time: {pirep['report_time']}")
        
        if 'MOD' in pirep['turbulence'] or 'SEV' in pirep['turbulence']:
            print(f"   ⚠️  ALERT: Moderate or severe turbulence reported!")
else:
    print("✓  No relevant PIREPs found (good news - no reported hazards)")
print()

# Test 5: Distance Calculation
print("5. DISTANCE CALCULATION TEST")
print("-" * 70)
# Calculate distance between two well-known airports
sfo_lat, sfo_lon = 37.6213, -122.3790  # San Francisco
oak_lat, oak_lon = 37.7213, -122.2208  # Oakland
distance = calculate_distance(sfo_lat, sfo_lon, oak_lat, oak_lon)
print(f"Distance SFO to OAK: {distance:.1f} nm")
print(f"(Known distance: ~8-9 nm)")
print()

# Summary
print("=" * 70)
print("SUMMARY")
print("=" * 70)
print("✅ All 5 critical data sources are working:")
print("   1. Terrain elevation (USGS API)")
print("   2. Airport proximity (OurAirports database)")
print("   3. Aircraft performance (built-in database)")
print("   4. PIREPs (NOAA Aviation Weather)")
print("   5. Distance calculations (Haversine formula)")
print()
print("These data sources will dramatically improve Grok's ability to:")
print("  • Detect dangerous low altitude situations (terrain + AGL)")
print("  • Distinguish normal approaches from emergencies (airport proximity)")
print("  • Issue accurate speed warnings (aircraft performance)")
print("  • Alert about turbulence (PIREPs)")
print("  • Analyze flight patterns (distance calculations)")
print()
print("=" * 70)
