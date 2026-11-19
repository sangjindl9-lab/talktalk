import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';

class RegionPickerScreen extends StatefulWidget {
  const RegionPickerScreen({super.key, this.selectedCode});
  final String? selectedCode;

  @override
  State<RegionPickerScreen> createState() => _RegionPickerScreenState();
}

class _RegionPickerScreenState extends State<RegionPickerScreen> {
  String? _selected;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _selected = widget.selectedCode;
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      await context.read<AppState>().loadRegions();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final regions = context.watch<AppState>().regions;
    final grouped = <String, List<Region>>{};
    for (final region in regions) {
      grouped.putIfAbsent(region.city, () => []).add(region);
    }
    return Scaffold(
      appBar: AppBar(title: const Text('활동 지역 선택')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.only(bottom: 90),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  child: Text(
                    '위치 권한을 허용하지 않아도 시군구를 직접 선택해 이용할 수 있어요.',
                    style: TextStyle(
                      fontSize: 12.5,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ),
                for (final entry in grouped.entries) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 18, 16, 6),
                    child: Text(
                      entry.key,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  for (final region in entry.value)
                    RadioListTile<String>(
                      value: region.code,
                      groupValue: _selected,
                      onChanged: (value) => setState(() => _selected = value),
                      title: Text(region.name),
                      subtitle: Text(
                        region.city,
                        style: const TextStyle(fontSize: 11),
                      ),
                    ),
                ],
              ],
            ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton(
            onPressed: _selected == null
                ? null
                : () {
                    final region = regions.firstWhere(
                      (r) => r.code == _selected,
                    );
                    Navigator.of(context).pop(region);
                  },
            child: const Text('이 지역으로 설정'),
          ),
        ),
      ),
    );
  }
}
