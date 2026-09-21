"""Fail deployment early when the configured Cloudflare API token is invalid.

Only token state, validated expiry and HTTP status are logged; never response
bodies, credentials, exception text or resource data. Supports both token types.
"""
import json
import os
import re
import urllib.error
import urllib.request


def verify(token, account, request, log=print):
    if not token:
        log('::error::CLOUDFLARE_API_TOKEN is missing in this GitHub environment.')
        return 1
    if token != token.strip() or not re.fullmatch(r'[0-9a-f]{32}', account):
        log('::error::Cloudflare credential configuration has invalid whitespace or account ID.')
        return 1
    for path in (f'/accounts/{account}/tokens/verify', '/user/tokens/verify'):
        try:
            status, body = request(path, token)
            result = body.get('result') or {}
            if status == 200 and body.get('success') is True and isinstance(result, dict):
                state = result.get('status')
                if state == 'active':
                    log('Cloudflare API token is active. Resource permissions are checked by subsequent deployment steps.')
                    return 0
                if state in ('expired', 'disabled'):
                    expiry = result.get('expires_on')
                    suffix = f' (expires_on={expiry})' if isinstance(expiry, str) and re.fullmatch(r'[0-9TZ:.+\-]{1,40}', expiry) else ''
                    log(f'::error::Cloudflare API token is {state}{suffix}. Replace CLOUDFLARE_API_TOKEN in this GitHub environment.')
                    return 1
            log(f'Cloudflare token verification did not confirm active status (HTTP {status}).')
        except Exception:
            log('::error::Cloudflare token verification failed due to a network or response error. No credentials were logged.')
            return 1
    log('::error::Cloudflare API token could not be verified. Check the environment secret, token status and account ID.')
    return 1


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def request(path, token):
    req = urllib.request.Request(
        'https://api.cloudflare.com/client/v4' + path,
        headers={'Authorization': 'Bearer ' + token}, method='GET',
    )
    opener = urllib.request.build_opener(NoRedirect)
    try:
        response = opener.open(req, timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.code, json.loads(response.read())


if __name__ == '__main__':
    raise SystemExit(verify(os.environ.get('CLOUDFLARE_API_TOKEN', ''),
                           os.environ.get('CLOUDFLARE_ACCOUNT_ID', ''), request))
