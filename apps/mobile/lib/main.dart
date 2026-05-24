import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // Local dev builds run before Firebase config files are added.
  }
  runApp(const ProviderScope(child: KhidmatApp()));
}

const _storage = FlutterSecureStorage();
const _defaultApiBaseUrl = 'http://10.0.2.2:4000/api/v1';

final apiBaseUrlProvider = StateProvider<String>((ref) => _defaultApiBaseUrl);

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>((ref) {
  return AuthController(ref);
});

final authDioProvider = Provider<Dio>((ref) {
  return Dio(
    BaseOptions(
      baseUrl: ref.watch(apiBaseUrlProvider),
      connectTimeout: const Duration(seconds: 8),
      receiveTimeout: const Duration(seconds: 8),
    ),
  );
});

final dioProvider = Provider<Dio>((ref) {
  final baseUrl = ref.watch(apiBaseUrlProvider);
  ref.watch(authControllerProvider.select((state) => state.accessToken));
  final dio = Dio(
    BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 8),
      receiveTimeout: const Duration(seconds: 8),
    ),
  );

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        final token = ref.read(authControllerProvider).accessToken;
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        final refreshToken = ref.read(authControllerProvider).refreshToken;
        if (error.response?.statusCode != 401 || refreshToken == null) {
          handler.next(error);
          return;
        }

        try {
          final refreshDio = Dio(BaseOptions(baseUrl: baseUrl));
          final response = await refreshDio.post<Map<String, dynamic>>(
            '/auth/refresh',
            data: {'refreshToken': refreshToken},
          );
          final payload = response.data?['data'] as Map<String, dynamic>?;
          await ref.read(authControllerProvider.notifier).saveAuthPayload(payload);
          final request = error.requestOptions;
          request.headers['Authorization'] = 'Bearer ${ref.read(authControllerProvider).accessToken}';
          final retryResponse = await dio.fetch<dynamic>(request);
          handler.resolve(retryResponse);
        } catch (_) {
          await ref.read(authControllerProvider.notifier).logout();
          handler.next(error);
        }
      },
    ),
  );

  return dio;
});

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authControllerProvider);
  return GoRouter(
    initialLocation: '/auth',
    redirect: (context, state) {
      final isAuthRoute = state.matchedLocation == '/auth';
      if (!auth.isSignedIn && !isAuthRoute) {
        return '/auth';
      }
      if (auth.isSignedIn && isAuthRoute) {
        return '/home';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/auth', builder: (context, state) => const AuthScreen()),
      ShellRoute(
        builder: (context, state, child) => MainShell(child: child),
        routes: [
          GoRoute(path: '/home', builder: (context, state) => const HomeScreen()),
          GoRoute(path: '/bookings', builder: (context, state) => const BookingsScreen()),
          GoRoute(path: '/jobs', builder: (context, state) => const JobPostsScreen()),
          GoRoute(path: '/notifications', builder: (context, state) => const NotificationsScreen()),
          GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen()),
        ],
      ),
      GoRoute(
        path: '/providers/:id',
        builder: (context, state) => ProviderProfileScreen(providerId: state.pathParameters['id'] ?? ''),
      ),
      GoRoute(
        path: '/book/:id',
        builder: (context, state) => DirectBookingScreen(providerId: state.pathParameters['id'] ?? ''),
      ),
      GoRoute(
        path: '/chat/:bookingId',
        builder: (context, state) => ChatScreen(bookingId: state.pathParameters['bookingId'] ?? ''),
      ),
      GoRoute(path: '/provider/dashboard', builder: (context, state) => const ProviderDashboardScreen()),
      GoRoute(path: '/provider/onboarding', builder: (context, state) => const ProviderOnboardingScreen()),
    ],
  );
});

class KhidmatApp extends ConsumerWidget {
  const KhidmatApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'KhidmatApp',
      debugShowCheckedModeBanner: false,
      routerConfig: ref.watch(routerProvider),
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0F766E)),
        useMaterial3: true,
        inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
        cardTheme: const CardThemeData(margin: EdgeInsets.zero),
      ),
    );
  }
}

class AuthState {
  const AuthState({
    this.user,
    this.accessToken,
    this.refreshToken,
    this.message = 'Not signed in',
  });

  final Map<String, dynamic>? user;
  final String? accessToken;
  final String? refreshToken;
  final String message;

  bool get isSignedIn => accessToken != null;
  String get role => user?['role']?.toString() ?? 'CUSTOMER';
  String get phone => user?['phone']?.toString() ?? '';

