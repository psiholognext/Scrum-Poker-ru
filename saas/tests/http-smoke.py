"""Run explicitly against the private staging API and SMTP catcher. No token output."""
import html
import json
import os
import re
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = os.environ.get('SMOKE_API_URL', 'http://127.0.0.1:23601')
MAIL = os.environ.get('SMOKE_MAIL_URL', 'http://127.0.0.1:28025')
assert urllib.parse.urlparse(API).hostname in ('localhost', '127.0.0.1')
assert urllib.parse.urlparse(MAIL).hostname in ('localhost', '127.0.0.1')
email = 'preview-' + secrets.token_hex(3) + '@example.test'
password = secrets.token_urlsafe(20)

def request(path, data=None, token=None, method=None):
    headers = {'Content-Type': 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(API + path, data=json.dumps(data).encode() if data is not None else None, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: body = json.loads(raw)
        except ValueError: body = {}
        return e.code, body

def op(name, data, token=None, expected=200):
    status, result = request('/operations/' + name, {'json': data}, token)
    assert status == expected, (name, status)
    return result.get('json') if isinstance(result, dict) else result

def mail_token(subject):
    for _ in range(20):
        with urllib.request.urlopen(MAIL + '/api/v1/messages', timeout=5) as r: messages = json.load(r)['messages']
        for m in messages:
            if not any(x.get('Address') == email for x in m.get('To', [])) or subject not in m.get('Subject', ''): continue
            with urllib.request.urlopen(MAIL + '/api/v1/message/' + m['ID'], timeout=5) as r: body = json.load(r)
            for url in re.findall(r'https?://[^\s<>"\']+', html.unescape(body.get('Text', '') + '\n' + body.get('HTML', ''))):
                token = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get('token')
                if token: return token[0]
        time.sleep(.5)
    raise AssertionError('Expected test email not received')

status, _ = request('/auth/email/signup', {'email': email, 'password': password, 'username': 'Preview', 'name': 'Preview', 'isAdmin': True})
assert status == 200, ('signup', status)
status, _ = request('/auth/email/login', {'email': email, 'password': password})
assert status >= 400, ('unverified login must fail', status)
token = mail_token('Подтвердите')
status, result = request('/auth/email/verify-email', {'token': token})
assert status == 200 and result.get('success'), ('verify', status)
status, result = request('/auth/email/login', {'email': email, 'password': password})
assert status == 200 and result.get('sessionId'), ('login', status)
session = result['sessionId']
status, me = request('/auth/me', token=session)
assert status == 200, ('me', status)
def admin_values(value):
    if isinstance(value, dict):
        for k, v in value.items():
            if k == 'isAdmin': yield v
            yield from admin_values(v)
    elif isinstance(value, list):
        for v in value: yield from admin_values(v)
values = list(admin_values(me))
assert values and not any(values), 'Signup must not accept isAdmin from the client'
print('PASS signup, verification, login and protected administrator flag')

team = op('create-team', {'name': 'Команда предпросмотра'}, session)
room = op('create-room', {'teamId': team['id'], 'name': 'Планирование спринта'}, session)
view = op('get-room-state', {'roomId': room['id']}, session)
invite = op('create-invitation', {'roomId': room['id']}, session)
guest = op('join-invitation', {'token': invite['token'], 'name': 'Приглашённый участник'})
guest_args = {'roomId': room['id'], 'guestToken': guest['guestToken']}
op('mutate-room', {**guest_args, 'roundId': view['currentRound']['id'], 'type': 'vote', 'value': '8'})
owner_view = op('get-room-state', {'roomId': room['id']}, session)
others = [p for p in owner_view['participants'] if p['id'] != owner_view['me']]
assert others and others[0]['hasVoted'] and others[0]['vote'] is None
op('mutate-room', {**guest_args, 'roundId': view['currentRound']['id'], 'type': 'reveal'}, expected=403)

req = urllib.request.Request(API + '/poker-stream/' + room['id'], headers={'Authorization': 'Bearer ' + owner_view['streamTicket']})
with urllib.request.urlopen(req, timeout=10) as r:
    lines = []
    while True:
        line = r.readline().decode()
        if line.strip() == '' and lines: break
        lines.append(line)
    assert 'event: state' in ''.join(lines) and '"vote":"8"' not in ''.join(lines)
op('mutate-room', {'roomId': room['id'], 'roundId': view['currentRound']['id'], 'type': 'reveal'}, session)
revealed = op('get-room-state', {'roomId': room['id']}, session)
assert any(p['vote'] == '8' for p in revealed['participants'])
op('revoke-invitation', {'id': invite['id']}, session)
op('get-room-state', guest_args, expected=403)
print('PASS room, guest invitation, private SSE votes, facilitator rights and guest revocation')

status, _ = request('/auth/email/request-password-reset', {'email': email})
assert status == 200
reset = mail_token('Сброс')
new_password = secrets.token_urlsafe(20)
status, result = request('/auth/email/reset-password', {'token': reset, 'password': new_password})
assert status == 200 and result.get('success'), ('password reset', status)
status, _ = request('/auth/email/login', {'email': email, 'password': password})
assert status >= 400, ('old password', status)
status, result = request('/auth/email/login', {'email': email, 'password': new_password})
assert status == 200 and result.get('sessionId'), ('new password', status)
print('PASS password-reset email, password change and login with the new password')

output = os.environ.get('PREVIEW_CREDENTIALS_FILE')
if output:
    path = Path(output)
    path.write_text(json.dumps({'email': email, 'password': new_password, 'teamId': team['id'], 'roomId': room['id']}, ensure_ascii=False))
    path.chmod(0o600)
    print('Preview credentials stored in a private file')
