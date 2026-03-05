import 'dart:io';
import 'package:flutter/foundation.dart';

class CheckResult {
  final String name;
  final String status; // pass, fail, warn
  final String message;

  CheckResult({required this.name, required this.status, required this.message});
}

class CheckGroup {
  final String name;
  final String icon;
  final List<CheckResult> results;

  CheckGroup({required this.name, required this.icon, required this.results});

  int get passed => results.where((r) => r.status == 'pass').length;
  int get total => results.length;
}

class MemoryStats {
  final int totalMemories;
  final int ingestedFiles;
  final String dbSize;
  final Map<String, int> categories;

  MemoryStats({
    required this.totalMemories,
    required this.ingestedFiles,
    required this.dbSize,
    required this.categories,
  });
}

class RexService extends ChangeNotifier {
  String healthStatus = 'unknown';
  List<CheckGroup> healthGroups = [];
  bool isLoading = false;
  String lastOutput = '';
  bool ollamaRunning = false;
  String currentMode = 'qwen';
  bool gatewayRunning = false;
  MemoryStats? memoryStats;

  Future<String> _runRex(String args, {int timeout = 30}) async {
    try {
      final result = await Process.run(
        'rex',
        args.split(' '),
        environment: Platform.environment,
      ).timeout(Duration(seconds: timeout));
      return _stripAnsi(result.stdout as String);
    } catch (e) {
      return 'Error: $e';
    }
  }

  String _stripAnsi(String text) {
    return text.replaceAll(RegExp(r'\x1b\[[0-9;]*m'), '');
  }

  Future<void> refreshAll() async {
    isLoading = true;
    notifyListeners();

    await Future.wait([
      runDoctor(),
      checkOllama(),
      checkGateway(),
    ]);

    isLoading = false;
    notifyListeners();
  }

  Future<void> runDoctor() async {
    final output = await _runRex('doctor', timeout: 60);
    _parseDoctorOutput(output);
    notifyListeners();
  }

  void _parseDoctorOutput(String output) {
    healthGroups = [];
    final lines = output.split('\n');

    CheckGroup? currentGroup;
    for (final line in lines) {
      // Group header: "  ICON Name  N/N"
      final groupMatch = RegExp(r'^\s+(.)\s+(.+?)\s+(\d+)/(\d+)').firstMatch(line);
      if (groupMatch != null) {
        if (currentGroup != null) healthGroups.add(currentGroup);
        currentGroup = CheckGroup(
          name: groupMatch.group(2)!.trim(),
          icon: groupMatch.group(1)!,
          results: [],
        );
        continue;
      }

      // Check result: "    ICON name — message"
      if (currentGroup != null) {
        final checkMatch = RegExp(r'^\s+([✓✗!])\s+(.+?)\s+—\s+(.+)').firstMatch(line);
        if (checkMatch != null) {
          final status = checkMatch.group(1) == '✓'
              ? 'pass'
              : checkMatch.group(1) == '✗'
                  ? 'fail'
                  : 'warn';
          currentGroup.results.add(CheckResult(
            name: checkMatch.group(2)!,
            status: status,
            message: checkMatch.group(3)!,
          ));
        }
      }

      // Status line
      if (line.contains('Status:')) {
        if (line.contains('HEALTHY')) {
          healthStatus = 'healthy';
        } else if (line.contains('DEGRADED')) {
          healthStatus = 'degraded';
        } else if (line.contains('BROKEN')) {
          healthStatus = 'broken';
        }
      }
    }
    if (currentGroup != null) healthGroups.add(currentGroup);
  }

  Future<void> checkOllama() async {
    try {
      final result = await Process.run('curl', ['-s', 'http://localhost:11434/api/tags']);
      ollamaRunning = (result.exitCode == 0);
    } catch (_) {
      ollamaRunning = false;
    }
    notifyListeners();
  }

  Future<void> checkGateway() async {
    try {
      final result = await Process.run('pgrep', ['-f', 'rex gateway']);
      gatewayRunning = (result.exitCode == 0);
    } catch (_) {
      gatewayRunning = false;
    }
    notifyListeners();
  }

  Future<String> runIngest() async {
    isLoading = true;
    notifyListeners();
    final output = await _runRex('ingest', timeout: 120);
    lastOutput = output;
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> runPrune({bool statsOnly = false}) async {
    isLoading = true;
    notifyListeners();
    final output = await _runRex(statsOnly ? 'prune --stats' : 'prune', timeout: 60);
    lastOutput = output;
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> runOptimize({bool apply = false}) async {
    isLoading = true;
    notifyListeners();
    final output = await _runRex(apply ? 'optimize --apply' : 'optimize', timeout: 120);
    lastOutput = output;
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> runSearch(String query) async {
    final output = await _runRex('search $query', timeout: 30);
    lastOutput = output;
    notifyListeners();
    return output;
  }

  Future<String> runSetup() async {
    isLoading = true;
    notifyListeners();
    final output = await _runRex('setup', timeout: 300);
    lastOutput = output;
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> runInit() async {
    isLoading = true;
    notifyListeners();
    final output = await _runRex('init', timeout: 60);
    lastOutput = output;
    isLoading = false;
    await refreshAll();
    return output;
  }
}