  AuthState copyWith({
    Map<String, dynamic>? user,
    String? accessToken,
    String? refreshToken,
    String? message,
    bool clear = false,
  }) {
    if (clear) {
      return const AuthState(message: 'Signed out');
    }
    return AuthState(
      user: user ?? this.user,
      accessToken: accessToken ?? this.accessToken,
      refreshToken: refreshToken ?? this.refreshToken,
      message: message ?? this.message,
    );
  }
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this.ref) : super(const AuthState());

  final Ref ref;

  Future<void> saveAuthPayload(Map<String, dynamic>? payload) async {
    final user = payload?['user'] as Map<String, dynamic>?;
    final tokens = payload?['tokens'] as Map<String, dynamic>?;
    final accessToken = tokens?['accessToken']?.toString();
    final refreshToken = tokens?['refreshToken']?.toString();
    if (accessToken == null || refreshToken == null || user == null) {
      throw StateError('Missing auth payload');
    }
    await _storage.write(key: 'accessToken', value: accessToken);
    await _storage.write(key: 'refreshToken', value: refreshToken);
    state = AuthState(
      user: user,
      accessToken: accessToken,
      refreshToken: refreshToken,
      message: 'Signed in as ${user['role']}',
    );
    await _registerFcmToken();
  }

  Future<void> loginWithOtp(String phone, String otp) async {
    final dio = ref.read(authDioProvider);
    await dio.post<Map<String, dynamic>>('/auth/otp/send', data: {'phone': phone});
    final response = await dio.post<Map<String, dynamic>>(
      '/auth/otp/verify',
      data: {'phone': phone, 'code': otp},
    );
    await saveAuthPayload(response.data?['data'] as Map<String, dynamic>?);
  }

  Future<void> register({
    required String phone,
    required String role,
    required String name,
    required String city,
    String? email,
    String? password,
  }) async {
    final dio = ref.read(authDioProvider);
    final response = await dio.post<Map<String, dynamic>>(
      '/auth/register',
      data: {
        'phone': phone,
        'role': role,
        'city': city,
        if (role == 'CUSTOMER') 'fullName': name,
        if (role == 'PROVIDER') 'displayName': name,
        if (email != null && email.isNotEmpty) 'email': email,
        if (password != null && password.isNotEmpty) 'password': password,
      },
    );
    await saveAuthPayload(response.data?['data'] as Map<String, dynamic>?);
  }

  Future<void> logout() async {
    final refreshToken = state.refreshToken;
    final accessToken = state.accessToken;
    try {
      if (refreshToken != null) {
        await ref.read(authDioProvider).post<Map<String, dynamic>>(
              '/auth/logout',
              data: {'refreshToken': refreshToken},
              options: Options(headers: accessToken == null ? null : {'Authorization': 'Bearer $accessToken'}),
            );
      }
    } catch (_) {
      // A logout should clear the device even if the API is offline.
    }
    await _storage.deleteAll();
    state = state.copyWith(clear: true);
  }

  Future<void> _registerFcmToken() async {
    try {
      final messaging = FirebaseMessaging.instance;
      final token = await messaging.getToken();
      if (token != null) {
        await ref.read(authDioProvider).post<Map<String, dynamic>>(
              '/notifications/device-tokens',
              data: {'token': token, 'platform': 'android'},
              options: Options(headers: {'Authorization': 'Bearer ${state.accessToken}'}),
            );
      }
    } catch (_) {
      // Firebase config is optional while the product is under local development.
    }
  }
}

Future<T> apiData<T>(Future<Response<Map<String, dynamic>>> request, T fallback) async {
  final response = await request;
  return (response.data?['data'] as T?) ?? fallback;
}

String apiError(Object error) {
  if (error is DioException) {
    final body = error.response?.data;
    if (body is Map<String, dynamic>) {
      return body['message']?.toString() ?? error.message ?? 'Request failed';
    }
    return error.message ?? 'Request failed';
  }
  return error.toString();
}

