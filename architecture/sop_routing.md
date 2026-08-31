# Standard Operating Procedure (SOP): KVB Live Journey Routing

## 1. Objective
Calculate door-to-door transit routes between any two stations/stops in the Cologne transit network with live real-time delay tracking and transfer steps.

## 2. Source & Protocol
- **Service:** HAFAS `client.journeys(fromId, toId, options)`
- **Endpoint:** `GET /api/routes?from={fromId}&to={toId}`

## 3. Data Processing & Rules
1. **Input Validation:** Ensure `from` and `to` are valid station identifiers (or resolve query names via location lookup).
2. **Leg Decomposition:**
   - **Transit Leg:** Line name, product category, origin stop + platform, destination stop + platform, departure & arrival timestamps, delay minutes, line color.
   - **Walking Leg:** Origin stop, destination stop, duration in minutes, walking indicator.
3. **Trip Summary:** Total travel duration (minutes), number of transfers, departure & arrival times.
4. **Resilience:** Fall back gracefully if no direct journey is found, returning clear human-readable messages.
