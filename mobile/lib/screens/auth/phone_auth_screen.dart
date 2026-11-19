import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import 'signup_profile_screen.dart';

class PhoneAuthScreen extends StatefulWidget {
  const PhoneAuthScreen({super.key, this.isLogin = false});
  final bool isLogin;

  @override
  State<PhoneAuthScreen> createState() => _PhoneAuthScreenState();
}

class _PhoneAuthScreenState extends State<PhoneAuthScreen> {
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  bool _codeSent = false;
  bool _loading = false;

  @override
  void dispose() {
    _phoneController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _requestCode() async {
    final phone = _phoneController.text.trim();
    if (phone.replaceAll(RegExp(r'[^0-9]'), '').length < 10) {
      showInfo(context, '휴대폰 번호를 정확히 입력해 주세요.');
      return;
    }
    setState(() => _loading = true);
    try {
      await context.read<AppState>().requestPhoneCode(phone);
      setState(() => _codeSent = true);
      showInfo(context, '인증번호를 보냈습니다. 5분 안에 입력해 주세요.');
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verify() async {
    final state = context.read<AppState>();
    final phone = _phoneController.text.trim();
    final code = _codeController.text.trim();
    if (code.length < 4) {
      showInfo(context, '인증번호를 입력해 주세요.');
      return;
    }
    setState(() => _loading = true);
    try {
      final verificationToken = await state.verifyPhoneCode(phone, code);
      try {
        await state.login(phone, code);
        if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
      } on ApiException catch (e) {
        if (e.status == 404 && mounted) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(
              builder: (_) => SignupProfileScreen(
                verificationToken: verificationToken,
                phone: phone,
              ),
            ),
          );
        } else {
          rethrow;
        }
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.isLogin ? '로그인' : '휴대폰 인증')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '휴대폰 번호로 본인확인',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            Text(
              '만 ${widget.isLogin ? '기존 회원' : '19세 이상'}만 이용할 수 있으며, 번호는 다른 회원에게 공개되지 않습니다.',
              style: TextStyle(
                fontSize: 12.5,
                color: Colors.grey.shade600,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 24),
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[0-9-]')),
              ],
              decoration: const InputDecoration(
                labelText: '휴대폰 번호',
                hintText: '010-0000-0000',
              ),
            ),
            const SizedBox(height: 10),
            if (!_codeSent)
              FilledButton(
                onPressed: _loading ? null : _requestCode,
                child: _loading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('인증번호 받기'),
              ),
            if (_codeSent) ...[
              TextField(
                controller: _codeController,
                keyboardType: TextInputType.number,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                decoration: const InputDecoration(labelText: '인증번호 6자리'),
              ),
              const SizedBox(height: 10),
              FilledButton(
                onPressed: _loading ? null : _verify,
                child: _loading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('인증하고 계속'),
              ),
              TextButton(
                onPressed: _loading ? null : _requestCode,
                child: const Text('인증번호 다시 받기'),
              ),
            ],
            const SizedBox(height: 22),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade200),
              ),
              child: Text(
                '· 본인확인 결과는 가입 시점에만 사용되며 실명·생년월일은 다른 회원에게 절대 공개되지 않습니다.\n'
                '· 운영 환경에서는 본인확인기관(NICE/KCB 등) 연동 후 가입이 진행됩니다.',
                style: TextStyle(
                  fontSize: 11.5,
                  color: Colors.grey.shade700,
                  height: 1.6,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
