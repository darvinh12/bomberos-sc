# Deploy Intranet Final — Implementation Plan

> **Para agentes:** SKILL REQUERIDA: superpowers:subagent-driven-development o superpowers:executing-plans.
>
> **Importante:** Este plan se ejecuta físicamente en la sede del cliente. No es un plan puramente de código — incluye trabajo de campo, capacitación y handover. Coordinar agenda con cliente antes de empezar.

**Goal:** Desplegar el sistema en el servidor físico del Cuerpo de Bomberos, migrar datos reales, capacitar al personal, hacer handover formal con documentación firmada.

**Architecture:** Servidor único Debian 12 con LUKS+TPM. Stack en Docker Compose: Postgres + FastAPI + Caddy (TLS interno con CA propia) + pgbackup. Sin internet. Mirrors locales para actualizaciones futuras.

**Tech Stack:** Debian 12, LUKS, Docker 24+, step-ca, fail2ban, nftables, auditd, chrony, AppArmor.

**Esfuerzo estimado:** 2-3 semanas calendario / 1-2 ingenieros + tiempo de capacitación con cliente.

---

## Convenciones del plan

- Todos los comandos asumen `root` en consola serial/local del servidor salvo cuando se indique `bomberos-ops@`.
- Hostname objetivo: `bomberos-srv01`.
- Dominio interno: `bomberos.dc.local`.
- Subred LAN intranet: `10.20.0.0/16`.
- Subred de administración: `10.20.99.0/24`.
- IP del servidor: `10.20.0.10/16`.
- NTP interno: `10.20.0.1` (router del DC) y `10.20.0.2` (fallback).
- Usuarios:
  - `bomberos-ops` (operador, único con SSH).
  - `bomberos-app` (uid 10001, dueño de `/opt/bomberos`).
- Convención de checklists: cada entregable `6.X` está marcado al inicio del paso correspondiente.

---

# Sección 1 — Preparación del servidor físico (6.1–6.11)

## 6.1 — Inventario hardware y validación de mínimos

**Mínimos exigidos** (validar contra el servidor físico antes de tocarlo):

| Recurso | Mínimo | Recomendado | Verificación |
|---|---|---|---|
| CPU | 8 cores físicos x86_64, AES-NI, VT-x | 16 cores | `lscpu` |
| RAM | 32 GB ECC | 64 GB ECC | `dmidecode -t memory` |
| Disco | 2× 1 TB NVMe en **RAID 1** (mdadm o controladora) | 2× 2 TB NVMe RAID 1 | `lsblk -d -o NAME,SIZE,ROTA,MODEL` |
| Red | 1× 1 Gbps Ethernet | 2× 1 Gbps bonded LACP | `ethtool eth0` |
| TPM | TPM 2.0 presente y activado en BIOS | — | `ls /sys/class/tpm/` |
| BIOS | UEFI, Secure Boot disponible, vt-d/IOMMU | — | revisar BIOS |
| Energía | UPS con autonomía ≥30 min, apagado limpio vía NUT | — | inspección física |

Procedimiento de validación desde un live USB Debian:

```bash
# CPU
lscpu | grep -E '^(Architecture|CPU\(s\)|Model name|Flags)' \
  | tee /root/inv_cpu.txt

# Memoria (cantidad, tipo, ECC)
dmidecode -t memory | grep -E '(Size|Type:|Speed|Manufacturer|Configured Memory Speed|Form Factor|Total Width|Data Width)' \
  | tee /root/inv_ram.txt
grep -i ecc /root/inv_ram.txt || echo "WARN: ECC no confirmado"

# Discos
lsblk -d -o NAME,SIZE,ROTA,MODEL,SERIAL | tee /root/inv_disk.txt
for d in nvme0n1 nvme1n1; do
  nvme smart-log /dev/$d | tee /root/inv_nvme_${d}.txt
done

# Red
for n in $(ls /sys/class/net | grep -v lo); do
  echo "=== $n ==="
  ethtool $n 2>/dev/null | grep -E '(Speed|Duplex|Link detected)'
done | tee /root/inv_net.txt

# TPM
ls -l /sys/class/tpm/ | tee /root/inv_tpm.txt
[ -e /sys/class/tpm/tpm0 ] || { echo "FAIL: TPM no detectado"; exit 1; }

# BIOS / firmware
dmidecode -t bios | tee /root/inv_bios.txt
```

Salida esperada: archivo `inv_*.txt` que se firma y archiva en el handover.

Si alguna línea no cumple, **DETENER** y escalar al cliente antes de continuar.

---

## 6.2 — Instalar Debian 12 con particionado exacto

Boot del instalador Debian 12 (`debian-12.x.0-amd64-netinst.iso` curado previamente en USB y verificado con SHA512 + clave Debian).

Configuración del instalador:

- Idioma: español. Teclado: latinoamericano. Zona horaria: `America/Caracas`.
- Hostname: `bomberos-srv01`. Dominio: `bomberos.dc.local`.
- Usuario root: contraseña fuerte (16+ chars, generada con `pwgen -s 20 1`).
- Usuario inicial: `bomberos-ops`.
- Réplica APT: **mirror local** `http://mirror.bomberos.dc.local/debian/` (configurado en 6.35; durante la primera instalación se puede usar USB de paquetes).
- Selección de software: solo "SSH server" + "utilidades estándar". **Sin** entorno gráfico.
- Habilitar `non-free-firmware` solo si la NIC lo requiere.

### Particionado manual

Usar particionado guiado **NO** — usar manual. RAID 1 mdadm sobre las dos NVMe, LUKS arriba del RAID, LVM dentro del LUKS:

```
/dev/nvme0n1 -> particiones:
   nvme0n1p1   512 MB   EFI System (ESP) — montar /boot/efi
   nvme0n1p2   1 GB     Linux RAID autodetect (md0 -> /boot)
   nvme0n1p3   resto    Linux RAID autodetect (md1 -> LUKS -> LVM)

/dev/nvme1n1 -> espejo:
   nvme1n1p1   512 MB   EFI System (ESP) — copia, montar como reserva
   nvme1n1p2   1 GB     Linux RAID autodetect (md0)
   nvme1n1p3   resto    Linux RAID autodetect (md1)
```

Crear **md0** (RAID 1, metadata 1.2) sobre `nvme[01]n1p2` -> formatear ext4 -> montar `/boot`.

Crear **md1** (RAID 1, metadata 1.2) sobre `nvme[01]n1p3` -> cifrar con LUKS2 (alias `cryptroot`) -> dentro del LUKS crear VG `vg_bomberos`:

```
LV       SIZE   FS    MOUNT                          OPTS
lv_root  50G    ext4  /                              defaults,errors=remount-ro
lv_home  20G    ext4  /home                          defaults,nodev,nosuid
lv_var   30G    ext4  /var                           defaults,nodev,nosuid
lv_varlog 20G   ext4  /var/log                       defaults,nodev,nosuid,noexec
lv_docker 300G  ext4  /var/lib/docker                defaults,noatime,nodev,nosuid
lv_data  400G   ext4  /srv/bomberos/data             defaults,noatime,nodev,nosuid
lv_backup 200G  ext4  /srv/bomberos/backups          defaults,noatime,noexec,nodev,nosuid
lv_swap  8G     swap  none                           sw
```

> Si los discos son de 1 TB exactos, ajustar `lv_data` a 350G y `lv_backup` a 180G. El plan asume mínimo 1 TB útil después de RAID 1.

Verificación post-install desde el sistema arrancado:

```bash
cat /proc/mdstat
cryptsetup status cryptroot
vgs && lvs
mount | grep -E 'noatime|noexec|nodev|nosuid'
findmnt -t ext4
swapon --show
```

Resultado esperado: 8 montajes con flags correctos, `md0` y `md1` en `[UU]`, `cryptroot` `active and is in use`.

---

## 6.3 — Cifrado de disco completo con LUKS + TPM

Si `cryptsetup luksFormat` se ejecutó con passphrase larga (manual del instalador). Ahora se inscribe el TPM 2.0 como segundo keyslot para que el sistema arranque automático.

```bash
# Paquetes
apt update
apt install -y tpm2-tools clevis clevis-luks clevis-initramfs cryptsetup-initramfs

# Verificar TPM 2.0
tpm2_getcap properties-fixed | grep -i 'TPM2_PT_FAMILY'   # debe decir '2.0'
tpm2_pcrread sha256:0,1,2,3,4,5,6,7

# Inscribir el LUKS con clevis usando PCRs estables (0,2,4,7)
clevis luks bind -d /dev/md1 tpm2 \
  '{"hash":"sha256","key":"rsa","pcr_bank":"sha256","pcr_ids":"0,2,4,7"}'

# Listar keyslots — debe aparecer slot extra "clevis"
cryptsetup luksDump /dev/md1 | grep -A2 'Keyslots:'

# Regenerar initramfs para que clevis monte el slot al boot
update-initramfs -u -k all
```

Custodia de la passphrase original:

1. Imprimir la passphrase LUKS en **dos** sobres sellados independientes.
2. Sobre A → caja fuerte del Distrito Capital (custodio: Director TI).
3. Sobre B → caja fuerte de Auditoría Interna (custodio: Director Auditoría).
4. Registrar en `docs/HANDOVER.md` sección "Inventario de credenciales en custodia" (ver §6).

**Prueba de boot sin teclado:**

```bash
reboot
# Verificar desde KVM/serial que arranca sin pedir frase.
```

Si pide passphrase: validar PCRs (`tpm2_pcrread`), regenerar binding clevis y volver a probar.

---

## 6.4 — Actualizaciones desatendidas con mirror local

```bash
apt update && apt full-upgrade -y
apt install -y unattended-upgrades apt-listchanges apt-listbugs needrestart
```

`/etc/apt/sources.list` apuntando al mirror local (será creado en 6.35; para el primer arranque se usa USB):

```text
deb http://mirror.bomberos.dc.local/debian bookworm main contrib non-free-firmware
deb http://mirror.bomberos.dc.local/debian bookworm-updates main contrib non-free-firmware
deb http://mirror.bomberos.dc.local/debian-security bookworm-security main contrib non-free-firmware
```

`/etc/apt/apt.conf.d/50unattended-upgrades` (archivo completo):

```text
Unattended-Upgrade::Origins-Pattern {
    "origin=Debian,codename=${distro_codename}-security,label=Debian-Security";
    "origin=Debian,codename=${distro_codename},label=Debian";
    "origin=Debian,codename=${distro_codename}-updates";
};

Unattended-Upgrade::Package-Blacklist {
    "docker-ce";
    "docker-ce-cli";
    "containerd.io";
    "linux-image-*";
    "linux-headers-*";
};

Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::InstallOnShutdown "false";
Unattended-Upgrade::Mail "ops@bomberos.dc.local";
Unattended-Upgrade::MailReport "on-change";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::SyslogEnable "true";
Unattended-Upgrade::Verbose "true";

Acquire::http::Proxy "false";
Acquire::http::AllowRedirect "false";
```

`/etc/apt/apt.conf.d/20auto-upgrades`:

```text
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
```

Verificar:

```bash
unattended-upgrade --dry-run --debug 2>&1 | tail -30
systemctl enable --now apt-daily.timer apt-daily-upgrade.timer
systemctl list-timers | grep apt
```

---

## 6.5 — SSH hardening completo

```bash
# Generar llave Ed25519 en el equipo del operador y copiarla por out-of-band (USB cifrado)
# En el servidor:
mkdir -p /home/bomberos-ops/.ssh
chmod 700 /home/bomberos-ops/.ssh
# Copiar la pública a /home/bomberos-ops/.ssh/authorized_keys con perms 600
chown -R bomberos-ops:bomberos-ops /home/bomberos-ops/.ssh
chmod 600 /home/bomberos-ops/.ssh/authorized_keys

# Generar moduli fuerte (toma ~10 min, dejar correr una vez)
ssh-keygen -M generate -O bits=4096 /tmp/moduli.candidates
ssh-keygen -M screen -f /tmp/moduli.candidates /etc/ssh/moduli
chmod 644 /etc/ssh/moduli
```

`/etc/ssh/sshd_config` (archivo completo, reemplazo total):

```text
# /etc/ssh/sshd_config — Bomberos DC, intranet only
Port 2222
AddressFamily inet
ListenAddress 10.20.0.10

Protocol 2
HostKey /etc/ssh/ssh_host_ed25519_key
HostKey /etc/ssh/ssh_host_rsa_key

# Algoritmos modernos (drop everything else)
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,sntrup761x25519-sha512@openssh.com,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,umac-128-etm@openssh.com
HostKeyAlgorithms ssh-ed25519,ssh-ed25519-cert-v01@openssh.com,rsa-sha2-512,rsa-sha2-256
PubkeyAcceptedAlgorithms ssh-ed25519,ssh-ed25519-cert-v01@openssh.com,rsa-sha2-512,rsa-sha2-256

# Login
LoginGraceTime 30s
PermitRootLogin no
StrictModes yes
MaxAuthTries 3
MaxSessions 4
MaxStartups 3:50:6

# Auth
PasswordAuthentication no
PermitEmptyPasswords no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
UsePAM yes
PubkeyAuthentication yes
AuthenticationMethods publickey
AuthorizedKeysFile .ssh/authorized_keys

# Restricciones de usuario
AllowUsers bomberos-ops
DenyUsers root
AllowGroups ssh-users

# Funcionalidad
X11Forwarding no
AllowTcpForwarding no
AllowAgentForwarding no
AllowStreamLocalForwarding no
GatewayPorts no
PermitTunnel no
PermitUserEnvironment no

# Sesión
ClientAliveInterval 300
ClientAliveCountMax 2
TCPKeepAlive no
Compression no
UseDNS no

# Logging
SyslogFacility AUTH
LogLevel VERBOSE

# Banner
Banner /etc/issue.net

# SFTP interno (opcional, mantener bloqueado por defecto)
Subsystem sftp internal-sftp
```

