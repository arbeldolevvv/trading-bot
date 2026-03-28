"""
IBKR connection manager — singleton IB instance shared across the app.
TWS or IB Gateway must be running with API enabled.
"""
import asyncio
import logging
from ib_insync import IB

logger = logging.getLogger(__name__)

_ib: IB | None = None


async def get_ib(host: str, port: int, client_id: int) -> IB:
    """Return a connected IB instance, reconnecting if needed."""
    global _ib

    if _ib is not None and _ib.isConnected():
        return _ib

    logger.info(f"Connecting to IBKR at {host}:{port} (clientId={client_id})...")
    _ib = IB()
    await _ib.connectAsync(host, port, clientId=client_id, timeout=20)
    logger.info("IBKR connected.")
    return _ib


def get_status() -> dict:
    if _ib and _ib.isConnected():
        acc = _ib.managedAccounts()
        return {
            "connected": True,
            "host": _ib.client.host,
            "port": _ib.client.port,
            "accounts": list(acc),
        }
    return {"connected": False}


async def disconnect():
    global _ib
    if _ib:
        _ib.disconnect()
        _ib = None
        logger.info("IBKR disconnected.")
