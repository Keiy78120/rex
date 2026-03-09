import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

class NetworkPage extends StatefulWidget {
  const NetworkPage({super.key});
  @override
  State<NetworkPage> createState() => _NetworkPageState();
}

class _NetworkPageState extends State<NetworkPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<RexService>().loadNetworkStatus();
    });
  }

  @override
  Widget build(BuildContext context) {
    return RexPageLayout(
      title: 'Network',
      actions: [
        RexHeaderButton(
          icon: CupertinoIcons.refresh,
          label: 'Refresh',
          onPressed: () => context.read<RexService>().loadNetworkStatus(),
        ),
      ],
      builder: (context, scrollController) {
        return Consumer<RexService>(
          builder: (context, rex, _) {
            if (rex.isLoading && rex.nodeStatus == null) {
              return const Center(child: CupertinoActivityIndicator());
            }
            if (rex.nodeStatus == null) {
              return RexEmptyState(
                icon: CupertinoIcons.wifi_slash,
                title: 'No network data',
                subtitle: 'Could not load network status.',
                actionLabel: 'Retry',
                onAction: () => rex.loadNetworkStatus(),
              );
            }
            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.all(20),
              children: [
                _TopologyBanner(node: rex.nodeStatus!),
                const SizedBox(height: 16),
                // Node identity card
                RexSection(title: 'This Node', icon: CupertinoIcons.desktopcomputer),
                _NodeIdentityCard(node: rex.nodeStatus!),
                const SizedBox(height: 8),
                // Commander section
                RexSection(title: 'Commander', icon: CupertinoIcons.circle_grid_hex),
                _HubCard(hub: rex.hubStatus),
                const SizedBox(height: 8),
                // Sync section
                RexSection(title: 'Sync', icon: CupertinoIcons.arrow_2_circlepath),
                _SyncCard(sync: rex.syncStatus),
                const SizedBox(height: 8),
                // Tailscale mesh peers
                if ((rex.nodeStatus!['tailscalePeers'] as List?)?.isNotEmpty == true) ...[
                  const SizedBox(height: 8),
                  RexSection(title: 'Mesh Peers', icon: CupertinoIcons.antenna_radiowaves_left_right),
                  _MeshPeersCard(peers: (rex.nodeStatus!['tailscalePeers'] as List)
                      .whereType<Map<String, dynamic>>().toList()),
                ],
                const SizedBox(height: 8),
                // Queue section
                RexSection(title: 'Event Queue', icon: CupertinoIcons.tray_full),
                _QueueCard(queue: rex.queueStats),
              ],
            );
          },
        );
      },
    );
  }
}

class _TopologyBanner extends StatelessWidget {
  final Map<String, dynamic> node;
  const _TopologyBanner({required this.node});
  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final mode = (node['mode'] as String?) ?? 'solo';
    final connected = node['hubConnected'] == true;
    final modeIcon = mode == 'fleet'
        ? CupertinoIcons.device_laptop
        : mode == 'cluster'
            ? CupertinoIcons.square_stack_3d_up
            : CupertinoIcons.person;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [c.accent.withAlpha(20), c.accent.withAlpha(6)]),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.accent.withAlpha(40)),
      ),
      child: Row(children: [
        Icon(modeIcon, size: 36, color: c.accent),
        const SizedBox(width: 16),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(mode.toUpperCase(),
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: c.text)),
          const SizedBox(height: 4),
          Text('Topology mode',
              style: TextStyle(fontSize: 12, color: c.textSecondary)),
        ]),
        const Spacer(),
        RexStatusChip(
          label: connected ? 'Connected' : 'Disconnected',
          status: connected ? RexChipStatus.ok : RexChipStatus.error,
        ),
      ]),
    );
  }
}

