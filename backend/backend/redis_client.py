import os
import redis.asyncio as redis
from typing import Optional, Any
import json

REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379')
redis_client: Optional[redis.Redis] = None

async def init_redis():
    global redis_client
    try:
        redis_client = await redis.from_url(REDIS_URL, decode_responses=True)
        await redis_client.ping()
        print("✓ Redis connected")
    except Exception as e:
        print(f"⚠ Redis connection failed: {e}")
        redis_client = None

async def close_redis():
    global redis_client
    if redis_client:
        await redis_client.close()

async def get_cached(key: str) -> Optional[Any]:
    if not redis_client:
        return None
    try:
        data = await redis_client.get(key)
        return json.loads(data) if data else None
    except Exception:
        return None

async def set_cached(key: str, data: Any, ttl: int = 300):
    if not redis_client:
        return
    try:
        await redis_client.setex(key, ttl, json.dumps(data, default=str))
    except Exception:
        pass

async def delete_cached(key: str):
    if not redis_client:
        return
    try:
        await redis_client.delete(key)
    except Exception:
        pass

async def clear_cache_pattern(pattern: str):
    if not redis_client:
        return
    try:
        keys = await redis_client.keys(pattern)
        if keys:
            await redis_client.delete(*keys)
    except Exception:
        pass
