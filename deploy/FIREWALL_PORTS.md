# Firewall And Port Exposure

## Local Development Ports

These ports are used only for local development:

- `4000/tcp` API
- `5173/tcp` CRM Vite dev server
- `5174/tcp` time clock Vite dev server

These should stay local to the development machine. Do not publish them directly to the internet.

## Recommended Production Exposure

Expose only:

- `80/tcp`
- `443/tcp`

Use a reverse proxy or web server on those ports to:

- serve the built CRM frontend
- optionally serve the built time clock frontend
- proxy `/api/*` and `/filesystem/*` to the API on `127.0.0.1:4000`

## API Port

Recommended production binding:

- API on `127.0.0.1:4000`

Recommended production stance:

- do not expose `4000/tcp` publicly
- do not forward router traffic directly to the Node API

## LAN-Only Deployments

For an internal-only deployment, allow users to reach the reverse proxy or web server over the LAN on:

- `80/tcp`
- `443/tcp`

If you intentionally choose direct LAN API access, treat that as an explicit exception rather than the default.

## Time Clock

Preferred exposure:

- LAN-only
- VPN-only
- reverse-proxy restricted

If the standalone time clock is externally reachable:

- keep `TIMECLOCK_KIOSK_KEY` configured
- add IP or network restrictions where possible
- treat the kiosk surface as lower trust than the full CRM

## Management Access

Restrict management ports such as SSH, RDP, or remote admin tools separately.

Do not assume the application firewall rules are enough by themselves.
