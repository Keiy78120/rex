import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

class WorkflowPage extends StatefulWidget {
  const WorkflowPage({super.key});

  @override
  State<WorkflowPage> createState() => _WorkflowPageState();
}

class _WorkflowPageState extends State<WorkflowPage> {
  bool _loading = false;
  String? _toast;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadAll());
  }

  Future<void> _loadAll() async {
    setState(() => _loading = true);
    final rex = context.read<RexService>();
    await Future.wait([
      rex.loadGitStatus(),
      rex.loadBackups(),
      rex.loadJournalStats(),
      rex.loadCacheStats(),
    ]);
    if (mounted) setState(() => _loading = false);
  }

  void _showToast(String msg) {
    setState(() => _toast = msg);
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) setState(() => _toast = null);
    });
  }

  @override
  Widget build(BuildContext context) {
    return RexPageLayout(
      title: 'Workflow',
      actions: [
        RexHeaderButton(
          icon: CupertinoIcons.refresh,
          label: 'Refresh',
          onPressed: _loadAll,
        ),
      ],
      builder: (context, scrollController) {
        return Consumer<RexService>(
          builder: (context, rex, _) {
            if (_loading) {
              return const Center(child: CupertinoActivityIndicator(radius: 12));
            }
            return Stack(
              children: [
                ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.all(20),
                  children: [
                    _GitSection(
                      status: rex.gitStatus,
                      onAction: (action, arg) async {
                        final out = await rex.runWorkflow(action, arg);
                        await rex.loadGitStatus();
                        _showToast(out.isNotEmpty ? out.split('\n').first : '✓ Done');
                      },
                    ),
                    _BackupSection(
                      backups: rex.backups,
                      onCreateBackup: () async {
                        _showToast('Creating backup…');
                        final result = await rex.createBackup();
                        _showToast(result);
                      },
                    ),
                    _IntelSection(
                      journalStats: rex.journalStats,
                      cacheStats: rex.cacheStats,
                      onReplayJournal: () async {
                        _showToast('Replaying events…');
                        await rex.replayJournal();
                        _showToast('Replay complete');
                      },
                      onCleanCache: () async {
                        await rex.cleanCache();
                        _showToast('Cache cleaned');
                      },
                    ),
                  ],
                ),
                if (_toast != null)
                  Positioned(
                    bottom: 20,
                    left: 20,
                    right: 20,
                    child: _Toast(message: _toast!),
                  ),
              ],
            );
          },
        );
      },
    );
  }
}

// ── Git Section ────────────────────────────────────────────────────────────

class _GitSection extends StatefulWidget {
  const _GitSection({required this.status, required this.onAction});

  final Map<String, dynamic> status;
  final Future<void> Function(String action, String? arg) onAction;

  @override
  State<_GitSection> createState() => _GitSectionState();
}

class _GitSectionState extends State<_GitSection> {
  final _nameCtrl = TextEditingController();
  String _mode = ''; // '' | 'feature' | 'bugfix'

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final branch = widget.status['branch'] as String? ?? 'unknown';
    final total = widget.status['total'] as int? ?? 0;
    final modified = widget.status['modified'] as int? ?? 0;
    final added = widget.status['added'] as int? ?? 0;
    final deleted = widget.status['deleted'] as int? ?? 0;
    final files = (widget.status['files'] as List?)?.cast<String>() ?? [];
    final commits = (widget.status['recentCommits'] as List?)?.cast<String>() ?? [];
    final cwd = widget.status['cwd'] as String? ?? '';