class _NodeIdentityCard extends StatelessWidget {
  final Map<String, dynamic> node;
  const _NodeIdentityCard({required this.node});
  @override
  Widget build(BuildContext context) {
    final nodeId = (node['nodeId'] as String?) ?? '';
    final hostname = (node['hostname'] as String?) ?? '';
    final platform = (node['platform'] as String?) ?? '';
    final nodeType = (node['type'] as String?) ?? 'desktop';
    final connected = node['hubConnected'] == true;
    return RexCard(
      child: Column(children: [
        RexStatRow(
          label: 'Node ID',
          value: nodeId.length > 12 ? '${nodeId.substring(0, 12)}...' : nodeId,
          icon: CupertinoIcons.tag,
        ),
        if (hostname.isNotEmpty)
          RexStatRow(
            label: 'Hostname',
            value: hostname,
            icon: CupertinoIcons.desktopcomputer,
          ),
        if (platform.isNotEmpty)
          RexStatRow(
            label: 'Platform',
            value: platform,
            icon: CupertinoIcons.device_laptop,
          ),
        RexStatRow(
          label: 'Type',
          value: nodeType,
          icon: CupertinoIcons.cube,
        ),
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Row(children: [
            Text('Status', style: TextStyle(fontSize: 12, color: context.rex.textSecondary)),
            const Spacer(),
            RexStatusChip(
              label: connected ? 'Online' : 'Offline',
              status: connected ? RexChipStatus.ok : RexChipStatus.inactive,
              small: true,
            ),
          ]),
        ),
      ]),
    );
  }
}

class _HubCard extends StatelessWidget {
  final Map<String, dynamic>? hub;
  const _HubCard({required this.hub});
  @override
  Widget build(BuildContext context) {
    final running = hub?['running'] == true;
    final port = hub?['port'] as int?;
    final nodesCount = (hub?['nodesCount'] as int?) ?? 0;
    final nodes = (hub?['nodes'] as List?)?.whereType<Map<String, dynamic>>().toList() ?? [];
    return RexCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          RexStatusChip(
            label: running ? 'Running' : 'Offline',
            status: running ? RexChipStatus.ok : RexChipStatus.error,
            small: true,
          ),
          const Spacer(),
          if (running && port != null)
            Text(':$port',
                style: TextStyle(fontSize: 12, fontFamily: 'Menlo', color: context.rex.textTertiary)),
          if (running) ...[
            const SizedBox(width: 10),
            Text('$nodesCount node${nodesCount != 1 ? 's' : ''}',
                style: TextStyle(fontSize: 12, color: context.rex.textSecondary)),
          ],
        ]),
        if (running && nodes.isNotEmpty) ...[
          const SizedBox(height: 12),
          Container(height: 0.5, color: context.rex.separator),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(
              'SPECIALISTS',
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, letterSpacing: 0.6, color: context.rex.textTertiary),
            ),
          ),
          ...nodes.map((n) => _ConnectedNodeRow(node: n)),
        ],
        const SizedBox(height: 12),
        Row(children: [
          if (!running)
            RexButton(
              label: 'Start Commander',
              icon: CupertinoIcons.play_fill,
              variant: RexButtonVariant.success,
              small: true,
              onPressed: () => context.read<RexService>().startHub(),
            )
          else
            RexButton(
              label: 'Stop Commander',
              icon: CupertinoIcons.stop_fill,
              variant: RexButtonVariant.danger,
              small: true,
              onPressed: () => context.read<RexService>().stopHub(),
            ),
        ]),
      ]),
    );
  }
}

class _ConnectedNodeRow extends StatelessWidget {
  final Map<String, dynamic> node;
  const _ConnectedNodeRow({required this.node});
  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final id = (node['id'] as String?) ?? '';
    final truncId = id.length > 8 ? id.substring(0, 8) : id;
    final hostname = (node['hostname'] as String?) ?? '';
    final platform = (node['platform'] as String?) ?? '';
    final lastSeen = (node['lastSeen'] as String?) ?? '';
    final role = (node['role'] as String?) ?? '';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Text(truncId, style: TextStyle(fontSize: 12, fontFamily: 'Menlo', color: c.textSecondary)),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(hostname, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: c.text)),
          Text('$platform  $lastSeen', style: TextStyle(fontSize: 11, color: c.textTertiary)),
        ])),
        if (role.isNotEmpty)
          RexStatusChip(label: role, status: RexChipStatus.pending, small: true),
      ]),
    );
  }
}

