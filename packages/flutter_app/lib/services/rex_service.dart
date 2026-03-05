import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';

class CheckResult {
  final String name;
  final String status; // pass, fail, warn
  final String message;

  CheckResult({
    required this.name,
    required this.status,
    required this.message,
  });
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

class AgentInfo {
  final String id;
  final String name;
  final String profile;
  final String model;
  final int intervalSec;
  final bool enabled;
  final bool running;
  final String lastRunAt;

  AgentInfo({
    required this.id,
    required this.name,
    required this.profile,
    required this.model,
    required this.intervalSec,
    required this.enabled,
    required this.running,
    required this.lastRunAt,
  });

  factory AgentInfo.fromJson(Map<String, dynamic> json) {
    return AgentInfo(
      id: (json['id'] as String?) ?? '',
      name: (json['name'] as String?) ?? '',
      profile: (json['profile'] as String?) ?? '',
      model: (json['model'] as String?) ?? '',
      intervalSec: (json['intervalSec'] as num?)?.toInt() ?? 0,
      enabled: json['enabled'] == true,
      running: json['running'] == true,
      lastRunAt: (json['lastRunAt'] as String?) ?? '',
    );
  }
}

class McpServerInfo {
  final String id;
  final String name;
  final String type;
  final bool enabled;
  final String command;
  final List<String> args;
  final String url;
  final String updatedAt;

  McpServerInfo({
    required this.id,
    required this.name,
    required this.type,
    required this.enabled,
    required this.command,
    required this.args,
    required this.url,
    required this.updatedAt,
  });

  factory McpServerInfo.fromJson(Map<String, dynamic> json) {
    final argsRaw = json['args'];
    final parsedArgs = argsRaw is List
        ? argsRaw.map((e) => e.toString()).toList()
        : const <String>[];
    return McpServerInfo(
      id: (json['id'] as String?) ?? '',
      name: (json['name'] as String?) ?? '',
      type: (json['type'] as String?) ?? 'stdio',
      enabled: json['enabled'] == true,
      command: (json['command'] as String?) ?? '',
      args: parsedArgs,
      url: (json['url'] as String?) ?? '',
      updatedAt: (json['updatedAt'] as String?) ?? '',
    );
  }
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

  bool callActive = false;
  String callApp = '';
  String callReason = '';
  String callTitle = '';
  String callIso = '';

  bool audioCapturing = false;
  int audioRecordingsCount = 0;
  String audioRecordingsDir = '';
  String audioCurrentFile = '';

  bool voiceOptimizeEnabled = false;
  String voiceOptimizeModel = 'qwen3.5:4b';
  bool whisperCliAvailable = false;
  String whisperModelPath = '';
  bool whisperModelExists = false;
  String lastTranscript = '';

  List<String> callEvents = [];
  List<AgentInfo> agents = [];
  List<Map<String, dynamic>> agentProfiles = [];
  List<McpServerInfo> mcpServers = [];

  Future<String> _runRexArgs(List<String> args, {int timeout = 30}) async {
    try {
      final result = await Process.run(
        'rex',
        args,
        environment: Platform.environment,
      ).timeout(Duration(seconds: timeout));

      final stdout = _stripAnsi(result.stdout as String? ?? '');
      final stderr = _stripAnsi(result.stderr as String? ?? '');
      if ((result.exitCode != 0) && stderr.isNotEmpty) {
        return stderr;
      }
      return stdout.isNotEmpty ? stdout : stderr;
    } catch (e) {
      return 'Error: $e';
    }
  }

  Future<String> _runRex(String args, {int timeout = 30}) {
    return _runRexArgs(args.split(' '), timeout: timeout);
  }

  String _stripAnsi(String text) {
    return text.replaceAll(RegExp(r'\x1b\[[0-9;]*m'), '');
  }