Crear grupo y banner:

```bash
groupadd -f ssh-users
usermod -a -G ssh-users bomberos-ops
```

`/etc/issue.net`:

```text
+------------------------------------------------------------+
|  Sistema del Cuerpo de Bomberos del Distrito Capital       |
|  Acceso restringido. Toda actividad es registrada.         |
|  Uso no autorizado puede dar lugar a sanciones civiles     |
|  y penales bajo la legislación venezolana.                 |
+------------------------------------------------------------+
```

Aplicar y validar:

```bash
sshd -t                       # debe terminar sin output
systemctl reload ssh
ss -ltnp | grep 2222
# Probar desde estación de admin antes de cerrar la consola física.
ssh -p 2222 -i ~/.ssh/id_ed25519_bomberos bomberos-ops@10.20.0.10 'id; uptime'
```

---

## 6.6 — fail2ban con jail SSH custom

```bash
apt install -y fail2ban
```

`/etc/fail2ban/jail.local` (archivo completo):

```ini
[DEFAULT]
bantime  = 1d
findtime = 10m
maxretry = 3
backend  = systemd
banaction = nftables-multiport
banaction_allports = nftables-allports
loglevel = INFO
logtarget = /var/log/fail2ban.log
usedns = no
destemail = ops@bomberos.dc.local
sender = fail2ban@bomberos.dc.local
mta = sendmail
protocol = tcp
chain = INPUT
ignoreip = 127.0.0.1/8 ::1 10.20.99.0/24

[sshd]
enabled  = true
port     = 2222
filter   = sshd
mode     = aggressive
journalmatch = _SYSTEMD_UNIT=ssh.service + _COMM=sshd
maxretry = 3
findtime = 10m
bantime  = 1d
bantime.increment = true
bantime.factor = 4
bantime.maxtime = 30d
bantime.rndtime = 5m

[recidive]
enabled  = true
filter   = recidive
logpath  = /var/log/fail2ban.log
bantime  = 30d
findtime = 1d
maxretry = 5
banaction = nftables-allports

[caddy-api]
enabled  = true
filter   = caddy-api
logpath  = /var/log/caddy/access.log
port     = https
maxretry = 50
findtime = 5m
bantime  = 1h
```

`/etc/fail2ban/filter.d/caddy-api.conf`:

```ini
[Definition]
failregex = ^.*"remote_ip":"<HOST>".*"status":(?:401|403|429).*$
ignoreregex =
```

Activar:

```bash
systemctl enable --now fail2ban
fail2ban-client status
fail2ban-client status sshd
```

---

## 6.7 — Firewall nftables (drop por defecto)

```bash
apt install -y nftables
systemctl disable --now ufw 2>/dev/null || true
```

`/etc/nftables.conf` (archivo completo):

```text
#!/usr/sbin/nft -f

flush ruleset

define LAN_INTRANET   = 10.20.0.0/16
define ADMIN_SUBNET   = 10.20.99.0/24
define NTP_INTERNAL_A = 10.20.0.1
define NTP_INTERNAL_B = 10.20.0.2
define SYSLOG_HOST    = 10.20.0.20
define MIRROR_HOST    = 10.20.0.30

table inet filter {

    set blackhole {
        type ipv4_addr
        flags timeout
    }

    chain ct_invalid_drop {
        ct state invalid drop
    }

    chain input {
        type filter hook input priority filter; policy drop;

        ct state established,related accept
        ct state invalid drop

        iif "lo" accept

        ip saddr @blackhole drop

        # ICMP esencial
        ip protocol icmp icmp type { echo-request, destination-unreachable, time-exceeded, parameter-problem } accept
        ip6 nexthdr ipv6-icmp accept

        # SSH solo desde subred de administración
        ip saddr $ADMIN_SUBNET tcp dport 2222 ct state new limit rate 5/minute burst 10 packets accept

        # HTTPS app desde toda la LAN intranet
        ip saddr $LAN_INTRANET tcp dport 443 ct state new accept

        # HTTP solo para redirección 308 a HTTPS (Caddy)
        ip saddr $LAN_INTRANET tcp dport 80 ct state new accept

        # Docker bridge interno
        iifname "br-bomberos-frontend" accept
        iifname "br-bomberos-backend"  accept

        # Logging del resto
        limit rate 10/minute log prefix "nft-drop-in: " level warn
        counter drop
    }

    chain forward {
        type filter hook forward priority filter; policy drop;
        ct state established,related accept
        ct state invalid drop
        # Docker administra sus propias chains, pero los paquetes inter-bridges
        # los rechazamos explícitamente para impedir lateral movement.
        iifname "br-bomberos-backend"  oifname != "br-bomberos-backend"  drop
    }

    chain output {
        type filter hook output priority filter; policy drop;

        ct state established,related accept
        oif "lo" accept

        # DNS interno
        ip daddr $LAN_INTRANET udp dport 53 accept
        ip daddr $LAN_INTRANET tcp dport 53 accept

        # NTP interno
        ip daddr { $NTP_INTERNAL_A, $NTP_INTERNAL_B } udp dport 123 accept

        # Syslog hacia host de logs append-only
        ip daddr $SYSLOG_HOST udp dport 514 accept
        ip daddr $SYSLOG_HOST tcp dport 6514 accept

        # Mirror Debian/PyPI/npm interno
        ip daddr $MIRROR_HOST tcp dport { 80, 443 } accept

        # ICMP saliente
        ip protocol icmp accept
        ip6 nexthdr ipv6-icmp accept

        # Tráfico inter-contenedor
        oifname "br-bomberos-frontend" accept
        oifname "br-bomberos-backend"  accept

        limit rate 10/minute log prefix "nft-drop-out: " level warn
        counter drop
    }
}

table ip nat {
    chain prerouting  { type nat hook prerouting  priority dstnat; }
    chain postrouting { type nat hook postrouting priority srcnat; }
}
```

> Docker añade sus propias tablas (`docker`, `DOCKER-USER`). Para nuestro caso el aislamiento real lo da `network: internal: true` en compose y la inhabilitación de `icc` en daemon.json (6.11).

Aplicar:

```bash
nft -c -f /etc/nftables.conf      # check sintaxis
systemctl enable --now nftables
nft list ruleset | head -80
```

---

## 6.8 — auditd con reglas para acciones críticas

```bash
apt install -y auditd audispd-plugins
```

`/etc/audit/auditd.conf` (líneas clave a modificar; resto por default):

```text
log_file = /var/log/audit/audit.log
log_format = ENRICHED
log_group = adm
max_log_file = 100
max_log_file_action = KEEP_LOGS
num_logs = 30
space_left = 1024
space_left_action = SYSLOG
admin_space_left = 256
admin_space_left_action = SUSPEND
disk_full_action = SUSPEND
disk_error_action = SUSPEND
flush = INCREMENTAL_ASYNC
freq = 50
name_format = HOSTNAME
```

`/etc/audit/rules.d/bomberos.rules` (archivo completo):

```text
## Deshabilitar reglas previas y fijar buffer
-D
-b 16384
-f 1
--backlog_wait_time 60000

## Tiempo y reloj
-a always,exit -F arch=b64 -S adjtimex,settimeofday,clock_settime -k time-change
-w /etc/localtime -p wa -k time-change

## Usuarios/grupos
-w /etc/group -p wa -k identity
-w /etc/passwd -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/gshadow -p wa -k identity
-w /etc/sudoers -p wa -k identity
-w /etc/sudoers.d/ -p wa -k identity

## SSH
-w /etc/ssh/sshd_config -p wa -k sshd-config
-w /etc/ssh/ssh_host_ed25519_key -p wa -k sshd-keys
-w /etc/ssh/ssh_host_rsa_key     -p wa -k sshd-keys

## Configs sensibles del sistema
-w /etc/fail2ban/    -p wa -k fail2ban
-w /etc/nftables.conf -p wa -k nftables
-w /etc/apparmor.d/  -p wa -k apparmor
-w /etc/docker/      -p wa -k docker-config

## Carpetas del sistema Bomberos
-w /opt/bomberos/                -p rwa -k bomberos-app
-w /opt/bomberos/secrets/        -p rwa -k bomberos-secrets
-w /etc/bomberos/                -p rwa -k bomberos-etc
-w /var/lib/docker/volumes/      -p rwa -k docker-volumes
-w /srv/bomberos/data/           -p rwa -k bomberos-data
-w /srv/bomberos/backups/        -p rwa -k bomberos-backups

## Ejecución de binarios críticos
-a always,exit -F arch=b64 -F path=/usr/bin/docker          -F perm=x -k exec-docker
-a always,exit -F arch=b64 -F path=/usr/local/bin/docker    -F perm=x -k exec-docker
-a always,exit -F arch=b64 -F path=/usr/bin/psql            -F perm=x -k exec-psql
-a always,exit -F arch=b64 -F path=/usr/bin/pg_dump         -F perm=x -k exec-pgdump
-a always,exit -F arch=b64 -F path=/usr/bin/su              -F perm=x -k exec-su
-a always,exit -F arch=b64 -F path=/usr/bin/sudo            -F perm=x -k exec-sudo
-a always,exit -F arch=b64 -F path=/usr/bin/passwd          -F perm=x -k exec-passwd
-a always,exit -F arch=b64 -F path=/usr/sbin/useradd        -F perm=x -k exec-useradd
-a always,exit -F arch=b64 -F path=/usr/sbin/usermod        -F perm=x -k exec-usermod

## Cambios de uid/gid efectivos sospechosos
-a always,exit -F arch=b64 -S setuid,setgid,setreuid,setregid -F a0=0 -k root-escalation

## Kernel modules
-a always,exit -F arch=b64 -S init_module,finit_module,delete_module -k modules
-w /sbin/insmod -p x -k modules
-w /sbin/rmmod  -p x -k modules
-w /sbin/modprobe -p x -k modules

## ptrace / mount son comunes en explotación
-a always,exit -F arch=b64 -S ptrace -k tracing
-a always,exit -F arch=b64 -S mount  -k mount

## Inmutable al final — re-arrancar para volver a editar
-e 2
```

Aplicar:

```bash
augenrules --check
augenrules --load
systemctl restart auditd
auditctl -l | head -30
auditctl -s
```

Pruebas:

```bash
touch /opt/bomberos/test.tmp
ausearch -k bomberos-app -ts recent | head
```

---

## 6.9 — chronyd contra NTP interno

```bash
apt install -y chrony
```

`/etc/chrony/chrony.conf` (archivo completo):

```text
# NTP interno del Distrito Capital
server 10.20.0.1 iburst minpoll 4 maxpoll 6 prefer
server 10.20.0.2 iburst minpoll 4 maxpoll 6

# Sin pools públicos (no hay internet)
# Si el NTP interno falla, chrony NO debe saltar al pool global.
pool 2.debian.pool.ntp.org offline iburst

# Permitir solo a la propia LAN consultar tiempo a este host
allow 10.20.0.0/16

driftfile /var/lib/chrony/drift
makestep 1.0 3
rtcsync
leapsectz right/UTC

# Logging
logdir /var/log/chrony
log measurements statistics tracking
logbanner 0

# Endurecer NTS si está disponible (Debian 12 lo soporta)
ntsdumpdir /var/lib/chrony

# No corregir hacia atrás más de 5s una vez sincronizado (guardia anti-replay)
maxslewrate 100
maxdistance 16.0
```

Aplicar:

```bash
systemctl enable --now chrony
chronyc tracking
chronyc sources -v
chronyc activity
timedatectl set-timezone America/Caracas
timedatectl status
```

---

## 6.10 — AppArmor en enforcing

```bash
apt install -y apparmor apparmor-utils apparmor-profiles apparmor-profiles-extra
systemctl enable --now apparmor
aa-status
```

Confirmar que el kernel arranca con AppArmor habilitado. Editar `/etc/default/grub`:

```text
GRUB_CMDLINE_LINUX_DEFAULT="quiet apparmor=1 security=apparmor lsm=lockdown,yama,integrity,apparmor"
```

Aplicar:

```bash
update-grub
```

Mover todos los perfiles a enforce y crear el perfil específico de Docker:

```bash
for p in /etc/apparmor.d/*; do
  [ -f "$p" ] && aa-enforce "$p" 2>/dev/null || true
done
```

`/etc/apparmor.d/docker-bomberos-api` (perfil específico para el contenedor api):

```text
#include <tunables/global>

profile docker-bomberos-api flags=(attach_disconnected,mediate_deleted) {
  #include <abstractions/base>
  #include <abstractions/python>
  #include <abstractions/openssl>

  network inet stream,
  network inet6 stream,

  /usr/local/bin/python3.12 ix,
  /usr/local/bin/uvicorn ix,
  /app/** r,
  /tmp/** rw,
  /proc/sys/kernel/random/uuid r,
  /proc/*/status r,
  /proc/*/stat r,

  deny /etc/shadow r,
  deny /root/** rwklx,
  deny /var/log/** wl,
  deny mount,
  deny ptrace,
  deny capability sys_admin,
  deny capability sys_module,
  deny @{PROC}/sysrq-trigger rwklx,
  deny @{PROC}/mem rwklx,
}
```

