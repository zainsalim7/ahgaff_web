# RCA — notifications to large audiences fail (POST /api/notifications/send)

## Scope / important caveat
- The deployer deployment I am scoped to (`schedule-hub-272`, run `63dfb2cd-a4e1-464a-a8f0-e6c13f974df1`) is in status **deleted**.
  - Loki returned **0 log lines** and the production MongoDB is gone (`deployment_deleted`).
  - Therefore I **could NOT** read the real production status code/traceback, the request duration, or the `fcm_tokens` count / Expo-vs-FCM split. Those are **unverifiable** from the current (deleted) deployment.
- What IS verified: the deployed source code of the last successful run, and the behavior of the pinned `firebase_admin==7.2.0` SDK (inspected in an eph sandbox).

## Code read (deployed source, last successful run)
`backend/backend/services/firebase_service.py → send_notification_to_many()`:
- Builds ONE `messaging.MulticastMessage(tokens=<ALL tokens>)` and calls `messaging.send_each_for_multicast(message)`.
- The call is **synchronous/blocking**, invoked **directly inside an `async def`** (no `asyncio.to_thread` / `run_in_executor`) → it blocks the asyncio event loop for the full duration.
- Any exception is swallowed by a broad `except Exception` that returns `{"success":0,"failure":0,"error":...}`.

`backend/backend/routes/notifications.py → send_notification_api()` (role / all / faculty / dept):
- Fetches the target user list, builds an in-app notification per user and `insert_many`s them (e.g. ~1046 docs for a role), then fetches matching `fcm_tokens` and passes **all** of them to `send_notification_to_many` in a single call.

## SDK behavior confirmed in sandbox (firebase_admin==7.2.0)
`_MessagingService.send_each()` (what `send_each_for_multicast` calls):
```python
if len(messages) > 500:
    raise ValueError('messages must not contain more than 500 elements.')
...
with concurrent.futures.ThreadPoolExecutor(max_workers=len(message_data)) as executor:
    responses = list(executor.map(send_data, message_data))
```
Two consequences for large audiences:
1. **Hard 500-token cap.** If the matching token set > 500, `send_each` raises `ValueError('messages must not contain more than 500 elements.')` **before any send**. In this app that ValueError is caught by the broad `except`, so the endpoint returns **HTTP 200** with `{"success":0,"failure":0,"error":...}` and **zero** pushes delivered (silent failure).
2. **Thread explosion.** `max_workers=len(message_data)` spawns **one OS thread per token** (up to 500), each opening a TLS request to FCM — all at once, on the event-loop thread's process.

## Why single works but bulk fails
- Single teacher/student = 1 token = 1 thread, finishes instantly → works.
- Large audience (role ≈1046 users, all / faculty / dept) = many tokens:
  - The deployment runs on **tier_0**: CPU throttled to **250m** (¼ core), memory limit **512Mi**.
  - Spawning hundreds of threads + hundreds of concurrent HTTPS buffers, on top of the ~1046-doc `insert_many` and two full user-list reads, on a 512Mi / ¼-core pod, is very likely to **OOMKill the pod** or hit **"can't start new thread"**, and in any case the blocking call on ¼ core easily exceeds the ingress request timeout.
  - When the pod is killed / the request times out at the gateway, the client gets a **502/504 / dropped connection with no JSON `detail`** — exactly the generic UI error `فشل إرسال الإشعار`. (A caught exception would instead return HTTP 200, so the user-visible HTTP error points at a process/timeout failure, not the caught path.)

## Primary vs secondary failure modes
- **Primary (produces the HTTP error / timeout the user sees):** blocking `send_each_for_multicast` with `max_workers=len(tokens)` threads on tier_0 → OOM / gateway timeout / dropped connection.
- **Secondary (silent, biggest audiences):** >500 matching tokens → SDK `ValueError` caught → HTTP 200 but 0 delivered.
- These are not mutually exclusive; which one a given send hits depends on the token count (unverifiable now because the DB is deleted).

## Extra finding — code mismatch
The task description says the code sends Expo pushes sequentially in batches of 100 and handles `ExponentPushToken`. The **deployed** `firebase_service.py` has **no Expo/ExponentPushToken handling at all** — everything goes through FCM `MulticastMessage`. If the production `fcm_tokens` collection actually stores Expo tokens (`ExponentPushToken[...]`), FCM treats them as invalid registration tokens → per-token failures (failure_count), not an exception. Worth confirming once a live DB exists.

## Suggested fix (backend — E1 to apply)
In `backend/backend/services/firebase_service.py → send_notification_to_many`:
1. **Chunk** tokens into batches of **≤500** (recommend ~100) and loop, accumulating `success`/`failure` — never pass the full list in one call (fixes the 500-cap silent failure).
2. **Offload** the blocking `messaging.send_each_for_multicast` to a worker thread via `await asyncio.to_thread(...)` / `run_in_executor` so it does not block the event loop. With chunk size ~100 the SDK's `max_workers=len(chunk)` stays bounded (~100 threads/chunk instead of hundreds-at-once).
3. (Recommended) In `routes/notifications.py`, move the push send into a FastAPI **BackgroundTask** so the HTTP request returns immediately regardless of audience size — the in-app `notifications`/`notification_history` writes are the authoritative record.
4. If the `fcm_tokens` collection stores Expo tokens, split `ExponentPushToken[...]` out and send them via the Expo push API (batches of 100) instead of FCM.

## Suggested action (user)
- These large sends are memory/CPU-heavy; **tier_0 (512Mi / 250m)** is marginal. After the code fix, if large audiences remain, raise the tier (Deployment Panel → Resources). Only the user can do this.

## Verified vs inferred
- Verified: deployed source behavior; `firebase_admin==7.2.0` `send_each` 500-cap + `max_workers=len(tokens)` (sandbox inspection); tier_0 = 512Mi/250m.
- Inferred (could NOT verify — deployment deleted, no logs/DB): the exact production status code, the request duration, the actual `fcm_tokens` count, and the Expo-vs-FCM token split. The OOM/timeout conclusion is reasoned from the code path + tier limits, not reproduced (sandbox has no FCM creds, no prod tokens, and more memory than tier_0).
