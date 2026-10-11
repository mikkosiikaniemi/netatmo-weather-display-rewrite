import json
import logging
import os
from pathlib import Path
from typing import Any, Optional

import aiohttp
from aiohttp import ClientSession, ClientWebSocketResponse

DEFAULT_WS_URL = "ws://127.0.0.1:5580/ws"
LOGGER = logging.getLogger("matter_bridge")


class MatterError(RuntimeError):
    pass


def load_env_file(env_file: Optional[str] = None) -> None:
    if not env_file:
        env_file = os.getenv("MATTER_BRIDGE_ENV", str(Path(__file__).resolve().parent / ".env"))
    path = Path(env_file)
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if key and key not in os.environ:
            os.environ[key] = value


async def connect(
    ws_url: str, session: Optional[ClientSession] = None
) -> tuple[ClientSession, ClientWebSocketResponse]:
    if session is None:
        session = aiohttp.ClientSession()
    ws = await session.ws_connect(ws_url, heartbeat=30)
    return session, ws


async def request(
    ws: ClientWebSocketResponse,
    message_id: str,
    command: str,
    args: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"message_id": message_id, "command": command}
    if args is not None:
        payload["args"] = args
    await ws.send_json(payload)
    async for msg in ws:
        if msg.type != aiohttp.WSMsgType.TEXT:
            raise MatterError("websocket closed or errored while waiting for a reply")
        data = json.loads(msg.data)
        if data.get("message_id") != message_id:
            continue
        if data.get("type") == "event":
            continue
        if not data.get("success", True):
            error_code = data.get("error_code")
            summary = data.get("details")
            if isinstance(summary, dict):
                summary = summary.get("message", summary)
            raise MatterError(f"command '{command}' failed (error_code={error_code}): {summary or 'unknown error'}")
        return data
    raise MatterError(f"no reply for command '{command}'")


async def read_attribute(ws: ClientWebSocketResponse, node_id: int, attribute_path: str) -> Any:
    data = await request(
        ws,
        "read",
        "read_attribute",
        {"node_id": node_id, "attribute_path": attribute_path},
    )
    result = data.get("result") or {}
    return result.get("attribute_value")