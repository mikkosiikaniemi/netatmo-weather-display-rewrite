import argparse
import asyncio
import logging
import os
import sys

import aiohttp

from matter_common import DEFAULT_WS_URL, MatterError, connect, load_env_file, read_attribute

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOGGER = logging.getLogger("matter_bridge")

MIN_EXPECTED_TEMP = -50.0
MAX_EXPECTED_TEMP = 80.0
INVALID_INT16 = -32768
INVALID_UINT16 = 65535


class Config:
    def __init__(self) -> None:
        self.ws_url = os_env("MATTER_WS_URL", DEFAULT_WS_URL)
        self.ingest_url = os_env("INGEST_URL", "")
        self.ingest_token = os_env("INGEST_TOKEN", "")
        self.device_id = os_env("DEVICE_ID", "timmerflotte")
        self.device_name = os_env("DEVICE_NAME", "")
        self.node_id = int(os_env("NODE_ID", "1"))
        self.poll_interval = int(os_env("POLL_INTERVAL_SEC", "600"))
        self.collect_timeout = int(os_env("COLLECT_TIMEOUT_SEC", "90"))
        self.temperature_path = os_env("TEMPERATURE_PATH", "1/1026/0")
        self.humidity_path = os_env("HUMIDITY_PATH", "2/1029/0")
        self.battery_path = os_env("BATTERY_PATH", "")
        self.verify_tls = os_env("VERIFY_TLS", "true").lower() != "false"

    def validate(self) -> None:
        problems = []
        if not self.ingest_url:
            problems.append("INGEST_URL is required (the backend /api/sensors/ingest endpoint)")
        if not self.ingest_token:
            problems.append("INGEST_TOKEN is required (SENSOR_INGEST_TOKEN from backend/.env)")
        if problems:
            for problem in problems:
                LOGGER.error("Missing configuration: %s", problem)
            raise ValueError("invalid configuration")


def os_env(key: str, default: str) -> str:
    value = os.environ.get(key)
    return value if value is not None else default


def scaled_value(attribute_value, divisor: float) -> float | None:
    if not isinstance(attribute_value, (int, float)):
        return None
    if attribute_value == INVALID_INT16 or attribute_value == INVALID_UINT16:
        return None
    return float(attribute_value) / divisor


def valid_temperature(value: float | None) -> bool:
    return value is not None and MIN_EXPECTED_TEMP <= value <= MAX_EXPECTED_TEMP


async def read_measurements(ws, cfg: Config) -> dict:
    payload: dict = {}

    try:
        raw = await read_attribute(ws, cfg.node_id, cfg.temperature_path)
        temperature = scaled_value(raw, 100.0)
        if valid_temperature(temperature):
            payload["temperature"] = round(temperature, 2)
        else:
            LOGGER.warning("Temperature value ignored: %r", raw)
    except MatterError as error:
        LOGGER.error("Temperature read failed: %s", error)

    try:
        raw = await read_attribute(ws, cfg.node_id, cfg.humidity_path)
        humidity = scaled_value(raw, 100.0)
        if humidity is not None and 0.0 <= humidity <= 100.0:
            payload["humidity"] = round(humidity, 2)
        else:
            LOGGER.warning("Humidity value ignored: %r", raw)
    except MatterError as error:
        LOGGER.error("Humidity read failed: %s", error)

    if cfg.battery_path:
        try:
            raw = await read_attribute(ws, cfg.node_id, cfg.battery_path)
            battery = scaled_value(raw, 2.0)
            if battery is not None and 0.0 <= battery <= 100.0:
                payload["battery"] = round(battery, 2)
        except MatterError as error:
            LOGGER.warning("Battery read failed (skipping battery): %s", error)

    if not payload:
        raise MatterError("no usable measurement values")
    return payload


async def post_reading(session: aiohttp.ClientSession, cfg: Config, payload: dict) -> None:
    body = {"deviceId": cfg.device_id}
    if cfg.device_name:
        body["name"] = cfg.device_name
    body.update(payload)

    headers = {"x-api-token": cfg.ingest_token}
    async with session.post(cfg.ingest_url, json=body, headers=headers, ssl=cfg.verify_tls) as response:
        text = await response.text()
        if response.status not in (200, 201):
            raise MatterError(f"ingest returned HTTP {response.status}: {text[:300]}")


async def collect_once(session: aiohttp.ClientSession, cfg: Config) -> None:
    _, ws = await connect(cfg.ws_url, session)
    try:
        payload = await read_measurements(ws, cfg)
        await post_reading(session, cfg, payload)
        LOGGER.info("Pushed %s", payload)
    finally:
        await ws.close()


async def run(cfg: Config, once: bool) -> None:
    LOGGER.info("Connecting to Matter server at %s", cfg.ws_url)
    session = aiohttp.ClientSession()
    try:
        if once:
            await collect_once(session, cfg)
            return

        while True:
            try:
                await asyncio.wait_for(collect_once(session, cfg), timeout=cfg.collect_timeout)
            except asyncio.TimeoutError:
                LOGGER.error("Poll timed out after %ss", cfg.collect_timeout)
            except Exception as error:
                LOGGER.exception("Poll failed: %s", error)
            if session.closed:
                session = aiohttp.ClientSession()
            await asyncio.sleep(cfg.poll_interval)
    finally:
        await session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Push IKEA TIMMERFLOTTE readings to the Netatmo backend")
    parser.add_argument("--once", action="store_true", help="Read and push a single reading, then exit")
    args = parser.parse_args()

    load_env_file()
    cfg = Config()
    try:
        cfg.validate()
    except ValueError:
        sys.exit(2)

    asyncio.run(run(cfg, args.once))


if __name__ == "__main__":
    main()