Cargar:

```bash
apparmor_parser -r /etc/apparmor.d/docker-bomberos-api
aa-status | grep docker-bomberos-api
```

El perfil se asigna al contenedor vía `security_opt: ["apparmor=docker-bomberos-api"]` en `docker-compose.prod.yml`.

---

## 6.11 — Docker daemon configuration

```bash
# Instalar Docker desde paquete .deb curado en USB / mirror local
apt install -y \
  /opt/bomberos/install/docker/containerd.io_*.deb \
  /opt/bomberos/install/docker/docker-ce_*.deb \
  /opt/bomberos/install/docker/docker-ce-cli_*.deb \
  /opt/bomberos/install/docker/docker-compose-plugin_*.deb \
  /opt/bomberos/install/docker/docker-buildx-plugin_*.deb
```

`/etc/docker/daemon.json` (archivo completo):

```json
{
  "userns-remap": "default",
  "live-restore": true,
  "icc": false,
  "no-new-privileges": true,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "7",
    "compress": "true",
    "labels": "service,environment"
  },
  "storage-driver": "overlay2",
  "default-runtime": "runc",
  "selinux-enabled": false,
  "ipv6": false,
  "iptables": true,
  "ip-forward": true,
  "default-address-pools": [
    { "base": "172.30.0.0/16", "size": 24 }
  ],
  "default-ulimits": {
    "nofile": { "Name": "nofile", "Hard": 65536, "Soft": 65536 },
    "nproc":  { "Name": "nproc",  "Hard": 8192,  "Soft": 4096  }
  },
  "default-shm-size": "64M",
  "exec-opts": ["native.cgroupdriver=systemd"],
  "experimental": false,
  "metrics-addr": "127.0.0.1:9323",
  "userland-proxy": false,
  "registry-mirrors": ["https://mirror.bomberos.dc.local/registry"],
  "insecure-registries": [],
  "allow-nondistributable-artifacts": [],
  "tls": true,
  "tlsverify": true,
  "tlscacert": "/etc/docker/certs/ca.pem",
  "tlscert":   "/etc/docker/certs/server-cert.pem",
  "tlskey":    "/etc/docker/certs/server-key.pem",
  "data-root": "/var/lib/docker",
  "seccomp-profile": "/etc/docker/seccomp-default.json",
  "default-cgroupns-mode": "private"
}
```

Descargar seccomp profile oficial Docker (curado en USB):

```bash
install -m 0644 /opt/bomberos/install/docker/seccomp-default.json /etc/docker/seccomp-default.json
mkdir -p /etc/docker/certs
chmod 700 /etc/docker/certs
```

Activar y verificar:

```bash
systemctl enable --now docker
docker info | grep -E '(Userns|Live Restore|Inter Container|Logging|Storage)'
docker run --rm hello-world 2>/dev/null || echo "OK si no hay imagen — registry interno aún no poblado"
```

> Si `userns-remap: default` choca con bind mounts, asegurar que `/srv/bomberos/data` y `/var/lib/docker/volumes` permiten al rango remapeado leer (`chown -R 100000:100000 /srv/bomberos/data` después de bootstrap inicial). Documentar en HANDOVER.

---

# Sección 2 — CA interna y TLS (6.12–6.14)

## 6.12 — Generar la CA del Cuerpo de Bomberos con step-ca

`step-ca` corre **fuera** del servidor de producción en una estación dedicada offline (laptop dedicada de operador TI). Instalación en esa estación:

```bash
# Instalar step-cli y step-ca desde paquete .deb curado
dpkg -i /opt/bomberos/install/step/step-cli_*.deb
dpkg -i /opt/bomberos/install/step/step-ca_*.deb
```

Inicializar la PKI:

```bash
step ca init \
  --name "Cuerpo de Bomberos del Distrito Capital — Root CA" \
  --dns "ca.bomberos.dc.local" \
  --address "127.0.0.1:8443" \
  --provisioner "ops@bomberos.dc.local" \
  --password-file=<(pwgen -s 32 1) \
  --provisioner-password-file=<(pwgen -s 32 1) \
  --deployment-type standalone
```

Esto genera bajo `~/.step/`:

- `certs/root_ca.crt` — certificado raíz (compartible).
- `secrets/root_ca_key` — llave privada raíz (cold storage).
- `certs/intermediate_ca.crt` — intermedia operativa.
- `secrets/intermediate_ca_key` — llave intermedia.
- `config/ca.json`, `config/defaults.json`.

Custodia de la root key:

1. Copiar `~/.step/secrets/root_ca_key` y la passphrase a **USB cifrado con LUKS** (clave distinta a la del servidor).
2. Sobre sellado etiquetado "CA-ROOT-BOMBEROS-DC — NO ABRIR SIN AUTORIZACIÓN DEL DIRECTOR TI".
3. Caja fuerte del Distrito Capital. Doble custodia.
4. **Borrar** `root_ca_key` del disco de la estación step-ca (después del paso 6.13):
   ```bash
   shred -u ~/.step/secrets/root_ca_key
   ```
5. La intermedia se queda online para emitir cert leaf y renovaciones.

Validar:

```bash
step certificate inspect ~/.step/certs/root_ca.crt --short
step certificate inspect ~/.step/certs/intermediate_ca.crt --short
```

---

## 6.13 — Emitir cert leaf para `bomberos.dc.local`

En la estación step-ca, generar la CSR y firmar el cert leaf:

```bash
# Llave del servidor (P-256, suficiente y mucho más rápido que RSA 4096 en TLS)
step certificate create \
  "bomberos.dc.local" \
  /tmp/bomberos.crt /tmp/bomberos.key \
  --san bomberos.dc.local \
  --san bomberos-srv01.bomberos.dc.local \
  --san 10.20.0.10 \
  --profile leaf \
  --not-after 8760h \
  --kty EC --curve P-256 \
  --ca ~/.step/certs/intermediate_ca.crt \
  --ca-key ~/.step/secrets/intermediate_ca_key

step certificate inspect /tmp/bomberos.crt --short
```

Transferir a la sede vía USB cifrado:

```bash
# En la estación step-ca:
mkdir -p /mnt/usb_certs/bomberos
cp /tmp/bomberos.crt /tmp/bomberos.key \
   ~/.step/certs/root_ca.crt ~/.step/certs/intermediate_ca.crt \
   /mnt/usb_certs/bomberos/
chmod 600 /mnt/usb_certs/bomberos/*.key
sync && umount /mnt/usb_certs
```

En el servidor de producción:

```bash
mkdir -p /opt/bomberos/secrets/tls
install -m 0600 /mnt/usb_certs/bomberos/bomberos.key /opt/bomberos/secrets/tls/server.key
install -m 0644 /mnt/usb_certs/bomberos/bomberos.crt /opt/bomberos/secrets/tls/server.crt
install -m 0644 /mnt/usb_certs/bomberos/intermediate_ca.crt /opt/bomberos/secrets/tls/intermediate.crt
install -m 0644 /mnt/usb_certs/bomberos/root_ca.crt /opt/bomberos/secrets/tls/root.crt

# Fullchain para Caddy
cat /opt/bomberos/secrets/tls/server.crt \
    /opt/bomberos/secrets/tls/intermediate.crt > /opt/bomberos/secrets/tls/fullchain.crt
chmod 644 /opt/bomberos/secrets/tls/fullchain.crt
chown -R root:root /opt/bomberos/secrets/tls
chmod 700 /opt/bomberos/secrets/tls
```

---

## 6.14 — Distribuir root CA a estaciones de funcionarios

### A — Windows con GPO (Active Directory existente)

En el DC del cliente, importar `root_ca.crt` al GPO de equipos:

1. `gpmc.msc` → editar GPO "Bomberos Workstations Policy".
2. Computer Configuration → Policies → Windows Settings → Security Settings → Public Key Policies → **Trusted Root Certification Authorities** → Import.
3. Importar `root_ca.crt`.
4. Replicar GPO; `gpupdate /force` en estaciones.

### B — Sin AD: script de instalación (USB de despliegue)

`install_ca_windows.ps1`:

```powershell
# Bomberos DC — instalación de Root CA en cliente Windows
# Requiere ejecutar como Administrador

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$CertPath  = Join-Path $ScriptDir 'root_ca.crt'

if (-not (Test-Path $CertPath)) {
    Write-Error "No se encuentra root_ca.crt en $ScriptDir"
    exit 1
}

$expectedSha256 = 'PLACEHOLDER_FILL_AFTER_GENERATION'
$actualSha256 = (Get-FileHash -Algorithm SHA256 $CertPath).Hash.ToLower()
if ($actualSha256 -ne $expectedSha256.ToLower()) {
    Write-Error "Hash SHA-256 del CA no coincide. Abortando."
    exit 2
}

Import-Certificate -FilePath $CertPath -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
Write-Host "Root CA del Cuerpo de Bomberos instalada correctamente." -ForegroundColor Green

# Firefox usa su propio store: copiar a la policy de cada perfil si Firefox está instalado
$ffPolicyDir = "$env:ProgramFiles\Mozilla Firefox\distribution"
if (Test-Path "$env:ProgramFiles\Mozilla Firefox\firefox.exe") {
    New-Item -ItemType Directory -Force -Path $ffPolicyDir | Out-Null
    @{
        policies = @{
            Certificates = @{
                ImportEnterpriseRoots = $true
                Install = @($CertPath)
            }
        }
    } | ConvertTo-Json -Depth 5 | Out-File "$ffPolicyDir\policies.json" -Encoding utf8
    Write-Host "Política de Firefox aplicada."
}
```

Antes de generar el USB, reemplazar `PLACEHOLDER_FILL_AFTER_GENERATION` con:

```bash
sha256sum /opt/bomberos/secrets/tls/root.crt | awk '{print $1}'
```

### C — Linux (estaciones técnicas)

`install_ca_linux.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
CERT="${SCRIPT_DIR}/root_ca.crt"
EXPECTED_SHA="PLACEHOLDER_FILL_AFTER_GENERATION"

[[ $EUID -eq 0 ]] || { echo "Ejecutar con sudo"; exit 1; }
[[ -f "$CERT" ]]   || { echo "No existe $CERT"; exit 1; }

actual="$(sha256sum "$CERT" | awk '{print $1}')"
[[ "$actual" == "$EXPECTED_SHA" ]] || { echo "Hash no coincide. Abort."; exit 2; }

install -m 0644 "$CERT" /usr/local/share/ca-certificates/bomberos-dc-root.crt
update-ca-certificates
echo "Root CA del Cuerpo de Bomberos instalada."
```

Distribución y registro:

- Bitácora de PCs con CA instalada: `docs/manuales/registro_ca_distribucion.csv`.
- Verificación spot: visitar 5 estaciones al azar y abrir `https://bomberos.dc.local` — debe cargar sin warning.

---

# Sección 3 — Despliegue del stack (6.15–6.23)

## 6.15 — Clonar repo y configurar secrets

```bash
# Usuario operacional del stack (NO confundir con bomberos-ops que es SSH)
groupadd -g 10001 bomberos-app
useradd -m -u 10001 -g 10001 -s /usr/sbin/nologin bomberos-app

# Estructura base
install -d -o root -g root -m 0755 /opt/bomberos
install -d -o root -g root -m 0700 /opt/bomberos/secrets
install -d -o root -g root -m 0755 /opt/bomberos/install
install -d -o bomberos-app -g bomberos-app -m 0750 /srv/bomberos/data
install -d -o bomberos-app -g bomberos-app -m 0750 /srv/bomberos/backups
install -d -o bomberos-app -g bomberos-app -m 0750 /srv/bomberos/logs

# Repositorio (desde USB curado en sede — sin internet)
mkdir -p /opt/bomberos/repo
tar -xJf /mnt/usb_repo/bomberos-caracas-bd-${RELEASE_TAG}.tar.xz -C /opt/bomberos/repo --strip-components=1

# Verificar firma del bundle (GPG offline)
gpg --verify /mnt/usb_repo/bomberos-caracas-bd-${RELEASE_TAG}.tar.xz.sig \
             /mnt/usb_repo/bomberos-caracas-bd-${RELEASE_TAG}.tar.xz

cd /opt/bomberos/repo
git log -1                        # bundle también incluye .git
```

Layout final de `/opt/bomberos`:

```
/opt/bomberos/
├── repo/                         # código fuente y compose.prod
├── secrets/                      # 700 root:root
│   ├── api.env                   # 600 root:root
│   ├── postgres.env              # 600 root:root
│   ├── pgbackup.env              # 600 root:root
│   ├── jwt_private.pem           # 600 bomberos-app:bomberos-app
│   ├── jwt_public.pem            # 644 bomberos-app:bomberos-app
│   ├── kms.key                   # 600 bomberos-app:bomberos-app
│   ├── backup_passphrase.txt     # 400 root:root
│   └── tls/
│       ├── server.crt
│       ├── server.key            # 600 root:root
│       ├── fullchain.crt
│       └── root.crt
└── install/                      # paquetes .deb, seccomp, imágenes docker .tar
```

Permisos:

```bash
chmod 700 /opt/bomberos/secrets
chmod 600 /opt/bomberos/secrets/*.env /opt/bomberos/secrets/*.key /opt/bomberos/secrets/*.pem /opt/bomberos/secrets/backup_passphrase.txt 2>/dev/null
chown -R root:root /opt/bomberos/secrets
# Excepción JWT que api lee con usuario remapeado
chown bomberos-app:bomberos-app /opt/bomberos/secrets/jwt_private.pem /opt/bomberos/secrets/jwt_public.pem /opt/bomberos/secrets/kms.key
chmod 600 /opt/bomberos/secrets/jwt_private.pem /opt/bomberos/secrets/kms.key
chmod 644 /opt/bomberos/secrets/jwt_public.pem
```

