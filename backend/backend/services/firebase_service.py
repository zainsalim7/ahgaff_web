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
                    link="/"
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
    """Send push notification to multiple devices"""
    if not tokens:
        return {"success": 0, "failure": 0}
    
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
    
    try:
        response = messaging.send_each_for_multicast(message)
        logger.info(f"Notifications sent: {response.success_count} success, {response.failure_count} failure")
        return {
            "success": response.success_count,
            "failure": response.failure_count,
        }
    except Exception as e:
        logger.error(f"Failed to send notifications: {e}")
        return {"success": 0, "failure": 0, "error": str(e)}
