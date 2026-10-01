import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/auth/auth_controller.dart';
import '../features/inbox/inbox_repository.dart';
import 'api_client.dart';
import 'push_service.dart';
import 'socket_service.dart';
import 'token_store.dart';

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());

final apiClientProvider = Provider<ApiClient>((ref) {
  final api = ApiClient(tokens: ref.watch(tokenStoreProvider));
  // Wired after construction: the client needs to tell the auth controller the
  // session is gone, and the controller needs the client to make requests.
  api.onSessionExpired = () => ref.read(authControllerProvider.notifier).onSessionExpired();
  return api;
});

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);

final socketServiceProvider = Provider<SocketService>((ref) {
  final socket = SocketService(tokens: ref.watch(tokenStoreProvider));
  ref.onDispose(socket.dispose);
  return socket;
});

final pushServiceProvider = Provider<PushService>(
  (ref) => PushService(ref.watch(apiClientProvider)),
);

final inboxRepositoryProvider = Provider<InboxRepository>(
  (ref) => InboxRepository(ref.watch(apiClientProvider)),
);