---

## 6.16 — Generar JWT_SECRET_KEY real

```bash
python3 - <<'PY' > /opt/bomberos/secrets/.jwt_secret
import secrets
print(secrets.token_urlsafe(64))
PY

# Mover al archivo de env (no se queda crudo en disco)
JWT_SECRET="$(cat /opt/bomberos/secrets/.jwt_secret)"
shred -u /opt/bomberos/secrets/.jwt_secret

cat > /opt/bomberos/secrets/api.env <<EOF
APP_ENV=production
APP_DEBUG=false
LOG_LEVEL=INFO
LOG_FORMAT=json
DATABASE_URL=postgresql+asyncpg://bomberos_app:__SET_BY_POSTGRES_ENV__@postgres:5432/bomberos_caracas
JWT_SECRET_KEY=${JWT_SECRET}
JWT_ALGORITHM=RS256
JWT_PRIVATE_KEY_PATH=/run/secrets/jwt_private.pem
JWT_PUBLIC_KEY_PATH=/run/secrets/jwt_public.pem
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_SECONDS=3600
JWT_ISSUER=https://bomberos.dc.local
JWT_AUDIENCE=bomberos-app
CORS_ORIGINS=https://bomberos.dc.local
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=strict
SESSION_COOKIE_DOMAIN=bomberos.dc.local
KMS_KEY_PATH=/run/secrets/kms.key
MFA_ENFORCE_ROLES=ADMIN,SUPER_ADMIN,RRHH,MEDICO
BOOTSTRAP_ADMIN_USER=admin
BOOTSTRAP_ADMIN_EMAIL=admin@bomberos.dc.local
EOF
chmod 600 /opt/bomberos/secrets/api.env
chown root:root /opt/bomberos/secrets/api.env
```

Postgres env y password DB:

```bash
DB_APP_PASS="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
DB_ADMIN_PASS="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
REPL_PASS="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"

cat > /opt/bomberos/secrets/postgres.env <<EOF
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${DB_ADMIN_PASS}
POSTGRES_DB=bomberos_caracas
POSTGRES_INITDB_ARGS=--encoding=UTF8 --locale=es_VE.UTF-8 --data-checksums
LANG=es_VE.UTF-8
APP_DB_USER=bomberos_app
APP_DB_PASSWORD=${DB_APP_PASS}
REPL_USER=repl
REPL_PASSWORD=${REPL_PASS}
EOF
chmod 600 /opt/bomberos/secrets/postgres.env

# Inyectar password app en DATABASE_URL del api.env
sed -i "s|__SET_BY_POSTGRES_ENV__|${DB_APP_PASS}|" /opt/bomberos/secrets/api.env
```

KMS key (cifrado en reposo del módulo `pgcrypto`):

```bash
openssl rand -base64 32 > /opt/bomberos/secrets/kms.key
chown bomberos-app:bomberos-app /opt/bomberos/secrets/kms.key
chmod 600 /opt/bomberos/secrets/kms.key
```

Passphrase para backups GPG:

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(40))' \
  > /opt/bomberos/secrets/backup_passphrase.txt
chmod 400 /opt/bomberos/secrets/backup_passphrase.txt

cat > /opt/bomberos/secrets/pgbackup.env <<EOF
PGHOST=postgres
PGUSER=postgres
PGPASSWORD=${DB_ADMIN_PASS}
PGDATABASE=bomberos_caracas
BACKUP_CRON=0 */6 * * *
BACKUP_RETENTION_DAYS=30
BACKUP_DIR=/backups
BACKUP_PASSPHRASE_FILE=/run/secrets/backup_passphrase
EOF
chmod 600 /opt/bomberos/secrets/pgbackup.env
```

Custodia inmediata de credenciales:

1. Imprimir en papel: `DB_ADMIN_PASS`, `BOOTSTRAP_ADMIN_PASSWORD`, `JWT_SECRET_KEY` (hash), passphrase de backup.
2. Sobre sellado etiquetado por fecha, firmado por ingeniero + custodio.
3. Caja fuerte de TI + caja fuerte de Auditoría (doble custodia).

---

## 6.17 — Generar par RSA 4096 para JWT RS256

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 \
  -out /opt/bomberos/secrets/jwt_private.pem
openssl rsa -in /opt/bomberos/secrets/jwt_private.pem -pubout \
  -out /opt/bomberos/secrets/jwt_public.pem

chown bomberos-app:bomberos-app /opt/bomberos/secrets/jwt_*.pem
chmod 600 /opt/bomberos/secrets/jwt_private.pem
chmod 644 /opt/bomberos/secrets/jwt_public.pem

# Sanity check: firmar/verificar
echo -n "test" | openssl dgst -sha256 -sign /opt/bomberos/secrets/jwt_private.pem \
  | openssl dgst -sha256 -verify /opt/bomberos/secrets/jwt_public.pem \
                 -signature /dev/stdin <(echo -n "test")
```

Backup de las llaves JWT a USB cifrado de custodia (cold storage, igual que LUKS passphrase).

---

## 6.18 — Levantar Postgres y validar aislamiento

### `docker-compose.prod.yml` (archivo completo, vive en `/opt/bomberos/repo/`)

```yaml
name: bomberos-prod

networks:
  frontend:
    name: br-bomberos-frontend
    driver: bridge
    driver_opts:
      com.docker.network.bridge.name: br-bomberos-frontend
      com.docker.network.bridge.enable_icc: "false"
    ipam:
      config:
        - subnet: 172.30.10.0/24
  backend:
    name: br-bomberos-backend
    driver: bridge
    internal: true
    driver_opts:
      com.docker.network.bridge.name: br-bomberos-backend
      com.docker.network.bridge.enable_icc: "false"
    ipam:
      config:
        - subnet: 172.30.11.0/24

volumes:
  pg_data:
    name: bomberos_pg_data
    driver_opts:
      type: none
      o: bind
      device: /srv/bomberos/data/postgres
  pg_wal:
    name: bomberos_pg_wal
    driver_opts:
      type: none
      o: bind
      device: /srv/bomberos/data/postgres-wal
  caddy_data:
    name: bomberos_caddy_data
  caddy_config:
    name: bomberos_caddy_config
  loki_data:
    name: bomberos_loki_data
    driver_opts:
      type: none
      o: bind
      device: /srv/bomberos/logs/loki

secrets:
  api_env:
    file: /opt/bomberos/secrets/api.env
  postgres_env:
    file: /opt/bomberos/secrets/postgres.env
  pgbackup_env:
    file: /opt/bomberos/secrets/pgbackup.env
  jwt_private:
    file: /opt/bomberos/secrets/jwt_private.pem
  jwt_public:
    file: /opt/bomberos/secrets/jwt_public.pem
  kms_key:
    file: /opt/bomberos/secrets/kms.key
  backup_passphrase:
    file: /opt/bomberos/secrets/backup_passphrase.txt

services:
  postgres:
    image: postgres:16.4-alpine@sha256:PINNED_DIGEST_HERE
    container_name: bomberos_pg
    hostname: postgres
    restart: unless-stopped
    env_file:
      - /opt/bomberos/secrets/postgres.env
    networks:
      - backend
    volumes:
      - pg_data:/var/lib/postgresql/data
      - pg_wal:/var/lib/postgresql/wal
      - ./sql:/docker-entrypoint-initdb.d:ro
      - ./infra/postgres/postgresql.conf:/etc/postgresql/postgresql.conf:ro
      - ./infra/postgres/pg_hba.conf:/etc/postgresql/pg_hba.conf:ro
    command:
      - "postgres"
      - "-c"
      - "config_file=/etc/postgresql/postgresql.conf"
      - "-c"
      - "hba_file=/etc/postgresql/pg_hba.conf"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d bomberos_caracas"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 30s
    cap_drop: ["ALL"]
    cap_add: ["CHOWN", "SETUID", "SETGID", "DAC_OVERRIDE", "FOWNER"]
    security_opt:
      - no-new-privileges:true
      - seccomp=/etc/docker/seccomp-default.json
    read_only: false   # postgres necesita escribir en pgdata
    tmpfs:
      - /tmp:size=64m,mode=1777,nodev,nosuid,noexec
      - /run/postgresql:size=16m,mode=0755
    ulimits:
      nofile: { soft: 65536, hard: 65536 }
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "10", labels: "service=postgres" }
    deploy:
      resources:
        limits: { cpus: "4.0", memory: 12g }
        reservations: { memory: 4g }

  api:
    image: bomberos/api:1.0.0
    container_name: bomberos_api
    hostname: api
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    env_file:
      - /opt/bomberos/secrets/api.env
    networks:
      - backend
      - frontend
    secrets:
      - source: jwt_private
        target: /run/secrets/jwt_private.pem
        mode: 0400
      - source: jwt_public
        target: /run/secrets/jwt_public.pem
        mode: 0444
      - source: kms_key
        target: /run/secrets/kms.key
        mode: 0400
    user: "10001:10001"
    cap_drop: ["ALL"]
    security_opt:
      - no-new-privileges:true
      - apparmor=docker-bomberos-api
      - seccomp=/etc/docker/seccomp-default.json
    read_only: true
    tmpfs:
      - /tmp:size=64m,mode=1777,nodev,nosuid,noexec
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:8000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "10", labels: "service=api" }
    deploy:
      resources:
        limits: { cpus: "2.0", memory: 2g }
        reservations: { memory: 512m }

  caddy:
    image: caddy:2.8-alpine@sha256:PINNED_DIGEST_HERE
    container_name: bomberos_caddy
    hostname: caddy
    restart: unless-stopped
    depends_on:
      api:
        condition: service_healthy
    networks:
      - frontend
    ports:
      - "10.20.0.10:443:443"
      - "10.20.0.10:80:80"
    volumes:
      - ./infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - /opt/bomberos/secrets/tls:/etc/tls:ro
      - caddy_data:/data
      - caddy_config:/config
    cap_drop: ["ALL"]
    cap_add: ["NET_BIND_SERVICE"]
    security_opt:
      - no-new-privileges:true
      - seccomp=/etc/docker/seccomp-default.json
    read_only: true
    tmpfs:
      - /tmp:size=32m
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "10", labels: "service=caddy" }
    deploy:
      resources:
        limits: { cpus: "1.0", memory: 256m }

  pgbackup:
    image: bomberos/pgbackup:1.0.0
    container_name: bomberos_pgbackup
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    env_file:
      - /opt/bomberos/secrets/pgbackup.env
    networks:
      - backend
    volumes:
      - /srv/bomberos/backups:/backups
    secrets:
      - source: backup_passphrase
        target: /run/secrets/backup_passphrase
        mode: 0400
    cap_drop: ["ALL"]
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp:size=128m

  promtail:
    image: grafana/promtail:2.9.0
    container_name: bomberos_promtail
    restart: unless-stopped
    networks:
      - backend
    volumes:
      - ./infra/promtail/config.yml:/etc/promtail/config.yml:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /var/log:/var/log:ro
    command: -config.file=/etc/promtail/config.yml
    cap_drop: ["ALL"]
    security_opt:
      - no-new-privileges:true
    read_only: true

  loki:
    image: grafana/loki:2.9.0
    container_name: bomberos_loki
    restart: unless-stopped
    networks:
      - backend
    volumes:
      - ./infra/loki/config.yml:/etc/loki/config.yml:ro
      - loki_data:/loki
    command: -config.file=/etc/loki/config.yml
    cap_drop: ["ALL"]
    security_opt:
      - no-new-privileges:true
```

### `infra/postgres/postgresql.conf`

```text
# === Conexiones ===
listen_addresses = '*'
port = 5432
max_connections = 200
superuser_reserved_connections = 3

# === Autenticación / TLS ===
ssl = on
ssl_cert_file = '/etc/postgresql/server.crt'
ssl_key_file  = '/etc/postgresql/server.key'
ssl_ciphers = 'HIGH:!aNULL:!MD5'
ssl_prefer_server_ciphers = on
ssl_min_protocol_version  = 'TLSv1.2'
password_encryption = scram-sha-256

# === Memoria ===
shared_buffers = 4GB
effective_cache_size = 12GB
maintenance_work_mem = 1GB
work_mem = 32MB

# === WAL / replicación / durabilidad ===
wal_level = replica
synchronous_commit = on
fsync = on
full_page_writes = on
wal_compression = on
checkpoint_timeout = 15min
checkpoint_completion_target = 0.9
max_wal_size = 4GB
min_wal_size = 1GB
wal_keep_size = 2GB
archive_mode = on
archive_command = 'test ! -f /var/lib/postgresql/wal/%f && cp %p /var/lib/postgresql/wal/%f'

# === Planner ===
random_page_cost = 1.1
effective_io_concurrency = 200
default_statistics_target = 100

# === Logging ===
logging_collector = on
log_destination = 'stderr,csvlog'
log_directory = '/var/log/postgresql'
log_filename = 'pg-%Y%m%d.log'
log_rotation_age = 1d
log_rotation_size = 100MB
log_truncate_on_rotation = off
log_min_duration_statement = 500
log_connections = on
log_disconnections = on
log_hostname = off
log_line_prefix = '%m [%p] %q%u@%d/%a '
log_lock_waits = on
log_statement = 'ddl'
log_temp_files = 0
log_timezone = 'America/Caracas'

# === Auditoría (pgaudit) ===
shared_preload_libraries = 'pgaudit'
pgaudit.log = 'write, ddl, role'
pgaudit.log_relation = on
pgaudit.log_catalog = off
pgaudit.log_parameter = on

# === Locale ===
datestyle = 'iso, dmy'
timezone = 'America/Caracas'
lc_messages = 'es_VE.UTF-8'
lc_monetary = 'es_VE.UTF-8'
lc_numeric  = 'es_VE.UTF-8'
lc_time     = 'es_VE.UTF-8'

# === Autovacuum ===
autovacuum = on
autovacuum_max_workers = 4
autovacuum_vacuum_scale_factor = 0.05
autovacuum_analyze_scale_factor = 0.025
```

