import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:macos_ui/macos_ui.dart';
import 'package:pty/pty.dart';
import 'package:xterm/xterm.dart';
import '../theme.dart';

class TerminalPage extends StatefulWidget {
  const TerminalPage({super.key});

  @override
  State<TerminalPage> createState() => _TerminalPageState();
}

class _TerminalPageState extends State<TerminalPage> {
  late final Terminal _terminal;
  PseudoTerminal? _pty;
  bool _connected = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _terminal = Terminal(maxLines: 10000);
    _startPty();
  }

  @override
  void dispose() {
    _pty?.kill();
    super.dispose();
  }

  void _startPty() {
    try {
      final home = Platform.environment['HOME'] ?? '/';
      final pathDirs = [
        '$home/.nvm/versions/node/v22.20.0/bin',
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin',
        Platform.environment['PATH'] ?? '',
      ].join(':');

      final env = Map<String, String>.from(Platform.environment);
      env['PATH'] = pathDirs;
      env['TERM'] = 'xterm-256color';
      env['COLORTERM'] = 'truecolor';
      env['LANG'] = env['LANG'] ?? 'en_US.UTF-8';

      _pty = PseudoTerminal.start(
        '/bin/zsh',
        ['-l'],
        workingDirectory: home,
        environment: env,
      );

      // PTY output → terminal
      _pty!.out.listen(
        (data) => _terminal.write(data),
        onDone: () {
          if (mounted) setState(() => _connected = false);
        },
      );

      // Terminal input → PTY
      _terminal.onOutput = (data) => _pty!.write(data);

      // Terminal resize → PTY
      _terminal.onResize = (w, h, pw, ph) => _pty!.resize(w, h);

      // Wait for process exit
      _pty!.exitCode.then((code) {
        if (mounted) {
          setState(() {
            _connected = false;
            _terminal.write('\r\n[Process exited with code $code]\r\n');
          });
        }
      });

      setState(() {
        _connected = true;
        _error = null;
      });
    } catch (e) {
      setState(() {
        _connected = false;
        _error = e.toString();
      });
    }
  }

  void _restart() {
    _pty?.kill();
    _pty = null;
    _terminal.write('\r\n--- Restarting terminal ---\r\n');
    _startPty();
  }

  static const _darkTheme = TerminalTheme(
    cursor: Color(0xFFE5484D),
    selection: Color(0x803D3D4D),
    foreground: Color(0xFFD4D4D8),
    background: Color(0xFF1C1C24),
    black: Color(0xFF1E1E2A),
    red: Color(0xFFE5484D),
    green: Color(0xFF4EC994),
    yellow: Color(0xFFF0B429),
    blue: Color(0xFF5B8AF0),
    magenta: Color(0xFFC47EDB),
    cyan: Color(0xFF4EC9B0),
    white: Color(0xFFD4D4D8),
    brightBlack: Color(0xFF3C3C4C),
    brightRed: Color(0xFFFF5F57),
    brightGreen: Color(0xFF5AF78E),
    brightYellow: Color(0xFFF3F99D),
    brightBlue: Color(0xFF57C7FF),
    brightMagenta: Color(0xFFFF6AC1),
    brightCyan: Color(0xFF9AEDFE),
    brightWhite: Color(0xFFF1F1F0),
    searchHitBackground: Color(0x80F0B429),
    searchHitBackgroundCurrent: Color(0xCCF0B429),
    searchHitForeground: Color(0xFF1C1C24),
  );

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return Column(
      children: [
        // Title bar
        Container(
          height: 40,
          color: c.surface,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              Icon(CupertinoIcons.chevron_right_square, size: 14, color: c.textSecondary),
              const SizedBox(width: 8),
              Text(
                'Terminal',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: c.text,
                ),
              ),
              const Spacer(),
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _connected ? c.accent : c.textSecondary,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                _connected ? 'Connected' : 'Disconnected',
                style: TextStyle(fontSize: 11, color: c.textSecondary),
              ),
              const SizedBox(width: 12),
              MacosIconButton(
                icon: Icon(
                  CupertinoIcons.refresh,
                  size: 14,
                  color: c.textSecondary,
                ),
                onPressed: _restart,
              ),
            ],
          ),
        ),
        Container(height: 1, color: c.separator),
        Expanded(
          child: _error != null
              ? _buildError(context, c)
              : Container(
                  color: const Color(0xFF1C1C24),
                  child: TerminalView(
                    _terminal,
                    theme: _darkTheme,
                    autofocus: true,
                    padding: const EdgeInsets.all(8),
                    textStyle: const TerminalStyle(
                      fontFamily: 'Menlo',
                      fontSize: 13,
                    ),
                    keyboardType: TextInputType.multiline,
                  ),
                ),
        ),
      ],
    );
  }

  Widget _buildError(BuildContext context, RexColors c) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(CupertinoIcons.xmark_circle, size: 32, color: c.error),
            const SizedBox(height: 12),
            Text(
              'Failed to start terminal',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: c.text,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _error ?? 'Unknown error',
              style: TextStyle(fontSize: 12, color: c.textSecondary),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            CupertinoButton(
              onPressed: _restart,
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
