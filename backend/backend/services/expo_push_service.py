"""📱 Expo Push API — لإشعارات iOS التي تسجّل توكنات بصيغة ExponentPushToken[...] (Firebase لا يفهمها)"""
import logging
from typing import List, Optional

import httpx

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_BATCH = 100  # الحد الأقصى لرسائل الطلب الواحد في Expo


def is_expo_token(token: str) -> bool:
    return isinstance(token, str) and (token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken["))


async def send_expo_push_to_many(tokens: List[str], title: str, body: str, data: Optional[dict] = None) -> dict:
    if not tokens:
        return {"success": 0, "failure": 0, "failed_details": []}
    messages = [{"to": t, "title": title, "body": body, "sound": "default", "data": data or {}} for t in tokens]
    success, failure, failed_details = 0, 0, []
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            for i in range(0, len(messages), EXPO_BATCH):
                chunk = messages[i:i + EXPO_BATCH]
                response = await client.post(EXPO_PUSH_URL, json=chunk, headers={"Accept": "application/json", "Content-Type": "application/json"})
                result = response.json()
                data_list = result.get("data") or []
                for idx, d in enumerate(data_list):
                    if d.get("status") == "ok":
                        success += 1
                    else:
                        failure += 1
                        tok = chunk[idx]["to"] if idx < len(chunk) else ""
                        err = (d.get("details") or {}).get("error") or d.get("message") or "unknown"
                        logger.error(f"Expo push failed [token={tok[:30]}...] [error={err}]")
                        failed_details.append({"token_preview": tok[:30] + "...", "error_code": err, "error_message": d.get("message", "")})
                if not data_list and result.get("errors"):
                    failure += len(chunk)
                    logger.error(f"Expo push request error: {result['errors']}")
        logger.info(f"Expo push sent: {success} success, {failure} failure")
        return {"success": success, "failure": failure, "failed_details": failed_details}
    except Exception as e:
        logger.error(f"Expo push failed: {e}")
        return {"success": success, "failure": len(tokens) - success, "failed_details": failed_details, "error": str(e)}
