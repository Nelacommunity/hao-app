#!/usr/bin/env bash
# Locks down the VPS (Ubuntu 24.04 under Coolify). Safe to run again.
#
#   scripts/vps/harden.sh                  # SSH keys only, fail2ban, firewall; Traefik's 8080 closed
#   scripts/vps/harden.sh close-coolify    # also close Coolify's 8000/6001/6002, once the dashboard has
#                                          # an https domain (Coolify → Settings → Instance's Domain)
#
# SSH: passwords off (root still logs in with a key; Coolify manages the server with its own key), and
# the change is undone if a fresh key login fails afterwards. Firewall: ufw lets in 22, 80 and 443.
# Ports published by Docker skip ufw over IPv4, so those are closed in ufw's DOCKER-USER rules instead.
#
# Needs VPS_SSH in .vps.env.local (see scripts/vps/vps.env.example).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.vps.env.local}"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (copy scripts/vps/vps.env.example)"; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
[ -n "${VPS_SSH:-}" ] || { echo "VPS_SSH is not set in $ENV_FILE"; exit 1; }

case "${1:-}" in
  '') CLOSED_PORTS="8080" ;;
  close-coolify) CLOSED_PORTS="8080 8000 6001 6002" ;;
  *) echo "Usage: $0 [close-coolify]"; exit 1 ;;
esac

ssh -o BatchMode=yes "$VPS_SSH" true || { echo "Key login to $VPS_SSH fails; fix that first (ssh-copy-id $VPS_SSH)"; exit 1; }

echo "── SSH: keys only"
ssh "$VPS_SSH" 'bash -s' <<'EOF'
set -euo pipefail
[ -s /root/.ssh/authorized_keys ] || { echo "No keys in /root/.ssh/authorized_keys"; exit 1; }
# sshd takes the first value it reads, and 50-cloud-init.conf turns passwords on, so this sorts first.
cat > /etc/ssh/sshd_config.d/00-hardening.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
X11Forwarding no
MaxAuthTries 3
CONF
sshd -t
systemctl reload ssh
sshd -T | grep -E '^(passwordauthentication|permitrootlogin) '
EOF
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$VPS_SSH" true; then
  echo "A fresh key login failed after the change. Undo it from the Coolify terminal:"
  echo "  rm /etc/ssh/sshd_config.d/00-hardening.conf && systemctl reload ssh"
  exit 1
fi

echo "── fail2ban, firewall"
ssh "$VPS_SSH" CLOSED_PORTS="'$CLOSED_PORTS'" 'bash -s' <<'EOF'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
dpkg -s fail2ban python3-systemd > /dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq fail2ban python3-systemd > /dev/null; }
cat > /etc/fail2ban/jail.d/hardening.local <<'CONF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
CONF
systemctl enable --now fail2ban > /dev/null 2>&1
systemctl restart fail2ban

IFACE="$(ip route show default | awk '{print $5; exit}')"
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow 22/tcp > /dev/null
ufw allow 80/tcp > /dev/null
ufw allow 443/tcp > /dev/null
ufw allow 443/udp > /dev/null
for port in 8000 6001 6002 8080; do
  if [[ " $CLOSED_PORTS " == *" $port "* ]]; then
    ufw delete allow "$port/tcp" > /dev/null 2>&1 || true
  else
    ufw allow "$port/tcp" > /dev/null
  fi
done

# Docker's IPv4 port forwarding happens before ufw's rules; DOCKER-USER runs first. Match the port the
# client asked for (Coolify's 8000 is 8080 inside its container).
sed -i '/^# BEGIN hardening/,/^# END hardening/d' /etc/ufw/after.rules
{
  echo '# BEGIN hardening'
  echo '*filter'
  echo ':DOCKER-USER - [0:0]'
  for port in $CLOSED_PORTS; do
    echo "-A DOCKER-USER -i $IFACE -p tcp -m conntrack --ctorigdstport $port --ctdir ORIGINAL -j DROP"
  done
  echo 'COMMIT'
  echo '# END hardening'
} >> /etc/ufw/after.rules
ufw --force enable > /dev/null
ufw reload > /dev/null
ufw status | sed -n '1,20p'
iptables -S DOCKER-USER
EOF

echo "── Checking from here"
host="${VPS_SSH#*@}"
# Some networks answer every outgoing connection themselves; then this check can't tell anything.
if timeout 5 bash -c "exec 3<>/dev/tcp/$host/47613" 2> /dev/null; then
  echo "This network accepts connections to any port, so the ports can't be checked from here."
else for port in 22 443 8000 8080 6001; do
  if timeout 5 bash -c "exec 3<>/dev/tcp/$host/$port" 2> /dev/null; then echo "$port: open"; else echo "$port: closed"; fi
done; fi
ssh "$VPS_SSH" '[ -f /var/run/reboot-required ] && echo "The VPS has updates waiting on a reboot: ssh '"$VPS_SSH"' reboot (a minute or two of downtime)." || true' || true
