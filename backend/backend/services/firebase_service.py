import firebase_admin
from firebase_admin import credentials, messaging
import os
import json
import logging

logger = logging.getLogger(__name__)

_firebase_initialized = False

def init_firebase():
    global _firebase_initialized
    if _firebase_initialized or firebase_admin._apps:
        return
    
    cred = None
    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "")
    if sa_json:
        try:
            sa_dict = json.loads(sa_json)
            cred = credentials.Certificate(sa_dict)
            logger.info("Firebase: loaded from FIREBASE_SERVICE_ACCOUNT_JSON env var")
        except Exception as e:
            logger.error(f"Firebase: failed to parse JSON env var: {e}")
    
    if not cred:
        sa_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH", "")
        if sa_path and os.path.exists(sa_path):
            cred = credentials.Certificate(sa_path)
            logger.info(f"Firebase: loaded from file {sa_path}")
    
    if cred:
        firebase_admin.initialize_app(cred)
        _firebase_initialized = True
        logger.info("Firebase Admin SDK initialized successfully")
    else:
        logger.warning("Firebase: no credentials found")


async def send_notification(token: str, title: str, body: str, data: dict = None):
    """Send push notification to a single device"""
    try:
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            data=data or {},
            token=token,
            android=messaging.AndroidConfig(
                priority='high',
                notification=messaging.AndroidNotification(
                    title=title,
                    body=body,
                    icon='ic_notification',
                    color='#1b5e20',
                    channel_id='default',
                    sound='default',
                    priority='high',
                    default_sound=True,
                    default_vibrate_timings=True,
                    visibility='public',
                ),
            ),
            webpush=messaging.WebpushConfig(
                notification=messaging.WebpushNotification(
                    title=title,
                    body=body,
                    icon="/icon.png",
                    badge="/icon.png",
                ),
                fcm_options=messaging.WebpushFCMOptions(
                    link="https://app.ahgaff.net/"
                ),
            ),
        )
        response = messaging.send(message)
        logger.info(f"Notification sent: {response}")
        return response
    except messaging.UnregisteredError:
        logger.warning(f"Token unregistered, should remove: {token[:20]}...")
        return None
    except Exception as e:
        logger.error(f"Failed to send notification: {e}")
        return None


async def send_notification_to_many(tokens: list, title: str, body: str, data: dict = None):
    """Send push notification to multiple devices.
    🤖 أندرويد (FCM) بنفس المسار القديم دون تغيير · 🍎 iOS بتوكنات ExponentPushToken → Expo Push API"""
    if not tokens:
        return {"success": 0, "failure": 0}

    from services.expo_push_service import is_expo_token, send_expo_push_to_many
    expo_tokens = [t for t in tokens if is_expo_token(t)]
    tokens = [t for t in tokens if not is_expo_token(t)]

    expo_result = {"success": 0, "failure": 0, "failed_details": []}
    if expo_tokens:
        try:
            expo_result = await send_expo_push_to_many(expo_tokens, title, body, data)
        except Exception as e:
            logger.error(f"Expo push failed: {e}")
            expo_result = {"success": 0, "failure": len(expo_tokens), "failed_details": [], "error": str(e)}
    if not tokens:
        return expo_result

    import asyncio
    ok, bad, failed_details, errors = 0, 0, [], []
    all_tokens = tokens
    for i in range(0, len(all_tokens), FCM_BATCH):
        tokens = all_tokens[i:i + FCM_BATCH]
        try:
            r = await asyncio.to_thread(_send_fcm_chunk, tokens, title, body, data)
        except Exception as e:
            logger.error(f"Failed to send notifications chunk: {e}")
            bad += len(tokens)
            errors.append(str(e))
            continue
        ok += r["success"]
        bad += r["failure"]
        failed_details += r["failed_details"]
    out = {"success": ok + expo_result["success"], "failure": bad + expo_result["failure"],
           "failed_details": failed_details + expo_result.get("failed_details", [])}
    if errors:
        out["error"] = errors[0]
    return out


FCM_BATCH = 500  # حد FCM لكل MulticastMessage


def _send_fcm_chunk(tokens: list, title: str, body: str, data: dict = None) -> dict:
    message = messaging.MulticastMessage(
        notification=messaging.Notification(
            title=title,
            body=body,
        ),
        data=data or {},
        tokens=tokens,
        android=messaging.AndroidConfig(
            priority='high',
            notification=messaging.AndroidNotification(
                title=title,
                body=body,
                icon='ic_notification',
                color='#1b5e20',
                channel_id='default',
                sound='default',
                priority='high',
                default_sound=True,
                default_vibrate_timings=True,
                visibility='public',
            ),
        ),
        webpush=messaging.WebpushConfig(
            notification=messaging.WebpushNotification(
                title=title,
                body=body,
                icon="/icon.png",
            ),
        ),
    )
    
    response = messaging.send_each_for_multicast(message)
    logger.info(f"Notifications sent: {response.success_count} success, {response.failure_count} failure")
    failed_details = []
    for idx, resp in enumerate(response.responses):
        if not resp.success:
            token_preview = tokens[idx][:30] + '...' if len(tokens[idx]) > 30 else tokens[idx]
            exc = resp.exception
            err_code = getattr(exc, 'code', None) or type(exc).__name__
            logger.error(f"FCM send failed [token={token_preview}] [code={err_code}] [msg={exc}]")
            failed_details.append({"token_preview": token_preview, "error_code": err_code, "error_message": str(exc)})
    return {"success": response.success_count, "failure": response.failure_count, "failed_details": failed_details}
