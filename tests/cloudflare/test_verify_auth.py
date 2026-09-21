import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[2] / 'scripts/cloudflare/verify-auth.py'
spec = importlib.util.spec_from_file_location('verify_auth', SCRIPT)
auth = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auth)

class VerifyAuthTests(unittest.TestCase):
    def run_check(self, replies, token='secret-token'):
        logs = []
        def request(path, credential):
            value = replies.pop(0)
            if isinstance(value, Exception):
                raise value
            return value
        return auth.verify(token, 'a' * 32, request, logs.append), '\n'.join(logs)

    def test_expired_account_token_stops_with_actionable_error(self):
        code, output = self.run_check([(200, {'success': True, 'result': {'status': 'expired', 'expires_on': '2026-08-22T23:59:59Z'}})])
        self.assertEqual(code, 1)
        self.assertIn('expired', output)
        self.assertIn('2026-08-22', output)

    def test_active_user_token_passes_after_account_endpoint_rejection(self):
        code, _ = self.run_check([(401, {'success': False}), (200, {'success': True, 'result': {'status': 'active'}})])
        self.assertEqual(code, 0)

    def test_active_account_token_passes(self):
        code, _ = self.run_check([(200, {'success': True, 'result': {'status': 'active'}})])
        self.assertEqual(code, 0)

    def test_untrusted_error_body_is_never_logged(self):
        code, output = self.run_check([(401, {'errors': [{'message': 'secret-token'}]}), (403, {'result': {'status': 'secret-token'}})])
        self.assertEqual(code, 1)
        self.assertNotIn('secret-token', output)

    def test_transport_failure_is_sanitized(self):
        code, output = self.run_check([RuntimeError('secret-token')])
        self.assertEqual(code, 1)
        self.assertNotIn('secret-token', output)

    def test_missing_secret_stops_before_requests(self):
        code, output = self.run_check([], token='')
        self.assertEqual(code, 1)
        self.assertIn('missing', output)

if __name__ == '__main__':
    unittest.main()