List<Map<String, dynamic>> listFrom(dynamic value, String key) {
  if (value is Map<String, dynamic>) {
    final list = value[key];
    if (list is List) {
      return list.whereType<Map<String, dynamic>>().toList();
    }
  }
  if (value is List) {
    return value.whereType<Map<String, dynamic>>().toList();
  }
  return [];
}

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  final _apiController = TextEditingController(text: _defaultApiBaseUrl);
  final _phoneController = TextEditingController(text: '+923001234567');
  final _otpController = TextEditingController(text: '123456');
  final _nameController = TextEditingController(text: 'Khidmat User');
  final _cityController = TextEditingController(text: 'Mardan');
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController(text: 'password123');
  bool _isRegistering = false;
  bool _loading = false;
  String _role = 'CUSTOMER';
  String _message = 'Use 123456 for local OTP testing.';

  @override
  void dispose() {
    _apiController.dispose();
    _phoneController.dispose();
    _otpController.dispose();
    _nameController.dispose();
    _cityController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _message = 'Working...';
    });
    ref.read(apiBaseUrlProvider.notifier).state = _apiController.text.trim();

    try {
      if (_isRegistering) {
        await ref.read(authControllerProvider.notifier).register(
              phone: _phoneController.text.trim(),
              role: _role,
              name: _nameController.text.trim(),
              city: _cityController.text.trim(),
              email: _emailController.text.trim(),
              password: _passwordController.text.trim(),
            );
      } else {
        await ref.read(authControllerProvider.notifier).loginWithOtp(
              _phoneController.text.trim(),
              _otpController.text.trim(),
            );
      }
      setState(() => _message = ref.read(authControllerProvider).message);
    } catch (error) {
      setState(() => _message = apiError(error));
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('KhidmatApp')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Apka Bharosa, Hamare Haath', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 16),
            TextField(
              controller: _apiController,
              decoration: const InputDecoration(labelText: 'API base URL', prefixIcon: Icon(Icons.link)),
              keyboardType: TextInputType.url,
            ),
            const SizedBox(height: 12),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'CUSTOMER', icon: Icon(Icons.person_outline), label: Text('Customer')),
                ButtonSegment(value: 'PROVIDER', icon: Icon(Icons.handyman_outlined), label: Text('Provider')),
              ],
              selected: {_role},
              onSelectionChanged: (value) => setState(() => _role = value.first),
            ),
            const SizedBox(height: 12),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _isRegistering,
              onChanged: (value) => setState(() => _isRegistering = value),
              title: const Text('Create account'),
            ),
            TextField(
              controller: _phoneController,
              decoration: const InputDecoration(labelText: 'Phone', prefixIcon: Icon(Icons.phone_outlined)),
              keyboardType: TextInputType.phone,
            ),
            const SizedBox(height: 12),
            if (!_isRegistering)
              TextField(
                controller: _otpController,
                decoration: const InputDecoration(labelText: 'OTP', prefixIcon: Icon(Icons.password_outlined)),
                keyboardType: TextInputType.number,
              )
            else ...[
              TextField(controller: _nameController, decoration: const InputDecoration(labelText: 'Name')),
              const SizedBox(height: 12),
              TextField(controller: _cityController, decoration: const InputDecoration(labelText: 'City')),
              const SizedBox(height: 12),
              TextField(controller: _emailController, decoration: const InputDecoration(labelText: 'Email optional')),
              const SizedBox(height: 12),
              TextField(
                controller: _passwordController,
                decoration: const InputDecoration(labelText: 'Password optional'),
                obscureText: true,
              ),
            ],
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _loading ? null : _submit,
              icon: _loading
                  ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.login),
              label: Text(_isRegistering ? 'Create Account' : 'Sign In'),
            ),
            const SizedBox(height: 12),
            InfoPanel(icon: Icons.verified_user_outlined, title: 'Auth', value: _message),
          ],
        ),
      ),
    );
  }
}

class MainShell extends ConsumerWidget {
  const MainShell({required this.child, super.key});

  final Widget child;

  int _index(String location) {
    if (location.startsWith('/bookings')) return 1;
    if (location.startsWith('/jobs')) return 2;
    if (location.startsWith('/notifications')) return 3;
    if (location.startsWith('/profile')) return 4;
    return 0;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).uri.toString();
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index(location),
        onDestinationSelected: (index) {
          final routes = ['/home', '/bookings', '/jobs', '/notifications', '/profile'];
          context.go(routes[index]);
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(
              icon: Icon(Icons.assignment_outlined), selectedIcon: Icon(Icons.assignment), label: 'Bookings'),
          NavigationDestination(icon: Icon(Icons.work_outline), selectedIcon: Icon(Icons.work), label: 'Jobs'),
          NavigationDestination(
              icon: Icon(Icons.notifications_outlined), selectedIcon: Icon(Icons.notifications), label: 'Alerts'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final _searchController = TextEditingController();
  final _cityController = TextEditingController(text: 'Mardan');
  bool _loading = true;
  String _health = 'Checking backend...';
  String _message = '';
  List<Map<String, dynamic>> _providers = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _searchController.dispose();
    _cityController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final dio = ref.read(dioProvider);
      final health = await apiData<Map<String, dynamic>>(dio.get<Map<String, dynamic>>('/health'), {});
      final providerData = await apiData<Map<String, dynamic>>(
        dio.get<Map<String, dynamic>>(
          '/providers',
          queryParameters: {
            'city': _cityController.text.trim(),
            if (_searchController.text.trim().isNotEmpty) 'category': _searchController.text.trim(),
          },
        ),
        {},
      );
      setState(() {
        _health =
            'API ${health['status'] ?? 'ok'} | DB ${health['dbStatus'] ?? 'unknown'} | Redis ${health['redisStatus'] ?? 'unknown'}';
        _providers = listFrom(providerData, 'providers');
        _message =
            _providers.isEmpty ? 'No verified providers found yet. Approve providers from admin after onboarding.' : '';
      });
    } catch (error) {
      setState(() => _message = apiError(error));
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('KhidmatApp'),
        actions: [
          IconButton(onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh), tooltip: 'Refresh'),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('Find trusted help near you', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              InfoPanel(icon: Icons.cloud_done_outlined, title: 'Backend', value: _health),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _searchController,
                      decoration: const InputDecoration(labelText: 'Category', prefixIcon: Icon(Icons.search)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _cityController,
                      decoration:
                          const InputDecoration(labelText: 'City', prefixIcon: Icon(Icons.location_city_outlined)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                  onPressed: _loading ? null : _load,
                  icon: const Icon(Icons.manage_search),
                  label: const Text('Search')),
              if (_message.isNotEmpty) ...[
                const SizedBox(height: 12),
                InfoPanel(icon: Icons.info_outline, title: 'Status', value: _message),
              ],
              const SizedBox(height: 16),
              ..._providers.map((provider) => ProviderCard(provider: provider)),
            ],
          ),
        ),
      ),
    );
  }
}