  Future<Map<String, dynamic>?> _runRexJson(
    List<String> args, {
    int timeout = 30,
  }) async {
    final out = (await _runRexArgs(args, timeout: timeout)).trim();
    try {
      final parsed = jsonDecode(out);
      if (parsed is Map<String, dynamic>) return parsed;
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<void> refreshAll() async {
    isLoading = true;
    notifyListeners();

    await Future.wait([
      runDoctor(),
      checkOllama(),
      checkGateway(),
      checkCallStatus(),
      checkAudioLogger(),
      checkVoiceStatus(),
      loadCallEvents(),
      loadAgents(),
      loadMcpServers(),
    ]);

    isLoading = false;
    notifyListeners();
  }

  Future<void> runDoctor() async {
    final output = await _runRexArgs(['doctor'], timeout: 60);
    _parseDoctorOutput(output);
    notifyListeners();
  }

  void _parseDoctorOutput(String output) {
    healthGroups = [];
    final lines = output.split('\n');

    CheckGroup? currentGroup;
    for (final line in lines) {
      // Group header: "  ICON Name  N/N"
      final groupMatch = RegExp(
        r'^\s+(.)\s+(.+?)\s+(\d+)/(\d+)',
      ).firstMatch(line);
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
        final checkMatch = RegExp(
          r'^\s+([✓✗!])\s+(.+?)\s+—\s+(.+)',
        ).firstMatch(line);
        if (checkMatch != null) {
          final status = checkMatch.group(1) == '✓'
              ? 'pass'
              : checkMatch.group(1) == '✗'
              ? 'fail'
              : 'warn';
          currentGroup.results.add(
            CheckResult(
              name: checkMatch.group(2)!,
              status: status,
              message: checkMatch.group(3)!,
            ),
          );
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
      final result = await Process.run('curl', [
        '-s',
        'http://localhost:11434/api/tags',
      ]);
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

  Future<void> checkCallStatus() async {
    final parsed = await _runRexJson(['call', 'status', '--json']);
    if (parsed == null) {
      callActive = false;
      callApp = '';
      callReason = '';
      callTitle = '';
      callIso = '';
      notifyListeners();
      return;
    }

    callActive = parsed['active'] == true;
    callApp = (parsed['app'] as String?) ?? '';
    callReason = (parsed['reason'] as String?) ?? '';
    callTitle = (parsed['title'] as String?) ?? '';
    callIso = (parsed['iso'] as String?) ?? '';
    notifyListeners();
  }

  Future<void> checkAudioLogger() async {
    final parsed = await _runRexJson(['audio', 'status', '--json']);
    if (parsed == null) {
      audioCapturing = false;
      audioRecordingsCount = 0;
      audioRecordingsDir = '';
      audioCurrentFile = '';
      notifyListeners();
      return;
    }

    audioCapturing = parsed['capturing'] == true;
    audioRecordingsCount = (parsed['recordingsCount'] as num?)?.toInt() ?? 0;
    audioRecordingsDir = (parsed['recordingsDir'] as String?) ?? '';
    audioCurrentFile = (parsed['currentFile'] as String?) ?? '';
    notifyListeners();
  }

  Future<void> checkVoiceStatus() async {
    final parsed = await _runRexJson(['voice', 'status', '--json']);
    if (parsed == null) {
      notifyListeners();
      return;
    }
    voiceOptimizeEnabled = parsed['optimizeEnabled'] == true;
    voiceOptimizeModel =
        (parsed['optimizeModel'] as String?) ?? voiceOptimizeModel;
    whisperCliAvailable = parsed['whisperCliAvailable'] == true;
    whisperModelPath = (parsed['whisperModelPath'] as String?) ?? '';
    whisperModelExists = parsed['whisperModelExists'] == true;
    notifyListeners();
  }

  Future<void> loadCallEvents({int tail = 20}) async {
    final output = await _runRexArgs(['call', 'events', '--tail', '$tail']);
    callEvents = output
        .split('\n')
        .map((line) => line.trim())
        .where((line) => line.isNotEmpty)
        .toList();
    notifyListeners();
  }

  Future<void> loadAgents() async {
    final output = await _runRexArgs(['agents', 'list', '--json'], timeout: 30);
    try {
      final parsed = jsonDecode(output);
      if (parsed is Map<String, dynamic>) {
        final list = parsed['agents'];
        if (list is List) {
          agents = list
              .whereType<Map>()
              .map((raw) => AgentInfo.fromJson(raw.cast<String, dynamic>()))
              .toList();
          notifyListeners();
          return;
        }
      }
    } catch (_) {
      // Ignore parse failures and keep previous value.
    }
    agents = [];
    notifyListeners();
  }

  Future<void> loadAgentProfiles() async {
    final output = await _runRexArgs([
      'agents',
      'profiles',
      '--json',
    ], timeout: 20);
    try {
      final parsed = jsonDecode(output);
      if (parsed is Map<String, dynamic>) {
        final list = parsed['profiles'];
        if (list is List) {
          agentProfiles = list
              .whereType<Map>()
              .map((raw) => raw.cast<String, dynamic>())
              .toList();
          notifyListeners();
          return;
        }
      }
    } catch (_) {
      // Ignore parse failures and keep previous value.
    }
    agentProfiles = [];
    notifyListeners();
  }

  Future<String> createAgent(
    String profile, {
    String? name,
    String? prompt,
    String? model,
    int? intervalSec,
  }) async {
    isLoading = true;
    notifyListeners();
    final args = ['agents', 'create', profile];
    if (name != null && name.trim().isNotEmpty) args.add(name.trim());
    if (prompt != null && prompt.trim().isNotEmpty) {
      args.addAll(['--prompt', prompt.trim()]);
    }
    if (model != null && model.trim().isNotEmpty) {
      args.addAll(['--model', model.trim()]);
    }
    if (intervalSec != null && intervalSec > 0) {
      args.addAll(['--interval', '$intervalSec']);
    }
    final output = await _runRexArgs(args, timeout: 30);
    lastOutput = output;
    await loadAgents();
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> startAgent(String id) async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs(['agents', 'run', id], timeout: 30);
    lastOutput = output;
    await loadAgents();
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> runAgentOnce(String id) async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs([
      'agents',
      'run',
      id,
      '--once',
    ], timeout: 120);
    lastOutput = output;
    await loadAgents();
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> stopAgent(String id) async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs(['agents', 'stop', id], timeout: 30);
    lastOutput = output;
    await loadAgents();
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> setAgentEnabled(String id, bool enabled) async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs([
      'agents',
      enabled ? 'enable' : 'disable',
      id,
    ], timeout: 30);
    lastOutput = output;
    await loadAgents();
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> deleteAgent(String id) async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs(['agents', 'delete', id], timeout: 30);
    lastOutput = output;
    await loadAgents();
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> readAgentLogs(String id, {int tail = 80}) async {
    final output = await _runRexArgs([
      'agents',
      'logs',
      id,
      '--tail',
      '$tail',
    ], timeout: 30);
    lastOutput = output;
    notifyListeners();
    return output;
  }

  Future<void> loadMcpServers() async {
    final output = await _runRexArgs(['mcp', 'list', '--json'], timeout: 20);
    try {
      final parsed = jsonDecode(output);
      if (parsed is Map<String, dynamic>) {
        final list = parsed['servers'];
        if (list is List) {
          mcpServers = list
              .whereType<Map>()
              .map((raw) => McpServerInfo.fromJson(raw.cast<String, dynamic>()))
              .toList();
          notifyListeners();
          return;
        }
      }
    } catch (_) {
      // Ignore parse failures and keep previous value.
    }
    mcpServers = [];
    notifyListeners();
  }

  Future<String> addMcpStdio(
    String name,
    String command, {
    String argsCsv = '',
    String cwd = '',
    String tagsCsv = '',
  }) async {
    isLoading = true;
    notifyListeners();
    final args = ['mcp', 'add', name, '--command', command];
    if (argsCsv.trim().isNotEmpty) args.addAll(['--args', argsCsv.trim()]);
    if (cwd.trim().isNotEmpty) args.addAll(['--cwd', cwd.trim()]);
    if (tagsCsv.trim().isNotEmpty) args.addAll(['--tags', tagsCsv.trim()]);
    final output = await _runRexArgs(args, timeout: 30);
    lastOutput = output;
    await loadMcpServers();
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> addMcpUrl(
    String name,
    String url, {
    String type = 'sse',
    String tagsCsv = '',
  }) async {
    isLoading = true;
    notifyListeners();
    final args = ['mcp', 'add-url', name, url, '--type', type];
    if (tagsCsv.trim().isNotEmpty) args.addAll(['--tags', tagsCsv.trim()]);
    final output = await _runRexArgs(args, timeout: 30);
    lastOutput = output;
    await loadMcpServers();
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> checkMcp(String id) async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs(['mcp', 'check', id], timeout: 30);
    lastOutput = output;
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> setMcpEnabled(String id, bool enabled) async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs([
      'mcp',
      enabled ? 'enable' : 'disable',
      id,
    ], timeout: 30);
    lastOutput = output;
    await loadMcpServers();
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> removeMcp(String id) async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs(['mcp', 'remove', id], timeout: 30);
    lastOutput = output;
    await loadMcpServers();
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> syncMcpClaude() async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs(['mcp', 'sync-claude'], timeout: 30);
    lastOutput = output;
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> exportMcp() async {
    final output = await _runRexArgs(['mcp', 'export'], timeout: 30);
    lastOutput = output;
    notifyListeners();
    return output;
  }

  Future<String> startAudioLogger() async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs(['audio', 'start'], timeout: 30);
    lastOutput = output;
    await checkAudioLogger();
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> stopAudioLogger() async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs(['audio', 'stop'], timeout: 30);
    lastOutput = output;
    await checkAudioLogger();
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> setVoiceOptimize(bool enabled, {String? model}) async {
    isLoading = true;
    notifyListeners();
    final args = ['voice', 'set-optimize', enabled ? 'on' : 'off'];
    if (model != null && model.trim().isNotEmpty) args.add(model.trim());
    final output = await _runRexArgs(args, timeout: 30);
    lastOutput = output;
    await checkVoiceStatus();
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> transcribeLatest({bool optimize = false}) async {
    isLoading = true;
    notifyListeners();
    final args = ['voice', 'transcribe', '--json'];
    if (optimize) args.add('--optimize');
    final output = await _runRexArgs(args, timeout: 120);
    lastOutput = output;
    try {
      final parsed = jsonDecode(output);
      if (parsed is Map<String, dynamic>) {
        lastTranscript =
            (parsed['output'] as String?) ??
            (parsed['transcript'] as String?) ??
            '';
      }
    } catch (_) {
      // keep raw output in lastOutput
    }
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> runIngest() async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs(['ingest'], timeout: 120);
    lastOutput = output;
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> runPrune({bool statsOnly = false}) async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs(
      statsOnly ? ['prune', '--stats'] : ['prune'],
      timeout: 60,
    );
    lastOutput = output;
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> runOptimize({bool apply = false}) async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs(
      apply ? ['optimize', '--apply'] : ['optimize'],
      timeout: 120,
    );
    lastOutput = output;
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> runSearch(String query) async {
    final output = await _runRexArgs(['search', query], timeout: 30);
    lastOutput = output;
    notifyListeners();
    return output;
  }

  Future<String> runSetup() async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs(['setup'], timeout: 300);
    lastOutput = output;
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> runAppUpdate({bool release = false}) async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs([
      'app',
      'update',
      release ? '--release' : '--debug',
    ], timeout: 1200);
    lastOutput = output;
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> runInit() async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs(['init'], timeout: 120);
    lastOutput = output;
    isLoading = false;
    await refreshAll();
    return output;
  }
}
