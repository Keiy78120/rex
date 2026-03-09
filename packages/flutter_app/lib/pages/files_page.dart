import 'dart:io';
import 'package:flutter/cupertino.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

// ── Entry Point ───────────────────────────────────────────────────────────────

class FilesPage extends StatefulWidget {
  const FilesPage({super.key});

  @override
  State<FilesPage> createState() => _FilesPageState();
}

// ── State ─────────────────────────────────────────────────────────────────────

class _FilesPageState extends State<FilesPage> {
  int _tab = 0; // 0=Skills, 1=Rules, 2=Guards
  List<String> _files = [];
  String? _selectedPath;
  late TextEditingController _controller;
  bool _modified = false;
  bool _saving = false;
  bool _showNewField = false;
  final _newNameController = TextEditingController();

  // ── Paths ──────────────────────────────────────────────────────────────────

  static final _home = Platform.environment['HOME'] ?? '';

  static const _dirs = [
    '\$HOME/.claude/rex/skills',
    '\$HOME/.claude/rules',
    '\$HOME/.claude/rex-guards',
  ];

  String get _dir {
    return _dirs[_tab].replaceFirst('\$HOME', _home);
  }

  String get _ext => _tab == 2 ? '.sh' : '.md';

  String _basename(String path) => path.split('/').last;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController()
      ..addListener(() {
        if (!_modified && _selectedPath != null) {
          setState(() => _modified = true);
        }
      });
    _loadFiles();
  }

  @override
  void dispose() {
    _controller.dispose();
    _newNameController.dispose();
    super.dispose();
  }

  // ── File Ops ───────────────────────────────────────────────────────────────

  void _loadFiles() {
    try {
      final dir = Directory(_dir);
      if (!dir.existsSync()) {
        setState(() {
          _files = [];
          _selectedPath = null;
          _controller.text = '';
          _modified = false;
        });
        return;
      }
      final list = dir
          .listSync()
          .whereType<File>()
          .map((f) => f.path)
          .toList()
        ..sort();
      setState(() {
        _files = list;
        _selectedPath = null;
        _controller.text = '';
        _modified = false;
        _showNewField = false;
      });
    } catch (_) {
      setState(() => _files = []);
    }
  }

  void _selectFile(String path) {
    try {
      final content = File(path).readAsStringSync();
      setState(() {
        _selectedPath = path;
        _modified = false;
      });
      _controller.text = content;
    } catch (_) {}
  }

  Future<void> _saveFile() async {
    if (_selectedPath == null) return;
    setState(() => _saving = true);
    try {
      File(_selectedPath!).writeAsStringSync(_controller.text);
      setState(() {
        _modified = false;
        _saving = false;
      });
    } catch (_) {
      setState(() => _saving = false);
    }
  }

  Future<void> _createFile() async {
    final name = _newNameController.text.trim();
    if (name.isEmpty) return;
    final slug = name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-').replaceAll(RegExp(r'^-+|-+$'), '');
    if (slug.isEmpty) return;
    final ext = name.endsWith(_ext) ? '' : _ext;
    final path = '$_dir/$slug$ext';
    try {
      Directory(_dir).createSync(recursive: true);
      File(path).writeAsStringSync('');
      _newNameController.clear();
      _loadFiles();
      _selectFile(path);
    } catch (_) {}
  }

  Future<void> _deleteFile(String path) async {
    try {
      File(path).deleteSync();
      if (_selectedPath == path) {
        setState(() {
          _selectedPath = null;
          _controller.text = '';
          _modified = false;
        });
      }
      _loadFiles();
    } catch (_) {}
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return RexPageLayout(
      title: 'Files',
      actions: [
        if (_selectedPath != null && _modified)
          RexHeaderButton(
            icon: _saving ? CupertinoIcons.circle : CupertinoIcons.checkmark,
            label: _saving ? 'Saving…' : 'Save',
            onPressed: _saving ? null : _saveFile,
          ),
        RexHeaderButton(
          icon: CupertinoIcons.add,
          label: 'New',
          onPressed: () => setState(() => _showNewField = !_showNewField),
        ),
        RexHeaderButton(
          icon: CupertinoIcons.refresh,
          label: 'Refresh',
          onPressed: _loadFiles,
        ),
      ],
      builder: (context, scroll) {
        return Column(
          children: [
            // Tab bar
            _TabBar(
              selected: _tab,
              onChanged: (i) {
                setState(() => _tab = i);
                _loadFiles();
              },
            ),
            // New file input
            if (_showNewField) _NewFileRow(
              controller: _newNameController,
              ext: _ext,
              onCreate: _createFile,
              onCancel: () => setState(() {
                _showNewField = false;
                _newNameController.clear();
              }),
            ),
            // Body
            Expanded(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // File list
                  _FileList(
                    files: _files,
                    selectedPath: _selectedPath,
                    onSelect: _selectFile,
                    onDelete: _deleteFile,
                    basename: _basename,
                    dir: _dir,
                    ext: _ext,
                    tab: _tab,
                  ),
                  // Vertical separator
                  Container(
                    width: 1,
                    color: context.rex.separator,
                  ),
                  // Editor
                  Expanded(
                    child: _selectedPath == null
                        ? _EmptyEditor(tab: _tab)
                        : _Editor(
                            path: _selectedPath!,
                            basename: _basename(_selectedPath!),
                            controller: _controller,
                            modified: _modified,
                          ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

// ── Tab Bar ───────────────────────────────────────────────────────────────────

class _TabBar extends StatelessWidget {
  const _TabBar({required this.selected, required this.onChanged});
  final int selected;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final tabs = ['Skills', 'Rules', 'Guards'];
    return Container(
      height: 40,
      decoration: BoxDecoration(
        color: context.rex.surface,
        border: Border(bottom: BorderSide(color: context.rex.separator)),
      ),
      child: Row(
        children: [
          const SizedBox(width: 16),
          ...tabs.asMap().entries.map((e) {
            final active = e.key == selected;
            return GestureDetector(
              onTap: () => onChanged(e.key),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      color: active ? context.rex.accent : const Color(0x00000000),
                      width: 2,
                    ),
                  ),
                ),
                child: Text(
                  e.value,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                    color: active ? context.rex.accent : context.rex.textSecondary,
                  ),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}

// ── New File Row ──────────────────────────────────────────────────────────────

class _NewFileRow extends StatelessWidget {
  const _NewFileRow({
    required this.controller,
    required this.ext,
    required this.onCreate,
    required this.onCancel,
  });
  final TextEditingController controller;
  final String ext;
  final VoidCallback onCreate;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: context.rex.card,
      child: Row(
        children: [
          const Text('New file:', style: TextStyle(fontSize: 13)),
          const SizedBox(width: 8),
          Expanded(
            child: CupertinoTextField(
              controller: controller,
              placeholder: 'name (auto-slugified)$ext',
              style: TextStyle(fontSize: 13, color: context.rex.text),
              onSubmitted: (_) => onCreate(),
              autofocus: true,
            ),
          ),
          const SizedBox(width: 8),
          CupertinoButton(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            minSize: 0,
            color: context.rex.accent,
            borderRadius: BorderRadius.circular(6),
            onPressed: onCreate,
            child: const Text('Create', style: TextStyle(fontSize: 12, color: CupertinoColors.white)),
          ),
          const SizedBox(width: 6),
          CupertinoButton(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            minSize: 0,
            onPressed: onCancel,
            child: Text('Cancel', style: TextStyle(fontSize: 12, color: context.rex.textSecondary)),
          ),
        ],
      ),
    );
  }
}

// ── File List ─────────────────────────────────────────────────────────────────

class _FileList extends StatelessWidget {
  const _FileList({
    required this.files,
    required this.selectedPath,
    required this.onSelect,
    required this.onDelete,
    required this.basename,
    required this.dir,
    required this.ext,
    required this.tab,
  });
  final List<String> files;
  final String? selectedPath;
  final ValueChanged<String> onSelect;
  final ValueChanged<String> onDelete;
  final String Function(String) basename;
  final String dir;
  final String ext;
  final int tab;

  @override
  Widget build(BuildContext context) {
    const w = 200.0;
    if (files.isEmpty) {
      return SizedBox(
        width: w,
        child: Center(
          child: Text(
            'No files in\n$dir',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: context.rex.textTertiary),
          ),
        ),
      );
    }
    return SizedBox(
      width: w,
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: files.length,
        itemBuilder: (context, i) {
          final path = files[i];
          final name = basename(path);
          final selected = path == selectedPath;
          return _FileRow(
            name: name,
            selected: selected,
            onTap: () => onSelect(path),
            onDelete: () => onDelete(path),
          );
        },
      ),
    );
  }
}

class _FileRow extends StatefulWidget {
  const _FileRow({
    required this.name,
    required this.selected,
    required this.onTap,
    required this.onDelete,
  });
  final String name;
  final bool selected;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  @override
  State<_FileRow> createState() => _FileRowState();
}

class _FileRowState extends State<_FileRow> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final bgColor = widget.selected
        ? context.rex.accent.withValues(alpha: 0.10)
        : _hovered
            ? context.rex.text.withValues(alpha: 0.04)
            : const Color(0x00000000);

    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  widget.name,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: widget.selected ? FontWeight.w600 : FontWeight.w400,
                    color: widget.selected ? context.rex.accent : context.rex.text,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (_hovered || widget.selected)
                GestureDetector(
                  onTap: widget.onDelete,
                  child: Icon(
                    CupertinoIcons.trash,
                    size: 13,
                    color: context.rex.error.withValues(alpha: 0.7),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Editor ────────────────────────────────────────────────────────────────────

class _Editor extends StatelessWidget {
  const _Editor({
    required this.path,
    required this.basename,
    required this.controller,
    required this.modified,
  });
  final String path;
  final String basename;
  final TextEditingController controller;
  final bool modified;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // File header
        Container(
          height: 36,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: context.rex.card,
            border: Border(bottom: BorderSide(color: context.rex.separator)),
          ),
          child: Row(
            children: [
              Text(
                basename,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: context.rex.text,
                ),
              ),
              if (modified) ...[
                const SizedBox(width: 6),
                Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: context.rex.accent,
                    shape: BoxShape.circle,
                  ),
                ),
              ],
              const Spacer(),
              Text(
                path,
                style: TextStyle(fontSize: 10, color: context.rex.textTertiary),
              ),
            ],
          ),
        ),
        // Text area
        Expanded(
          child: CupertinoTextField(
            controller: controller,
            maxLines: null,
            expands: true,
            textAlignVertical: TextAlignVertical.top,
            style: const TextStyle(
              fontFamily: 'Menlo',
              fontSize: 12,
              height: 1.6,
            ),
            decoration: const BoxDecoration(color: Color(0x00000000)),
            padding: const EdgeInsets.all(16),
          ),
        ),
      ],
    );
  }
}

class _EmptyEditor extends StatelessWidget {
  const _EmptyEditor({required this.tab});
  final int tab;

  @override
  Widget build(BuildContext context) {
    final labels = ['skill', 'rule', 'guard'];
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(CupertinoIcons.doc_text, size: 32, color: context.rex.textTertiary),
          const SizedBox(height: 10),
          Text(
            'Select a ${labels[tab]} to edit',
            style: TextStyle(fontSize: 14, color: context.rex.textSecondary),
          ),
        ],
      ),
    );
  }
}
