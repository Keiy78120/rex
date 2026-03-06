import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

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

class TranscriptionEntry {
  final String text;
  final DateTime timestamp;
  final Duration duration;
  TranscriptionEntry({
    required this.text,
    required this.timestamp,
    required this.duration,
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

class BackgroundProcess {
  final String name;
  final String label;
  final int? pid;
  final bool running;
  final String? uptime;

  BackgroundProcess({
    required this.name,
    required this.label,
    this.pid,
    required this.running,
    this.uptime,
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

  // Voice (local whisper pipeline from Version A)
  bool isRecording = false;
  bool whisperInstalled = false;
  String _whisperExe = '';
  String currentTranscription = '';
  String lastWhisperModel = '';
  String lastRawTranscription = '';
  bool lastTranscriptionOptimized = false;
  String lastOptimizationModel = '';
  List<TranscriptionEntry> transcriptions = [];
  Duration recordingDuration = Duration.zero;
  Timer? _recordingTimer;
  Process? _recordingProcess;
  String? _recordingFile;
  Timer? _callStateTimer;
  bool _callAutoRecording = false;
  bool callStateActive = false;
  String callStateApp = '';
  String callStateReason = '';
  String callStateTitle = '';
  DateTime? callStateStartedAt;

  // Call status (CLI-driven)
  bool callActive = false;
  String callApp = '';
  String callReason = '';
  String callTitle = '';
  String callIso = '';

  // Audio logger
  bool audioCapturing = false;
  int audioRecordingsCount = 0;
  String audioRecordingsDir = '';
  String audioCurrentFile = '';

  // Voice status (CLI-driven)
  bool whisperCliAvailable = false;
  String whisperModelPath = '';
  bool whisperModelExists = false;
  String lastTranscript = '';

  // Agents & MCP
  List<String> callEvents = [];
  List<AgentInfo> agents = [];
  List<Map<String, dynamic>> agentProfiles = [];
  List<McpServerInfo> mcpServers = [];

  // Background processes
  List<BackgroundProcess> backgroundProcesses = [];

  // Build env with proper PATH + Telegram credentials injected (critical for macOS)
  Map<String, String> get _env {
    final env = Map<String, String>.from(Platform.environment);
    final home = env['HOME'] ?? '';
    env['PATH'] = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '$home/.local/bin',
      '$home/.npm-global/bin',
      '$home/.nvm/versions/node/v22.14.0/bin',
      '$home/.nvm/versions/node/v22.20.0/bin',
      env['PATH'] ?? '',
    ].join(':');
    if (telegramBotToken.isNotEmpty)
      env['REX_TELEGRAM_BOT_TOKEN'] = telegramBotToken;
    if (telegramChatId.isNotEmpty) env['REX_TELEGRAM_CHAT_ID'] = telegramChatId;
    if (ollamaUrl.isNotEmpty) env['OLLAMA_URL'] = ollamaUrl;
    if (ollamaLlmTemperature.isNotEmpty)
      env['REX_LLM_TEMPERATURE'] = ollamaLlmTemperature;
    return env;
  }

  Future<String> _runRexArgs(List<String> args, {int timeout = 30}) async {
    try {
      // Try rex from PATH, fallback to absolute path
      String exe = 'rex';
      final home = Platform.environment['HOME'] ?? '';
      final absRex = '$home/.nvm/versions/node/v22.20.0/bin/rex';
      if (await File(absRex).exists()) exe = absRex;

      final result = await Process.run(
        exe,
        args,
        environment: _env,
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

  // --- Whisper detection (Version A) ---

  Future<void> checkWhisper() async {
    try {
      final r = await Process.run('which', ['whisper'], environment: _env);
      if (r.exitCode == 0) {
        _whisperExe = (r.stdout as String).trim();
        if (!whisperInstalled) {
          whisperInstalled = true;
          notifyListeners();
        }
        return;
      }
    } catch (_) {}

    final home = Platform.environment['HOME'] ?? '';
    final candidates = [
      '/Library/Frameworks/Python.framework/Versions/3.13/bin/whisper',
      '/Library/Frameworks/Python.framework/Versions/Current/bin/whisper',
      '/Library/Frameworks/Python.framework/Versions/3.12/bin/whisper',
      '/opt/homebrew/bin/whisper',
      '$home/Library/Python/3.13/bin/whisper',
      '$home/Library/Python/3.12/bin/whisper',
      '$home/.pyenv/shims/whisper',
    ];
    for (final path in candidates) {
      if (File(path).existsSync()) {
        _whisperExe = path;
        if (!whisperInstalled) {
          whisperInstalled = true;
          notifyListeners();
        }
        return;
      }
    }

    try {
      final r = await Process.run('python3', [
        '-c',
        'import whisper',
      ], environment: _env);
      if (r.exitCode == 0) {
        _whisperExe = '__python3_module__';
        if (!whisperInstalled) {
          whisperInstalled = true;
          notifyListeners();
        }
        return;
      }
    } catch (_) {}

    _whisperExe = '';
    if (whisperInstalled) {
      whisperInstalled = false;
      notifyListeners();
    }
  }

  // --- Recording (Version A) ---

  Future<void> startRecording() async {
    if (isRecording) return;
    final tmpFile =
        '/tmp/rex_recording_${DateTime.now().millisecondsSinceEpoch}.m4a';
    _recordingFile = tmpFile;
    recordingDuration = Duration.zero;
    isRecording = true;
    notifyListeners();

    _recordingTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      recordingDuration += const Duration(seconds: 1);
      notifyListeners();
    });

    try {
      _recordingProcess = await Process.start(
        'ffmpeg',
        [
          '-f',
          'avfoundation',
          '-i',
          ':0',
          '-acodec',
          'aac',
          '-b:a',
          '128k',
          tmpFile,
        ],
        environment: {
          ...Platform.environment,
          'PATH':
              '/opt/homebrew/bin:/usr/local/bin:${Platform.environment['PATH'] ?? ''}',
        },
      );
    } catch (e) {
      isRecording = false;
      _recordingTimer?.cancel();
      notifyListeners();
    }
  }

  String _voiceOptimizePrompt(String transcript) {
    return '''
Tu es un optimiseur de prompt pour agent de code.
Reformule la transcription vocale en prompt net, actionnable et fidele.

Regles strictes:
- Garde l'intention exacte, n'invente rien.
- Corrige les fautes de reconnaissance vocale et les termes techniques.
- Structure en 4 blocs: Contexte, Objectif, Contraintes, Resultat attendu.
- Reste concis.
- Retourne uniquement le prompt final, sans explication.

Transcription:
$transcript
''';
  }

  Future<String> _optimizeTranscript(String transcript) async {
    final model = voiceOptimizeModel.trim().isEmpty
        ? 'qwen3.5:4b'
        : voiceOptimizeModel.trim();
    try {
      final result = await Process.run(
        'rex',
        ['llm', _voiceOptimizePrompt(transcript)],
        environment: {..._env, 'REX_LLM_MODEL': model},
      ).timeout(const Duration(seconds: 90));
      final output = _stripAnsi('${result.stdout}').trim();
      return output;
    } catch (_) {
      return '';
    }
  }

  Future<void> _finalizeTranscription(String text) async {
    final raw = text.trim();
    if (raw.isEmpty) {
      currentTranscription = 'No speech detected';
      lastRawTranscription = '';
      lastTranscriptionOptimized = false;
      lastOptimizationModel = '';
      return;
    }

    lastRawTranscription = raw;
    lastTranscriptionOptimized = false;
    lastOptimizationModel = '';
    var finalText = raw;

    if (voiceOptimizeEnabled) {
      final model = voiceOptimizeModel.trim().isEmpty
          ? 'qwen3.5:4b'
          : voiceOptimizeModel.trim();
      currentTranscription = 'Optimizing prompt ($model)...';
      notifyListeners();
      final optimized = await _optimizeTranscript(raw);
      if (optimized.trim().isNotEmpty) {
        finalText = optimized.trim();
        lastTranscriptionOptimized = true;
        lastOptimizationModel = model;
      }
    }

    currentTranscription = finalText;
    await Clipboard.setData(ClipboardData(text: finalText));
    transcriptions.insert(
      0,
      TranscriptionEntry(
        text: finalText,
        timestamp: DateTime.now(),
        duration: recordingDuration,
      ),
    );
    if (transcriptions.length > 50)
      transcriptions = transcriptions.sublist(0, 50);
  }

  bool get _isVoiceBusy {
    return currentTranscription.startsWith('Transcribing') ||
        currentTranscription.startsWith('Fallback') ||
        currentTranscription.startsWith('Optimizing prompt');
  }

  String get _callStatePath {
    final home = Platform.environment['HOME'] ?? '';
    return '$home/.rex-memory/runtime/call-state.json';
  }

  Future<void> _pollCallState() async {
    try {
      final file = File(_callStatePath);
      if (!file.existsSync()) {
        if (callStateActive) {
          callStateActive = false;
          callStateApp = '';
          callStateReason = '';
          callStateTitle = '';
          callStateStartedAt = null;
          notifyListeners();
        }
        return;
      }

      final raw = file.readAsStringSync().trim();
      if (raw.isEmpty) return;
      final data = json.decode(raw) as Map<String, dynamic>;
      final active = data['active'] == true;
      final app = (data['app'] as String?) ?? '';
      final reason = (data['reason'] as String?) ?? '';
      final title = (data['title'] as String?) ?? '';
      final startedAtTs = data['startedAt'];
      DateTime? startedAt;
      if (startedAtTs is int && startedAtTs > 0) {
        startedAt = DateTime.fromMillisecondsSinceEpoch(
          startedAtTs * 1000,
          isUtc: true,
        ).toLocal();
      }

      final changed =
          active != callStateActive ||
          app != callStateApp ||
          reason != callStateReason ||
          title != callStateTitle;

      callStateActive = active;
      callStateApp = app;
      callStateReason = reason;
      callStateTitle = title;
      callStateStartedAt = startedAt;

      if (changed) notifyListeners();

      if (!callAutoRecordEnabled) return;

      if (active) {
        if (!_callAutoRecording && !isRecording && !_isVoiceBusy) {
          currentTranscription = app.isNotEmpty
              ? 'Call detected on $app — recording...'
              : 'Call detected — recording...';
          notifyListeners();
          await startRecording();
          if (isRecording) _callAutoRecording = true;
        }
      } else if (_callAutoRecording) {
        _callAutoRecording = false;
        if (isRecording) {
          currentTranscription = 'Call ended — transcribing...';
          notifyListeners();
          await stopRecordingAndTranscribe();
        }
      }
    } catch (_) {}
  }

  Future<void> _syncCallAutomationWatcher() async {
    if (callAutoRecordEnabled) {
      _callStateTimer ??= Timer.periodic(
        const Duration(seconds: 3),
        (_) => _pollCallState(),
      );
      await _pollCallState();
      return;
    }

    _callStateTimer?.cancel();
    _callStateTimer = null;

    if (_callAutoRecording) {
      _callAutoRecording = false;
      if (isRecording) {
        await stopRecordingAndTranscribe();
      }
    }
  }

  Future<void> stopRecordingAndTranscribe() async {
    if (!isRecording) return;
    _recordingTimer?.cancel();
    _recordingProcess?.kill(ProcessSignal.sigint);
    await _recordingProcess?.exitCode;
    isRecording = false;
    notifyListeners();

    final file = _recordingFile;
    if (file == null || !File(file).existsSync()) return;

    if (whisperInstalled) {
      final isLong = recordingDuration.inSeconds >= 30;
      final preferredModel = isLong ? 'large-v3-turbo' : 'tiny';
      lastWhisperModel = preferredModel;
      lastRawTranscription = '';
      lastTranscriptionOptimized = false;
      lastOptimizationModel = '';
      currentTranscription = 'Transcribing ($preferredModel)...';
      notifyListeners();

      Future<String> transcribeWith(String model) async {
        final timeout = model == 'tiny' ? 60 : 180;
        final args = [
          file,
          '--model',
          model,
          '--output_format',
          'txt',
          '--output_dir',
          '/tmp',
        ];
        final ProcessResult result;
        if (_whisperExe == '__python3_module__') {
          result = await Process.run('python3', [
            '-m',
            'whisper',
            ...args,
          ], environment: _env).timeout(Duration(seconds: timeout));
        } else {
          final exe = _whisperExe.isNotEmpty ? _whisperExe : 'whisper';
          result = await Process.run(
            exe,
            args,
            environment: _env,
          ).timeout(Duration(seconds: timeout));
        }
        final txtFile = File(file.replaceAll('.m4a', '.txt'));
        if (txtFile.existsSync()) {
          final text = txtFile.readAsStringSync().trim();
          try {
            txtFile.deleteSync();
          } catch (_) {}
          return text;
        }
        return _stripAnsi(result.stdout as String).trim();
      }

      try {
        String text = await transcribeWith(preferredModel);
        if (text.isEmpty && isLong) {
          lastWhisperModel = 'tiny (fallback)';
          currentTranscription = 'Fallback to tiny...';
          notifyListeners();
          text = await transcribeWith('tiny');
        }
        await _finalizeTranscription(text);
      } catch (e) {
        if (isLong) {
          try {
            lastWhisperModel = 'tiny (fallback)';
            currentTranscription = 'Fallback to tiny...';
            notifyListeners();
            final text = await transcribeWith('tiny');
            await _finalizeTranscription(text);
          } catch (e2) {
            currentTranscription = 'Transcription failed: $e2';
          }
        } else {
          currentTranscription = 'Transcription failed: $e';
        }
      }
    } else {
      currentTranscription =
          'Recording saved to $file\nInstall whisper to auto-transcribe: pip install openai-whisper';
    }
    try {
      File(file).deleteSync();
    } catch (_) {}
    notifyListeners();
  }

  Future<String> installWhisper() async {
    isLoading = true;
    notifyListeners();
    try {
      final env = Map<String, String>.from(Platform.environment);
      env['PATH'] =
          '/opt/homebrew/bin:/usr/local/bin:${Platform.environment['HOME']}/.pyenv/shims:${env['PATH'] ?? ''}';
      final result = await Process.run('pip3', [
        'install',
        'openai-whisper',
      ], environment: env).timeout(const Duration(seconds: 120));
      await checkWhisper();
      return _stripAnsi('${result.stdout}\n${result.stderr}');
    } catch (e) {
      return 'Install failed: $e';
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  // --- Refresh ---

  Future<void> refreshAll() async {
    isLoading = true;
    notifyListeners();

    await Future.wait([
      runDoctor(),
      checkOllama(),
      checkGateway(),
      checkWhisper(),
      loadClaudeSettings(),
      checkCallStatus(),
      checkAudioLogger(),
      checkVoiceStatus(),
      loadCallEvents(),
      loadAgents(),
      loadMcpServers(),
      loadBackgroundProcesses(),
    ]);

    isLoading = false;
    notifyListeners();
  }

  // --- Doctor ---

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
      final groupMatch = RegExp(
        r'^\s+(\S+)\s+(.+?)\s+(\d+)/(\d+)\s*$',
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

      if (currentGroup != null) {
        final checkMatch = RegExp(
          r'^\s+(✓|✗|!)\s+(.+?)\s+—\s+(.+)',
        ).firstMatch(line);
        if (checkMatch != null) {
          final symbol = checkMatch.group(1)!;
          final status = symbol == '✓'
              ? 'pass'
              : symbol == '✗'
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

      if (line.contains('HEALTHY')) {
        healthStatus = 'healthy';
      } else if (line.contains('DEGRADED')) {
        healthStatus = 'degraded';
      } else if (line.contains('BROKEN')) {
        healthStatus = 'broken';
      }
    }
    if (currentGroup != null) healthGroups.add(currentGroup);
  }

  // --- Status checks ---

  Future<void> checkOllama() async {
    try {
      final result = await Process.run('curl', [
        '-s',
        '--max-time',
        '3',
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

  // --- Agents ---

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
    } catch (_) {}
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
    } catch (_) {}
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

  Future<String> chatOrchestrator(String message) async {
    final output = await _runRexArgs([
      'agents',
      'chat',
      message,
    ], timeout: 300);
    return output;
  }

  // --- Background Processes ---

  Future<void> loadBackgroundProcesses() async {
    final procs = <BackgroundProcess>[];

    // Check each known REX background service via ps
    try {
      final result = await Process.run('ps', ['aux'], environment: _env)
          .timeout(const Duration(seconds: 5));
      final lines = (result.stdout as String).split('\n');

      final checks = <String, String>{
        'rex gateway': 'Gateway (Telegram)',
        'rex daemon': 'Daemon',
        'rex call watch': 'Call Watcher',
      };

      for (final entry in checks.entries) {
        final match = lines.firstWhere(
          (l) => l.contains(entry.key) && !l.contains('grep'),
          orElse: () => '',
        );
        if (match.isNotEmpty) {
          final parts = match.trim().split(RegExp(r'\s+'));
          final pid = int.tryParse(parts.length > 1 ? parts[1] : '');
          procs.add(BackgroundProcess(
            name: entry.key,
            label: entry.value,
            pid: pid,
            running: true,
          ));
        } else {
          procs.add(BackgroundProcess(
            name: entry.key,
            label: entry.value,
            running: false,
          ));
        }
      }

      // Ollama
      final ollamaLine = lines.firstWhere(
        (l) => l.contains('ollama serve') && !l.contains('grep'),
        orElse: () => '',
      );
      final ollamaParts = ollamaLine.isNotEmpty
          ? ollamaLine.trim().split(RegExp(r'\s+'))
          : <String>[];
      procs.add(BackgroundProcess(
        name: 'ollama',
        label: 'Ollama (LLM)',
        pid: ollamaParts.length > 1 ? int.tryParse(ollamaParts[1]) : null,
        running: ollamaLine.isNotEmpty,
      ));
    } catch (_) {}

    backgroundProcesses = procs;
    notifyListeners();
  }

  Future<String> restartProcess(String processName) async {
    isLoading = true;
    notifyListeners();
    String output = '';

    try {
      switch (processName) {
        case 'rex gateway':
          // Stop then restart via launchctl
          await Process.run('launchctl', [
            'kickstart',
            '-k',
            'gui/${_uid()}/com.dstudio.rex-gateway',
          ], environment: _env);
          output = 'Gateway restarted';
          break;
        case 'rex daemon':
          await Process.run('launchctl', [
            'kickstart',
            '-k',
            'gui/${_uid()}/com.dstudio.rex-daemon',
          ], environment: _env);
          output = 'Daemon restarted';
          break;
        case 'ollama':
          await Process.run('open', [
            '-a',
            'Ollama',
          ]);
          output = 'Ollama started';
          break;
        default:
          output = 'Unknown process: $processName';
      }
    } catch (e) {
      output = 'Error: $e';
    }

    await Future.delayed(const Duration(seconds: 2));
    await loadBackgroundProcesses();
    isLoading = false;
    notifyListeners();
    return output;
  }

  String _uid() {
    try {
      final result = Process.runSync('id', ['-u']);
      return (result.stdout as String).trim();
    } catch (_) {
      return '501';
    }
  }

  // --- MCP ---

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
    } catch (_) {}
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

  // Marketplace
  List<Map<String, dynamic>> marketplaceResults = [];

  Future<void> searchMarketplace(String query) async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs(['mcp', 'search', query, '--json'], timeout: 20);
    try {
      final decoded = jsonDecode(output);
      if (decoded is List) {
        marketplaceResults = decoded.cast<Map<String, dynamic>>();
      }
    } catch (_) {
      marketplaceResults = [];
    }
    isLoading = false;
    notifyListeners();
  }

  Future<String> installMarketplace(String name) async {
    isLoading = true;
    notifyListeners();
    final output = await _runRexArgs(['mcp', 'install', name], timeout: 60);
    lastOutput = output;
    await loadMcpServers();
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> discoverMcp(String id) async {
    final output = await _runRexArgs(['mcp', 'discover', id, '--json'], timeout: 30);
    lastOutput = output;
    notifyListeners();
    return output;
  }

  // --- Audio logger ---

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

  // --- Voice CLI methods ---

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
    } catch (_) {}
    isLoading = false;
    notifyListeners();
    return output;
  }

  // --- Memory / Ingest / Prune / Optimize / Search / Categorize ---

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
    final output = await _runRex(
      statsOnly ? 'prune --stats' : 'prune',
      timeout: 60,
    );
    lastOutput = output;
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> runOptimize({bool apply = false, String? model}) async {
    isLoading = true;
    notifyListeners();
    String cmd = apply ? 'optimize --apply' : 'optimize';
    if (model != null && model.isNotEmpty) cmd += ' --model $model';
    final output = await _runRex(cmd, timeout: 180);
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

  Future<String> runCategorize({String model = 'qwen', int batch = 50}) async {
    isLoading = true;
    notifyListeners();
    final output = await _runRex(
      'categorize --model=$model --batch=$batch',
      timeout: 300,
    );
    lastOutput = output;
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> runConsolidate({
    double threshold = 0.82,
    int limit = 300,
    bool dryRun = false,
  }) async {
    isLoading = true;
    notifyListeners();
    final args =
        'consolidate --threshold=$threshold --limit=$limit${dryRun ? ' --dry-run' : ''}';
    final output = await _runRex(args, timeout: 600);
    lastOutput = output;
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<List<Map<String, dynamic>>> listMemories({
    String? category,
    int limit = 50,
  }) async {
    try {
      final args = <String>['list-memories', '--limit=$limit', '--format=json'];
      if (category != null && category != 'all')
        args.add('--category=$category');
      final result = await Process.run(
        'rex',
        args,
        environment: _env,
      ).timeout(const Duration(seconds: 30));
      final raw = _stripAnsi(result.stdout as String).trim();
      if (raw.isEmpty) return [];
      final decoded = json.decode(raw);
      if (decoded is List) return decoded.cast<Map<String, dynamic>>();
      return [];
    } catch (_) {
      return [];
    }
  }

  // --- Setup / Startup / Init ---

  Future<String> runSetup() async {
    isLoading = true;
    notifyListeners();
    final output = await _runRex('setup', timeout: 300);
    lastOutput = output;
    isLoading = false;
    notifyListeners();
    return output;
  }

  Future<String> runStartup() async => await _runRex('startup', timeout: 30);
  Future<String> runStartupRemove() async =>
      await _runRex('startup-remove', timeout: 30);

  Future<String> runInit() async {
    isLoading = true;
    notifyListeners();
    final output = await _runRex('init', timeout: 60);
    lastOutput = output;
    isLoading = false;
    await refreshAll();
    return output;
  }

  // --- App update ---

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

  // --- Telegram ---

  Future<String> runNotify(String message) async {
    final token = telegramBotToken;
    final chatId = telegramChatId;

    if (token.isEmpty || chatId.isEmpty) {
      return 'Telegram non configure.\nAjoute REX_TELEGRAM_BOT_TOKEN et REX_TELEGRAM_CHAT_ID dans Settings -> Advanced.';
    }

    try {
      final result = await Process.run('curl', [
        '-sf',
        '-X',
        'POST',
        'https://api.telegram.org/bot$token/sendMessage',
        '-d',
        'chat_id=$chatId',
        '-d',
        'parse_mode=Markdown',
        '-d',
        'text=$message',
      ]).timeout(const Duration(seconds: 15));

      if (result.exitCode == 0) {
        final body = result.stdout as String;
        final decoded = json.decode(body) as Map<String, dynamic>?;
        if (decoded?['ok'] == true) {
          return 'Message envoye via Telegram';
        } else {
          final desc = decoded?['description'] ?? 'Erreur inconnue';
          return await _fallbackNotify(message) ?? 'API Telegram: $desc';
        }
      } else {
        return await _fallbackNotify(message) ??
            'curl failed (exit ${result.exitCode})';
      }
    } catch (e) {
      return await _fallbackNotify(message) ?? 'Erreur: $e';
    }
  }

  Future<String?> _fallbackNotify(String message) async {
    final home = Platform.environment['HOME'] ?? '';
    final script = File('$home/.claude/rex-guards/notify-telegram.sh');
    if (!script.existsSync()) return null;
    try {
      final env = Map<String, String>.from(_env);
      env['REX_NOTIFY_MSG'] = message;
      final result = await Process.run('bash', [
        '-c',
        'MSG=\$REX_NOTIFY_MSG ${script.path}',
      ], environment: env).timeout(const Duration(seconds: 15));
      return result.exitCode == 0 ? 'Message envoye (via script)' : null;
    } catch (_) {
      return null;
    }
  }

  // --- Claude Code settings ---

  Map<String, dynamic> _claudeSettings = {};
  Map<String, dynamic> get claudeSettings => _claudeSettings;

  Future<void> loadClaudeSettings() async {
    try {
      final home = Platform.environment['HOME'] ?? '';
      final file = File('$home/.claude/settings.json');
      if (file.existsSync()) {
        final content = file.readAsStringSync();
        _claudeSettings = json.decode(content) as Map<String, dynamic>;
        notifyListeners();
      }
    } catch (_) {}
    await _syncCallAutomationWatcher();
  }

  Future<void> saveClaudeSettings() async {
    try {
      final home = Platform.environment['HOME'] ?? '';
      final file = File('$home/.claude/settings.json');
      final content = const JsonEncoder.withIndent(
        '  ',
      ).convert(_claudeSettings);
      file.writeAsStringSync(content);
    } catch (_) {}
  }

  String get claudeModel => (_claudeSettings['model'] as String?) ?? 'sonnet';
  String get claudeEffort =>
      (_claudeSettings['effortLevel'] as String?) ?? 'high';
  String get maxOutputTokens {
    final env = _claudeSettings['env'] as Map<String, dynamic>?;
    return (env?['CLAUDE_CODE_MAX_OUTPUT_TOKENS'] as String?) ?? '64000';
  }

  String get autocompactPct {
    final env = _claudeSettings['env'] as Map<String, dynamic>?;
    return (env?['CLAUDE_AUTOCOMPACT_PCT_OVERRIDE'] as String?) ?? '75';
  }

  String get ollamaLlmTemperature {
    final env = _claudeSettings['env'] as Map<String, dynamic>?;
    return (env?['REX_LLM_TEMPERATURE'] as String?) ?? '0.7';
  }

  String get ollamaUrl {
    final env = _claudeSettings['env'] as Map<String, dynamic>?;
    return (env?['OLLAMA_URL'] as String?) ?? 'http://localhost:11434';
  }

  bool get showTurnDuration =>
      (_claudeSettings['showTurnDuration'] as bool?) ?? true;

  String get telegramBotToken {
    final env = _claudeSettings['env'] as Map<String, dynamic>?;
    return (env?['REX_TELEGRAM_BOT_TOKEN'] as String?) ?? '';
  }

  String get telegramChatId {
    final env = _claudeSettings['env'] as Map<String, dynamic>?;
    return (env?['REX_TELEGRAM_CHAT_ID'] as String?) ?? '';
  }

  void setClaudeModel(String model) {
    _claudeSettings['model'] = model;
    saveClaudeSettings();
    notifyListeners();
  }

  void setClaudeEffort(String effort) {
    _claudeSettings['effortLevel'] = effort;
    saveClaudeSettings();
    notifyListeners();
  }

  void _setEnvKey(String key, String value) {
    final env = (_claudeSettings['env'] as Map<String, dynamic>?) ?? {};
    env[key] = value;
    _claudeSettings['env'] = env;
    saveClaudeSettings();
    notifyListeners();
  }

  void setMaxOutputTokens(String val) =>
      _setEnvKey('CLAUDE_CODE_MAX_OUTPUT_TOKENS', val);
  void setAutocompactPct(String val) =>
      _setEnvKey('CLAUDE_AUTOCOMPACT_PCT_OVERRIDE', val);
  void setOllamaTemperature(String val) =>
      _setEnvKey('REX_LLM_TEMPERATURE', val);
  void setOllamaUrl(String val) => _setEnvKey('OLLAMA_URL', val);
  void setShowTurnDuration(bool val) {
    _claudeSettings['showTurnDuration'] = val;
    saveClaudeSettings();
    notifyListeners();
  }

  void setTelegramBotToken(String val) =>
      _setEnvKey('REX_TELEGRAM_BOT_TOKEN', val);
  void setTelegramChatId(String val) => _setEnvKey('REX_TELEGRAM_CHAT_ID', val);

  String get categorizingModel {
    final env = _claudeSettings['env'] as Map<String, dynamic>?;
    return (env?['REX_CATEGORIZE_MODEL'] as String?) ?? 'qwen';
  }

  void setCategorizingModel(String model) =>
      _setEnvKey('REX_CATEGORIZE_MODEL', model);

  bool get voiceOptimizeEnabled {
    final env = _claudeSettings['env'] as Map<String, dynamic>?;
    final raw = ((env?['REX_VOICE_OPTIMIZE_ENABLED'] as String?) ?? '')
        .toLowerCase()
        .trim();
    return raw == '1' || raw == 'true' || raw == 'yes' || raw == 'on';
  }

  String get voiceOptimizeModel {
    final env = _claudeSettings['env'] as Map<String, dynamic>?;
    return (env?['REX_VOICE_OPTIMIZE_MODEL'] as String?) ?? 'qwen3.5:4b';
  }

  void setVoiceOptimizeEnabled(bool enabled) =>
      _setEnvKey('REX_VOICE_OPTIMIZE_ENABLED', enabled ? '1' : '0');
  void setVoiceOptimizeModel(String model) =>
      _setEnvKey('REX_VOICE_OPTIMIZE_MODEL', model);

  bool get callAutoRecordEnabled {
    final env = _claudeSettings['env'] as Map<String, dynamic>?;
    final raw = ((env?['REX_CALL_AUTO_RECORD_ENABLED'] as String?) ?? '')
        .toLowerCase()
        .trim();
    return raw == '1' || raw == 'true' || raw == 'yes' || raw == 'on';
  }

  void setCallAutoRecordEnabled(bool enabled) {
    _setEnvKey('REX_CALL_AUTO_RECORD_ENABLED', enabled ? '1' : '0');
    unawaited(_syncCallAutomationWatcher());
  }

  // --- Gateway ---

  Process? _gatewayProcess;

  Future<void> startGateway() async {
    if (gatewayRunning) return;
    try {
      _gatewayProcess = await Process.start('rex', [
        'gateway',
      ], environment: _env);
      // Drain stdout/stderr to prevent buffer deadlock
      _gatewayProcess!.stdout.drain<void>();
      _gatewayProcess!.stderr.drain<void>();
      await Future.delayed(const Duration(seconds: 2));
      await checkGateway();
    } catch (_) {}
  }

  Future<void> stopGateway() async {
    _gatewayProcess?.kill();
    _gatewayProcess = null;
    try {
      await Process.run('pkill', ['-f', 'rex gateway'], environment: _env);
    } catch (_) {}
    await Future.delayed(const Duration(milliseconds: 800));
    await checkGateway();
  }

  // --- LLM ---

  Future<String> runLlmTest(String prompt) async {
    isLoading = true;
    notifyListeners();
    try {
      final result = await Process.run('rex', [
        'llm',
        prompt,
      ], environment: _env).timeout(const Duration(seconds: 60));
      isLoading = false;
      notifyListeners();
      return _stripAnsi('${result.stdout}');
    } catch (e) {
      isLoading = false;
      notifyListeners();
      return 'Error: $e';
    }
  }

  // --- Context ---

  Future<String> runContext(String path) async {
    isLoading = true;
    notifyListeners();
    final output = await _runRex('context $path', timeout: 60);
    lastOutput = output;
    isLoading = false;
    notifyListeners();
    return output;
  }

  // --- File editing ---

  String? readFile(String path) {
    try {
      final resolved = path.replaceFirst(
        '~',
        Platform.environment['HOME'] ?? '',
      );
      final f = File(resolved);
      return f.existsSync() ? f.readAsStringSync() : null;
    } catch (_) {
      return null;
    }
  }

  bool writeFile(String path, String content) {
    try {
      final resolved = path.replaceFirst(
        '~',
        Platform.environment['HOME'] ?? '',
      );
      File(resolved).writeAsStringSync(content);
      return true;
    } catch (_) {
      return false;
    }
  }

  List<Map<String, String>> listEditableFiles() {
    final home = Platform.environment['HOME'] ?? '~';
    final files = <Map<String, String>>[
      {'label': 'CLAUDE.md', 'path': '$home/.claude/CLAUDE.md'},
    ];
    final rulesDir = Directory('$home/.claude/rules');
    if (rulesDir.existsSync()) {
      try {
        final ruleFiles =
            rulesDir
                .listSync()
                .whereType<File>()
                .where((f) => f.path.endsWith('.md'))
                .toList()
              ..sort((a, b) => a.path.compareTo(b.path));
        for (final f in ruleFiles) {
          files.add({
            'label': 'rules/${f.path.split('/').last}',
            'path': f.path,
          });
        }
      } catch (_) {}
    }
    return files;
  }

  // --- Ollama ---

  Future<String> pullOllamaModel(String model) async {
    isLoading = true;
    notifyListeners();
    try {
      final env = Map<String, String>.from(Platform.environment);
      env['PATH'] = '/opt/homebrew/bin:/usr/local/bin:${env['PATH'] ?? ''}';
      final result = await Process.run('ollama', [
        'pull',
        model,
      ], environment: env).timeout(const Duration(minutes: 10));
      isLoading = false;
      notifyListeners();
      return _stripAnsi('${result.stdout}\n${result.stderr}');
    } catch (e) {
      isLoading = false;
      notifyListeners();
      return 'Error: $e';
    }
  }

  @override
  void dispose() {
    _recordingTimer?.cancel();
    _callStateTimer?.cancel();
    _gatewayProcess?.kill();
    super.dispose();
  }
}
