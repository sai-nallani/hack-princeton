# Airplanes.live REST API Context

## Overview
Airplanes.live provides a REST API for accessing ADS-B and MLAT aircraft tracking data. The API is located at `http://api.airplanes.live/v2/`. Note that there is no SLA or uptime guarantee, and it is intended for non-commercial use. Access currently does not require a feeder, but this may change.

If you use the API, consider contributing to Airplanes.live.

## Endpoints
The following endpoints are available:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/hex/[hex]` | GET | Return all aircraft with an exact match on one of the given Mode S hex ids (limited to 1000) |
| `/callsign/[callsign]` | GET | Returns all aircraft with an exact match on one of the given callsigns (limited to 1000 or 8000 characters for the request) |
| `/reg/[reg]` | GET | Returns all aircraft with an exact match on one of the given registrations (limited to 1000 or 8000 characters for the request) |
| `/type/[type]` | GET | Returns all aircraft that have one of the specified ICAO type codes (e.g., A321, B738) |
| `/squawk/[squawk]` | GET | Returns all aircraft that are squawking the specified value |
| `/mil` | GET | Returns all aircraft tagged as military |
| `/ladd` | GET | Returns all aircraft tagged as LADD |
| `/pia` | GET | Returns all aircraft tagged as PIA |
| `/point/[lat]/[lon]/[radius]` | GET | Returns all aircraft within a certain radius of a given point up to 250 nm |

## Example Usage
```bash
curl https://api.airplanes.live/v2/hex/45211e
```

### Example JSON Response
```json
{
  "ac": [
    {
      "hex": "45211e",
      "type": "mode_s",
      "flight": "CFG846 ",
      "r": "LZ-LAJ",
      "t": "A320",
      "desc": "AIRBUS A-320",
      "alt_baro": 37000,
      "gs": 496,
      "ias": 259,
      "tas": 464,
      "mach": 0.8,
      "oat": -52,
      "tat": -23,
      "track": 113.55,
      "track_rate": 0,
      "roll": 0.35,
      "mag_heading": 111.8,
      "true_heading": 116.72,
      "baro_rate": 0,
      "geom_rate": 0,
      "squawk": "7665",
      "emergency": "none",
      "category": "A3",
      "nav_qnh": 1013.6,
      "nav_altitude_mcp": 36992,
      "rr_lat": 40.7,
      "rr_lon": 39.3,
      "lastPosition": {
        "lat": 43.261414,
        "lon": 29.636404,
        "nic": 8,
        "rc": 185,
        "seen_pos": 3061.406
      },
      "version": 2,
      "nic_baro": 1,
      "nac_p": 0,
      "nac_v": 0,
      "sil": 0,
      "sil_type": "persample",
      "gva": 0,
      "sda": 2,
      "alert": 0,
      "spi": 0,
      "mlat": [],
      "tisb": [],
      "messages": 7675,
      "seen": 0.5,
      "rssi": -7.7
    }
  ],
  "msg": "No error",
  "now": 1695420989961,
  "total": 1,
  "ctime": 1695420989961,
  "ptime": 0
}
```

## Data Field Descriptions
For detailed descriptions of the data fields, refer to [https://airplanes.live/rest-api-adsb-data-field-descriptions/](https://airplanes.live/rest-api-adsb-data-field-descriptions/).

## Rate Limiting
The API is rate limited to 1 request per second.

## Terms of Use
Read the full terms at [https://airplanes.live/terms-of-use/](https://airplanes.live/terms-of-use/).