### `infra/postgres/pg_hba.conf`

```text
# TYPE      DATABASE          USER             ADDRESS              METHOD
local       all               postgres                              peer
hostssl     all               postgres         172.30.11.0/24       scram-sha-256
hostssl     bomberos_caracas  bomberos_app     172.30.11.0/24       scram-sha-256
hostssl     replication       repl             172.30.11.0/24       scram-sha-256
# Resto: rechazar
host        all               all              0.0.0.0/0            reject
host        all               all              ::/0                 reject
```

Copiar el cert TLS para postgres:

```bash
install -m 0644 /opt/bomberos/secrets/tls/server.crt /opt/bomberos/repo/infra/postgres/server.crt
install -m 0600 /opt/bomberos/secrets/tls/server.key /opt/bomberos/repo/infra/postgres/server.key
# Postgres exige owner del proceso. En el contenedor postgres es uid 70.
chown 70:70 /opt/bomberos/repo/infra/postgres/server.key
```

Levantar:

```bash
cd /opt/bomberos/repo
docker compose -f docker-compose.prod.yml up -d postgres

# Esperar healthy
until docker inspect bomberos_pg --format='{{.State.Health.Status}}' | grep -q healthy; do
  sleep 2
done

# Validar aislamiento desde host: NO debe haber port 5432 expuesto
ss -ltnp | grep 5432   # debe estar vacío
docker port bomberos_pg # debe estar vacío

# Validar TLS exigido
docker exec bomberos_pg psql -U postgres -c "SHOW ssl;"
docker exec bomberos_pg psql -U postgres -c "SELECT name, setting FROM pg_settings WHERE name IN ('password_encryption','log_connections','ssl');"
```

---

## 6.19 — Aplicar schema completo

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres -d bomberos_caracas -v ON_ERROR_STOP=1 \
  -f /docker-entrypoint-initdb.d/99_run_all.sql

# Verificar conteo de tablas y schemas
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres -d bomberos_caracas -c "
    SELECT n.nspname AS schema, COUNT(*) AS tables
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema')
    GROUP BY 1 ORDER BY 1;
  "
```

---

## 6.20 — Aplicar RLS, roles, append-only triggers

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres -d bomberos_caracas -v ON_ERROR_STOP=1 \
  -f /docker-entrypoint-initdb.d/06_seguridad_rls.sql

docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres -d bomberos_caracas -v ON_ERROR_STOP=1 \
  -f /docker-entrypoint-initdb.d/07_roles_por_departamento.sql

# Crear/actualizar password del rol app
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres -d bomberos_caracas <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bomberos_app') THEN
    CREATE ROLE bomberos_app LOGIN PASSWORD '$(grep ^APP_DB_PASSWORD /opt/bomberos/secrets/postgres.env | cut -d= -f2)';
  ELSE
    ALTER ROLE bomberos_app WITH LOGIN PASSWORD '$(grep ^APP_DB_PASSWORD /opt/bomberos/secrets/postgres.env | cut -d= -f2)';
  END IF;
END\$\$;
ALTER ROLE bomberos_app NOBYPASSRLS;
SQL

# Verificar: todas las tablas sensibles con RLS FORCE
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres -d bomberos_caracas -c "
    SELECT schemaname, tablename, rowsecurity, forcerowsecurity
    FROM pg_tables
    WHERE schemaname IN ('personal','salud','ops','carrera','equipo','beneficios','egresos','documentos','seguridad','aud')
    ORDER BY 1,2;
  "
```

Espera: `rowsecurity=t` y `forcerowsecurity=t` en todas las filas.

---

## 6.21 — Levantar api, caddy, pgbackup

Pre-cargar imágenes (build offline en estación con internet, exportadas a USB):

```bash
docker load -i /opt/bomberos/install/images/bomberos-api-1.0.0.tar
docker load -i /opt/bomberos/install/images/bomberos-pgbackup-1.0.0.tar
docker load -i /opt/bomberos/install/images/caddy-2.8-alpine.tar
docker load -i /opt/bomberos/install/images/loki-2.9.0.tar
docker load -i /opt/bomberos/install/images/promtail-2.9.0.tar
docker images
```

### `infra/caddy/Caddyfile`

```text
{
    auto_https off
    admin off
    servers {
        protocols h1 h2
    }
    log default {
        output file /var/log/caddy/access.log {
            roll_size 100MiB
            roll_keep 30
        }
        format json
        level INFO
    }
}

(security_headers) {
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer"
        Permissions-Policy "geolocation=(), microphone=(), camera=()"
        Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'"
        -Server
    }
}

:80 {
    redir https://bomberos.dc.local{uri} 308
}

bomberos.dc.local {
    tls /etc/tls/fullchain.crt /etc/tls/server.key {
        protocols tls1.2 tls1.3
        ciphers TLS_AES_256_GCM_SHA384 TLS_CHACHA20_POLY1305_SHA256 TLS_AES_128_GCM_SHA256 TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
    }
    import security_headers

    encode zstd gzip

    @api path /api/* /health
    handle @api {
        reverse_proxy api:8000 {
            header_up X-Real-IP {http.request.remote.host}
            header_up X-Forwarded-For {http.request.remote.host}
            header_up X-Forwarded-Proto https
        }
    }

    # Estáticos del frontend (build de Next/Vite exportado en /opt/bomberos/repo/dist)
    handle {
        root * /srv/frontend
        file_server
        try_files {path} /index.html
    }

    log
}
```

Frontend build estático (copiado por el bundle):

```bash
install -d -o bomberos-app -g bomberos-app -m 0755 /srv/frontend
tar -xJf /opt/bomberos/install/frontend/bomberos-frontend-1.0.0.tar.xz -C /srv/frontend --strip-components=1
```

Levantar el resto del stack:

```bash
cd /opt/bomberos/repo
docker compose -f docker-compose.prod.yml up -d api caddy pgbackup promtail loki

docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=50 api
docker compose -f docker-compose.prod.yml logs --tail=50 caddy
```

---

## 6.22 — Bootstrap del admin inicial

Generar password fuerte para el admin:

```bash
ADMIN_PASS="$(python3 -c '
import secrets, string
alpha = string.ascii_letters + string.digits + "!@#%^&*()-_=+[]"
print("".join(secrets.choice(alpha) for _ in range(24)))
')"
echo "$ADMIN_PASS" > /opt/bomberos/secrets/.admin_first.txt
chmod 400 /opt/bomberos/secrets/.admin_first.txt
chown root:root /opt/bomberos/secrets/.admin_first.txt

# Inyectar al api.env y reiniciar api SOLO para bootstrap
sed -i "/^BOOTSTRAP_ADMIN_PASSWORD=/d" /opt/bomberos/secrets/api.env
echo "BOOTSTRAP_ADMIN_PASSWORD=${ADMIN_PASS}" >> /opt/bomberos/secrets/api.env

docker compose -f docker-compose.prod.yml restart api

# El bootstrap corre al arranque (apps/api/Dockerfile CMD).
# Esperar a que /health responda 200
until curl -fsk --cacert /opt/bomberos/secrets/tls/root.crt https://bomberos.dc.local/health; do
  sleep 2
done

# Una vez bootstrapeado: quitar la variable del env y reiniciar
sed -i "/^BOOTSTRAP_ADMIN_PASSWORD=/d" /opt/bomberos/secrets/api.env
docker compose -f docker-compose.prod.yml restart api
```

Custodia del password admin:

1. Imprimir el contenido de `.admin_first.txt` en dos sobres.
2. Sobre A → Director de Operaciones del Cuerpo de Bomberos.
3. Sobre B → caja fuerte de Auditoría Interna.
4. **Borrar** del disco:
   ```bash
   shred -u /opt/bomberos/secrets/.admin_first.txt
   ```
5. En la primera sesión real, el Director de Operaciones cambia la password por una propia. Documentar en HANDOVER.

---

## 6.23 — Smoke test

```bash
# Curl directo
curl -fsk --cacert /opt/bomberos/secrets/tls/root.crt \
  -X POST https://bomberos.dc.local/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"usuario\":\"admin\",\"password\":\"${ADMIN_PASS}\"}" \
  -c /tmp/cookies.txt

# Endpoint protegido
curl -fsk --cacert /opt/bomberos/secrets/tls/root.crt \
  -b /tmp/cookies.txt \
  https://bomberos.dc.local/api/funcionarios?limit=5 | head

# Crear funcionario de prueba (luego borrar)
curl -fsk --cacert /opt/bomberos/secrets/tls/root.crt \
  -b /tmp/cookies.txt \
  -X POST https://bomberos.dc.local/api/funcionarios \
  -H 'Content-Type: application/json' \
  -d '{"cedula":"V-99999999","nombres":"PRUEBA","apellidos":"SMOKE TEST","fecha_nacimiento":"1990-01-01"}' \
  | tee /tmp/smoke_funcionario.json

# Logout
curl -fsk --cacert /opt/bomberos/secrets/tls/root.crt \
  -b /tmp/cookies.txt -X POST https://bomberos.dc.local/api/auth/logout

rm -f /tmp/cookies.txt /tmp/smoke_funcionario.json
```

Validación adicional desde una estación de funcionario:

- Abrir `https://bomberos.dc.local` en Edge/Chrome → debe cargar sin warning de cert.
- Probar login admin, navegar todas las secciones principales, cerrar sesión.
- Anotar en `docs/manuales/smoke_test_log.md` (fecha, ingeniero, estación, resultado).

---

# Sección 4 — Migración de datos reales (6.24–6.28)

> **Pre-requisito:** snapshot de la BD legacy del cliente disponible vía dump SQL en USB cifrado entregado por el cliente, **no** acceso de red. La herramienta `bomberos-migrate` corre en el servidor de producción tras restaurarse el dump legacy en una BD separada (`bomberos_legacy`).

Restauración del legacy en una BD aislada:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres -c "CREATE DATABASE bomberos_legacy ENCODING 'UTF8' LC_COLLATE 'es_VE.UTF-8' LC_CTYPE 'es_VE.UTF-8' TEMPLATE template0;"

# Restaurar dump entregado por el cliente
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U postgres -d bomberos_legacy --no-owner --no-privileges \
  < /mnt/usb_legacy/bomberos_legacy_2026-05-XX.dump
```

## 6.24 — Analyze contra legacy real

```bash
docker compose -f docker-compose.prod.yml exec -T api \
  python -m bomberos_api.migrate analyze \
    --legacy-url "postgresql://postgres:${DB_ADMIN_PASS}@postgres:5432/bomberos_legacy" \
    --report-out /tmp/analyze_report.json

docker cp bomberos_api:/tmp/analyze_report.json /opt/bomberos/migration/analyze_report_$(date +%Y%m%d).json
```

Revisar:

- Conteo total de funcionarios legacy.
- Campos con NULLs en columnas obligatorias.
- Cédulas duplicadas.
- Mapeo de tablas legacy → nuevas.
- Warnings de codificación (latin1 → utf8).

**Si hay errores blocker, NO continuar.** Coordinar con RRHH para resolver en legacy primero.

---

## 6.25 — Dry-run

```bash
docker compose -f docker-compose.prod.yml exec -T api \
  python -m bomberos_api.migrate migrate \
    --legacy-url "postgresql://postgres:${DB_ADMIN_PASS}@postgres:5432/bomberos_legacy" \
    --target-url "postgresql://postgres:${DB_ADMIN_PASS}@postgres:5432/bomberos_caracas" \
    --dry-run --report-out /tmp/dryrun_report.json

docker cp bomberos_api:/tmp/dryrun_report.json /opt/bomberos/migration/dryrun_$(date +%Y%m%d).json
```

Revisión obligatoria por:

- Ingeniero responsable.
- Director RRHH del Cuerpo de Bomberos (firma).
- Director TI (firma).

Solo cuando los 3 firman el reporte → continuar.

---

## 6.26 — Apply (estimación 30-90 min)

**Cierre de ventana de mantenimiento.** Antes:

```bash
# Snapshot de seguridad de la BD nueva (vacía pero ya con schema)
docker compose -f docker-compose.prod.yml exec -T pgbackup /backup.sh pre-migration

# Cuenta atrás: poner el API en modo mantenimiento
docker compose -f docker-compose.prod.yml exec -T api \
  python -m bomberos_api.maintenance enable --reason "Migración de datos legacy"
```

Ejecución:

```bash
time docker compose -f docker-compose.prod.yml exec -T api \
  python -m bomberos_api.migrate migrate \
    --legacy-url "postgresql://postgres:${DB_ADMIN_PASS}@postgres:5432/bomberos_legacy" \
    --target-url "postgresql://postgres:${DB_ADMIN_PASS}@postgres:5432/bomberos_caracas" \
    --apply \
    --batch-size 500 \
    --checkpoint-every 5000 \
    --report-out /tmp/apply_report.json 2>&1 | tee /opt/bomberos/migration/apply_$(date +%Y%m%d).log
