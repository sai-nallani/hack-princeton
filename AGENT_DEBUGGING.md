# Agent Debugging Guide

## Overview

The system now includes comprehensive logging of Dedalus AI agent's intermediate steps for debugging purposes.

## Features Implemented

### 1. **Console Logging** (Always Active when `DEBUG_AGENT_STEPS=true`)

Every analysis execution prints:
```
================================================================================
🤖 DEDALUS AGENT EXECUTION - INTERMEDIATE STEPS
Timestamp: 2025-11-09T00:14:00.585479+00:00
Model: xai/grok-4-fast-non-reasoning
MCP Servers: ['akakak/sonar']
================================================================================
```

For each step in the agent's reasoning:
- **Role**: The role of the step (assistant, tool, etc.)
- **Tool Calls**: Functions/tools called by the agent (web searches, etc.)
  - Function name
  - Arguments (formatted JSON)
- **Content**: Agent's reasoning/thoughts
- **Tool Responses**: Results from tool executions

### 2. **File Logging** (Persistent Record)

All debug information is also saved to:
```
/Users/sainallani/Projects/hack-princeton-1/services/agent_debug.log
```

This file accumulates all agent executions for later analysis.

## Configuration

### Enable/Disable Debugging

Set in `.env` file or environment:
```bash
DEBUG_AGENT_STEPS=true   # Enable (default)
DEBUG_AGENT_STEPS=false  # Disable
```

### What Gets Logged

```python
# For each analysis run:
- Timestamp (UTC)
- Model name (e.g., xai/grok-4-fast-non-reasoning)
- MCP servers being used
- Step-by-step breakdown:
  - Step number
  - Role (assistant, tool, system)
  - Tool calls with arguments
  - Content/reasoning (preview: first 300 chars)
  - Tool responses (preview: first 200 chars)
```

## Understanding the Output

### Example Log Entry

```
--- Step 1 ---
Role: assistant
🔧 Tool Calls: 2
  Tool 1:
    Function: search_web
    Arguments: {
      "query": "FAA NOTAM Atlanta area",
      "max_results": 5
    }
  Tool 2:
    Function: get_weather
    Arguments: {
      "location": "KATL"
    }
💭 Content: I need to check for active NOTAMs and weather conditions in the Atlanta area...

--- Step 2 ---
Role: tool
🔄 Tool Response ID: call_abc123
   Response: Found 3 active NOTAMs for Atlanta Hartsfield-Jackson: 1) Runway 27L closed for maintenance...
```

### Tool Call Types You Might See

- **`search_web`**: Agent searching FAA/NWS websites for NOTAMs, weather, TFRs
- **`browse_url`**: Agent visiting specific pages (e.g., notams.aim.faa.gov)
- **`extract_content`**: Agent extracting specific information from web pages
- **JSON parsing**: Final step where agent formats task output

## Troubleshooting

### No Intermediate Steps Logged

If you only see the headers but no steps, this means:

1. **The model doesn't expose intermediate steps**: Some AI models return only the final output without intermediate reasoning traces.

2. **The Dedalus response object structure**: The `response` object may not have a `.steps` attribute, or it might be structured differently.

3. **Fast execution**: The agent completed in a single step without tool calls.

### How to Get More Details

If intermediate steps aren't showing, you can:

1. **Check the Dedalus response object structure**:
   ```python
   # In analysis_service.py, after the runner.run() call:
   print(f"Response attributes: {dir(response)}")
   print(f"Response type: {type(response)}")
   ```

2. **Log the entire response object**:
   ```python
   import pprint
   pprint.pprint(vars(response))
   ```

3. **Check for alternative attributes**:
   - `response.messages`
   - `response.interactions`
   - `response.trace`
   - `response.history`

## Current Logging Location

All logs are written to:
```
/Users/sainallani/Projects/hack-princeton-1/services/agent_debug.log
```

View latest logs:
```bash
tail -f services/agent_debug.log
```

View specific analysis run:
```bash
grep -A 50 "2025-11-09T00:14:00" services/agent_debug.log
```

## Performance Impact

- **Minimal overhead**: Logging only prints/writes text
- **Console output**: May slow terminal slightly with large outputs
- **File writes**: Async, non-blocking
- **Disk space**: ~1-5KB per analysis run (depends on step count)

## Disabling for Production

To disable debugging in production:

1. Set environment variable:
   ```bash
   export DEBUG_AGENT_STEPS=false
   ```

2. Or in `.env`:
   ```
   DEBUG_AGENT_STEPS=false
   ```

3. Or comment out in `analysis_service.py`:
   ```python
   # DEBUG_AGENT_STEPS = os.getenv("DEBUG_AGENT_STEPS", "true").lower() == "true"
   DEBUG_AGENT_STEPS = False
   ```

## Integration with Existing System

The debugging layer:
- ✅ Does NOT affect task generation
- ✅ Does NOT slow down analysis significantly
- ✅ Can be toggled on/off without code changes
- ✅ Works with continuous background analysis
- ✅ Compatible with auto-reload during development

## Example Use Cases

1. **Verify web searches are working**:
   - Check if agent is actually calling search tools
   - See what queries the agent is making
   - Verify responses from FAA/NWS websites

2. **Debug task generation issues**:
   - See agent's reasoning for generating specific tasks
   - Check if agent is finding relevant NOTAMs/weather
   - Verify JSON formatting issues

3. **Optimize prompts**:
   - See how agent interprets your prompts
   - Identify unnecessary tool calls
   - Improve prompt engineering based on agent behavior

4. **Monitor API usage**:
   - Track number of tool calls per analysis
   - Identify expensive operations
   - Optimize for API rate limits

## Technical Details

### Code Location

File: `services/analysis_service.py`

Key sections:
```python
# Configuration (lines ~30-32)
DEBUG_AGENT_STEPS = os.getenv("DEBUG_AGENT_STEPS", "true").lower() == "true"
DEBUG_LOG_FILE = Path(__file__).parent / "agent_debug.log"

# Logging implementation (lines ~243-315)
# In analyze_with_dedalus() function
if DEBUG_AGENT_STEPS and hasattr(response, 'steps') and response.steps:
    # ... logging logic ...
```

### Dependencies

- **Python standard library**: json, pathlib, datetime
- **No additional packages required**: Uses existing Dedalus SDK

## Future Enhancements

Potential improvements:
- [ ] Add structured JSON logging (for parsing by log analysis tools)
- [ ] Add filtering by log level (INFO, DEBUG, TRACE)
- [ ] Log rotation (max file size, archive old logs)
- [ ] Real-time streaming to external monitoring (e.g., Datadog, Sentry)
- [ ] Performance metrics (token usage, latency per step)
- [ ] Web UI for viewing logs
