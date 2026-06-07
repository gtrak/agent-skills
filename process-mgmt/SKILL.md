---
name: process-mgmt
description: MANDATORY skill for spawning and killing processes
---
# Process Management Skill - MANDATORY

Safe process lifecycle management in terminal environments where `pkill` and `pgrep -f` are unsafe due to subprocess self-matching.

**CRITICAL:** This skill is **MANDATORY** for all processes involving starting, stopping, or managing background services (servers, daemons, test runners, etc.). Violations cause infinite loops and hung shells.

## WHY THIS EXISTS

The bash tool runs commands via `bash -c "..."`. When you run `pkill -f pattern`, the `-f` flag causes pkill to match against the full command line including itself (`bash -c "... pkill -f ..."`), creating an infinite kill loop that hangs the shell indefinitely.

## PROHIBITED Commands

These commands **MUST NEVER** be used:

```bash
pkill <pattern>          # NO - self-matches
pkill -f <pattern>       # NO - definitely self-matches  
pgrep -f <pattern>       # NO - hangs shell
pkillall                 # NO - same as pkill
killall                  # NO - not safe in subprocess
```

## Safe Alternatives

### Method 1: Justfile Recipes (PREFERRED)

Most projects provide justfile recipes for daemon management:

```bash
# Start/stop servers safely
just site-stop
just site-serve
just daemon-stop
just daemon-start
just daemon-restart
just daemon-status
```

**Always prefer project-provided recipes over manual process management.**

### Method 2: PID Files

Store PIDs at startup, read them for cleanup:

```bash
# Start and capture PID (Unix way):
myserver &
echo $! > /tmp/myserver.pid

# Later, stop using the stored PID:
kill $(cat /tmp/myserver.pid) 2>/dev/null || true
rm -f /tmp/myserver.pid
```

### Method 3: Process Group Kill

For related processes started from same command:

```bash
# Start a process group:
( myserver && another-server ) &
echo $! > /tmp/servers.gid

# Kill entire group:
kill -- -$(cat /tmp/servers.gid) 2>/dev/null || true
```

### Method 4: PID from Status/Info Commands

Many servers expose their PIDs:

```bash
# Get PID from status command output:
PID=$(grep -oP 'PID: \K\d+' <(myserver --status))
kill "$PID"

# Or from a JSON state file:
PID=$(jq '.pid' /path/to/state.json)
kill "$PID"
```

### Method 5: Signal-based Graceful Shutdown

Prefer SIGTERM for graceful shutdown, with timeout fallback:

```bash
# Graceful shutdown with timeout:
if [ -f /tmp/server.pid ]; then
  PID=$(cat /tmp/server.pid)
  kill "$PID" 2>/dev/null || true
  sleep 2
  # Verify it stopped, force if needed:
  kill -0 "$PID" 2>/dev/null && kill -9 "$PID" 2>/dev/null || true
  rm -f /tmp/server.pid
fi
```

### Method 6: Named Socket/Port Check

For servers that bind ports:

```bash
# Check if port is in use (server running):
ss -tlnp | grep -q ':9999' && echo "running" || echo "stopped"
```

## Common Patterns

### Start-if-not-running guard:

```bash
start_server() {
  local pid_file="/tmp/myserver.pid"
  if [ -f "$pid_file" ]; then
    local existing_pid=$(cat "$pid_file")
    # Check if process is actually alive (kill -0 doesn't send signal)
    kill -0 "$existing_pid" 2>/dev/null && {
      echo "Server already running (PID: $existing_pid)"
      return 0
    }
  fi
  myserver &
  echo $! > "$pid_file"
}
```

### Stop-if-running guard:

```bash
stop_server() {
  local pid_file="/tmp/myserver.pid"
  if [ -f "$pid_file" ]; then
    local pid=$(cat "$pid_file")
    kill "$pid" 2>/dev/null || true
    rm -f "$pid_file"
  fi
}
```

## Process State Inspection (without pgrep -f)

```bash
# Check if a specific PID is alive:
kill -0 $PID 2>/dev/null && echo "alive" || echo "dead"

# List PIDs from known process names (no -f):
ps aux | grep '[s]erver'  # [s] avoids matching grep itself

# Find processes by listening port:
lsof -i :9999 2>/dev/null
ss -tlnp sport = :9999

# List PIDs for known process tree:
pstree -p $$ | head  # shows children of current shell
```

## Troubleshooting Stuck Processes

```bash
# Check if PID file is stale (file exists but process dead):
if [ -f /tmp/server.pid ]; then
  kill -0 $(cat /tmp/server.pid) 2>/dev/null || rm -f /tmp/server.pid
fi

# Find what's listening on a port:
ss -tlnp sport = :9999

# Get PID from lsof:
LSPID=$(lsof -ti :9999 2>/dev/null)
kill $LSPID 2>/dev/null || true

# Check zombie processes:
ps aux | grep '[Z]'  # find zombies
```

## When to Use Each Method

| Situation | Preferred Method |
|-----------|------------------|
| Project provides justfile recipes | Method 1 (just recipes) |
| Starting server in current session | Method 2 (PID file) |
| Multiple related servers | Method 3 (process group) |
| Server exposes status/PID info | Method 4 (status commands) |
| Need graceful shutdown | Method 5 (signal-based) |
| Checking if server is up | Method 6 (port check) |

## Key Takeaways

1. **NEVER** use `pkill`, `pgrep -f`, or `killall`
2. **ALWAYS** prefer project-provided justfile recipes
3. Store PIDs in files when starting processes
4. Use `kill -0 PID` to check if process is alive
5. Kill by explicit PID: `kill $PID`
6. For servers: check ports with `ss` or `lsof`

---

*Last Updated: 2026-05-12*
