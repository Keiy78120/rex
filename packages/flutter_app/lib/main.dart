import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show ThemeMode;
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import 'services/rex_service.dart';
import 'pages/health_page.dart';
import 'pages/network_page.dart';
import 'pages/providers_page.dart';
import 'pages/voice_page.dart';
import 'pages/audio_page.dart';
import 'pages/memory_page.dart';
import 'pages/gateway_page.dart';
import 'pages/agents_page.dart';
import 'pages/mcp_page.dart';
import 'pages/optimize_page.dart';
import 'pages/clients_page.dart';
import 'pages/token_page.dart';
import 'pages/observer_page.dart';
import 'pages/workflow_page.dart';
import 'pages/review_page.dart';
import 'pages/guards_page.dart';
import 'pages/projects_page.dart';
import 'pages/sandbox_page.dart';
import 'pages/curious_page.dart';
import 'pages/logs_page.dart';
import 'pages/settings_page.dart';
import 'widgets/rex_sidebar.dart';

void main() {
  runApp(
    ChangeNotifierProvider(create: (_) => RexService(), child: const RexApp()),
  );
}

class RexApp extends StatelessWidget {
  const RexApp({super.key});

  static final _lightTheme = MacosThemeData.light(accentColor: AccentColor.red)
      .copyWith(canvasColor: const Color(0xFFF7F7F8));

  @override
  Widget build(BuildContext context) {
    return MacosApp(
      title: 'REX',
      theme: _lightTheme,
      darkTheme: _lightTheme,
      themeMode: ThemeMode.light,
      home: const RexMainWindow(),
      debugShowCheckedModeBanner: false,
    );
  }
}

class RexMainWindow extends StatefulWidget {
  const RexMainWindow({super.key});

  @override
  State<RexMainWindow> createState() => _RexMainWindowState();
}

class _RexMainWindowState extends State<RexMainWindow> {
  int _pageIndex = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<RexService>().refreshAll();
      WindowManipulator.overrideMacOSBrightness(dark: false);
    });
  }

  @override
  Widget build(BuildContext context) {
    return MediaQuery(
      data: MediaQuery.of(context).copyWith(
        platformBrightness: Brightness.light,
      ),
      child: MacosTheme(
        data: RexApp._lightTheme,
        child: Row(
          children: [
            RexSidebar(
              currentIndex: _pageIndex,
              onChanged: (i) => setState(() => _pageIndex = i),
            ),
            Expanded(
              child: IndexedStack(
                index: _pageIndex,
                children: const [
                  HealthPage(),
                  NetworkPage(),
                  ProvidersPage(),
                  VoicePage(),
                  AudioPage(),
                  MemoryPage(),
                  GatewayPage(),
                  AgentsPage(),
                  McpPage(),
                  OptimizePage(),
                  ClientsPage(),
                  TokenPage(),
                  ObserverPage(),
                  WorkflowPage(),
                  ReviewPage(),
                  GuardsPage(),
                  SandboxPage(),
                  ProjectsPage(),
                  CuriousPage(),
                  LogsPage(),
                  SettingsPage(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