class ProviderCard extends StatelessWidget {
  const ProviderCard({required this.provider, super.key});

  final Map<String, dynamic> provider;

  @override
  Widget build(BuildContext context) {
    final services = listFrom(provider['services'], '');
    final serviceText = services.map((item) => item['categoryName']).whereType<String>().take(2).join(', ');
    return Card(
      child: ListTile(
        leading: CircleAvatar(child: Text((provider['displayName']?.toString() ?? 'P').characters.first)),
        title: Text(provider['displayName']?.toString() ?? 'Provider'),
        subtitle: Text('${provider['city'] ?? 'Mardan'} | ${serviceText.isEmpty ? 'General service' : serviceText}'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push('/providers/${provider['id']}'),
      ),
    );
  }
}

class ProviderProfileScreen extends ConsumerStatefulWidget {
  const ProviderProfileScreen({required this.providerId, super.key});

  final String providerId;

  @override
  ConsumerState<ProviderProfileScreen> createState() => _ProviderProfileScreenState();
}

class _ProviderProfileScreenState extends ConsumerState<ProviderProfileScreen> {
  Map<String, dynamic>? _provider;
  List<Map<String, dynamic>> _reviews = [];
  String _message = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final dio = ref.read(dioProvider);
      final provider =
          await apiData<Map<String, dynamic>>(dio.get<Map<String, dynamic>>('/providers/${widget.providerId}'), {});
      final reviews = await apiData<Map<String, dynamic>>(
          dio.get<Map<String, dynamic>>('/providers/${widget.providerId}/reviews'), {});
      setState(() {
        _provider = provider;
        _reviews = listFrom(reviews, 'reviews');
      });
    } catch (error) {
      setState(() => _message = apiError(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = _provider;
    return Scaffold(
      appBar: AppBar(title: const Text('Provider')),
      body: SafeArea(
        child: provider == null
            ? Center(child: Text(_message.isEmpty ? 'Loading...' : _message))
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text(provider['displayName']?.toString() ?? 'Provider',
                      style: Theme.of(context).textTheme.headlineSmall),
                  Text(
                      '${provider['city'] ?? 'Mardan'} | ${provider['averageRating'] ?? 0} rating | ${provider['completedJobs'] ?? 0} jobs'),
                  const SizedBox(height: 12),
                  Text(provider['bio']?.toString() ?? 'No bio yet.'),
                  const SizedBox(height: 16),
                  SizedBox(
                    height: 180,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: GoogleMap(
                        initialCameraPosition: const CameraPosition(target: LatLng(34.1986, 72.0404), zoom: 12),
                        markers: {
                          const Marker(markerId: MarkerId('provider'), position: LatLng(34.1986, 72.0404)),
                        },
                        myLocationButtonEnabled: false,
                        zoomControlsEnabled: false,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: () => context.push('/book/${provider['id']}'),
                    icon: const Icon(Icons.calendar_month_outlined),
                    label: const Text('Book Service'),
                  ),
                  const SizedBox(height: 16),
                  Text('Services', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  ...listFrom(provider['services'], '').map(
                    (service) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(service['categoryName']?.toString() ?? 'Service'),
                      subtitle: Text('PKR ${service['priceRangeMin']} - ${service['priceRangeMax']}'),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text('Reviews', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  if (_reviews.isEmpty) const Text('No reviews yet.'),
                  ..._reviews.map((review) => InfoPanel(
                      icon: Icons.star_outline,
                      title: '${review['rating'] ?? 0} stars',
                      value: review['comment']?.toString() ?? '')),
                ],
              ),
      ),
    );
  }
}

class DirectBookingScreen extends ConsumerStatefulWidget {
  const DirectBookingScreen({required this.providerId, super.key});

  final String providerId;

  @override
  ConsumerState<DirectBookingScreen> createState() => _DirectBookingScreenState();
}

class _DirectBookingScreenState extends ConsumerState<DirectBookingScreen> {
  final _descriptionController = TextEditingController(text: 'Need service at my home in Mardan.');
  final _amountController = TextEditingController(text: '1500');
  Map<String, dynamic>? _provider;
  bool _loading = false;
  String _message = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadProvider());
  }

  @override
  void dispose() {
    _descriptionController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _loadProvider() async {
    try {
      final provider = await apiData<Map<String, dynamic>>(
        ref.read(dioProvider).get<Map<String, dynamic>>('/providers/${widget.providerId}'),
        {},
      );
      setState(() => _provider = provider);
    } catch (error) {
      setState(() => _message = apiError(error));
    }
  }

  Future<void> _create() async {
    final services = listFrom(_provider?['services'], '');
    final categoryId = services.isEmpty ? null : services.first['categoryId']?.toString();
    if (categoryId == null) {
      setState(() => _message = 'Provider has no service category yet.');
      return;
    }
    setState(() => _loading = true);
    try {
      final booking = await apiData<Map<String, dynamic>>(
        ref.read(dioProvider).post<Map<String, dynamic>>(
          '/bookings',
          data: {
            'providerId': widget.providerId,
            'categoryId': categoryId,
            'description': _descriptionController.text.trim(),
            'totalAmount': int.tryParse(_amountController.text.trim()) ?? 0,
          },
        ),
        {},
      );
      setState(() => _message = 'Booking created: ${booking['status'] ?? 'pending'}');
      if (mounted) {
        context.go('/bookings');
      }
    } catch (error) {
      setState(() => _message = apiError(error));
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Direct Booking')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(_provider?['displayName']?.toString() ?? 'Loading provider...',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            TextField(
                controller: _descriptionController,
                decoration: const InputDecoration(labelText: 'Work description'),
                maxLines: 4),
            const SizedBox(height: 12),
            TextField(
                controller: _amountController,
                decoration: const InputDecoration(labelText: 'Expected amount'),
                keyboardType: TextInputType.number),
            const SizedBox(height: 16),
            FilledButton.icon(
                onPressed: _loading ? null : _create,
                icon: const Icon(Icons.send_outlined),
                label: const Text('Send Booking Request')),
            if (_message.isNotEmpty) ...[
              const SizedBox(height: 12),
              InfoPanel(icon: Icons.info_outline, title: 'Booking', value: _message),
            ],
          ],
        ),
      ),
    );
  }
}

