import argparse
import asyncio
import logging
import os

from matter_common import DEFAULT_WS_URL, connect, load_env_file, request

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOGGER = logging.getLogger("matter_node_info")


def env_node_id() -> int:
    try:
        return int(os.getenv("NODE_ID", "1"))
    except ValueError:
        return 1


async def run(node_id: int, ws_url: str) -> int:
    session, ws = await connect(ws_url)
    try:
        try:
            data = await request(ws, "node", "get_node", {"node_id": node_id})
        except Exception as error:
            LOGGER.error("Failed to load node %s: %s", node_id, error)
            return 1
        node = data.get("result") or {}
        print(f"node_id   : {node.get('node_id')}")
        print(f"name      : {node.get('name')}")
        print(f"available : {node.get('available')}")
        attributes = node.get("attributes") or {}
        if not attributes:
            print("(no cached attributes yet)")
            return 0
        for path in sorted(attributes):
            value = attributes[path]
            print(f"  {path} = {value!r}")
        return 0
    finally:
        await ws.close()
        await session.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Print the attribute layout of a commissioned Matter node"
    )
    parser.add_argument("--node-id", type=int, default=None, help="Matter node id (default: NODE_ID env)")
    args = parser.parse_args()
    load_env_file()
    exit_code = asyncio.run(run(args.node_id or env_node_id(), os.getenv("MATTER_WS_URL", DEFAULT_WS_URL)))
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()