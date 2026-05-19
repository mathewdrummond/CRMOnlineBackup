# Millbrook JoinerFlow LAN Access And Certificates

This runbook covers the local network setup for accessing JoinerFlow from office computers.

## Current URLs

Use these addresses:

```text
https://crm.millbrookfurniture.co.nz
https://timeclock.millbrookfurniture.co.nz
```

The NAS currently resolves locally to:

```text
192.168.1.31
```

## Hosts File Entries

On each computer that needs access, add this line to the hosts file:

```text
192.168.1.31    crm.millbrookfurniture.co.nz timeclock.millbrookfurniture.co.nz
```

Optional, if old local aliases should keep working too:

```text
192.168.1.31    crm.millbrookfurniture.co.nz timeclock.millbrookfurniture.co.nz joinerflow.local clock.joinerflow.local Data.local
```

### macOS

Edit the hosts file:

```bash
sudo nano /etc/hosts
```

Add the hosts entry, save, then flush DNS:

```bash
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
```

### Windows

Open Notepad as Administrator, then open:

```text
C:\Windows\System32\drivers\etc\hosts
```

Add the hosts entry and save.

Then open Command Prompt as Administrator and run:

```cmd
ipconfig /flushdns
```

## Google Sign-In

Google Cloud must allow this exact Authorized JavaScript origin:

```text
https://crm.millbrookfurniture.co.nz
```

Do not include a path.

The time clock currently loads from:

```text
https://timeclock.millbrookfurniture.co.nz
```

If Google sign-in is required directly on the time clock hostname, also add:

```text
https://timeclock.millbrookfurniture.co.nz
```

## Browser Security Warnings

If the browser shows a certificate or security warning, it means the NAS is serving a certificate that does not match the hostname being used.

The certificate must include these hostnames:

```text
crm.millbrookfurniture.co.nz
timeclock.millbrookfurniture.co.nz
```

### Preferred Fix: Trusted Certificate

In Synology DSM:

1. Open **Control Panel**.
2. Go to **Security**.
3. Open **Certificate**.
4. Add or import a certificate that covers both hostnames.
5. Assign that certificate to the DSM/nginx service handling:
   - `crm.millbrookfurniture.co.nz`
   - `timeclock.millbrookfurniture.co.nz`

If using Let's Encrypt, validation must be possible. This usually means either:

- public DNS for these hostnames points to the NAS during validation, or
- DNS challenge validation is configured.

### LAN-Only Alternative

For a private LAN-only setup, use an internal certificate authority:

1. Create or obtain a certificate for both hostnames.
2. Install the certificate on the NAS.
3. Trust the issuing root certificate on every client computer.

Every client must trust the root certificate, otherwise the browser warning will remain.

## Validation Commands

From a Mac or Linux computer:

```bash
dscacheutil -q host -a name crm.millbrookfurniture.co.nz
dscacheutil -q host -a name timeclock.millbrookfurniture.co.nz
curl -k https://crm.millbrookfurniture.co.nz/api/health
curl -k https://timeclock.millbrookfurniture.co.nz/api/health
```

Expected health response:

```json
{
  "status": "ok"
}
```

Check the certificate being served:

```bash
echo | openssl s_client -connect crm.millbrookfurniture.co.nz:443 -servername crm.millbrookfurniture.co.nz 2>/dev/null | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
```

The Subject Alternative Name must include:

```text
DNS:crm.millbrookfurniture.co.nz
DNS:timeclock.millbrookfurniture.co.nz
```

## Current NAS Routing Summary

DSM nginx owns normal HTTPS port `443`.

DSM nginx proxies:

```text
crm.millbrookfurniture.co.nz -> JoinerFlow Caddy on 127.0.0.1:8443
timeclock.millbrookfurniture.co.nz -> JoinerFlow Caddy on 127.0.0.1:8443
```

JoinerFlow containers should be healthy:

```text
joinerflow-proxy
joinerflow-server
joinerflow-client
joinerflow-clock-client
joinerflow-postgres
qdrant
ollama
```