class _SyncCard extends StatelessWidget {
  final Map<String, dynamic>? sync;
  const _SyncCard({required this.sync});
  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final lastPush = (sync?['lastPush'] as String?) ?? '';
    final lastPull = (sync?['lastPull'] as String?) ?? '';
    final pendingPush = (sync?['pendingPush'] as int?) ?? 0;
    final pendingPull = (sync?['pendingPull'] as int?) ?? 0;
    final autoSync = sync?['autoSync'] == true;
    return RexCard(
      child: Column(children: [
        Row(children: [
          if (autoSync)
            RexStatusChip(label: 'AUTO', status: RexChipStatus.ok, small: true),
        ]),
        if (autoSync) const SizedBox(height: 10),
        RexStatRow(
          label: 'Last push',
          value: lastPush.isEmpty ? '\u2014' : lastPush,
          icon: CupertinoIcons.arrow_up,
        ),
        if (pendingPush > 0)
          RexStatRow(
            label: 'Pending push',
            value: '$pendingPush',
            valueColor: c.warning,
            icon: CupertinoIcons.clock,
          ),
        RexStatRow(
          label: 'Last pull',
          value: lastPull.isEmpty ? '\u2014' : lastPull,
          icon: CupertinoIcons.arrow_down,
        ),
        if (pendingPull > 0)
          RexStatRow(
            label: 'Pending pull',
            value: '$pendingPull',
            valueColor: c.warning,
            icon: CupertinoIcons.clock,
          ),
        const SizedBox(height: 12),
        Row(children: [
          RexButton(
            label: 'Sync Now',
            icon: CupertinoIcons.arrow_2_circlepath,
            variant: RexButtonVariant.secondary,
            small: true,
            onPressed: () => context.read<RexService>().syncNow(),
          ),
        ]),
      ]),
    );
  }
}

class _QueueCard extends StatelessWidget {
  final Map<String, dynamic>? queue;
  const _QueueCard({required this.queue});
  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final total = (queue?['total'] as int?) ?? 0;
    final pending = (queue?['pending'] as int?) ?? 0;
    final acked = (queue?['acked'] as int?) ?? 0;
    final byType =
        (queue?['byType'] as Map<String, dynamic>?)?.map((k, v) => MapEntry(k, v as int)) ?? {};
    final progress = total > 0 ? acked / total : 0.0;
    return RexCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          _QueueStat(label: 'Total', value: total, color: c.text),
          const SizedBox(width: 20),
          _QueueStat(label: 'Pending', value: pending, color: c.warning),
          const SizedBox(width: 20),
          _QueueStat(label: 'Acked', value: acked, color: c.success),
        ]),
        const SizedBox(height: 12),
        RexProgressBar(
          value: progress,
          color: pending > 0 ? c.warning : c.success,
        ),
        if (byType.isNotEmpty) ...[
          const SizedBox(height: 14),
          Wrap(spacing: 6, runSpacing: 6, children: byType.entries.map((e) {
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                  color: c.codeBg, borderRadius: BorderRadius.circular(6)),
              child: Text('${e.key}: ${e.value}',
                  style: TextStyle(fontSize: 11, fontFamily: 'Menlo', color: c.textSecondary)),
            );
          }).toList()),
        ],
      ]),
    );
  }
}

class _QueueStat extends StatelessWidget {
  final String label;
  final int value;
  final Color color;
  const _QueueStat({required this.label, required this.value, required this.color});
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('$value', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: color)),
      Text(label, style: TextStyle(fontSize: 11, color: context.rex.textSecondary)),
    ]);
  }
}

class _MeshPeersCard extends StatelessWidget {
  final List<Map<String, dynamic>> peers;
  const _MeshPeersCard({required this.peers});
  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final online = peers.where((p) => p['online'] == true).length;
    return RexCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text('$online/${peers.length}',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.text)),
          const SizedBox(width: 6),
          Text('peers online',
              style: TextStyle(fontSize: 12, color: c.textSecondary)),
        ]),
        const SizedBox(height: 10),
        ...peers.map((p) => _MeshPeerRow(peer: p)),
      ]),
    );
  }
}

class _MeshPeerRow extends StatelessWidget {
  final Map<String, dynamic> peer;
  const _MeshPeerRow({required this.peer});
  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final hostname = (peer['hostname'] as String?) ?? '';
    final ip = (peer['ip'] as String?) ?? '';
    final online = peer['online'] == true;
    final direct = peer['direct'] == true;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(
            color: online ? c.success : c.textTertiary,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(hostname, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: c.text)),
          Text(ip, style: TextStyle(fontSize: 11, fontFamily: 'Menlo', color: c.textTertiary)),
        ])),
        if (online && direct)
          RexStatusChip(label: 'direct', status: RexChipStatus.ok, small: true)
        else if (online)
          RexStatusChip(label: 'relay', status: RexChipStatus.pending, small: true),
      ]),
    );
  }
}
