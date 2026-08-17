#!/bin/sh
set -eu

CONFIG=/etc/pi-dashboard/cloud-status.conf
CACHE=/var/lib/pi-dashboard/cloud-status.json
DASHBOARD_USER=luke
DASHBOARD_GROUP=luke
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

fail() {
    echo "Media status installation failed: $*" >&2
    echo "Remediation: open /srv/secure, correct ${CONFIG}, then run this installer again." >&2
    exit 1
}

[ "$(id -u)" -eq 0 ] || fail "run this installer as root"
getent passwd "$DASHBOARD_USER" >/dev/null || fail "dashboard user '$DASHBOARD_USER' does not exist"
getent group "$DASHBOARD_GROUP" >/dev/null || fail "dashboard group '$DASHBOARD_GROUP' does not exist"
getent passwd jellyfin >/dev/null || fail "collector runtime user 'jellyfin' does not exist"
mountpoint -q /srv/secure || fail "the secure vault is not mounted at /srv/secure"

install -d -o root -g root -m 0755 /etc/pi-dashboard
if [ -L "$CONFIG" ]; then
    fail "refusing symlinked configuration at $CONFIG"
fi
if [ ! -e "$CONFIG" ]; then
    install -o root -g root -m 0600 "$SCRIPT_DIR/cloud-status.conf.example" "$CONFIG"
    echo "Installed default cloud collector configuration at $CONFIG"
else
    echo "Preserving existing cloud collector configuration at $CONFIG"
fi
[ "$(stat -c '%U:%G' "$CONFIG")" = "root:root" ] || fail "configuration must be owned by root:root"
if find "$CONFIG" -prune -perm /077 | grep -q .; then
    fail "configuration permissions are too broad; use mode 0600"
fi

set -a
# shellcheck disable=SC1090
. "$CONFIG"
set +a

[ -n "${PI_DASHBOARD_PROVIDERS:-}" ] || fail "PI_DASHBOARD_PROVIDERS is not configured"
[ -n "${PI_DASHBOARD_RCLONE_CONFIG:-}" ] || fail "PI_DASHBOARD_RCLONE_CONFIG is not configured"
[ -n "${PI_DASHBOARD_RCLONE_BINARY:-}" ] || fail "PI_DASHBOARD_RCLONE_BINARY is not configured"
[ -n "${PI_DASHBOARD_PASSWORD_COMMAND:-}" ] || fail "PI_DASHBOARD_PASSWORD_COMMAND is not configured"
[ -n "${PI_DASHBOARD_CLOUD_CACHE:-}" ] || fail "PI_DASHBOARD_CLOUD_CACHE is not configured"
[ -r "$PI_DASHBOARD_PROVIDERS" ] || fail "provider registry is not readable: $PI_DASHBOARD_PROVIDERS"
[ -s "$PI_DASHBOARD_PROVIDERS" ] || fail "provider registry is empty: $PI_DASHBOARD_PROVIDERS"
[ -r "$PI_DASHBOARD_RCLONE_CONFIG" ] || fail "rclone config is not readable: $PI_DASHBOARD_RCLONE_CONFIG"
[ -x "$PI_DASHBOARD_RCLONE_BINARY" ] || fail "rclone binary is not executable: $PI_DASHBOARD_RCLONE_BINARY"
[ -x "$PI_DASHBOARD_PASSWORD_COMMAND" ] || fail "password helper is not executable: $PI_DASHBOARD_PASSWORD_COMMAND"
runuser -u jellyfin -- test -r "$PI_DASHBOARD_RCLONE_CONFIG" || fail "jellyfin cannot read the rclone config"
runuser -u jellyfin -- test -x "$PI_DASHBOARD_RCLONE_BINARY" || fail "jellyfin cannot execute the rclone binary"
runuser -u jellyfin -- test -x "$PI_DASHBOARD_PASSWORD_COMMAND" || fail "jellyfin cannot execute the password helper"
[ "$PI_DASHBOARD_CLOUD_CACHE" = "$CACHE" ] || fail "cache must be configured as $CACHE"

install -d -o root -g "$DASHBOARD_GROUP" -m 0750 /var/lib/pi-dashboard
install -o root -g root -m 0755 "$SCRIPT_DIR/pi-dashboard-cloud-status" /usr/local/libexec/pi-dashboard-cloud-status
install -d -o root -g root -m 0755 /etc/systemd/system/rclone-pool-health.service.d
install -o root -g root -m 0644 "$SCRIPT_DIR/rclone-pool-health.service.d/20-pi-dashboard-cloud-status.conf" /etc/systemd/system/rclone-pool-health.service.d/20-pi-dashboard-cloud-status.conf

if [ -L /var/lib/pi-dashboard/provider-reminders.json ]; then
    fail "refusing symlinked reminder state"
fi
if [ ! -e /var/lib/pi-dashboard/provider-reminders.json ]; then
    install -o "$DASHBOARD_USER" -g "$DASHBOARD_GROUP" -m 0600 /dev/null /var/lib/pi-dashboard/provider-reminders.json
    printf '%s\n' '{"version":1,"providers":{}}' > /var/lib/pi-dashboard/provider-reminders.json
fi
chown "$DASHBOARD_USER:$DASHBOARD_GROUP" /var/lib/pi-dashboard/provider-reminders.json
chmod 0600 /var/lib/pi-dashboard/provider-reminders.json

systemctl daemon-reload
/usr/local/libexec/pi-dashboard-cloud-status || fail "the initial quota collection failed"

expected_providers=$(awk 'NF && $1 !~ /^#/ { if ($1 !~ /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/) exit 2; printf "%s%s", separator, $1; separator="," }' "$PI_DASHBOARD_PROVIDERS") || fail "provider registry contains an invalid identifier"
[ -n "$expected_providers" ] || fail "provider registry contains no providers"
[ ! -L "$CACHE" ] || fail "refusing symlinked cloud cache"
[ "$(stat -c '%U:%G %a' "$CACHE")" = "root:$DASHBOARD_GROUP 640" ] || fail "cache must be root:$DASHBOARD_GROUP mode 0640"
runuser -u "$DASHBOARD_USER" -- python3 -c 'import json,sys; data=json.load(open(sys.argv[1], encoding="utf-8")); expected=set(sys.argv[2].split(",")); actual=set(data.get("providers", {})); reported=sum(isinstance(item.get("quota"), dict) for item in data["providers"].values()); assert expected == actual and data.get("generatedAt") and reported' "$CACHE" "$expected_providers" || fail "$DASHBOARD_USER cannot read a valid, non-empty cache for every configured provider"

systemctl list-timers rclone-pool-health.timer --no-pager >/dev/null || fail "rclone-pool-health.timer is not installed"
echo "Cloud quota collection installed and verified for: $expected_providers"
