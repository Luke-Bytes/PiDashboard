#!/bin/sh
set -eu

install -d -o root -g luke -m 0770 /var/lib/pi-dashboard
install -o root -g root -m 0755 deploy/pi-dashboard-cloud-status /usr/local/libexec/pi-dashboard-cloud-status
install -d -o root -g root -m 0755 /etc/systemd/system/rclone-pool-health.service.d
install -o root -g root -m 0644 deploy/rclone-pool-health.service.d/20-pi-dashboard-cloud-status.conf /etc/systemd/system/rclone-pool-health.service.d/20-pi-dashboard-cloud-status.conf
if [ -L /var/lib/pi-dashboard/provider-reminders.json ]; then
    echo "Refusing symlinked reminder state" >&2
    exit 1
fi
if [ ! -e /var/lib/pi-dashboard/provider-reminders.json ]; then
    install -o luke -g luke -m 0600 /dev/null /var/lib/pi-dashboard/provider-reminders.json
    printf '%s\n' '{"version":1,"providers":{}}' > /var/lib/pi-dashboard/provider-reminders.json
fi
chown luke:luke /var/lib/pi-dashboard/provider-reminders.json
chmod 0600 /var/lib/pi-dashboard/provider-reminders.json
systemctl daemon-reload
systemctl list-timers rclone-pool-health.timer --no-pager
