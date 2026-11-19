import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/brand.dart';
import '../../models/models.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import '../auth/region_picker_screen.dart';
import '../chats/note_compose_sheet.dart';
import 'user_profile_screen.dart';

class NearbyScreen extends StatefulWidget {
  const NearbyScreen({super.key});

  @override
  State<NearbyScreen> createState() => _NearbyScreenState();
}

class _NearbyScreenState extends State<NearbyScreen> {
  bool _loading = false;
  bool _multiMode = false;
  final Set<String> _selected = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
  }

  Future<void> _refresh() async {
    final state = context.read<AppState>();
    if (state.me == null) return;
    setState(() => _loading = true);
    try {
      await state.loadNearby();
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _requestLocation() async {
    final state = context.read<AppState>();
    try {
      final region = await state.requestLocationRegion();
      if (region == null && mounted) {
        final picked = await Navigator.of(context).push<Region>(
          MaterialPageRoute(builder: (_) => const RegionPickerScreen()),
        );
        if (picked != null) {
          await state.setRegion(picked.code);
        }
      }
      await _refresh();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _openFilters() async {
    final state = context.read<AppState>();
    final result = await showModalBottomSheet<NearbyFilter>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _FilterSheet(
        initial: state.filter,
        regions: state.regions,
        interests: state.interests,
      ),
    );
    if (result != null) {
      setState(() {});
      await state.loadNearby(
        sort: result.sort,
        regionCode: result.regionCode,
        ageBand: result.ageBand,
        interest: result.interest,
      );
    }
  }

  Future<void> _sendMulti() async {
    if (_selected.isEmpty) return;
    final state = context.read<AppState>();
    final sent = await Navigator.of(context).push<int>(
      MaterialPageRoute(
        builder: (_) => MultiNoteScreen(recipientIds: _selected.toList()),
      ),
    );
    if (sent != null)
      setState(() {
        _selected.clear();
        _multiMode = false;
      });
    await state.loadNotes();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final me = state.me;
    return Scaffold(
      appBar: AppBar(
        title: const Text('주변 이웃'),
        actions: [
          IconButton(
            tooltip: '여러 명에게 인사',
            onPressed: () => setState(() {
              _multiMode = !_multiMode;
              _selected.clear();
            }),
            icon: Icon(
              _multiMode ? Icons.close : Icons.dynamic_feed_outlined,
              color: _multiMode ? const Color(Brand.primary) : null,
            ),
          ),
          IconButton(onPressed: _openFilters, icon: const Icon(Icons.tune)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: Column(
          children: [
            if (me?.regionCode == null || me?.regionName == null)
              Container(
                margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.grey.shade200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '가까운 이웃을 찾으려면 위치가 필요해요',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '위치 권한을 허용하면 같은 동네 이웃을 보여드려요. 거절하셔도 시군구를 직접 선택해 이용할 수 있습니다.',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade600,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton.tonal(
                            onPressed: _requestLocation,
                            child: const Text('위치 사용하기'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () async {
                              final picked = await Navigator.of(context)
                                  .push<Region>(
                                    MaterialPageRoute(
                                      builder: (_) =>
                                          const RegionPickerScreen(),
                                    ),
                                  );
                              if (picked != null) {
                                await state.setRegion(picked.code);
                                await _refresh();
                              }
                            },
                            child: const Text('지역 직접 선택'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
              child: Row(
                children: [
                  ChoiceChip(
                    label: const Text('가까운 순'),
                    selected: state.filter.sort == 'distance',
                    onSelected: (_) => state.loadNearby(sort: 'distance'),
                  ),
                  const SizedBox(width: 8),
                  ChoiceChip(
                    label: const Text('최근 활동 순'),
                    selected: state.filter.sort == 'recent',
                    onSelected: (_) => state.loadNearby(sort: 'recent'),
                  ),
                  const Spacer(),
                  Text(
                    '${state.nearby.length}명',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                  ),
                ],
              ),
            ),
            if (state.filter.regionCode != null ||
                state.filter.ageBand != null ||
                state.filter.interest != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    if (state.browsingRegion != null)
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: Chip(
                          label: Text(
                            '${state.browsingRegion!['badge'] ?? '이 지역 둘러보는 중'}',
                            style: const TextStyle(fontSize: 11),
                          ),
                        ),
                      ),
                    Expanded(
                      child: Text(
                        [
                          state.filter.ageBand,
                          state.filter.interest,
                          state.filter.regionCode,
                        ].whereType<String>().map((e) => '#$e').join(' '),
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey.shade600,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    TextButton(
                      onPressed: () {
                        state.loadNearby(
                          regionCode: '',
                          ageBand: '',
                          interest: '',
                        );
                      },
                      child: const Text(
                        '필터 초기화',
                        style: TextStyle(fontSize: 11),
                      ),
                    ),
                  ],
                ),
              ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : state.nearby.isEmpty
                  ? ListView(
                      children: const [
                        SizedBox(height: 60),
                        EmptyState(
                          icon: Icons.person_search_outlined,
                          title: '주변에 표시 중인 이웃이 없어요',
                          subtitle: '지역을 바꾸거나 잠시 후 다시 확인해 보세요.\n(운영 환경에서는 실제 가입 회원만 표시됩니다)',
                        ),
                      ],
                    )
                  : ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      itemCount: state.nearby.length,
                      separatorBuilder: (_, __) =>
                          Divider(height: 1, color: Colors.grey.shade100),
                      itemBuilder: (context, index) {
                        final user = state.nearby[index];
                        final selected = _selected.contains(user.id);
                        return UserListTile(
                          user: user,
                          onTap: () {
                            if (_multiMode) {
                              setState(() {
                                if (selected) {
                                  _selected.remove(user.id);
                                } else {
                                  _selected.add(user.id);
                                }
                              });
                            } else {
                              Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => UserProfileScreen(
                                    userId: user.id,
                                    fallback: user,
                                  ),
                                ),
                              );
                            }
                          },
                          trailing: _multiMode
                              ? Checkbox(
                                  value: selected,
                                  onChanged: (_) => setState(() {
                                    if (selected) {
                                      _selected.remove(user.id);
                                    } else {
                                      _selected.add(user.id);
                                    }
                                  }),
                                )
                              : TextButton(
                                  onPressed: () =>
                                      showNoteCompose(context, user),
                                  child: const Text('인사'),
                                ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
      floatingActionButton: _multiMode && _selected.isNotEmpty
          ? FloatingActionButton.extended(
              onPressed: _sendMulti,
              backgroundColor: const Color(Brand.primary),
              foregroundColor: Colors.white,
              label: Text('${_selected.length}명에게 인사'),
              icon: const Icon(Icons.send),
            )
          : null,
    );
  }
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({
    required this.initial,
    required this.regions,
    required this.interests,
  });
  final NearbyFilter initial;
  final List<Region> regions;
  final List<String> interests;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late NearbyFilter _filter;
  String? _regionCode;

  @override
  void initState() {
    super.initState();
    _filter = NearbyFilter(
      sort: widget.initial.sort,
      regionCode: widget.initial.regionCode,
      ageBand: widget.initial.ageBand,
      interest: widget.initial.interest,
    );
    _regionCode = _filter.regionCode;
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '주변 이웃 필터',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 14),
            const Text(
              '연령대',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              children: [
                for (final band in ['20s', '30s', '40s', '50s', '60s+'])
                  ChoiceChip(
                    label: Text(
                      band == '60s+' ? '60대+' : '${band.substring(0, 2)}대',
                    ),
                    selected: _filter.ageBand == band,
                    onSelected: (_) => setState(
                      () => _filter.ageBand = _filter.ageBand == band
                          ? null
                          : band,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            const Text(
              '관심사',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                for (final interest in widget.interests.take(12))
                  ChoiceChip(
                    label: Text(interest),
                    selected: _filter.interest == interest,
                    onSelected: (_) => setState(
                      () => _filter.interest = _filter.interest == interest
                          ? null
                          : interest,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            const Text(
              '지역',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              initialValue: _regionCode,
              decoration: const InputDecoration(labelText: '시군구'),
              items: [
                const DropdownMenuItem(value: '', child: Text('내 지역')),
                for (final region in widget.regions)
                  DropdownMenuItem(
                    value: region.code,
                    child: Text('${region.city} ${region.name}'),
                  ),
              ],
              onChanged: (value) => setState(() => _regionCode = value),
            ),
            const SizedBox(height: 8),
            Text(
              '다른 지역을 선택하면 유료(100P)로 둘러보게 됩니다.',
              style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () {
                _filter.regionCode =
                    (_regionCode == null || _regionCode!.isEmpty)
                    ? null
                    : _regionCode;
                Navigator.of(context).pop(_filter);
              },
              child: const Text('필터 적용'),
            ),
          ],
        ),
      ),
    );
  }
}