```

Plan de rollback si falla:

```bash
# Restaurar snapshot pre-migración
docker compose -f docker-compose.prod.yml stop api
docker compose -f docker-compose.prod.yml exec -T pgbackup /restore.sh pre-migration --target bomberos_caracas --confirm
docker compose -f docker-compose.prod.yml start api
```

Una vez exitoso:

```bash
docker compose -f docker-compose.prod.yml exec -T api \
  python -m bomberos_api.maintenance disable
```

---

## 6.27 — Validate

```bash
docker compose -f docker-compose.prod.yml exec -T api \
  python -m bomberos_api.migrate validate \
    --legacy-url "postgresql://postgres:${DB_ADMIN_PASS}@postgres:5432/bomberos_legacy" \
    --target-url "postgresql://postgres:${DB_ADMIN_PASS}@postgres:5432/bomberos_caracas" \
    --tolerance 0.001 \
    --report-out /tmp/validate_report.json
docker cp bomberos_api:/tmp/validate_report.json /opt/bomberos/migration/validate_$(date +%Y%m%d).json
```

Validaciones esperadas:

- Conteo de funcionarios legacy == nuevo (igualdad estricta).
- Hash agregado de campos clave (cédula, nombres, apellidos) por departamento coincide.
- Conteo de reposos, ascensos, egresos por año coincide.
- Sin registros huérfanos (FKs satisfechas).

---

## 6.28 — Validación manual: 10 funcionarios por RRHH

RRHH elige 10 cédulas representativas (mezcla de oficiales/sub-oficiales, activos/retirados, con y sin reposos recientes).

Procedimiento en cada caso:

```bash
for CED in V-1234567 V-7654321 V-9999999 ... ; do
  echo "=== $CED ==="
  docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U postgres -d bomberos_legacy -A -t -c "SELECT * FROM funcionario WHERE cedula='$CED';"
  echo "--- vs nuevo ---"
  docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U postgres -d bomberos_caracas -A -t -c "SELECT * FROM personal.funcionario WHERE cedula='$CED';"
done | tee /opt/bomberos/migration/manual_validation_$(date +%Y%m%d).log
```

RRHH revisa fila por fila y firma el log impreso. Archivar en handover.

Después de validación exitosa, **drop legacy** (la copia en USB cifrado se conserva para auditoría):

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres -c "DROP DATABASE bomberos_legacy;"
```

---

# Sección 5 — Capacitación (6.29–6.31)

## 6.29 — 3 sesiones de capacitación de 2 h

Cronograma propuesto (coordinar con RRHH y TI):

| Sesión | Día | Hora | Asistentes | Capacidad |
|---|---|---|---|---|
| S1 — RRHH y operadores | D+1 mig | 09:00–11:00 | RRHH (5–8), operadores (10–15) | 23 |
| S2 — Supervisores | D+1 mig | 14:00–16:00 | Comisarios, supervisores de área | 15 |
| S3 — Admins TI | D+2 mig | 09:00–11:00 | Equipo TI del Cuerpo de Bomberos | 5 |

Logística:

- Aula con proyector, conexión a la intranet, 1 PC por participante con la CA root ya instalada.
- Usuarios de práctica creados previamente (5 por sesión, dominio `entrenamiento.bomberos.dc.local` apuntando a la misma instancia con flag `--training-mode` que muestra banner).
- Manuales impresos + USB con manuales PDF y videos.

### Contenido S1 (RRHH y operadores)

1. Login, MFA TOTP (enrolamiento con app autorizada).
2. Recuperación de password / desbloqueo de cuenta.
3. Búsqueda de funcionarios. Filtros, paginación.
4. Crear, editar funcionario. Validaciones.
5. Registrar reposo médico, alta médica.
6. Cargar documento adjunto.
7. Ops del día (asignación, parte).
8. Q&A 20 min.

### Contenido S2 (Supervisores)

1. Login + cambio de password forzado primera vez.
2. Carrera: ascensos, registros de mérito.
3. Beneficios: bonos, primas.
4. Evaluaciones: registrar, aprobar.
5. Autorizaciones cross-funcionales (dual control).
6. Reportes y dashboards.
7. Q&A 20 min.

### Contenido S3 (Admins TI)

1. Arquitectura del sistema (mostrar `docs/HANDOVER.md`).
2. Gestión de usuarios: alta/baja, roles, scopes por departamento.
3. Parámetros globales (`parametros_globales`).
4. Dashboards de auditoría (consultas `aud.*`).
5. Procedimiento de backup/restore (ejecutar en vivo).
6. Procedimiento de actualización offline (mostrar bundle).
7. Runbook de incidentes (apagar/encender, ver logs, fail2ban unban).
8. Q&A 30 min.

Cada sesión:

- Asistencia firmada (PDF impreso, archivado).
- Test escrito de 10 preguntas al final. Aprobación ≥ 70%.

---

## 6.30 — Manuales PDF por rol

Crear en `docs/manuales/`:

```
docs/manuales/
├── 01_manual_rrhh_operadores.pdf
├── 02_manual_supervisores.pdf
├── 03_manual_administradores_ti.pdf
├── 04_runbook_incidentes.pdf
├── 05_politica_de_uso.pdf
├── plantillas/
│   ├── acta_capacitacion.docx
│   └── checklist_alta_funcionario.pdf
└── registro_ca_distribucion.csv
```

Cada manual debe incluir:

- Portada con escudo institucional, nombre del sistema, versión `1.0.0-production`, fecha.
- Tabla de contenido.
- Capturas reales de la app (no mockups).
- Glosario de roles y scopes.
- Procedimientos paso a paso con flechas y resaltados.
- Sección "Errores comunes y soluciones".
- Contacto de soporte de garantía.
- Hoja final de firma de "Recibido conforme".

Generación:

```bash
# Manuales en Markdown -> PDF con pandoc + tema institucional
cd /opt/bomberos/repo/docs/manuales/src
pandoc 01_manual_rrhh_operadores.md \
  --from markdown --to pdf \
  --pdf-engine=xelatex \
  --template=template_bomberos.tex \
  --resource-path=./assets \
  -o ../01_manual_rrhh_operadores.pdf
# Repetir para 02, 03, 04, 05
```

Hash de integridad de cada PDF (firmar offline con GPG del Director TI):

```bash
cd /opt/bomberos/repo/docs/manuales
sha256sum *.pdf > MANIFEST.sha256
gpg --detach-sign --armor MANIFEST.sha256
```

---

## 6.31 — Videos screencast

Lista mínima de videos (5–10 min cada uno, formato MP4 H.264 720p, audio limpio):

```
docs/manuales/videos/
├── 01_login_y_mfa.mp4
├── 02_crear_funcionario.mp4
├── 03_registrar_reposo_medico.mp4
├── 04_registrar_ascenso.mp4
├── 05_aprobar_autorizacion.mp4
├── 06_dashboards_y_reportes.mp4
├── 07_alta_baja_usuario_admin.mp4
├── 08_backup_y_restore.mp4
└── 09_runbook_apagado_encendido.mp4
```

Especificaciones:

- Grabados con OBS Studio en estación de prueba con datos sintéticos.
- Cursor amplificado, texto destacado.
- Sin información real de funcionarios.
- Subtítulos en español embebidos (SRT).
- Locución profesional (puede usar TTS revisado por humano).
- Logo institucional al inicio y al final.

Distribución:

