import argparse
import asyncio
import logging
import os

from matter_common import DEFAULT_WS_URL, MatterError, connect, request

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOGGER = logging.getLogger("matter_commission")


def env_ws_url() -> str:
    return os.getenv("MATTER_WS_URL", DEFAULT_WS_URL)


async def run(code: str, network_only: bool, ws_url: str) -> int:
    session, ws = await connect(ws_url)
    try:
        thread_dataset = os.getenv("THREAD_DATASET")
        if thread_dataset:
            try:
                await request(ws, "thread", "set_thread_dataset", {"dataset": thread_dataset})
                LOGGER.info("Thread Active Dataset sent to the Matter server")
            except MatterError as error:
                LOGGER.warning("Could not set Thread dataset: %s", error)

        wifi_ssid = os.getenv("WIFI_SSID")
        wifi_password = os.getenv("WIFI_PASSWORD")
        if wifi_ssid:
            await request(
                ws,
                "wifi",
                "set_wifi_credentials",
                {"ssid": wifi_ssid, "credentials": wifi_password or ""},
            )

        args = {"code": code}
        if network_only:
            args["network_only"] = True
        LOGGER.info("Commissioning (network_only=%s)...", network_only)
        try:
            data = await request(ws, "commission", "commission_with_code", args)
        except MatterError as error:
            LOGGER.error("Commissioning failed: %s", error)
            LOGGER.error(
                "For a Thread device, make sure the device is on the Apple/Thread network and "
                'set THREAD_DATASET in .env if reachability via the border router is not enough.'
            )
            return 1

        result = data.get("result") or {}
        node_id = result.get("node_id") or result.get("nodeId") or 1
        info = result.get("info") or {}
        name = info.get("name") or info.get("fabric_label") or "unknown"
        LOGGER.info("Commissioned node_id=%s name=%s", node_id, name)
        LOGGER.info("Set NODE_ID=%s and, if needed, DEVICE_NAME in /opt/netatmo-matter-bridge/.env", node_id)
        return 0
    finally:
        await ws.close()
        await session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Commission the IKEA TIMMERFLOTTE sensor to the Matter server")
    parser.add_argument("--code", required=True, help="Manual pairing code or MT:... QR code")
    parser.add_argument(
        "--no-network-only",
        action="store_true",
        help="Do not use network_only commissioning (for factory-reset / not-yet-joined devices)",
    )
    args = parser.parse_args()
    exit_code = asyncio.run(run(args.code, not args.no_network_only, env_ws_url()))
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()