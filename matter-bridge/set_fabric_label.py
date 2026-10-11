import argparse
import asyncio
import logging
import os

from matter_common import DEFAULT_WS_URL, connect, load_env_file, request

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOGGER = logging.getLogger("matter_fabric_label")

DEFAULT_LABEL = "Netatmo Bridge"


def env_node_id() -> int:
    try:
        return int(os.getenv("NODE_ID", "1"))
    except ValueError:
        return 1


async def run(node_id: int, label: str, ws_url: str) -> int:
    session, ws = await connect(ws_url)
    try:
        await request(ws, "fabric", "set_default_fabric_label", {"label": label})
        LOGGER.info("Set default fabric label to '%s'", label)
        await request(ws, "interview", "interview_node", {"node_id": node_id})
        LOGGER.info(
            "Re-interviewed node %s; the device fabric is now labelled '%s'. "
            "Apple Home may take a moment (or a refresh) to show the new name.",
            node_id,
            label,
        )
        return 0
    except Exception as error:
        LOGGER.error("Failed to set fabric label: %s", error)
        return 1
    finally:
        await ws.close()
        await session.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Set the fabric label shown for this controller in other ecosystems (e.g. Apple Home)"
    )
    parser.add_argument("--node-id", type=int, default=None, help="Matter node id (default: NODE_ID env)")
    parser.add_argument("--label", default=None, help=f"Fabric label, max 32 chars (default: FABRIC_LABEL env or '{DEFAULT_LABEL}')")
    args = parser.parse_args()
    load_env_file()
    label = args.label or os.getenv("FABRIC_LABEL") or DEFAULT_LABEL
    exit_code = asyncio.run(run(args.node_id or env_node_id(), label, os.getenv("MATTER_WS_URL", DEFAULT_WS_URL)))
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()