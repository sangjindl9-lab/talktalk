import 'dart:async';

import 'package:flutter/material.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:provider/provider.dart';

import '../../config/brand.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';

class PointsScreen extends StatefulWidget {
  const PointsScreen({super.key});

  @override
  State<PointsScreen> createState() => _PointsScreenState();
}

class _PointsScreenState extends State<PointsScreen> {
  final InAppPurchase _iap = InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? _subscription;
  Map<String, ProductDetails> _storeProducts = {};
  bool _storeReady = false;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final state = context.read<AppState>();
    try {
      await state.loadPoints();
      await _initStore(state);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _initStore(AppState state) async {
    try {
      _storeReady = await _iap.isAvailable();
      if (!_storeReady) return;
      final ids = state.products.map((p) => p.productId).toSet();
      if (ids.isEmpty) return;
      final response = await _iap.queryProductDetails(ids);
      _storeProducts = {for (final product in response.productDetails) product.id: product};
      _subscription?.cancel();
      _subscription = _iap.purchaseStream.listen(_onPurchase, onError: (error) {
        if (mounted) showInfo(context, '스토어 결제 오류: $error');
      });
      if (mounted) setState(() {});
    } catch (_) {
      _storeReady = false;
    }
  }

  Future<void> _onPurchase(List<PurchaseDetails> purchases) async {
    final state = context.read<AppState>();
    for (final purchase in purchases) {
      if (purchase.status == PurchaseStatus.pending) continue;
      if (purchase.status == PurchaseStatus.error) {
        if (mounted) showInfo(context, '결제가 완료되지 않았습니다: ${purchase.error?.message ?? ''}');
        continue;
      }
      try {
        final result = await state.verifyPurchase(
          platform: 'GOOGLE',
          productId: purchase.productID,
          transactionId: purchase.purchaseID ?? '',
          purchaseToken: purchase.verificationData.serverVerificationData,
        );
        if (mounted) {
          showInfo(context, result['duplicate'] == true ? '이미 처리된 영수증입니다.' : '포인트가 충전되었습니다. (${result['points']}P)');
        }
        if (purchase.status == PurchaseStatus.purchased || purchase.status == PurchaseStatus.restored) {
          await _iap.completePurchase(purchase);
        }
      } catch (e) {
        if (mounted) showError(context, e);
      }
    }
    await _load();
  }

  /// iOS에서는 StoreKit 영수증을 서버로 전달한다.
  Future<void> _buy(PointProduct product) async {
    final details = _storeProducts[product.productId];
    if (!_storeReady || details == null) {
      showInfo(context, '스토어 상품 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    setState(() => _loading = true);
    try {
      final param = PurchaseParam(productDetails: details);
      if (product.type == 'SUBSCRIPTION') {
        await _iap.buyNonConsumable(purchaseParam: param);
      } else {
        await _iap.buyConsumable(purchaseParam: param, autoConsume: true);
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(title: const Text('포인트')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(Brand.primary), Color(Brand.primaryDark)]),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('보유 포인트', style: TextStyle(color: Colors.white70, fontSize: 12)),
                const SizedBox(height: 6),
                Text('${state.points}P', style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w900)),
                const SizedBox(height: 4),
                const Text(
                  '기본 1:1 인사·신고·차단은 무료예요.',
                  style: TextStyle(color: Colors.white70, fontSize: 11.5),
                ),
              ],
            ),
          ),
          const SectionTitle('포인트 충전'),
          if (!_storeReady)
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: const Color(0xFFFFF3E0), borderRadius: BorderRadius.circular(12)),
              child: const Text(
                '스토어 상품 정보를 불러오는 중이거나 스토어를 사용할 수 없습니다.\n'
                'Google Play / App Store에 상품이 등록된 후 결제가 가능합니다.',
                style: TextStyle(fontSize: 12, color: Color(0xFF8A5A10), height: 1.5),
              ),
            ),
          for (final product in state.products)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
              child: ListTile(
                title: Text(product.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(
                  product.type == 'SUBSCRIPTION' ? '월 구독 · 매월 ${product.points}P 지급' : '${product.points}P',
                  style: const TextStyle(fontSize: 12),
                ),
                trailing: FilledButton.tonal(
                  onPressed: _loading ? null : () => _buy(product),
                  child: Text('${product.amount.toString()}원', style: const TextStyle(fontSize: 12)),
                ),
              ),
            ),
          const SectionTitle('상단 고정 이용 내역'),
          if (state.promotions.isEmpty)
            Text('이용 내역이 없습니다.', style: TextStyle(fontSize: 12, color: Colors.grey.shade600))
          else
            ...state.promotions.map((promo) => ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text('${promo['targetType']} 상단 고정 ${promo['days']}일', style: const TextStyle(fontSize: 13)),
                  subtitle: Text('${promo['status']} · ${promo['pointCost']}P', style: const TextStyle(fontSize: 11)),
                  trailing: Text('${promo['endsAt'] ?? ''}'.replaceAll('T', ' ').split('.').first, style: const TextStyle(fontSize: 10)),
                )),
          const SizedBox(height: 16),
          Text(
            '결제 영수증은 서버에서 Google Play / App Store에 검증하며, 동일 영수증은 중복 지급되지 않습니다.\n'
            '환불은 고객센터 문의를 통해 처리됩니다.',
            style: TextStyle(fontSize: 11, color: Colors.grey.shade600, height: 1.5),
          ),
        ],
      ),
    );
  }
}
