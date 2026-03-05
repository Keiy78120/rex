import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show ThemeMode;
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import 'services/rex_service.dart';
import 'pages/health_page.dart';
import 'pages/memory_page.dart';
import 'pages/gateway_page.dart';
import 'pages/optimize_page.dart';
import 'pages/settings_page.dart';

void main() {
  runApp(
    ChangeNotifierProvider(
      create: (_) => RexService(),
      child: const RexApp(),
    ),
  );
}

class RexApp extends StatelessWidget {
  const RexApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MacosApp(
      title: 'REX',
      theme: MacosThemeData.light().copyWith(
        primaryColor: const Color(0xFF6366F1),
      ),
      darkTheme: MacosThemeData.dark().copyWith(
        primaryColor: const Color(0xFF818CF8),
      ),
      themeMode: ThemeMode.system,
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
    });
  }

  @override
  Widget build(BuildContext context) {
    return MacosWindow(
      sidebar: Sidebar(
        minWidth: 200,
        builder: (context, scrollController) {
          return SidebarItems(
            currentIndex: _pageIndex,
            onChanged: (index) => setState(() => _pageIndex = index),
            scrollController: scrollController,
            itemSize: SidebarItemSize.large,
            items: const [
              SidebarItem(
                leading: MacosIcon(CupertinoIcons.heart_fill),
                label: Text('Health'),
              ),
              SidebarItem(
                leading: MacosIcon(CupertinoIcons.search),
                label: Text('Memory'),
              ),
              SidebarItem(
                leading: MacosIcon(CupertinoIcons.paperplane_fill),
                label: Text('Gateway'),
              ),
              SidebarItem(
                leading: MacosIcon(CupertinoIcons.bolt_fill),
                label: Text('Optimize'),
              ),
              SidebarItem(
                leading: MacosIcon(CupertinoIcons.gear),
                label: Text('Settings'),
              ),
            ],
          );
        },
        top: _SidebarHeader(),
        bottom: _SidebarFooter(),
      ),
      child: IndexedStack(
        index: _pageIndex,
        children: const [
          HealthPage(),
          MemoryPage(),
          GatewayPage(),
          OptimizePage(),
          SettingsPage(),
        ],
      ),
    );
  }
}

class _SidebarHeader extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Consumer<RexService>(
      builder: (context, rex, _) {
        final statusColor = rex.healthStatus == 'healthy'
            ? CupertinoColors.systemGreen
            : rex.healthStatus == 'degraded'
                ? CupertinoColors.systemYellow
                : CupertinoColors.systemRed;
        return Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
                  ),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Center(
                  child: Text(
                    'R',
                    style: TextStyle(
                      color: CupertinoColors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'REX',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                  Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: statusColor,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        rex.healthStatus.toUpperCase(),
                        style: TextStyle(
                          fontSize: 11,
                          color: MacosTheme.of(context)
                              .typography
                              .subheadline
                              .color,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

class _SidebarFooter extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.all(16),
      child: Text(
        'v4.0.0',
        style: TextStyle(fontSize: 11, color: CupertinoColors.systemGrey),
      ),
    );
  }
}
