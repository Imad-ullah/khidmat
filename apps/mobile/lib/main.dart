import 'package:flutter/material.dart';

void main() {
  runApp(const KhidmatApp());
}

class KhidmatApp extends StatelessWidget {
  const KhidmatApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      title: 'KhidmatApp',
      home: Scaffold(
        body: Center(
          child: Text('KhidmatApp'),
        ),
      ),
    );
  }
}
