import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:khidmatapp_mobile/main.dart';

void main() {
  testWidgets('shows KhidmatApp auth screen', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: KhidmatApp()));

    expect(find.text('KhidmatApp'), findsOneWidget);
    expect(find.text('Sign In'), findsOneWidget);
    expect(find.text('Create account'), findsOneWidget);
  });
}
