# Raspberry Pi bridge: IKEA TIMMERFLOTTE -> Netatmo dashboard

Reads the IKEA TIMMERFLOTTE (Matter over Thread) temperature/humidity sensor that is
already paired to Apple Home, and pushes readings to the project backend's
`POST /api/sensors/ingest` endpoint. The dashboard then shows the readings in the
sensor widget exactly like the Apple Shortcuts flow.

## Architecture

```
 IKEA TIMMERFLOTTE (Matter/Thread, joined to Apple Home)
        |
        | Thread 802.15.4
        |
 Apple TV 4K (Thread border router)  <-- Apple Home hub on the same LAN
        |
        | IPv6 (routed via ICMPv6 RIOs from the border router)
        |
 Raspberry Pi 4B
   +-- python-matter-server 8.1.2  (Matter controller, WebSocket API on :5580)
   |        |
   |        | ws://127.0.0.1:5580/ws  rpc-like commands
   |        v
   +-- collector.py  (reads 1/1026/0 temperature, 2/1029/0 humidity)
        |
        | POST /api/sensors/ingest  (X-Api-Token)
        v
 Node/Express backend  ->  backend/data/sensor-readings.json  ->  frontend widget
```

The Pi controller never touches the Thread radio itself: it reaches the sensor over
IPv6 through the Apple TV's Thread border router (the "network_only"/multi-admin
commissioning path). No BLE, no 802.15.4 dongle is required.

## Prerequisites

- Raspberry Pi 4B with 64-bit Raspberry Pi OS (Bookworm or Trixie), wired/`Wi-Fi` Ethernet on the same LAN / VLAN as the Apple TV.
- The TIMMERFLOTTE is already set up in the Apple Home app and the Apple TV 4K (or HomePod) is present as a Thread border router.
- A manual QR / pairing code from **Apple Home -> sensor -> Settings -> "Turn on Pairing Mode"** (a fresh code from the Home app, not the box code).
- `python-matter-server` requires **Python >= 3.12**. `setup.sh` uses `uv` to fetch a standalone Python 3.12 if the OS only ships 3.11 (Bookworm).

### Network requirements (important)

Matter depends on IPv6 link-local multicast, and reaching Thread devices through a
border router depends on the host processing ICMPv6 Router Advertisements with
Route Information Options (RIO). From the matter-server docs:

- The Pi must be on the same flat LAN/VLAN as the sensor, the Apple border router, and any commissioning device.
- IPv6 must be enabled on the host interface. The host must process ICMPv6 RA/RIO; NetworkManager >= 1.42 is recommended.
- `net.ipv6.conf.all.forwarding` must stay `0`.
- Disable "multicast optimizations" / "mDNS forwarder" options on managed switch gear (Unifi/Omada style), they break Matter multicast.

`setup.sh` writes `/etc/sysctl.d/99-matter-server.conf` with the recommended sysctls
(`accept_ra=1`, `accept_ra_rt_info_max_plen=64`, `igmp_max_memberships=1024`).

## Install

Copy the `matter-bridge/` directory (this repository branch `sensors-api`) to the Pi,
then:

```sh
sudo bash matter-bridge/setup.sh
```

This (idempotently) creates `/opt/netatmo-matter-bridge` with a Python 3.12 venv
containing `python-matter-server[server]==8.1.2`, installs two systemd units
(`matter-server.service`, `matter-bridge.service`), enables IPv6/multicast sysctls,
and starts both services. It also creates `/data`, where the Matter SDK keeps its
on-disk key/value store (`/data/chip_*.ini`) — if that path does not exist the
server crashes with `CHIP handle has not been initialized` before it ever binds
port 5580. Install logs go to `journalctl -u matter-server -f`.

## Configure

Edit `/opt/netatmo-matter-bridge/.env`:

```sh
sudo nano /opt/netatmo-matter-bridge/.env
```

