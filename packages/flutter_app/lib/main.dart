import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show ThemeMode;
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import 'services/rex_service.dart';
import 'pages/health_page.dart';
import 'pages/hub_page.dart';
import 'pages/network_page.dart';
import 'pages/providers_page.dart';
import 'pages/voice_page.dart';
import 'pages/audio_page.dart';
import 'pages/memory_page.dart';
import 'pages/gateway_page.dart';
import 'pages/agents_page.dart';
import 'pages/mcp_page.dart';
import 'pages/optimize_page.dart';
import 'pages/resource_hub_page.dart';
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
import 'pages/files_page.dart';
import 'pages/training_page.dart';
import 'pages/terminal_page.dart';
import 'pages/clients_page.dart';
import 'widgets/rex_nav.dart';
import 'widgets/rex_topbar.dart';
import 'widgets/rex_contextual_sidebar.dart';

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
  int _sectionIndex = 0;
  int _pageIndex = kCockpitPageIndex;

  Widget _buildPage(int index) {
    switch (index) {
      case 0:  return const HealthPage();
      case 1:  return const HubPage();
      case 2:  return const NetworkPage();
      case 3:  return const AgentsPage();
      case 4:  return const McpPage();
      case 5:  return const OptimizePage();
      case 6:  return const MemoryPage();
      case 7:  return const TokenPage();
      case 8:  return const ObserverPage();
      case 9:  return const CuriousPage();
      case 10: return const WorkflowPage();
      case 11: return const ProjectsPage();
      case 12: return const ReviewPage();
      case 13: return const GuardsPage();
      case 14: return const SandboxPage();
      case 15: return const ProvidersPage();
      case 16: return const ResourceHubPage();
      case 17: return const ClientsPage();
      case 18: return const GatewayPage();
      case 19: return const VoicePage();
      case 20: return const AudioPage();
      case 21: return const LogsPage();
      case 22: return const SettingsPage();
      case 23: return const FilesPage();
      case 24: return const TrainingPage();
      case 25: return const TerminalPage();
      default: return const HealthPage();
    }
  }

  void _onSectionChanged(int section) {
    setState(() {
      _sectionIndex = section;
      final items = kRexSections[section].items;
      _pageIndex = items.isNotEmpty ? items.first.pageIndex : kCockpitPageIndex;
    });
  }

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
    final section = kRexSections[_sectionIndex];

    return MediaQuery(
      data: MediaQuery.of(context).copyWith(
        platformBrightness: Brightness.light,
      ),
      child: MacosTheme(
        data: RexApp._lightTheme,
        child: Column(
          children: [
            RexTopBar(
              sections: kRexSections,
              selectedIndex: _sectionIndex,
              onChanged: _onSectionChanged,
            ),
            Expanded(
              child: Row(
                children: [
                  if (section.hasSidebar)
                    RexContextualSidebar(
                      section: section,
                      selectedPageIndex: _pageIndex,
                      onPageChanged: (i) => setState(() => _pageIndex = i),
                    ),
                  Expanded(child: _buildPage(_pageIndex)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