- USB de entrega con todos los archivos + checksum `videos/MANIFEST.sha256`.
- Servidor de archivos interno opcional (`\\fileserver.dc.local\bomberos\manuales\`).

---

# Sección 6 — Handover formal (6.32–6.36)

## 6.32 — `docs/HANDOVER.md` (contenido completo)

Crear el archivo `docs/HANDOVER.md` con el siguiente contenido íntegro:

````markdown
# Acta de Entrega — Sistema Integral del Cuerpo de Bomberos del Distrito Capital

**Versión del sistema:** `1.0.0-production`
**Fecha de entrega:** _DD/MM/2026_
**Entrega de:** [Nombre del Proveedor], representado por [Ingeniero/Líder de Proyecto]
**Entrega a:** Cuerpo de Bomberos del Distrito Capital
**Custodios designados:**

- Custodio Operativo: _Director de TI del Cuerpo de Bomberos del DC_
- Custodio de Auditoría: _Director de Auditoría Interna del DC_
- Custodio Funcional: _Director de RRHH del Cuerpo de Bomberos del DC_

---

## 1. Arquitectura entregada

### Stack desplegado

- **Hardware:** servidor único físico en sede del DC. Especificaciones registradas en `inv_*.txt` adjuntos.
- **SO:** Debian 12 (bookworm), kernel _versión_, LUKS2 + TPM 2.0.
- **Stack de aplicación:** Docker Compose v2 con servicios:
  - `postgres` (PostgreSQL 16.4 con pgaudit, RLS FORCE, append-only).
  - `api` (FastAPI sobre Python 3.12, uvicorn, JWT RS256).
  - `caddy` (TLS terminator con cert leaf firmado por CA interna).
  - `pgbackup` (cron 6h, GPG cifrado, retención 30 días).
  - `loki` + `promtail` (logs estructurados centralizados).
- **Red:** solo `:443` expuesto a LAN intranet `10.20.0.0/16`. SSH `:2222` solo desde `10.20.99.0/24` (administración).
- **CA interna:** root + intermediate emitidos por `step-ca` offline. Root key en cold storage.

### Diagrama

```
LAN Intranet 10.20.0.0/16
        |
        |  HTTPS :443
        v
+----------------------- bomberos-srv01 (Debian 12 + LUKS+TPM) -----------+
|                                                                         |
|  nftables drop-by-default  |  fail2ban  |  auditd  |  AppArmor enforce  |
|                                                                         |
|   Docker (userns-remap, no-new-privs, icc=false)                        |
|   +-------------------+      +-------------------+                      |
|   | network: frontend |      | network: backend  | internal:true        |
|   |  br-bomberos-fr   |      |  br-bomberos-bk   |                      |
|   |                   |      |                   |                      |
|   |     caddy:443  -----+----> api:8000  -----+----> postgres:5432      |
|   +-------------------+ |    +-------------------+         |            |
|                         |                                  |            |
|                         |                                  +-> pgbackup |
|                         |                                                |
|                         +---> promtail ---> loki                         |
+-------------------------------------------------------------------------+
```

---

## 2. Inventario de credenciales en custodia

| Credencial | Tipo | Ubicación física | Custodio principal | Custodio secundario | Sello |
|---|---|---|---|---|---|
| Passphrase LUKS | Texto impreso | Caja fuerte DC, sobre A | Director TI | Director Auditoría | Sello A-1 |
| LUKS — copia | Texto impreso | Caja fuerte Auditoría, sobre B | Director Auditoría | Director Operaciones | Sello B-1 |
| Root CA private key | USB cifrado LUKS | Caja fuerte DC, USB-CA-ROOT | Director TI | — | Sello A-2 |
| Intermediate CA key | Archivo en estación step-ca offline | Estación step-ca, encrypted disk | Operador step-ca | Director TI | — |
| JWT private key (RS256) | Archivo + impresión hash SHA256 | Caja fuerte DC, sobre JWT-PRIV | Director TI | Director Auditoría | Sello A-3 |
| KMS key (pgcrypto) | Texto base64 impreso | Caja fuerte DC, sobre KMS | Director TI | Director Auditoría | Sello A-4 |
| Postgres `postgres` password | Texto impreso | Caja fuerte DC, sobre PG-ADMIN | Director TI | Director Auditoría | Sello A-5 |
| Postgres `bomberos_app` password | Texto impreso | Caja fuerte DC, sobre PG-APP | Director TI | Director Auditoría | Sello A-6 |
| Passphrase de backup GPG | Texto impreso | Caja fuerte DC, sobre BAK-PHRASE | Director TI | Director Auditoría | Sello A-7 |
| Password admin inicial | Texto impreso (rotar al primer login) | Sobre A entregado al Director Operaciones; copia caja Auditoría | Director Operaciones | Director Auditoría | Sello A-8 |
| SSH private key bomberos-ops | USB cifrado | Caja fuerte DC | Director TI | — | Sello A-9 |

**Política:** apertura de sobre requiere acta firmada por 2 custodios. Una vez abierto, rotar la credencial y resellar.

---

## 3. Contactos de soporte

| Rol | Nombre | Teléfono | Email | Horario |
|---|---|---|---|---|
| Soporte L1 (24×7 durante garantía) | _Equipo guardia_ | _+58-..._ | soporte@proveedor.com | 24×7 |
| Soporte L2 (ingeniería) | _Líder técnico_ | _+58-..._ | l2@proveedor.com | 08–18 L–V |
| Project Manager | _PM_ | _+58-..._ | pm@proveedor.com | 09–17 L–V |
| Director TI Bomberos DC | _Nombre_ | _+58-..._ | ti@bomberos.dc.gob.ve | 08–17 L–V |

Canal de tickets: portal interno `https://tickets.bomberos.dc.local` (cuenta entregada al Director TI).

---

## 4. Procedimientos operativos

### 4.1 Backup manual

```bash
sudo -u root docker compose -f /opt/bomberos/repo/docker-compose.prod.yml \
  exec -T pgbackup /backup.sh manual
ls -lh /srv/bomberos/backups/
```

### 4.2 Restore

```bash
# 1. Identificar archivo
ls -lt /srv/bomberos/backups/ | head

# 2. Detener api
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml stop api

# 3. Restaurar
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml exec -T pgbackup \
  /restore.sh /backups/bomberos_caracas_YYYYMMDD_HHMM.dump.gpg --target bomberos_caracas --confirm

# 4. Re-arrancar
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml start api
```

### 4.3 Agregar usuario nuevo

1. Login como admin en `https://bomberos.dc.local`.
2. Administración → Usuarios → Nuevo.
3. Completar cédula, nombres, rol, scopes por departamento.
4. Generar password temporal (botón "Generar password").
5. Entregar password en sobre cerrado. Forzar cambio al primer login.
6. Si rol es ADMIN/RRHH/MEDICO/SUPER_ADMIN, instruir enrolamiento TOTP en primer login.

### 4.4 Rotar password de servicio

#### `bomberos_app` (Postgres)

```bash
NEW_PASS="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"

# 1. Cambiar en Postgres
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml exec -T postgres \
  psql -U postgres -c "ALTER ROLE bomberos_app WITH PASSWORD '$NEW_PASS';"

# 2. Actualizar secrets
sed -i "s|^APP_DB_PASSWORD=.*|APP_DB_PASSWORD=$NEW_PASS|" /opt/bomberos/secrets/postgres.env
sed -i "s|postgresql+asyncpg://bomberos_app:[^@]*@|postgresql+asyncpg://bomberos_app:$NEW_PASS@|" /opt/bomberos/secrets/api.env

# 3. Reiniciar api
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml restart api

# 4. Custodiar el nuevo password (imprimir, sellar, archivar)
```

#### JWT keypair

Rotar con periodo de gracia de 24h (los tokens vigentes deben terminar de expirar):

```bash
# 1. Generar nuevo par
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out /opt/bomberos/secrets/jwt_private.new.pem
openssl rsa -in /opt/bomberos/secrets/jwt_private.new.pem -pubout -out /opt/bomberos/secrets/jwt_public.new.pem
chown bomberos-app:bomberos-app /opt/bomberos/secrets/jwt_*.pem
chmod 600 /opt/bomberos/secrets/jwt_private.new.pem

# 2. Configurar api con kid dual (rotation grace)
#    Editar api.env: agregar JWT_NEXT_PRIVATE_KEY_PATH y JWT_NEXT_PUBLIC_KEY_PATH
# 3. Reiniciar api -> firma con nueva, valida ambas
# 4. Tras 24h: hacer swap final, eliminar la anterior
```

### 4.5 Apagado y encendido

```bash
# Apagado limpio (deja Postgres con WAL flushed)
sudo systemctl stop docker
sudo umount /srv/bomberos/data /srv/bomberos/backups /var/lib/docker
sudo shutdown -h now

# Encendido (LUKS+TPM unlock automático)
# Esperar 60s y ejecutar:
ssh -p 2222 bomberos-ops@10.20.0.10 'docker compose -f /opt/bomberos/repo/docker-compose.prod.yml ps'
```

### 4.6 fail2ban — quitar IP bloqueada

```bash
sudo fail2ban-client status sshd
sudo fail2ban-client set sshd unbanip 10.20.0.55
```

### 4.7 Renovación de cert leaf TLS (anual)

```bash
# En la estación step-ca offline
step certificate create "bomberos.dc.local" /tmp/new.crt /tmp/new.key \
  --san bomberos.dc.local --san bomberos-srv01.bomberos.dc.local --san 10.20.0.10 \
  --profile leaf --not-after 8760h --kty EC --curve P-256 \
  --ca ~/.step/certs/intermediate_ca.crt \
  --ca-key ~/.step/secrets/intermediate_ca_key

# Transferir vía USB cifrado al servidor de producción y rotar
# /opt/bomberos/secrets/tls/server.{crt,key}
# Luego:
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml restart caddy
```

---

## 5. Política de actualización trimestral

Cada **90 días** (calendario de TI):

1. Técnico genera bundle de actualización en estación externa con internet:
   - Imágenes Docker nuevas (`docker save`).
   - Paquetes Debian de seguridad (`apt-mirror` diff).
   - Wheels Python nuevos (snapshot devpi).
   - Manifests con SHA-256 firmados con GPG.
2. Bundle entregado en USB cifrado al Director TI.
3. Verificar firmas GPG y SHA-256 antes de aplicar.
4. Aplicar en ventana de mantenimiento documentada:
   ```bash
   docker load -i /mnt/usb_update/api-1.X.Y.tar
   docker compose -f docker-compose.prod.yml up -d --no-deps api
   ```
5. Rollback documentado: tag previo se conserva 30 días.
6. Acta de actualización firmada por Director TI + Auditoría.

---

## 6. Runbook de incidentes

### Incidente: API caída

```bash
# 1. Verificar estado
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml ps
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml logs --tail=200 api

# 2. Verificar Postgres
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml exec postgres pg_isready

# 3. Reiniciar api
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml restart api

# 4. Si persiste: escalar L2 con archivo de logs adjunto
journalctl -u docker --since "1 hour ago" > /tmp/incident_$(date +%Y%m%d_%H%M).log
```

### Incidente: disco lleno

```bash
df -h
docker system df

# Truncar logs Docker > 30 días
find /var/lib/docker/containers -name "*.log" -mtime +30 -delete

# Limpiar imágenes huérfanas (NUNCA dangling de imágenes pinneadas activas)
docker image prune -f --filter "until=720h"
```

### Incidente: sospecha de compromiso

1. **No apagar** — preservar evidencia.
2. Cortar acceso de red (regla nft temporal `iif eth0 drop`).
3. Snapshot del estado:
   ```bash
   ausearch -ts recent -k bomberos-app  > /tmp/audit_$(date +%Y%m%d).log
   docker compose logs --since 24h      > /tmp/docker_$(date +%Y%m%d).log
   tar czf /tmp/evidence_$(date +%Y%m%d).tgz /tmp/audit_*.log /tmp/docker_*.log /var/log/auth.log /var/log/fail2ban.log
   ```
4. Llamar L2 y Auditoría.
5. Solo restaurar tras dictamen.

### Incidente: olvido de password admin

1. Convocar a Director de Operaciones (custodio del sobre A-8 del admin original).
2. Si la rotación posterior no está registrada, ejecutar reset offline:
   ```bash
   docker compose -f /opt/bomberos/repo/docker-compose.prod.yml exec -T api \
     python -m bomberos_api.admin reset-password --user admin --confirm
   ```
3. La password nueva se imprime y se custodia con nueva acta.

---

## 7. Garantía y soporte

- **Período:** _X meses_ desde la firma de esta acta.
- **Cobertura:** corrección de bugs, ajuste de parámetros, asistencia operativa, parches de seguridad.
- **SLA:**
  - P1 (sistema caído): respuesta ≤ 1h, solución ≤ 4h.
  - P2 (degradación): respuesta ≤ 4h, solución ≤ 24h.
  - P3 (consulta): respuesta ≤ 24h.
- **Exclusiones:** desarrollo de nuevas funcionalidades, daños por uso negligente, fuerza mayor.

---

## 8. Firmas

| Rol | Nombre | Firma | Fecha |
|---|---|---|---|
| Por el Proveedor — Líder Técnico |  |  |  |
| Por el Proveedor — PM            |  |  |  |
| Por el Cliente — Director TI     |  |  |  |
| Por el Cliente — Director RRHH   |  |  |  |
| Por el Cliente — Director de Auditoría Interna |  |  |  |
| Por el Cliente — Director de Operaciones |  |  |  |

---

## 9. Anexos

- A1: Inventario hardware (`inv_*.txt`).
- A2: Reporte de migración (`apply_YYYYMMDD.log`, `validate_YYYYMMDD.json`).
- A3: Validación manual de 10 funcionarios firmada (`manual_validation_YYYYMMDD.log`).
- A4: Actas de capacitación de las 3 sesiones.
- A5: Hash SHA-256 firmado de manuales y videos (`MANIFEST.sha256.asc`).
- A6: Cert root CA del Cuerpo de Bomberos (`root_ca.crt`).
- A7: Política de uso aceptable.
- A8: Diagrama lógico y físico de la red.
````

---

## 6.33 — Reunión final con cliente

Agenda (90 min):

1. **Apertura** (10 min) — agradecer, repasar objetivos.
2. **Demo en vivo** (20 min) — login admin, navegar, crear funcionario de prueba, mostrar dashboards.
3. **Entrega de credenciales en custodia** (15 min):
   - Sobres sellados al Director TI (todas las credenciales A-1 a A-9).
   - Sobres a Auditoría (copias B).
   - Sobre admin inicial al Director de Operaciones.
   - Cada sobre con acta de recepción firmada.
4. **Entrega de manuales y videos** (10 min):
   - 5 USBs encriptados con todo el material.
   - 10 manuales impresos por rol.
5. **Firma del HANDOVER.md** (10 min) — todos los firmantes presentes.
6. **Activación de garantía** (10 min) — entrega de credenciales del portal de tickets y SLA.
7. **Q&A y cierre** (15 min).

Lista de control para la reunión (`docs/checklist_reunion_final.md`):

- [ ] Sala con proyector reservada.
- [ ] PC de demo con cuenta de admin de prueba.
- [ ] Sobres sellados preparados (verificación física la noche anterior).
- [ ] USBs encriptados con passphrases en sobres separados.
- [ ] Copias impresas de HANDOVER.md (1 por firmante).
- [ ] Refrigerio (cortesía).
- [ ] Cámara para fotos de la firma (con autorización).
- [ ] Acta de cierre redactada para firmar al final.

Al terminar:

```bash
git -C /opt/bomberos/repo tag -s v1.0.0-production -m "Entrega formal — sede Cuerpo de Bomberos DC"
# Pero solo después del check 6.36
```

---

## 6.34 — Primer backup verificado + restore probado

```bash
# 1. Forzar backup manual
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml exec -T pgbackup \
  /backup.sh handover-first
ls -lh /srv/bomberos/backups/

# 2. Verificar integridad del cifrado y firma
LATEST="$(ls -t /srv/bomberos/backups/*.dump.gpg | head -1)"
gpg --decrypt --passphrase-file /opt/bomberos/secrets/backup_passphrase.txt \
    --batch --yes "$LATEST" > /tmp/backup_decrypted.dump

# 3. Restore a entorno aislado (sandbox DB con nombre distinto)
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml exec -T postgres \
  psql -U postgres -c "CREATE DATABASE bomberos_caracas_restoretest;"

docker compose -f /opt/bomberos/repo/docker-compose.prod.yml exec -T postgres \
  pg_restore -U postgres -d bomberos_caracas_restoretest \
  --no-owner --no-privileges < /tmp/backup_decrypted.dump

# 4. Verificación funcional: conteos de filas críticas
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml exec -T postgres \
  psql -U postgres -d bomberos_caracas_restoretest \
  -c "SELECT COUNT(*) AS funcionarios FROM personal.funcionario;
      SELECT COUNT(*) AS usuarios FROM seguridad.usuario;
      SELECT COUNT(*) AS audits FROM aud.log_personal;"

# Comparar con la BD productiva
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml exec -T postgres \
  psql -U postgres -d bomberos_caracas \
  -c "SELECT COUNT(*) AS funcionarios FROM personal.funcionario;
      SELECT COUNT(*) AS usuarios FROM seguridad.usuario;
      SELECT COUNT(*) AS audits FROM aud.log_personal;"

# Deben coincidir. Documentar en el log de handover.

# 5. Limpiar sandbox
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml exec -T postgres \
  psql -U postgres -c "DROP DATABASE bomberos_caracas_restoretest;"
shred -u /tmp/backup_decrypted.dump
```

Firmar el resultado en acta `docs/manuales/restore_test_handover.md` (Director TI + Ingeniero).

Programar cron mensual:

```bash
cat > /etc/cron.d/bomberos-restore-test <<'EOF'
# Bomberos DC — restore drill mensual (último viernes)
0 22 * * 5 root [ "$(date +%d -d 'next Friday')" -lt "8" ] || /opt/bomberos/bin/restore_drill.sh >> /var/log/bomberos/restore_drill.log 2>&1
EOF
chmod 644 /etc/cron.d/bomberos-restore-test
```

`/opt/bomberos/bin/restore_drill.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
LOG="/var/log/bomberos/restore_drill_$(date +%Y%m%d).log"
exec > >(tee -a "$LOG") 2>&1
echo "=== Restore drill iniciado $(date -Is) ==="
LATEST="$(ls -t /srv/bomberos/backups/*.dump.gpg | head -1)"
[ -f "$LATEST" ] || { echo "No backups"; exit 1; }
WORK="/tmp/restore_drill.dump"
gpg --decrypt --passphrase-file /opt/bomberos/secrets/backup_passphrase.txt \
    --batch --yes "$LATEST" > "$WORK"
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml exec -T postgres \
  psql -U postgres -c "DROP DATABASE IF EXISTS bomberos_drill; CREATE DATABASE bomberos_drill;"
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml exec -T postgres \
  pg_restore -U postgres -d bomberos_drill --no-owner --no-privileges < "$WORK"
COUNT=$(docker compose -f /opt/bomberos/repo/docker-compose.prod.yml exec -T postgres \
  psql -U postgres -d bomberos_drill -A -t -c "SELECT COUNT(*) FROM personal.funcionario;")
echo "Funcionarios restaurados: $COUNT"
docker compose -f /opt/bomberos/repo/docker-compose.prod.yml exec -T postgres \
  psql -U postgres -c "DROP DATABASE bomberos_drill;"
shred -u "$WORK"
echo "=== Restore drill OK $(date -Is) ==="
```

---

## 6.35 — Mirrors locales PyPI / npm / Debian

Servidor de mirrors corre **separado** de bomberos-srv01 — `mirror-srv01.bomberos.dc.local` (`10.20.0.30`). Sino, los pinneamos sobre el mismo host pero en cgroup separado. Pero la recomendación es máquina dedicada (16 GB RAM, 1 TB disco).

### A — Mirror Debian (apt-mirror)

`/etc/apt/mirror.list`:

```text
set base_path    /srv/mirror/debian
set nthreads     20
set _tilde       0
set run_postmirror 0

deb http://deb.debian.org/debian              bookworm           main contrib non-free-firmware
deb http://deb.debian.org/debian              bookworm-updates   main contrib non-free-firmware
deb http://security.debian.org/debian-security bookworm-security main contrib non-free-firmware

clean http://deb.debian.org/debian
clean http://security.debian.org/debian-security
```

Sync inicial (en máquina externa con internet, luego rsync a mirror-srv01):

```bash
apt-mirror
rsync -a --delete /srv/mirror/debian/ rsync://mirror-srv01.bomberos.dc.local/debian/
```

Servir con nginx en mirror-srv01:

```nginx
server {
    listen 80;
    server_name mirror.bomberos.dc.local;
    root /srv/mirror;
    autoindex on;
    location / {
        try_files $uri $uri/ =404;
    }
}
```

### B — Mirror PyPI (devpi)

En máquina externa:

```bash
pip install devpi-server devpi-client devpi-web
devpi-init
devpi-server --host 0.0.0.0 --port 3141 --start
devpi use http://localhost:3141
devpi login root --password=
devpi user -c bomberos password=$DEVPI_PASS
devpi login bomberos --password=$DEVPI_PASS
devpi index -c stable bases=root/pypi volatile=False

# Pre-cachear requirements del API
pip download -r /opt/bomberos/repo/apps/api/requirements.lock -d /tmp/wheels
devpi upload --from-dir /tmp/wheels --index bomberos/stable
```

Bundle a USB → restaurar en mirror-srv01 con `devpi-server --import`.

Configurar pip global en bomberos-srv01:

`/etc/pip.conf`:

```ini
[global]
index-url = http://mirror.bomberos.dc.local:3141/bomberos/stable/+simple/
trusted-host = mirror.bomberos.dc.local
timeout = 60
```

### C — Mirror npm (verdaccio)

```bash
docker run -d --name verdaccio \
  --restart unless-stopped \
  -p 4873:4873 \
  -v verdaccio-storage:/verdaccio/storage \
  -v /etc/verdaccio/config.yaml:/verdaccio/conf/config.yaml \
  verdaccio/verdaccio:5
```

`/etc/verdaccio/config.yaml`:

```yaml
storage: /verdaccio/storage
auth:
  htpasswd:
    file: /verdaccio/storage/htpasswd
    max_users: -1
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
    cache: true
packages:
  '@*/*':
    access: $authenticated
    publish: $authenticated
    proxy: npmjs
  '**':
    access: $authenticated
    publish: $authenticated
    proxy: npmjs
listen: 0.0.0.0:4873
```

Pre-cachear deps del frontend:

```bash
npm config set registry http://mirror.bomberos.dc.local:4873
cd /tmp && tar -xJf /opt/bomberos/install/frontend/bomberos-frontend-src-1.0.0.tar.xz
cd bomberos-frontend && npm install
```

Verificación final:

```bash
curl -sS http://mirror.bomberos.dc.local/debian/dists/bookworm/Release | head
curl -sS http://mirror.bomberos.dc.local:3141/bomberos/stable/+simple/ | head
curl -sS http://mirror.bomberos.dc.local:4873/-/ping
```

### D — Registry Docker interno

```bash
docker run -d --name registry \
  --restart unless-stopped \
  -p 5000:5000 \
  -v /srv/mirror/registry:/var/lib/registry \
  -v /etc/docker/registry/config.yml:/etc/docker/registry/config.yml \
  registry:2
```

Push de las imágenes pin/digest:

```bash
docker tag bomberos/api:1.0.0 mirror.bomberos.dc.local:5000/bomberos/api:1.0.0
docker push mirror.bomberos.dc.local:5000/bomberos/api:1.0.0
# Repetir para pgbackup, caddy, postgres, loki, promtail
```

---

## 6.36 — Tag `v1.0.0-production`

Solo después de:

- [ ] Smoke test pasado (6.23).
- [ ] Migración validada (6.27 y 6.28).
- [ ] Capacitación impartida y actas firmadas (6.29–6.31).
- [ ] HANDOVER.md firmado (6.32–6.33).
- [ ] Backup + restore probado (6.34).
- [ ] Mirrors operativos (6.35).

Ejecutar:

```bash
cd /opt/bomberos/repo
git tag -s v1.0.0-production -m "$(cat <<'EOF'
Cuerpo de Bomberos del Distrito Capital — release v1.0.0-production

- Despliegue en sede: bomberos-srv01.bomberos.dc.local
- Migración legacy: validada por RRHH
- Capacitación: 3 sesiones firmadas
- Handover: firmado por TI/RRHH/Auditoría/Operaciones
- Garantía activa: ver acta

Resumen de seguridad:
- LUKS+TPM activo
- nftables drop-by-default + fail2ban
- AppArmor enforcing
- Postgres RLS FORCE en todas las tablas sensibles
- JWT RS256 + denylist + rotation con reuse detection
- MFA TOTP obligatorio para ADMIN/RRHH/MEDICO
- Backups GPG cifrados, retención 30d, restore drill mensual

Stack pinneado por SHA256 digest. Bundle entregado en USB cifrado.
EOF
)"

# Empaquetar y firmar el bundle final
cd /opt
tar -cJf /opt/bomberos/handover_bundle_v1.0.0.tar.xz \
  /opt/bomberos/repo/.git \
  /opt/bomberos/repo/docs/HANDOVER.md \
  /opt/bomberos/repo/docs/manuales/

gpg --detach-sign --armor /opt/bomberos/handover_bundle_v1.0.0.tar.xz
sha256sum /opt/bomberos/handover_bundle_v1.0.0.tar.xz > /opt/bomberos/handover_bundle_v1.0.0.sha256
```

---

# Apéndice A — Script CUTOVER (ejecución día D)

Guardar como `/opt/bomberos/bin/cutover.sh`:

```bash
#!/usr/bin/env bash
# Cutover día D — Cuerpo de Bomberos DC, v1.0.0-production
# Idempotente: cada paso verifica antes de hacer.
set -euo pipefail

REPO=/opt/bomberos/repo
SECRETS=/opt/bomberos/secrets
COMPOSE="docker compose -f ${REPO}/docker-compose.prod.yml"
LOGFILE=/var/log/bomberos/cutover_$(date +%Y%m%d_%H%M%S).log
mkdir -p "$(dirname "$LOGFILE")"
exec > >(tee -a "$LOGFILE") 2>&1

log()  { echo -e "\n[$(date -Is)] $*"; }
step() { log "=== STEP: $* ==="; }

require_root() { [ "$(id -u)" -eq 0 ] || { echo "Run as root"; exit 1; }; }
require_root

step "1/12 Validar inventario hardware"
for f in inv_cpu inv_ram inv_disk inv_net inv_tpm inv_bios; do
  [ -f "/root/${f}.txt" ] || { echo "Falta /root/${f}.txt — abort"; exit 2; }
done

step "2/12 Validar configs de seguridad"
sshd -t
nft -c -f /etc/nftables.conf
augenrules --check
aa-status --enabled || { echo "AppArmor no habilitado"; exit 3; }
systemctl is-active --quiet fail2ban
systemctl is-active --quiet chrony
systemctl is-active --quiet auditd
systemctl is-active --quiet nftables

step "3/12 Validar secrets"
for s in api.env postgres.env pgbackup.env jwt_private.pem jwt_public.pem kms.key backup_passphrase.txt tls/server.key tls/fullchain.crt; do
  [ -f "${SECRETS}/${s}" ] || { echo "Falta secret ${s}"; exit 4; }
done

step "4/12 Validar imágenes Docker pinneadas"
for img in postgres:16.4-alpine bomberos/api:1.0.0 bomberos/pgbackup:1.0.0 caddy:2.8-alpine; do
  docker image inspect "$img" >/dev/null || { echo "Falta imagen ${img}"; exit 5; }
done

step "5/12 Levantar Postgres"
$COMPOSE up -d postgres
for i in $(seq 1 60); do
  status=$(docker inspect bomberos_pg --format='{{.State.Health.Status}}' 2>/dev/null || echo starting)
  [ "$status" = "healthy" ] && break
  sleep 2
done
[ "$status" = "healthy" ] || { echo "Postgres no healthy"; exit 6; }

step "6/12 Aplicar schema (idempotente)"
$COMPOSE exec -T postgres psql -U postgres -d bomberos_caracas -v ON_ERROR_STOP=1 \
  -f /docker-entrypoint-initdb.d/99_run_all.sql || true

step "7/12 Aplicar RLS + roles"
$COMPOSE exec -T postgres psql -U postgres -d bomberos_caracas -v ON_ERROR_STOP=1 \
  -f /docker-entrypoint-initdb.d/06_seguridad_rls.sql || true
$COMPOSE exec -T postgres psql -U postgres -d bomberos_caracas -v ON_ERROR_STOP=1 \
  -f /docker-entrypoint-initdb.d/07_roles_por_departamento.sql || true

step "8/12 Levantar api + caddy + pgbackup + observabilidad"
$COMPOSE up -d api caddy pgbackup promtail loki

step "9/12 Esperar API healthy"
for i in $(seq 1 60); do
  status=$(docker inspect bomberos_api --format='{{.State.Health.Status}}' 2>/dev/null || echo starting)
  [ "$status" = "healthy" ] && break
  sleep 2
done
[ "$status" = "healthy" ] || { echo "API no healthy"; exit 7; }

step "10/12 Smoke test TLS + endpoint"
curl -fsk --cacert "${SECRETS}/tls/root.crt" https://bomberos.dc.local/health
curl -fsk --cacert "${SECRETS}/tls/root.crt" https://bomberos.dc.local/ -o /dev/null

step "11/12 Backup inmediato post-cutover"
$COMPOSE exec -T pgbackup /backup.sh post-cutover
ls -lh /srv/bomberos/backups/ | tail -3

step "12/12 Resumen"
$COMPOSE ps
echo "Cutover COMPLETO. Log en $LOGFILE"
```

Hacer ejecutable y registrar:

```bash
chmod 750 /opt/bomberos/bin/cutover.sh
chown root:root /opt/bomberos/bin/cutover.sh
```

---

# Apéndice B — Script ROLLBACK

`/opt/bomberos/bin/rollback.sh`:

```bash
#!/usr/bin/env bash
# Rollback de cutover — Bomberos DC
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "root requerido"; exit 1; }

read -r -p "Confirmar rollback (escribir ROLLBACK): " ans
[ "$ans" = "ROLLBACK" ] || { echo "Cancelado"; exit 0; }

COMPOSE="docker compose -f /opt/bomberos/repo/docker-compose.prod.yml"

echo "[1/4] Detener stack"
$COMPOSE stop api caddy

echo "[2/4] Restaurar último backup pre-cutover"
LATEST=$(ls -t /srv/bomberos/backups/pre-migration*.dump.gpg 2>/dev/null | head -1 || true)
[ -n "$LATEST" ] || { echo "No hay backup pre-migration"; exit 2; }

gpg --decrypt --passphrase-file /opt/bomberos/secrets/backup_passphrase.txt \
    --batch --yes "$LATEST" > /tmp/rollback.dump

$COMPOSE exec -T postgres psql -U postgres -c "DROP DATABASE bomberos_caracas WITH (FORCE);"
$COMPOSE exec -T postgres psql -U postgres -c "CREATE DATABASE bomberos_caracas ENCODING 'UTF8' LC_COLLATE 'es_VE.UTF-8' LC_CTYPE 'es_VE.UTF-8' TEMPLATE template0;"
$COMPOSE exec -T postgres pg_restore -U postgres -d bomberos_caracas --no-owner --no-privileges < /tmp/rollback.dump
shred -u /tmp/rollback.dump

echo "[3/4] Re-arrancar stack"
$COMPOSE up -d api caddy

echo "[4/4] Verificar"
sleep 10
$COMPOSE ps
curl -fsk --cacert /opt/bomberos/secrets/tls/root.crt https://bomberos.dc.local/health
echo "Rollback COMPLETO"
```

---

# Apéndice C — Definition of Done de Fase 6 (recordatorio)

Solo se cierra esta fase cuando:

- [ ] Sistema corriendo en sede del cliente con datos reales migrados.
- [ ] Personal capacitado (3 sesiones, asistencias y tests firmados).
- [ ] HANDOVER.md firmado por las 6 partes.
- [ ] Backups automáticos verificados (≥ 4 ciclos exitosos de 6h).
- [ ] Restore drill mensual programado en cron + primera ejecución manual OK.
- [ ] Mirrors PyPI/npm/Debian/Docker poblados y verificados.
- [ ] Tag `v1.0.0-production` firmado y bundle final entregado.
- [ ] Garantía contractual iniciada con portal de tickets entregado.

---

**Fin del plan.** Cualquier desviación durante la ejecución debe registrarse en `docs/superpowers/plans/2026-05-19-deploy-intranet-CHANGELOG.md`.