| Variable | Meaning |
| --- | --- |
| `INGEST_URL` | Backend endpoint, e.g. `https://your-domain.com/api/sensors/ingest` (dev: `http://<pi>:3001/api/sensors/ingest`) |
| `INGEST_TOKEN` | `SENSOR_INGEST_TOKEN` from `backend/.env` |
| `DEVICE_NAME` | Label shown in the dashboard widget (e.g. `Timmerflotte hall`) |
| `DEVICE_ID` | Stable id used to group readings (default `timmerflotte`) |
| `NODE_ID` | Matter node id assigned during commissioning (set after commissioning) |
| `POLL_INTERVAL_SEC` | Seconds between polls (default `600`) |
| `BATTERY_PATH` | Optional `endpoint/cluster/attribute` for battery percent (see `0/47/16`); empty = skip |

The scripts read this file automatically when run manually too (e.g. `collector.py --once`),
so there is no need to export the variables yourself.

## Commission the sensor

1. In the Apple Home app open the sensor -> Settings -> **Turn on Pairing Mode** and read the manual code.
2. On the Pi:

```sh
sudo /opt/netatmo-matter-bridge/venv/bin/python /opt/netatmo-matter-bridge/commission.py --code 123-45-678
```

The 8-digit battery-less sleep matter codes contain dashes; pass the code as one string, dashes included.
`commission_with_code` runs with `network_only: true`, which is the path Apple exposes for already-joined
devices; the controller does not need the Thread credentials in this mode. If commissioning fails with a
Thread connectivity error, export the Thread Active Dataset from your OTBR/HA and set `THREAD_DATASET`
in `.env`, then re-run.

3. The script prints `node_id`; set it in `/opt/netatmo-matter-bridge/.env` (`NODE_ID=...`) and restart:

```sh
sudo systemctl restart matter-bridge
```

## Verify

```sh
sudo systemctl status matter-server matter-bridge
journalctl -u matter-bridge -f          # shows each pushed reading
curl -s http://<backend>:3001/api/sensors/latest -H "X-Api-Token: $INGEST_TOKEN"
```

Then open the dashboard: the sensor cards will fill in on the next poll.

## Operation

```sh
sudo systemctl restart|stop matter-server          # Matter controller
sudo systemctl restart|stop matter-bridge          # collector
sudo /opt/netatmo-matter-bridge/venv/bin/python /opt/netatmo-matter-bridge/collector.py --once   # single test poll
```

## Troubleshooting

- **Restart loop with `CHIP handle has not been initialized` / `Failed to create temp file /data/chip_factory.ini`**: the Matter SDK's key/value store lives in `/data`, which must exist. `setup.sh` creates it; if you configured manually, run `sudo mkdir -p /data && sudo systemctl restart matter-server`.
- **Service fails to start**: `journalctl -u matter-server -e`. Ensure the platform is 64-bit ARM, Python 3.12+, and the venv install completed (`/opt/netatmo-matter-bridge/venv/bin/python -m matter_server.server --help`).
- **"No buffer space available" (OSError 105)**: the igmp sysctl in `/etc/sysctl.d/99-matter-server.conf` fixes this; re-run `sudo sysctl --system`.
- **Device unreachable / reads time out**: confirm the Pi processes RIOs (`ip -6 route` should show a route toward the Thread network via the Apple TV); enforce `net.ipv6.conf.all.forwarding=0`, NetworkManager >= 1.42, and that router multicast filtering is off.
- **Commissioning fails with a Thread error**: set `THREAD_DATASET` in `.env` (dataset from an OpenThread border router / Home Assistant Thread panel) and re-run `commission.py`.
- **No readings on the dashboard**: `journalctl -u matter-bridge` shows the last error; check `INGEST_URL`/`INGEST_TOKEN`; do a `--once` run.
- **Port 5580 already in use**: another matter-server instance (e.g. a Home Assistant add-on) is running; stop it or point `MATTER_WS_URL` elsewhere.

## Notes

- `python-matter-server` is archived (final release 8.1.2). The successor `matterjs-server` is still beta and has Thread gaps, so 8.1.2 is used here deliberately.
- The sensor is battery powered (sleepy end device); the first read may take a moment while the parent / border router buffers the request.
- Readings are kept 48h by the backend and visualised by the existing `SensorReadingsWidget`.