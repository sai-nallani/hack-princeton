# Configuration Changes & Troubleshooting

## Redis Cache TTL (10 minutes)

The Redis cache for airplane data is configured to expire automatically every 10 minutes.

### Implementation
In `services/main.py`, the `poll_opensky()` function sets a TTL on the 'planes' key:

```python
r.set('planes', json.dumps(planes), ex=600)  # 10 minutes = 600 seconds
```

### How it works
- Every time new airplane data is fetched from the API, it's cached with a 10-minute expiration
- After 10 minutes of no updates, the key automatically expires and Redis removes it
- The TTL resets on every write, so as long as the poller is running, data stays fresh
- If the service stops, data expires after 10 minutes automatically

### Testing the TTL
You can verify the TTL is working using `redis-cli`:

```bash
# Check the current TTL on the planes key (returns seconds remaining)
redis-cli TTL planes

# View the cached data
redis-cli GET planes

# After 10 minutes of no updates, the key will be gone
redis-cli GET planes  # returns (nil)
```

---

## Dedalus Labs AI Configuration

The service uses Dedalus Labs AI with web search capabilities powered by MCP (Model Context Protocol) servers for intelligent analysis of airplane data.

### Why Dedalus Labs?
- **Web Search Integration**: Uses playwright-mcp server for real-time web browsing and search
- **Model Flexibility**: Supports various models including GPT-4, GPT-4o-mini
- **Tool Calling**: Strong tool-calling capabilities for structured outputs
- **MCP Protocol**: Leverages Model Context Protocol for extended capabilities

### Environment Variables
Configure the Dedalus API using these environment variables:

```bash
# Required - your Dedalus API key
export DEDALUS_API_KEY="dsk_test_your_api_key_here"

# Optional - override the model (default: openai/gpt-4o-mini)
export DEDALUS_MODEL="openai/gpt-4o"
```

### Getting Your API Key
1. Create an account at [dedaluslabs.ai](https://dedaluslabs.ai/)
2. Navigate to your dashboard
3. Generate a new API key in the settings section
4. Add to your `.env` file

### Available Models
Dedalus supports various OpenAI models through their API:
- `openai/gpt-4o-mini` (default - cost-effective, fast)
- `openai/gpt-4o` (more capable)
- `openai/gpt-5` (latest model)
- `openai/gpt-5-mini` (efficient latest)

### MCP Servers Used
- **windsor/playwright-mcp**: Provides web browsing and search capabilities
  - Can search the web for current information
  - Navigate websites and extract data
  - Useful for real-time aviation data lookups

### Benefits Over Previous Implementation
- ✅ **Real-time web search**: Can look up current aviation alerts, NOTAMs, weather
- ✅ **Stronger reasoning**: GPT-4 models provide better analysis
- ✅ **Structured outputs**: More reliable JSON responses
- ✅ **Extensible**: Easy to add more MCP servers for additional capabilities

### Common Issues

**401 Unauthorized**
- API key is invalid or not set
- Check that `DEDALUS_API_KEY` is set in your environment or `.env` file
- Verify the key at https://dedaluslabs.ai/

**429 Rate Limited**
- Too many requests
- Wait a few minutes and try again
- Check your usage at the Dedalus dashboard

**MCP Server Errors**
- Playwright MCP requires proper setup
- Error messages will indicate if MCP server is unavailable
- Analysis will continue without web search if MCP fails

---

---

## Task Deduplication and Expiration

The system implements intelligent task management with deduplication and automatic cleanup.

### Fingerprint-based Deduplication

**How tasks are identified:**
- Each task is uniquely identified by: `aircraft_icao24 + category + priority`
- Example: `"A12345_Low Altitude_HIGH"` uniquely identifies a specific issue for a specific aircraft

**Deduplication behavior:**
1. **New task**: If a task with this fingerprint doesn't exist → added to the system
2. **Existing task**: If a task with this fingerprint exists → `last_seen` timestamp updated, description refreshed if needed
3. **Resolved tasks**: Can reappear if the same issue returns (creates a new unresolved task)

**Benefits:**
- No duplicate warnings for the same aircraft/issue combination
- Tasks show `last_seen` timestamp to track how long an issue has persisted
- Descriptions are updated if Grok provides more detailed information
- Resolved tasks are preserved separately

### Automatic Task Expiration

**Stale task cleanup:**
The system automatically removes outdated tasks to keep the list relevant.

**Expiration rules:**
1. **Unresolved tasks**: Removed if not seen in the last 10 minutes (configurable via `TASK_EXPIRY_MINUTES`)
   - If an issue persists, `last_seen` keeps getting updated and the task stays active
   - If an aircraft moves away or the condition resolves, the task expires naturally
2. **Resolved tasks**: Removed after 1 hour (configurable via `RESOLVED_TASK_RETENTION_HOURS`)
   - Keeps a short history of resolved issues for reference
   - Prevents indefinite growth of the tasks.json file

**Configuration:**
Set these environment variables to customize expiration:
```bash
# How long before unseen tasks are considered stale (default: 10 minutes)
export TASK_EXPIRY_MINUTES=10

# How long to keep resolved tasks for history (default: 1 hour)
export RESOLVED_TASK_RETENTION_HOURS=1
```

**Why 10 minutes?**
- Matches the Redis cache TTL (10 minutes)
- If a plane is still in range and has an issue, it will be detected again
- If a plane leaves the area or the issue resolves, the task cleans up automatically
- Prevents stale warnings from accumulating

### Testing

Run the deduplication test:
```bash
python3 test_task_dedup.py
```

This demonstrates:
- How existing tasks are updated vs new tasks added
- How the fingerprint prevents duplicates
- How resolved tasks are handled

---

## Quick Start

1. **Start Redis**:
   ```bash
   redis-server
   ```

2. **Set your API key**:
   ```bash
   export XAI_API_KEY="your-api-key"
   ```

3. **Test the API** (optional but recommended):
   ```bash
   python3 test_grok_api.py
   ```

4. **Start the service**:
   ```bash
   PYTHONPATH=. uvicorn services.main:app --reload
   ```

5. **Verify Redis caching**:
   ```bash
   # In another terminal
   redis-cli TTL planes  # Should show a number <= 600
   ```