class BookingsScreen extends ConsumerStatefulWidget {
  const BookingsScreen({super.key});

  @override
  ConsumerState<BookingsScreen> createState() => _BookingsScreenState();
}

class _BookingsScreenState extends ConsumerState<BookingsScreen> {
  List<Map<String, dynamic>> _bookings = [];
  String _message = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final data =
          await apiData<Map<String, dynamic>>(ref.read(dioProvider).get<Map<String, dynamic>>('/bookings'), {});
      setState(() {
        _bookings = listFrom(data, 'bookings');
        _message = _bookings.isEmpty ? 'No bookings yet.' : '';
      });
    } catch (error) {
      setState(() => _message = apiError(error));
    }
  }

  Future<void> _patch(String id, String action, [Map<String, dynamic>? body]) async {
    try {
      await ref.read(dioProvider).patch<Map<String, dynamic>>('/bookings/$id/$action', data: body ?? {});
      await _load();
    } catch (error) {
      setState(() => _message = apiError(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final role = ref.watch(authControllerProvider).role;
    return Scaffold(
      appBar: AppBar(
          title: const Text('My Bookings'), actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_message.isNotEmpty) InfoPanel(icon: Icons.info_outline, title: 'Bookings', value: _message),
            ..._bookings.map(
              (booking) => Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(booking['categoryName']?.toString() ?? 'Booking',
                          style: Theme.of(context).textTheme.titleMedium),
                      Text('${booking['status']} | PKR ${booking['totalAmount'] ?? 0}'),
                      const SizedBox(height: 8),
                      Text(booking['description']?.toString() ?? ''),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          OutlinedButton.icon(
                            onPressed: () => context.push('/chat/${booking['id']}'),
                            icon: const Icon(Icons.chat_bubble_outline),
                            label: const Text('Chat'),
                          ),
                          if (role == 'PROVIDER') ...[
                            OutlinedButton(
                                onPressed: () => _patch(booking['id'].toString(), 'confirm'),
                                child: const Text('Confirm')),
                            OutlinedButton(
                                onPressed: () => _patch(booking['id'].toString(), 'start'), child: const Text('Start')),
                            OutlinedButton(
                              onPressed: () => _patch(booking['id'].toString(), 'complete', {
                                'proofPhotoUrls': ['https://example.com/proof.jpg'],
                                'totalAmount': booking['totalAmount'] ?? 0,
                              }),
                              child: const Text('Complete'),
                            ),
                          ],
                          OutlinedButton(
                            onPressed: () => _patch(booking['id'].toString(), 'cancel',
                                {'cancellationReason': 'Cancelled from mobile app'}),
                            child: const Text('Cancel'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class JobPostsScreen extends ConsumerStatefulWidget {
  const JobPostsScreen({super.key});

  @override
  ConsumerState<JobPostsScreen> createState() => _JobPostsScreenState();
}

class _JobPostsScreenState extends ConsumerState<JobPostsScreen> {
  final _titleController = TextEditingController(text: 'Need plumber today');
  final _descriptionController = TextEditingController(text: 'Tap leakage repair required in Mardan.');
  final _categoryController = TextEditingController();
  final _budgetMinController = TextEditingController(text: '1000');
  final _budgetMaxController = TextEditingController(text: '3000');
  List<Map<String, dynamic>> _jobs = [];
  String _message = '';

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _categoryController.dispose();
    _budgetMinController.dispose();
    _budgetMaxController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data =
          await apiData<Map<String, dynamic>>(ref.read(dioProvider).get<Map<String, dynamic>>('/job-posts'), {});
      setState(() {
        _jobs = listFrom(data, 'jobPosts');
        _message = _jobs.isEmpty ? 'No open job posts yet.' : '';
      });
    } catch (error) {
      setState(() => _message = apiError(error));
    }
  }

  Future<void> _create() async {
    try {
      await ref.read(dioProvider).post<Map<String, dynamic>>(
        '/job-posts',
        data: {
          'title': _titleController.text.trim(),
          'description': _descriptionController.text.trim(),
          'categoryId': _categoryController.text.trim(),
          'budgetMin': int.tryParse(_budgetMinController.text.trim()) ?? 0,
          'budgetMax': int.tryParse(_budgetMaxController.text.trim()) ?? 0,
          'photoUrls': <String>[],
        },
      );
      setState(() => _message = 'Job post created.');
    } catch (error) {
      setState(() => _message = apiError(error));
    }
  }

  Future<void> _apply(String id) async {
    try {
      await ref.read(dioProvider).post<Map<String, dynamic>>(
        '/job-posts/$id/apply',
        data: {'quote': 2000, 'message': 'I can do this job today.'},
      );
      setState(() => _message = 'Application sent.');
    } catch (error) {
      setState(() => _message = apiError(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final role = ref.watch(authControllerProvider).role;
    return Scaffold(
      appBar:
          AppBar(title: const Text('Jobs'), actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (role == 'CUSTOMER') ...[
              Text('Create Job Post', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              TextField(controller: _titleController, decoration: const InputDecoration(labelText: 'Title')),
              const SizedBox(height: 12),
              TextField(
                  controller: _descriptionController,
                  decoration: const InputDecoration(labelText: 'Description'),
                  maxLines: 3),
              const SizedBox(height: 12),
              TextField(
                  controller: _categoryController,
                  decoration: const InputDecoration(labelText: 'Category ID from provider service')),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                      child: TextField(
                          controller: _budgetMinController,
                          decoration: const InputDecoration(labelText: 'Min'),
                          keyboardType: TextInputType.number)),
                  const SizedBox(width: 8),
                  Expanded(
                      child: TextField(
                          controller: _budgetMaxController,
                          decoration: const InputDecoration(labelText: 'Max'),
                          keyboardType: TextInputType.number)),
                ],
              ),
              const SizedBox(height: 12),
              FilledButton.icon(onPressed: _create, icon: const Icon(Icons.add), label: const Text('Post Job')),
              const SizedBox(height: 20),
            ],
            FilledButton.tonalIcon(
                onPressed: _load, icon: const Icon(Icons.work_outline), label: const Text('Load Open Jobs')),
            if (_message.isNotEmpty) ...[
              const SizedBox(height: 12),
              InfoPanel(icon: Icons.info_outline, title: 'Jobs', value: _message),
            ],
            const SizedBox(height: 16),
            ..._jobs.map(
              (job) => Card(
                child: ListTile(
                  title: Text(job['title']?.toString() ?? 'Job'),
                  subtitle: Text('${job['description'] ?? ''}\nPKR ${job['budgetMin']} - ${job['budgetMax']}'),
                  isThreeLine: true,
                  trailing: role == 'PROVIDER'
                      ? IconButton(onPressed: () => _apply(job['id'].toString()), icon: const Icon(Icons.send_outlined))
                      : null,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({required this.bookingId, super.key});

  final String bookingId;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _messageController = TextEditingController(text: 'Assalam o alaikum');
  List<Map<String, dynamic>> _messages = [];
  String _status = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final data = await apiData<Map<String, dynamic>>(
          ref.read(dioProvider).get<Map<String, dynamic>>('/chat/${widget.bookingId}/messages'), {});
      setState(() => _messages = listFrom(data, 'messages'));
    } catch (error) {
      setState(() => _status = apiError(error));
    }
  }

  Future<void> _send() async {
    try {
      await ref.read(dioProvider).post<Map<String, dynamic>>(
        '/chat/${widget.bookingId}/messages',
        data: {'body': _messageController.text.trim()},
      );
      _messageController.clear();
      await _load();
    } catch (error) {
      setState(() => _status = apiError(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar:
          AppBar(title: const Text('Chat'), actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_status.isNotEmpty) InfoPanel(icon: Icons.info_outline, title: 'Chat', value: _status),
                  ..._messages.map(
                    (message) => Align(
                      alignment: Alignment.centerLeft,
                      child: Card(
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Text(message['body']?.toString() ?? message['message']?.toString() ?? ''),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Expanded(
                      child: TextField(
                          controller: _messageController, decoration: const InputDecoration(labelText: 'Message'))),
                  const SizedBox(width: 8),
                  IconButton.filled(onPressed: _send, icon: const Icon(Icons.send)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  List<Map<String, dynamic>> _items = [];
  String _message = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final data =
          await apiData<Map<String, dynamic>>(ref.read(dioProvider).get<Map<String, dynamic>>('/notifications'), {});
      setState(() {
        _items = listFrom(data, 'notifications');
        _message = _items.isEmpty ? 'No notifications yet.' : '';
      });
    } catch (error) {
      setState(() => _message = apiError(error));
    }
  }

  Future<void> _markRead(String id) async {
    try {
      await ref.read(dioProvider).patch<Map<String, dynamic>>('/notifications/$id/read');
      await _load();
    } catch (error) {
      setState(() => _message = apiError(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
          title: const Text('Notifications'), actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_message.isNotEmpty) InfoPanel(icon: Icons.info_outline, title: 'Notifications', value: _message),
            ..._items.map(
              (item) => Card(
                child: ListTile(
                  leading:
                      Icon(item['readAt'] == null ? Icons.notifications_active_outlined : Icons.notifications_none),
                  title: Text(item['title']?.toString() ?? 'Notification'),
                  subtitle: Text(item['body']?.toString() ?? ''),
                  onTap: () => _markRead(item['id'].toString()),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            InfoPanel(
              icon: Icons.person_outline,
              title: auth.role,
              value: '${auth.phone}\n${auth.user?['status'] ?? 'ACTIVE'}',
            ),
            const SizedBox(height: 12),
            if (auth.role == 'PROVIDER') ...[
              FilledButton.icon(
                onPressed: () => context.push('/provider/dashboard'),
                icon: const Icon(Icons.dashboard_outlined),
                label: const Text('Provider Dashboard'),
              ),
              const SizedBox(height: 8),
              FilledButton.tonalIcon(
                onPressed: () => context.push('/provider/onboarding'),
                icon: const Icon(Icons.fact_check_outlined),
                label: const Text('Provider Onboarding'),
              ),
              const SizedBox(height: 16),
            ],
            OutlinedButton.icon(
              onPressed: () => ref.read(authControllerProvider.notifier).logout(),
              icon: const Icon(Icons.logout),
              label: const Text('Sign Out'),
            ),
          ],
        ),
      ),
    );
  }
}

class ProviderDashboardScreen extends ConsumerStatefulWidget {
  const ProviderDashboardScreen({super.key});

  @override
  ConsumerState<ProviderDashboardScreen> createState() => _ProviderDashboardScreenState();
}

class _ProviderDashboardScreenState extends ConsumerState<ProviderDashboardScreen> {
  Map<String, dynamic>? _provider;
  List<Map<String, dynamic>> _bookings = [];
  String _message = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final dio = ref.read(dioProvider);
      final provider = await apiData<Map<String, dynamic>>(dio.get<Map<String, dynamic>>('/providers/me'), {});
      final bookingData = await apiData<Map<String, dynamic>>(dio.get<Map<String, dynamic>>('/bookings'), {});
      setState(() {
        _provider = provider;
        _bookings = listFrom(bookingData, 'bookings');
      });
    } catch (error) {
      setState(() => _message = apiError(error));
    }
  }

  Future<void> _availability(bool value) async {
    try {
      await ref.read(dioProvider).patch<Map<String, dynamic>>('/providers/availability', data: {'isAvailable': value});
      await _load();
    } catch (error) {
      setState(() => _message = apiError(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    final completed = _bookings.where((item) => item['status'] == 'COMPLETED' || item['status'] == 'CLOSED').length;
    final earnings =
        _bookings.fold<int>(0, (sum, item) => sum + (item['totalAmount'] is int ? item['totalAmount'] as int : 0));
    return Scaffold(
      appBar: AppBar(
          title: const Text('Provider Dashboard'),
          actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_message.isNotEmpty) InfoPanel(icon: Icons.info_outline, title: 'Provider', value: _message),
            InfoPanel(
              icon: Icons.verified_outlined,
              title: _provider?['displayName']?.toString() ?? 'Provider',
              value:
                  '${_provider?['verificationStatus'] ?? 'Not loaded'} | ${_provider?['isAvailable'] == true ? 'Available' : 'Unavailable'}',
            ),
            const SizedBox(height: 12),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Availability'),
              value: _provider?['isAvailable'] == true,
              onChanged: _availability,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: InfoPanel(icon: Icons.task_alt, title: 'Completed', value: '$completed')),
                const SizedBox(width: 8),
                Expanded(child: InfoPanel(icon: Icons.payments_outlined, title: 'Earnings', value: 'PKR $earnings')),
              ],
            ),
            const SizedBox(height: 16),
            Text('Incoming Requests', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ..._bookings.map((booking) => ListTile(
                title: Text(booking['categoryName']?.toString() ?? 'Booking'),
                subtitle: Text(booking['status']?.toString() ?? ''))),
          ],
        ),
      ),
    );
  }
}

class ProviderOnboardingScreen extends ConsumerStatefulWidget {
  const ProviderOnboardingScreen({super.key});

  @override
  ConsumerState<ProviderOnboardingScreen> createState() => _ProviderOnboardingScreenState();
}

class _ProviderOnboardingScreenState extends ConsumerState<ProviderOnboardingScreen> {
  final _displayNameController = TextEditingController(text: 'Khidmat Provider');
  final _bioController = TextEditingController(text: 'Experienced local service provider.');
  final _cityController = TextEditingController(text: 'Mardan');
  final _addressController = TextEditingController(text: 'Mardan');
  final _categoryController = TextEditingController();
  final _cnicController = TextEditingController(text: '1234512345671');
  String _message = 'Complete steps in order. Category ID comes from admin categories.';

  @override
  void dispose() {
    _displayNameController.dispose();
    _bioController.dispose();
    _cityController.dispose();
    _addressController.dispose();
    _categoryController.dispose();
    _cnicController.dispose();
    super.dispose();
  }

  Future<void> _step(int step) async {
    Object data = {};
    if (step == 1) {
      data = {
        'displayName': _displayNameController.text.trim(),
        'bio': _bioController.text.trim(),
        'city': _cityController.text.trim(),
        'address': _addressController.text.trim(),
      };
    } else if (step == 2) {
      data = {
        'services': [
          {
            'categoryId': _categoryController.text.trim(),
            'priceRangeMin': 1000,
            'priceRangeMax': 5000,
            'description': 'Home service',
          }
        ],
      };
    } else if (step == 3) {
      data = {
        'cnicNumber': _cnicController.text.trim(),
        'cnicFrontUrl': 'https://example.com/cnic-front.jpg',
        'cnicBackUrl': 'https://example.com/cnic-back.jpg',
        'certificationUrls': <String>[],
      };
    }
    try {
      await ref.read(dioProvider).post<Map<String, dynamic>>('/providers/onboard/step/$step', data: data);
      setState(() => _message = 'Step $step saved.');
    } catch (error) {
      setState(() => _message = apiError(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Provider Onboarding')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            InfoPanel(icon: Icons.info_outline, title: 'Onboarding', value: _message),
            const SizedBox(height: 16),
            TextField(controller: _displayNameController, decoration: const InputDecoration(labelText: 'Display name')),
            const SizedBox(height: 12),
            TextField(controller: _bioController, decoration: const InputDecoration(labelText: 'Bio'), maxLines: 3),
            const SizedBox(height: 12),
            TextField(controller: _cityController, decoration: const InputDecoration(labelText: 'City')),
            const SizedBox(height: 12),
            TextField(controller: _addressController, decoration: const InputDecoration(labelText: 'Address')),
            const SizedBox(height: 12),
            FilledButton(onPressed: () => _step(1), child: const Text('Save Profile')),
            const SizedBox(height: 20),
            TextField(controller: _categoryController, decoration: const InputDecoration(labelText: 'Category ID')),
            const SizedBox(height: 12),
            FilledButton(onPressed: () => _step(2), child: const Text('Save Service')),
            const SizedBox(height: 20),
            TextField(controller: _cnicController, decoration: const InputDecoration(labelText: 'CNIC')),
            const SizedBox(height: 12),
            FilledButton(onPressed: () => _step(3), child: const Text('Save Documents')),
            const SizedBox(height: 12),
            FilledButton.tonal(onPressed: () => _step(4), child: const Text('Submit For Review')),
          ],
        ),
      ),
    );
  }
}

class InfoPanel extends StatelessWidget {
  const InfoPanel({
    required this.icon,
    required this.title,
    required this.value,
    super.key,
  });

  final IconData icon;
  final String title;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 4),
                Text(value),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
