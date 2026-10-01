# TickAi Inbox (Flutter)

Native iOS/Android client for the TickAi WhatsApp panel. v1 is deliberately
scoped to the inbox — the part of the product people need on a phone.

- Sign in, with the session surviving restarts
- Conversation list: unread badges, last message, pull to refresh
- Chat thread: history, send, delivery/read ticks, realtime updates
- Live updates over Socket.IO, folded into the list without refetching

## Running it

```bash
cd mobile
flutter run                                   # against https://tickai.app
flutter run --dart-define=TICKAI_BASE_URL=http://192.168.1.20:3000   # local server
```

A device cannot reach `localhost`, so a local backend needs the machine's LAN
address. On the Android emulator that address is `10.0.2.2`.

### Prerequisites beyond `flutter`

- **iOS**: CocoaPods (`brew install cocoapods`). Without it the native plugins
  (secure storage) will not link.
- **Android**: accept the SDK licences once — `flutter doctor --android-licenses`.

## How auth works

The web panel uses a session cookie that expires 24h after login and is never
refreshed. That would sign a phone out daily, so the app uses the token
endpoints instead:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/token` | credentials → access + refresh token |
| `POST /api/auth/token/refresh` | spend a refresh token for a new pair |
| `POST /api/auth/token/revoke` | sign out this device, or all of them |

Access tokens last 15 minutes; refresh tokens 60 days and **rotate on every
use**. Two consequences shape the client:

1. `ApiClient` collapses concurrent refreshes into one request. Without that,
   several widgets fetching at once would each refresh, and the later ones
   would present an already-spent token — which the server treats as a replay
   and answers by signing every device out.
2. A refresh that fails because the *network* is down must not sign the user
   out; only a 401/403 from the server does. Both are covered by tests.

Tokens live in the platform keychain/keystore, never in SharedPreferences.

## Layout

```
lib/
  core/
    config.dart          base URL, via --dart-define
    token_store.dart     keychain-backed tokens
    api_client.dart      Dio + auth header + transparent refresh
    socket_service.dart  Socket.IO, events normalised
    providers.dart       Riverpod wiring
  models/models.dart     Conversation, Message
  features/
    auth/                controller + login screen
    inbox/               repository, controllers, list + chat screens
```

Riverpod 3 removed `StateNotifier`, so controllers extend `Notifier` and read
dependencies off `ref`. Riverpod 3 also only exposes a family argument to
*generated* notifiers, so the chat controller is a single notifier the screen
`open()`s rather than a provider family — a phone shows one thread at a time.

## Tests

```bash
flutter test
```

Covers the defensive JSON parsing (the API returns both camelCase and
snake_case, and counts sometimes arrive as strings) and the refresh logic,
including the single-flight behaviour and the network-vs-auth distinction.

## Not in v1

Campaigns, contacts, templates, flows, analytics, and push notifications.
Push needs backend work: `firebase_config` and `users.fcm_token` exist in the
schema, but nothing registers a device token yet.