    final isMain = branch == 'main' || branch == 'master';
    final branchColor = isMain ? CupertinoColors.systemOrange : CupertinoColors.systemGreen;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(label: 'GIT STATUS', icon: CupertinoIcons.arrow_branch),
        RexCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Branch + path
              Row(
                children: [
                  Icon(CupertinoIcons.arrow_branch, size: 14, color: branchColor),
                  const SizedBox(width: 6),
                  Text(
                    branch,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: branchColor),
                  ),
                  const Spacer(),
                  if (isMain)
                    RexStatusChip(label: 'main', status: RexChipStatus.warning, small: true),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                cwd,
                style: TextStyle(fontSize: 10, color: context.rex.textTertiary),
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 12),
              // Change stats
              if (total > 0) ...[
                Row(
                  children: [
                    _ChangeStat(count: modified, label: 'modified', color: CupertinoColors.systemYellow),
                    const SizedBox(width: 12),
                    _ChangeStat(count: added, label: 'added', color: CupertinoColors.systemGreen),
                    const SizedBox(width: 12),
                    _ChangeStat(count: deleted, label: 'deleted', color: CupertinoColors.systemRed),
                  ],
                ),
                const SizedBox(height: 10),
                // File list
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: context.rex.surface,
                    borderRadius: BorderRadius.circular(7),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: files.map((f) => Text(
                      f,
                      style: TextStyle(fontSize: 11, fontFamily: 'monospace', color: context.rex.textSecondary),
                    )).toList(),
                  ),
                ),
              ] else ...[
                Row(
                  children: [
                    Icon(CupertinoIcons.checkmark_circle_fill, size: 14, color: CupertinoColors.systemGreen),
                    const SizedBox(width: 6),
                    Text('Working tree clean', style: TextStyle(fontSize: 12, color: context.rex.textSecondary)),
                  ],
                ),
              ],
              if (commits.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text('RECENT COMMITS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, letterSpacing: 0.6, color: context.rex.textTertiary)),
                const SizedBox(height: 6),
                for (final c in commits)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 3),
                    child: Text(
                      c,
                      style: TextStyle(fontSize: 11, fontFamily: 'monospace', color: context.rex.textSecondary),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
              ],
            ],
          ),
        ),
        // Quick actions
        RexCard(
          title: 'Quick Actions',
          child: Column(
            children: [
              if (_mode.isEmpty) ...[
                _ActionRow(
                  icon: CupertinoIcons.sparkles,
                  label: 'New Feature Branch',
                  subtitle: 'feat/<name>',
                  onTap: () => setState(() { _mode = 'feature'; _nameCtrl.clear(); }),
                ),
                Container(height: 1, color: context.rex.separator),
                _ActionRow(
                  icon: CupertinoIcons.wrench_fill,
                  label: 'New Bugfix Branch',
                  subtitle: 'fix/<description>',
                  onTap: () => setState(() { _mode = 'bugfix'; _nameCtrl.clear(); }),
                ),
                Container(height: 1, color: context.rex.separator),
                _ActionRow(
                  icon: CupertinoIcons.arrow_up_circle_fill,
                  label: 'Create Pull Request',
                  subtitle: 'push + gh pr create',
                  onTap: () => widget.onAction('pr', null),
                ),
              ] else ...[
                _Field(
                  label: _mode == 'feature' ? 'Feature name' : 'Bug description',
                  controller: _nameCtrl,
                  placeholder: _mode == 'feature' ? 'add-oauth-provider' : 'fix-token-refresh',
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    GestureDetector(
                      onTap: () => setState(() => _mode = ''),
                      child: Text('Cancel', style: TextStyle(fontSize: 12, color: context.rex.textSecondary)),
                    ),
                    const SizedBox(width: 16),
                    GestureDetector(
                      onTap: () async {
                        final name = _nameCtrl.text.trim();
                        if (name.isEmpty) return;
                        final action = _mode;
                        setState(() => _mode = '');
                        await widget.onAction(action, name);
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(
                          color: context.rex.accent,
                          borderRadius: BorderRadius.circular(7),
                        ),
                        child: Text(
                          _mode == 'feature' ? 'Start Feature' : 'Start Bugfix',
                          style: const TextStyle(fontSize: 12, color: CupertinoColors.white, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

// ── Backup Section ────────────────────────────────────────────────────────────

class _BackupSection extends StatelessWidget {
  const _BackupSection({required this.backups, required this.onCreateBackup});

  final List<Map<String, dynamic>> backups;
  final VoidCallback onCreateBackup;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(label: 'BACKUPS', icon: CupertinoIcons.archivebox_fill),
        RexCard(
          trailing: GestureDetector(
            onTap: onCreateBackup,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(CupertinoIcons.plus_circle_fill, size: 14, color: context.rex.accent),
                const SizedBox(width: 4),
                Text('Backup Now', style: TextStyle(fontSize: 12, color: context.rex.accent, fontWeight: FontWeight.w500)),
              ],
            ),
          ),
          child: backups.isEmpty
              ? RexEmptyState(
                  icon: CupertinoIcons.archivebox,
                  title: 'No backups yet',
                  subtitle: 'Backups are created daily by the daemon or manually.',
                )
              : Column(
                  children: [
                    for (int i = 0; i < backups.length; i++) ...[
                      _BackupRow(backup: backups[i]),
                      if (i < backups.length - 1)
                        Container(height: 1, color: context.rex.separator),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

class _BackupRow extends StatelessWidget {
  const _BackupRow({required this.backup});

  final Map<String, dynamic> backup;

  @override
  Widget build(BuildContext context) {
    final filename = backup['filename'] as String? ?? '';
    final size = backup['sizeHuman'] as String? ?? '';
    final path = backup['path'] as String? ?? '';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      child: Row(
        children: [
          Icon(CupertinoIcons.archivebox_fill, size: 14, color: context.rex.textTertiary),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(filename, style: TextStyle(fontSize: 12, color: context.rex.text, fontWeight: FontWeight.w500)),
                if (path.isNotEmpty)
                  Text(path, style: TextStyle(fontSize: 10, color: context.rex.textTertiary), overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          Text(size, style: TextStyle(fontSize: 11, color: context.rex.textSecondary)),
        ],
      ),
    );
  }
}

// ── Intel Section ─────────────────────────────────────────────────────────────

class _IntelSection extends StatelessWidget {
  const _IntelSection({
    required this.journalStats,
    required this.cacheStats,
    required this.onReplayJournal,
    required this.onCleanCache,
  });

  final Map<String, dynamic> journalStats;
  final Map<String, dynamic> cacheStats;
  final VoidCallback onReplayJournal;
  final VoidCallback onCleanCache;

  @override
  Widget build(BuildContext context) {
    final total = journalStats['total'] as int? ?? 0;
    final unacked = journalStats['unacked'] as int? ?? 0;
    final newest = journalStats['newest'] as String? ?? '';

    final cacheEntries = cacheStats['totalEntries'] as int? ?? 0;
    final cacheHits = cacheStats['totalHits'] as int? ?? 0;
    final tokensSaved = cacheStats['totalTokensSaved'] as int? ?? 0;
    final hitRate = (cacheStats['hitRate'] as num? ?? 0).toDouble();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(label: 'INTELLIGENCE', icon: CupertinoIcons.waveform_path_ecg),
        Row(
          children: [
            Expanded(
              child: RexCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(CupertinoIcons.list_bullet_below_rectangle, size: 14, color: context.rex.textSecondary),
                        const SizedBox(width: 6),
                        Text('Event Journal', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.rex.text)),
                        const Spacer(),
                        if (unacked > 0)
                          GestureDetector(
                            onTap: onReplayJournal,
                            child: Text('Replay', style: TextStyle(fontSize: 11, color: context.rex.accent)),
                          ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    RexStatRow(label: 'Total events', value: '$total'),
                    RexStatRow(
                      label: 'Unacked',
                      value: '$unacked',
                      valueColor: unacked > 0 ? CupertinoColors.systemOrange : CupertinoColors.systemGreen,
                    ),
                    if (newest.isNotEmpty)
                      RexStatRow(label: 'Latest', value: _shortDate(newest)),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: RexCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(CupertinoIcons.bolt_circle_fill, size: 14, color: context.rex.textSecondary),
                        const SizedBox(width: 6),
                        Text('Semantic Cache', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.rex.text)),
                        const Spacer(),
                        GestureDetector(
                          onTap: onCleanCache,
                          child: Text('Clean', style: TextStyle(fontSize: 11, color: context.rex.accent)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    RexStatRow(label: 'Entries', value: '$cacheEntries'),
                    RexStatRow(label: 'Total hits', value: '$cacheHits'),
                    RexStatRow(label: 'Tokens saved', value: _formatTokens(tokensSaved)),
                    RexStatRow(label: 'Hit rate', value: '${hitRate.toStringAsFixed(1)}×'),
                  ],
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  String _shortDate(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.month}/${dt.day} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso.length > 16 ? iso.substring(0, 16) : iso;
    }
  }

  String _formatTokens(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
    return '$n';
  }
}

// ── Shared Widgets ────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.label, required this.icon});

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Icon(icon, size: 12, color: context.rex.textTertiary),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.8,
              color: context.rex.textTertiary,
            ),
          ),
        ],
      ),
    );
  }
}

class _ChangeStat extends StatelessWidget {
  const _ChangeStat({required this.count, required this.label, required this.color});

  final int count;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          '$count',
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: count > 0 ? color : context.rex.textTertiary),
        ),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(fontSize: 11, color: context.rex.textTertiary)),
      ],
    );
  }
}

class _ActionRow extends StatefulWidget {
  const _ActionRow({required this.icon, required this.label, required this.subtitle, required this.onTap});

  final IconData icon;
  final String label;
  final String subtitle;
  final VoidCallback onTap;

  @override
  State<_ActionRow> createState() => _ActionRowState();
}

class _ActionRowState extends State<_ActionRow> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
          color: _hovered ? context.rex.text.withValues(alpha: 0.04) : const Color(0x00000000),
          child: Row(
            children: [
              Icon(widget.icon, size: 16, color: context.rex.accent),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(widget.label, style: TextStyle(fontSize: 13, color: context.rex.text, fontWeight: FontWeight.w500)),
                    Text(widget.subtitle, style: TextStyle(fontSize: 11, color: context.rex.textTertiary)),
                  ],
                ),
              ),
              Icon(CupertinoIcons.chevron_right, size: 12, color: context.rex.textTertiary),
            ],
          ),
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.controller, required this.placeholder});

  final String label;
  final TextEditingController controller;
  final String placeholder;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: context.rex.textSecondary)),
        const SizedBox(height: 5),
        Container(
          decoration: BoxDecoration(
            color: context.rex.surface,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: context.rex.separator),
          ),
          child: CupertinoTextField(
            controller: controller,
            placeholder: placeholder,
            placeholderStyle: TextStyle(fontSize: 13, color: context.rex.textTertiary),
            style: TextStyle(fontSize: 13, color: context.rex.text),
            decoration: const BoxDecoration(),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          ),
        ),
      ],
    );
  }
}

class _Toast extends StatelessWidget {
  const _Toast({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: context.rex.text,
          borderRadius: BorderRadius.circular(10),
          boxShadow: [BoxShadow(color: CupertinoColors.black.withValues(alpha: 0.15), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Text(
          message,
          style: TextStyle(fontSize: 13, color: context.rex.surface, fontWeight: FontWeight.w500),
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
      ),
    );
  }
}
