---
title: DGX Spark 4-Node AI Cluster Setup Guide
parent: White Papers
nav_order: 4
lang: en
page_id: dgx-spark-4node-cluster-kurulumu
description: >-
  Switch-based AI cluster setup with 4 NVIDIA DGX Spark nodes:
  management and compute networks, RoCEv2/RDMA, sparkrun and NAS configuration.
permalink: /papers/dgx-spark-4node-cluster-kurulumu/
last_modified_date: 2026-07-24
toc: true
---

This document describes the end-to-end installation and configuration steps for a switch-based AI cluster consisting of 4 NVIDIA DGX Spark nodes. The cluster uses the **sparkrun** toolkit to manage distributed AI workloads and model execution.

The document covers the preparation of management and compute networks, ConnectX-7/QSFP port configuration, RoCEv2/RDMA settings, SSH access, NCCL communication validation, and cluster health check steps.

## Architecture Overview

| **Component** | **Description** |
| --- | --- |
| **DGX Spark × 4** | Each has a ConnectX-7 200GbE QSFP56 port |
| **MikroTik CRS312** | 10GbE management network switch; also includes NAS bonding ports |
| **MikroTik CRS812** | **400G QSFP-DD compute network switch; provides 4×200G via breakout** |
| **ASUSTOR AS6808T** | 8-disk NAS; connected to CRS312 via 2×10Gbps LACP |
| **sparkrun** | Cluster management, SSH mesh, and CX7 configuration toolkit |

## Prerequisites

**Hardware**

- 4× NVIDIA DGX Spark systems

- 1× MikroTik CRS312-4C+8XS switch (management network)

- 1× MikroTik CRS812 switch (compute network)

- 1× ASUSTOR AS6808T NAS (8× HDD)

- 2× QSFP-DD → 2× QSFP56 passive breakout cable (compute network)

- Cat6 cables (management network and NAS connections)

**Software and Operating System**

- DGX OS (installed on each Spark system)

- Internet access (for package downloads and updates)

**Knowledge and Access**

- Knowledge of MikroTik RouterOS web interface and CLI usage

- Basic Linux command-line knowledge

- Physical access to all devices (for cabling)

**DGX Spark OS Kurulumu**

For DGX Spark OS installation, you can use the following video:

[NVIDIA DGX Spark Setup Part 1](https://www.youtube.com/watch?v=-z8GqGKDyXE)

## **DGX Spark Node Preparation**

Before proceeding to physical connections and network configurations, ensure that all Spark systems are running the latest software and firmware versions. A significant portion of the performance issues encountered during installation can be caused by outdated drivers, missing updates, or firmware incompatibilities.

The following steps must be applied on all four Spark systems.

### **System and Firmware Updates**

First, the operating system packages are updated:

```
sudo apt update

sudo apt dist-upgrade

```
Next, the system firmware is updated:

```
sudo fwupdmgr refresh --force

sudo fwupdmgr upgrade

```
Via the DGX Dashboard, verify that there are no pending updates; if any exist, apply them:

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/01-dgx-dashboard.jpg' | relative_url }})

After the updates are complete, reboot the system:

```
sudo reboot

```
During testing performed in the installation process, it was observed that connection performance did not reach the expected level due to outdated firmware versions. For this reason, updating all systems is recommended as the first step of the installation.

### **Docker Configuration**

To allow the container-based tools that will be used in the subsequent steps to run without requiring sudo, Docker post-install steps are applied on each Spark.

First, the current user is added to the Docker group:

```
sudo groupadd docker

sudo usermod -aG docker $USER

newgrp docker

```
The configuration can be verified with the following test:

```
docker run hello-world

```
![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/02-docker-hello.jpg' | relative_url }})

The successful execution of the command and Docker's ability to launch the sample container indicate that the necessary preparation for the container-based tools to be used in the subsequent steps has been completed.

**Storage Driver Check**

Additionally, the Docker storage driver was checked on all Spark nodes. The Storage Driver value in the docker info output was verified to be overlayfs. If overlay2 or a different storage driver was detected, Docker was configured to use the containerd snapshotter (overlayfs), and the Docker service was restarted. This ensured a consistent runtime environment by using the same storage infrastructure across all nodes.

First, the current storage driver was checked with the following command:

```
docker info -f 'Driver={{.Driver}} DriverStatus={{.DriverStatus}} DockerRootDir={{.DockerRootDir}}'

```
If the output showed the driver as overlay2, the following configuration was applied:

```
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'

{

"features": {

"containerd-snapshotter": true

}

}

EOF

sudo systemctl restart docker

```
After configuration, the same check command was run again, and the storage driver was verified to be overlayfs.

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/03-docker-storage.png' | relative_url }})
## Management Network (10GbE) Connection

The 10GbE Ethernet port of each DGX Spark is connected to one of the MikroTik CRS312 switch's 10G ports using a Cat6 cable. After plugging in the cable, verify that the link indicator on the relevant switch port is lit.

Open a terminal on the Spark desktop and check whether the device has obtained an IP address:

```
ip addr show

```

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/04-ip-addr.jpg' | relative_url }})

If you see an IP address on the 10GbE interface in the output, as in the example, SSH access can be established over the management network. If no IP address has been obtained, it can be assigned manually through the DGX OS desktop:

1.  Click the network icon in the top right corner → select Wired Settings

2.  Click the gear (⚙) icon next to the relevant 10GbE connection

3.  Switch to the IPv4 tab

4.  Change the Method field to Manual

5.  Enter the following information:

- Address: 192.168.1.162 (different for each Spark and according to your own network— .163, .164, .165)

- Netmask: 255.255.255.0

- Gateway: 192.168.1.1 (if available, otherwise leave blank)

- DNS: 1.1.1.1,8.8.8.8

6.  Press the Apply button and toggle the connection off and back on

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/05-wired-settings.jpg' | relative_url }})

If there is internet access, the 10GbE management connection is ready. Repeat the same steps on the other three Sparks and assign each a different IP address.

**Inter-node Access Check**

Verify that all Sparks can see each other over the management network. Ping the others from one Spark:

```
ping -c 4 192.168.1.157

ping -c 4 192.168.1.158

ping -c 4 192.168.1.161

```
If all pings are successful, the management network is ready and all nodes can communicate with each other.

## Compute Network (200GbE QSFP) Physical Connection

In the DGX Spark Quad AI Cluster, each Spark is connected to the MikroTik CRS812 switch at 200GbE speed via the ConnectX-7 QSFP port. The CRS812's 400G QSFP-DD ports are split into two 200G connections each using passive breakout cables.

**Cable Plan**

||
||
||
||

**Connection Steps**

1.  Plug the QSFP-DD end of the first breakout cable into the CRS812's QSFP-DD port number 1. Ensure the locking levers on both ends of the cable are fully seated.

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/06-breakout-cable.jpg' | relative_url }})

2.  Plug the two QSFP56 ends of the same cable into the outermost ConnectX-7 ports of the Spark 1 and Spark 2 systems.

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/07-connectx7-ports.jpg' | relative_url }})

3.  Plug the QSFP-DD end of the second breakout cable into the CRS812's QSFP-DD port number 2.

4.  Plug the two QSFP56 ends of this cable into the ConnectX-7 ports of the Spark 3 and Spark 4 systems.

5.  Verify that all connections are physically seated and the levers are locked.

6.  Power on the CRS812 switch.

## CRS312 MikroTik Switch Configuration

When the switch is powered on, the default IP address is 192.168.88.1/24. You can access this address from the Ethernet-1 port.

1.  Connect the CRS312's Ethernet-1 port to your computer.

2.  Assign the static IP address 192.168.88.2/24 to your computer's Ethernet interface.

3.  Go to http://192.168.88.1 in your browser

4.  The username is admin, and the password is the one on the label under the device. Log in with these credentials:

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/08-crs312-login.png' | relative_url }})

**Management IP Assignment**

After logging in, a screen will appear asking you to change your password. After changing the password here, you can assign the management IP address on the screen that opens. Here, 192.168.1.122/24 is given as an example; enter the appropriate gateway and DNS server addresses according to your network settings and press the “Apply Configuration” button:

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/09-crs312-mgmt-ip.jpg' | relative_url }})

Applying this setting will disconnect your session. Therefore, change your computer's IP address to an address in the 192.168.1.0/24 network again, and access the switch interface by entering 192.168.1.122 in your browser.

**RouterOS Update**

At this stage, first check whether the RouterOS software is up to date. To check this, go to the System - Packages - Check for Updates page, press the “Check for Updates” button, and apply the update if one is available:

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/10-crs312-update.jpg' | relative_url }})

### Bonding NAS Ports

By bonding both 10Gbps ports of the NAS device in use and connecting them to the switch's Combo3 and Combo4 ports that are bonded, a total bandwidth of 20Gbps will be obtained.

**Removing Combo3 and Combo4 Ports from Bridge**

1.  Go to the Bridge → Ports tab

2.  Find the combo3 and combo4 ports

3.  Select each one and click the Remove (−) button

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/11-bridge-ports.jpg' | relative_url }})

**Creating Bonding**

1.  Go to the Interfaces → Bonding tab in the switch interface

2.  Press the “new” button

3.  Enter the following values:

    1.  Name: bond-nas

    2.  Slaves: combo3, combo4

    3.  Mode: 802.3ad

    4.  Transmit Hash Policy: layer-3-and-4

4.  Press the Apply and OK buttons

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/12-bonding-config.jpg' | relative_url }})

**Adding the Bond to Bridge**

Finally, the created bond is added to the bridge:

1.  Go to the Bridge → Ports tab

2.  Press the “new” button

3.  Select “bond-nas” as the Interface

4.  Press the Apply and OK buttons

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/13-bond-bridge.jpg' | relative_url }})

## CRS812 MikroTik Switch Configuration

### Switch Preparation:

When the switch is powered on, the default IP address is 192.168.88.1/24. You can access this address from the MGMT-1 port:

1.  Connect the CRS812's MGMT-1 port to your computer.

2.  Assign the static IP address 192.168.88.2/24 to your computer's Ethernet interface.

3.  Go to http://192.168.88.1 in your browser

4.  The username is admin, and the password is the one on the label under the device. Log in with these credentials:

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/14-crs812-login.png' | relative_url }})

**Management IP Assignment**

After logging in, a screen will appear asking you to change your password. After changing the password here, you can assign the management IP address on the screen that opens. Here, 192.168.1.155/24 is given as an example; enter the appropriate gateway and DNS server addresses according to your network settings and press the “Apply Configuration” button:

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/15-crs812-mgmt-ip.jpg' | relative_url }})

Applying this setting will disconnect your session. Therefore, change your computer's IP address to an address in the 192.168.1.0/24 network again, and access the switch interface by entering 192.168.1.155 in your browser.

**RouterOS Update**

At this stage, the first thing to do is to ensure that the RouterOS software is on the latest version. To check this, go to the System - Packages - Check for Updates page, press the “Check for Updates” button, and apply the update if one is available:

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/16-crs812-update.jpg' | relative_url }})

### Pre-installation Inventory and Backup

Connect to the switch interface via SSH over the management IP. All configuration steps will be done through the terminal.

```
ssh admin@192.168.1.155

```
Back up the current config before starting the RoCEv2 configuration:

```
/export file=before-roce

/system/backup/save name=before-roce

/file/print

```
![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/17-config-backup.png' | relative_url }})

### QSFP-DD Port 2×200G Breakout Configuration

Each of the CRS812's two QSFP-DD physical ports is 400G by default. Each 400G port is split into two 200G connections using a passive breakout cable. The QSFP-DD ports have 8 sub-interfaces; in 2×200G mode, the 200G main interfaces are -1 and -5. The other sub-interfaces (-2, -3, -4, -6, -7, -8) are not shut down, they remain active but do not require configuration.

After plugging in the breakout cables, configure each 200G main interface with forced speed and auto-negotiation disabled:

```
/interface/ethernet

set qsfp56-dd-1-1 auto-negotiation=no speed=200G-baseCR4

set qsfp56-dd-1-5 auto-negotiation=no speed=200G-baseCR4

set qsfp56-dd-2-1 auto-negotiation=no speed=200G-baseCR4

set qsfp56-dd-2-5 auto-negotiation=no speed=200G-baseCR4

```
![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/18-qsfp-breakout.png' | relative_url }})

### Jumbo Frame and MTU Configuration

Set both L2MTU and MTU values on the QSFP-DD ports connected to the Sparks:

```
/interface/ethernet

set qsfp56-dd-1-1 l2mtu=9500 mtu=9000

set qsfp56-dd-1-5 l2mtu=9500 mtu=9000

set qsfp56-dd-2-1 l2mtu=9500 mtu=9000

set qsfp56-dd-2-5 l2mtu=9500 mtu=9000

```
![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/19-mtu-config.png' | relative_url }})

### RoCEv2 Traffic Classification

**QoS Profiles**

```
/interface/ethernet/switch/qos/profile

add name=roce dscp=26 traffic-class=3

add name=cnp dscp=48 traffic-class=6

```
![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/20-qos-profiles.png' | relative_url }})

**Tx Queue, ETS, ECN and CNP Priority**

```
/interface/ethernet/switch/qos/tx-manager/queue

set 1 schedule=high-priority-group weight=1

set 3 schedule=high-priority-group weight=1 ecn=yes

set 6 schedule=strict-priority

```
TC1 and TC3 run in the ETS group with equal weight (1:1); ECN marking is enabled on TC3; CNP control packets are prioritized with TC6 strict priority. If TC1 is idle, TC3 can use the entire port — this command does not create a permanent 100G/100G rate-limit.

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/21-tx-queue.png' | relative_url }})

**PFC Profile**

```
/interface/ethernet/switch/qos/priority-flow-control

add name=pfc-tc3 traffic-class=3 rx=yes tx=yes

```
Creates a bidirectional Priority-based Flow Control profile for TC3. tx=yes allows the switch to send XOFF/XON frames to the neighbor for TC3; rx=yes allows it to honor TC3 PFC frames received from the neighbor.

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/22-pfc-profile.png' | relative_url }})

**Trust, PFC and Queue Rate Reference for Spark Ports**

```
/interface/ethernet/switch/qos/port

set qsfp56-dd-1-1 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps

set qsfp56-dd-1-5 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps

set qsfp56-dd-2-1 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps

set qsfp56-dd-2-5 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps

```
![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/23-trust-pfc.png' | relative_url }})

**Lossless Traffic Class and Buffer Pool**

```
/interface/ethernet/switch/qos/settings

set lossless-traffic-class=3 lossless-buffers=auto

```
![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/24-lossless.png' | relative_url }})

**QoS hardware offload**

```
/interface/ethernet/switch

set switch1 qos-hw-offloading=yes

```
![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/25-qos-hw-offload.png' | relative_url }})

**LLDP DCBX Advertisement**

```
/ip/neighbor/discovery-settings

set lldp-dcbx=yes

```

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/26-lldp-dcbx.png' | relative_url }})
## Installing sparkrun on Spark Nodes

### User and SSH Configuration

After the network configuration is complete, a common user must be created on all nodes so that the Spark systems can communicate with each other without passwords. sparkrun connects to all nodes via SSH through this user and performs cluster management operations.

**Setting Hostnames**

Give each Spark a unique hostname. This is necessary for SSH known_hosts management, log analysis, and cluster node tracking:

```
# Spark 1 üzerinde:

sudo hostnamectl set-hostname spark1

# Spark 2 üzerinde:

sudo hostnamectl set-hostname spark2

# Spark 3 üzerinde:

sudo hostnamectl set-hostname spark3

# Spark 4 üzerinde:

sudo hostnamectl set-hostname spark4

```

**Creating Common User**

The same username must be created on all Spark systems. This document will use the nvidia username. The following commands are run on all four Spark systems:

```
sudo useradd -m nvidia

sudo usermod -aG sudo nvidia

sudo passwd nvidia

```

Use the same password on all systems — this simplifies management processes. sparkrun asks for this password on the first connection during SSH mesh setup, after which key-based authentication is used.

**Passwordless Sudo Configuration**

sparkrun runs commands with sudo during CX7 network configuration. To avoid prompting for a password each time, passwordless sudo must be configured:

```
echo "nvidia ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/nvidia

sudo chmod 440 /etc/sudoers.d/nvidia

```
![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/27-passwordless-sudo.png' | relative_url }})

### sparkrun Installation

The installation is performed on the account that has the nvidia user.

```
su - nvidia

```

First, the uv package is installed:

```
curl -LsSf https://astral.sh/uv/install.sh | sh

source ~/.bashrc

```

Then sparkrun is installed:

```
uvx sparkrun setup

```

Appropriate answers are given to the questions asked during installation:

1.  first, the IP addresses of the devices are entered:

2.  a name is given for the cluster

3.  nvidia, the username created in the previous step, is entered as the SSH username.

4.  Y is selected for MESH setup

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/28-sparkrun-wizard.jpg' | relative_url }})

5.  Answer Y to the Configure CX7 networking? question; here it asks for the original user password, not nvidia's:

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/29-cx7-password.png' | relative_url }})

6.  Select Y for the Add 'nvidia' to the docker group on all hosts? question

7.  Select “Y” for the Install sudoers entries? question

8.  Select “Y” for the Install earlyoom? question

9.  When the Setup complete message appears, the installation has been completed successfully

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/30-sparkrun-complete.png' | relative_url }})

### DCB (Data Center Bridging) Configuration

PFC and ECN were configured on the switch side, but DSCP tagging and PFC must also be enabled for the ConnectX-7 interfaces on the Spark side. This step is not performed by sparkrun — it must be applied manually on each Spark.

**Detecting Active CX7 Interfaces**

Detect the active CX7 interfaces on each Spark:

```
ip link show | grep -E 'enp.*np|enP.*np'

```

Interfaces with MTU 9000 and UP,LOWER_UP status are the active ones. In this document, two active interfaces are used on each Spark:

- enp1s0f1np1 — Subnet 1

- enP2p1s0f1np1 — Subnet 2

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/31-cx7-interfaces.png' | relative_url }})

**DSCP → Traffic Class Mapping**

The dcb app command is used to map the DSCP 26 value of RoCEv2 packets arriving at the ConnectX-7 interfaces to traffic class 3:

```
sudo dcb app add dev enp1s0f1np1 dscp-prio 26:3

sudo dcb app add dev enP2p1s0f1np1 dscp-prio 26:3

```

This command ensures that packets marked with DSCP 26 are directed to the priority 3 (TC3) queue. The same traffic class is used as in the TC3 configuration on the switch side.

**Enabling PFC**

Enable PFC to provide lossless communication for TC3:

```
sudo dcb pfc set dev enp1s0f1np1 prio-pfc 3:on

sudo dcb pfc set dev enP2p1s0f1np1 prio-pfc 3:on

```

prio-pfc 3:on — send and receive PFC frames only for priority 3. Other priorities are not affected.

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/32-pfc-enable.png' | relative_url }})

**Persistence (systemd Service)**

DCB commands are lost after reboot. Create a systemd service file so they are applied automatically. On each Spark:

```
sudo tee /etc/systemd/system/dcb-roce.service > /dev/null <<'EOF'

[Unit]

Description=Configure DCB DSCP and PFC for RoCEv2 on CX7 interfaces

After=network-online.target

Wants=network-online.target

[Service]

Type=oneshot

ExecStart=/bin/bash -c '\

dcb app add dev enp1s0f1np1 dscp-prio 26:3 && \

dcb app add dev enP2p1s0f1np1 dscp-prio 26:3 && \

dcb pfc set dev enp1s0f1np1 prio-pfc 3:on && \

dcb pfc set dev enP2p1s0f1np1 prio-pfc 3:on'

RemainAfterExit=yes

[Install]

WantedBy=multi-user.target

EOF

sudo systemctl daemon-reload

sudo systemctl enable dcb-roce.service

sudo systemctl start dcb-roce.service

```
![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/33-dcb-roce-service.jpg' | relative_url }})
## Speed and RDMA Tests

In this step, we will verify that the compute network is working correctly and that RDMA communication over RoCEv2 performs as expected. The tests are performed between two Sparks; for 4 nodes, cross tests can be repeated similarly.

**IP Assignment Reference**

The IP addresses assigned to the CX7 interfaces by the sparkrun wizard are as shown below; in your scenario, you should use your own addresses instead of these:

| **Spark** | **Management (enP7s7)** | **CX7 Subnet 1 (enp1s0f1np1)** | **CX7 Subnet 2 (enP2p1s0f1np1)** |
| --- | --- | --- | --- |
| Spark 1 | 192.168.1.162 | 192.168.0.162 | 192.168.2.162 |
| Spark 2 | 192.168.1.157 | 192.168.0.157 | 192.168.2.157 |
| Spark 3 | 192.168.1.158 | 192.168.0.158 | 192.168.2.158 |
| Spark 4 | 192.168.1.161 | 192.168.0.161 | 192.168.2.161 |

Two CX7 subnets are used for the tests:

- Subnet 1: 192.168.0.0/24 → enp1s0f1np1

- Subnet 2: 192.168.2.0/24 → enP2p1s0f1np1

**IP and MTU Test**

Test connectivity and jumbo frames from Spark 1 to Spark 2 with ping:

```
# Spark 1 üzerinde:

ping -c 4 192.168.0.157

ping -M do -s 8972 -c 4 192.168.0.157

```

The first ping tests normal connectivity, the second ping tests 9000 byte MTU. -M do prevents fragmentation — if packets don't drop, MTU 9000 is working end-to-end.

Repeat for the second subnet:

```
ping -c 4 192.168.2.157

ping -M do -s 8972 -c 4 192.168.2.157

```

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/34-ping-mtu.jpg' | relative_url }})

**TCP Throughput Test (iperf3)**

Measure the base bandwidth over the Ethernet/IP layer. This test is not RDMA — it is a TCP transfer with CPU involvement.

```
# Spark 2 üzerinde (sunucu):

iperf3 -s

# Spark 1 üzerinde (istemci):

iperf3 -c 192.168.0.157 -P 8 -t 30

```

-P 8 means eight parallel flows, -t 30 means thirty seconds test duration. Expected result: ~100-120 Gbps total throughput.

Note: if iperf3 is not installed, install it:

```
sudo apt install iperf3

```
![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/35-iperf3.jpg' | relative_url }})

**Identifying RDMA Devices**

Learn the RDMA device names:

```
ibdev2netdev

```

Example output:

rocep1s0f1 port 1 ==> enp1s0f1np1 (Up)

roceP2p1s0f1 port 1 ==> enP2p1s0f1np1 (Up)

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/36-ibdev2netdev.png' | relative_url }})

**RDMA Write Test (ib_write_bw)**

Measure the bandwidth of RDMA write operation over RoCEv2. This test directly tests memory transfer without CPU involvement.

**Subnet 1 (enp1s0f1np1 → rocep1s0f1):**

On Spark 2 (server):

```
ib_write_bw -d rocep1s0f1 -F --report_gbits

```

On Spark 1 (client):

```
ib_write_bw -d rocep1s0f1 -F --report_gbits 192.168.0.157

```

Expected result: ~100-111 Gbps.

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/37-ib-write-bw-1.jpg' | relative_url }})

**Subnet 2 (enP2p1s0f1np1 → roceP2p1s0f1):**

On Spark 2 (server):

```
ib_write_bw -d roceP2p1s0f1 -F --report_gbits

```

On Spark 1 (client):

```
ib_write_bw -d roceP2p1s0f1 -F --report_gbits 192.168.2.157

```

Expected result: ~100-111 Gbps.

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/38-ib-write-bw-2.jpg' | relative_url }})

If both interfaces provide ~100 Gbps, a total ~200 Gbps RDMA bandwidth is available between each Spark.

**RDMA Read Test (ib_read_bw)**

Measure the bandwidth of RDMA read operation:

**Subnet 1 (enp1s0f1np1 → rocep1s0f1):**

On Spark 2 (server):

```
ib_read_bw -d rocep1s0f1 -F --report_gbits

```

On Spark 1 (client):

```
ib_read_bw -d rocep1s0f1 -F --report_gbits 192.168.0.157

```
Expected result: ~95-110 Gbps.

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/39-ib-read-bw-1.jpg' | relative_url }})

**Subnet 2 (enP2p1s0f1np1 → roceP2p1s0f1):**

On Spark 2 (server):

```
ib_read_bw -d roceP2p1s0f1 -F --report_gbits

```

On Spark 1 (client):

```
ib_read_bw -d roceP2p1s0f1 -F --report_gbits 192.168.2.157

```
![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/40-ib-read-bw-2.jpg' | relative_url }})

Expected result: ~95-110 Gbps.

**RDMA Latency Test (ib_write_lat)**

On Spark 2 (server):

```
ib_write_lat -d rocep1s0f1

```

On Spark 1 (client):

```
ib_write_lat -d rocep1s0f1 192.168.0.157

```

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/41-ib-write-lat.jpg' | relative_url }})

Expected result: ~1-3 microsecond latency.

## Running Models with sparkrun

In this step, we will verify that the cluster works end-to-end by running a multi-node inference workload via sparkrun.

**Model and Recipe**

The glm-5.2-int4 model is used in this test. The model is run with tensor parallelism across 4 nodes. The custom container image and recipe YAML file for this model are provided by OpenZeka. Contact OpenZeka to use this model. Or you can use your own image and model.

**Running the Model**

Below is the command and yaml file content for the model to be run as an example:

```
sparkrun run glm52-qt-dcp4-4spark.yaml

```

The content of the executed yaml file is as follows:

```
model: QuantTrio/GLM-5.2-Int4-Int8Mix

runtime: vllm-ray

container: vllm-zatz-dcp:probe

min_nodes: 4

max_nodes: 4

metadata:

description: GLM-5.2 Int4-Int8Mix TP4 DCP4 655K MTP (tonyd2wild, cudagraph NONE for GB10 host-staged NCCL)

maintainer: local

model_params: 744B-MoE-40B-active

model_dtype: int4-int8mix

defaults:

port: 8210

host: 0.0.0.0

tensor_parallel: 4

pipeline_parallel: 1

decode_context_parallel: 4

gpu_memory_utilization: 0.80

max_model_len: 32000

max_num_seqs: 16

max_num_batched_tokens: 4096

kv_cache_dtype: fp8_ds_mla

kv_cache_memory_bytes: 9000000000

load_format: auto

served_model_name: glm-5.2

quantization: compressed-tensors

reasoning_parser: glm45

tool_call_parser: glm47

env:

NCCL_IB_TC: "106"

HF_HUB_OFFLINE: "1"

TRANSFORMERS_OFFLINE: "1"

SAFETENSORS_FAST_GPU: "1"

CUDA_DEVICE_ORDER: "PCI_BUS_ID"

CUDA_DEVICE_MAX_CONNECTIONS: "32"

CUTE_DSL_ARCH: "sm_121a"

TORCH_CUDA_ARCH_LIST: "12.1a"

VLLM_ALLOW_LONG_MAX_MODEL_LEN: "1"

VLLM_RPC_TIMEOUT: "1800000"

NCCL_MAX_NCHANNELS: "4"

NCCL_MIN_NCHANNELS: "4"

PYTORCH_CUDA_ALLOC_CONF: "expandable_segments:True"

VLLM_WORKER_MULTIPROC_METHOD: "spawn"

VLLM_USE_FLASHINFER_SAMPLER: "1"

VLLM_USE_V2_MODEL_RUNNER: "1"

VLLM_USE_B12X_SPARSE_INDEXER: "1"

VLLM_DCP_GLOBAL_TOPK: "1"

VLLM_DCP_SHARD_DRAFT: "1"

VLLM_KZ_TRIM_AFTER_LOAD: "1"

VLLM_USE_B12X_MOE: "0"

VLLM_USE_B12X_FP8_GEMM: "0"

VLLM_DISABLE_TP_MQ_BROADCASTER: "1"

VLLM_ENABLE_PCIE_ALLREDUCE: "0"

USES_B12X: "True"

FLASHINFER_DISABLE_VERSION_CHECK: "1"

RAY_memory_usage_threshold: "0.99"

RAY_memory_monitor_refresh_ms: "0"

command: |

vllm serve {model} \

--served-model-name {served_model_name} \

--trust-remote-code \

--load-format {load_format} \

--quantization {quantization} \

--distributed-executor-backend ray \

--tensor-parallel-size {tensor_parallel} \

--pipeline-parallel-size {pipeline_parallel} \

--decode-context-parallel-size {decode_context_parallel} \

--dcp-comm-backend ag_rs \

--dcp-kv-cache-interleave-size 1 \

--gpu-memory-utilization {gpu_memory_utilization} \

--max-model-len {max_model_len} \

--max-num-seqs {max_num_seqs} \

--max-num-batched-tokens {max_num_batched_tokens} \

--kv-cache-dtype {kv_cache_dtype} \

--kv-cache-memory-bytes {kv_cache_memory_bytes} \

--generation-config vllm \

--hf-overrides '{"use_index_cache":true,"index_topk_pattern":"FFFSSSFSSSFSSSFSSSFSSSFSSSFSSSFSSSFSSSFSSSFSSSFSSSFSSSFSSSFSSSFSSSFSSSFSSSFSSS"}' \

--port {port} \

--host {host} \

--no-enable-log-requests \

--compilation-config '{"cudagraph_mode":"NONE"}' \

--attention-backend B12X_MLA_SPARSE \

--moe-backend flashinfer_cutlass \

--reasoning-parser {reasoning_parser} \

--tool-call-parser {tool_call_parser} \

--enable-auto-tool-choice \

--speculative-config '{"model":"QuantTrio/GLM-5.2-Int4-Int8Mix","method":"mtp","num_speculative_tokens":3,"moe_backend":"flashinfer_cutlass","draft_attention_backend":"B12X_MLA_SPARSE","draft_sample_method":"probabilistic"}' \

--long-prefill-token-threshold 2048 \

--async-scheduling

```

**SSH Authorization Error Solution**

If an authorization-related error is received when connecting to itself after running the sparkrun command, the following command is used and sparkrun is run again:

```
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys

```

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/42-ssh-auth-fix.png' | relative_url }})

**Verifying Model Readiness**

When the model starts, you will receive a message "Application startup complete." — the model is now ready to use:

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/43-model-startup.jpg' | relative_url }})

**Benchmark Results**

The average values obtained as a result of the tests performed with the benchmark tool we provided at [this link](https://github.com/CordatusAI/llm-benchmark) on the model deployed this way are as follows:
## NAS Configuration (ASUSTOR AS6808T)

This section describes the setup of the NAS device used in this configuration starting from unboxing, connecting it to the CRS312 switch via 2×10Gbps LACP with bonding, creating a shared folder, setting its permissions, and mounting this directory on a Spark node.

**Physical Installation**

1.  Install 8 HDD disks into your device.

2.  Connect the two 10Gbps ports on the back of the NAS to the Combo3 and Combo4 ports of the CRS312 device using Cat6 cables.

3.  Make the power connection.

**NAS First Boot and Factory Reset**

Turn on the device by pressing and holding the Power button for 1-2 seconds. During boot, the following messages will appear sequentially on the LCD panel:

1.  "Starting system please wait" — system is starting

2.  "booting-service" / "booting-network" — services and network are starting

3.  "Initialize NAS?" — initial setup/factory reset prompt

When the "Initialize NAS?" prompt appears on the screen, with YES selected, press the Confirm (enter) button in the lower right corner of the LCD panel.

Then the "Delete all data?" prompt will appear. Since all data will be deleted, if you are sure, press the Confirm button again with YES selected.

The message "Initializing please wait" appears on the screen and the process begins. After a while, the process completes and the IP address assigned to the NAS appears on the LCD panel.

**Finding NAS IP Address**

The NAS obtains its IP via DHCP in factory defaults. If there is a DHCP server on your network, the IP address will be displayed automatically on the LCD panel.

If there is no DHCP server on your network, the NAS will obtain a link-local address (169.254.x.x). In this case, you can access it by bringing your computer to the same link-local range.

After learning the IP address, go to http://<nas-ip>:8000 from your browser. For example: [http://192.168.1.31:8000](http://192.168.1.31:8000)

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/44-nas-login.jpg' | relative_url }})

On the initial setup screen, the default username and password are admin / admin. After logging in, it will show the default port configuration; you can change it or continue with the default settings:

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/45-nas-port-config.jpg' | relative_url }})

If you are asked to change your password, change your password. If not asked, you can click the A icon in the upper right corner, select Personal from there, and change your password on the screen that opens:

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/46-nas-password.jpg' | relative_url }})

**RAID Configuration**

The NAS comes configured with RAID 5 using 8 disks in factory defaults. RAID 5 provides 1 disk tolerance and offers ~51 TB of usable space.

| **RAID** | **Disk Tolerance** | **Available Space** | **Speed** | **Recommended Use** |
| --- | --- | --- | --- | --- |
| RAID 0 | None | 58 TB | Fastest | Maximum performance, data safety not important |
| RAID 5 | 1 Disk | 51 TB | Medium | Default, balanced use |
| RAID 6 | 2 Disks | 44 TB | Low | High data safety |

Note: Although the disk labels say 8 TB, they appear as 7.28 TB in the NAS interface. This is because disk manufacturers specify capacity in decimal system, while operating systems calculate in binary system. 8 TB (decimal) ≈ 7.28 TB (binary) is displayed. The values below are calculated according to the binary system.

In this document, RAID 0 configuration will be described for speed, but at the cost of redundancy. If you want to use the system that comes configured with RAID 5 by default, you can skip this step. If you want 2-disk redundancy, you can choose RAID 6, but in this case your speed and storage space will decrease. You can choose according to your needs.

**RAID 0 Configuration Steps:**

1.  In the NAS web interface, go to Storage Manager → Volume page

2.  Select the existing RAID 5 volume

3.  Click the Remove button

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/47-raid-volume.jpg' | relative_url }})

4.  On the screen that appears, select the Quick Setup option

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/48-raid-quick-setup.jpg' | relative_url }})

5.  On the next screen, select the RAID 0 option

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/49-raid0-select.jpg' | relative_url }})

6.  Press the Finish button

When the process completes, the RAID 0 volume consisting of 8 disks will be ready. The total usable space will be ~58 TB.

**Network Configuration — LACP Bonding**

Combine the two 10Gbps Ethernet ports of the NAS under a single bonding interface to provide a 2×10Gbps LACP connection:

1.  In the NAS web interface, go to Settings → Network → Network Interface page

2.  Click Add → Create Link Aggregation

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/50-link-aggregation.jpg' | relative_url }})

3.  In the Interface field, select LAN 1 and LAN 2

4.  Aggregation Mode: select 802.3ad

5.  Press the Next button

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/51-lacp-config.jpg' | relative_url }})

6.  Check the Set up IP address manually option

7.  Enter the following information:

    1.  IP Address: 192.168.1.31

    2.  Subnet Mask: 255.255.255.0

    3.  Gateway: 192.168.1.1

8.  Press the Next button

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/52-nas-ip-config.jpg' | relative_url }})

9.  Review the summary screen and press the Finish button

When the process completes, the NAS will start using the two Ethernet ports as a single bonding interface. Together with the LACP bonding on the CRS312 switch side, 2×10Gbps aggregate throughput is provided.

**Enabling SSH Access**

To install the performance tuning script, you need to connect to the NAS via SSH. SSH is disabled by default.

1.  In the NAS web interface, go to Services → Terminal page

2.  Check the Enable SSH Service option

3.  Press the Apply button

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/53-ssh-enable.jpg' | relative_url }})

You can now connect to the NAS via SSH:

```
ssh admin@192.168.1.31
```

The username is admin, and the password is the one you set during installation.

**Enabling NFS Service**

1.  In the NAS web interface, go to Services → NFS page

2.  Check the Enable NFS Service option

3.  Press the Apply button

4.  Restart the NAS for the NFS service to start completely

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/image49.png' | relative_url }})

Important: After enabling the NFS service, you must restart the NAS. Otherwise, you may get an "unknown error (ref. 5052)" when adding an NFS export.

**Creating a Shared Folder**

1.  In the NAS web interface, click the File Explorer → + (Create New Shared Folder) button

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/54-shared-folder.png' | relative_url }})

2.  Click the Add button

    1.  Name: enter a name

3.  Press the Next button

4.  On the Access Rights screen:

    1.  Select the Read and Write for all users option (everyone gets read/write permission)

    2.  Or you can leave the default Read and Write for admins option

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/55-access-rights.jpg' | relative_url }})

5.  Press the Next button

6.  Additional protection measures: select the Skip option

    1.  Encrypt this shared folder: You can select this if you wish, it is not selected in this document

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/56-protection-measures.jpg' | relative_url }})

7.  Press Next → Finish buttons

**Setting NFS Permissions**

1.  In the NAS web interface, go to Access Control → Shared Folders page

2.  Select the relevant folder

3.  Click the Access Rights button

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/57-nfs-privileges.jpg' | relative_url }})

4.  Switch to the NFS Privileges tab

5.  Click the Add button

6.  Enter the following information:

    1.  Client Address: 192.168.1.1/24 (enter your own network range, the /24 mask covers the entire subnet)

    2.  Privilege: Read and Write

    3.  Root Mapping: root (0)

7\. Press the OK button

![]({{ '/papers/dgx-spark-4node-cluster-kurulumu/images/58-nfs-add.jpg' | relative_url }})

**Performance Tuning Script**

Connect to the NAS via SSH and create the performance tuning script. This script runs automatically on every reboot and changes the bonding hash policy to layer3+4:

```
ssh admin@192.168.1.31

```

```
sudo tee /usr/local/etc/init.d/S98nfstune > /dev/null <<'EOF'

#!/bin/sh

# NFS + RAID0 performance tuning - persistent across reboots

case "$1" in

start)

# wait for NFS and network to be ready

sleep 30

# RAID0 read-ahead 8MB

blockdev --setra 8192 /dev/md1 2>/dev/null

# per-disk read-ahead 8MB

for d in a b c d e f g h; do blockdev --setra 8192 /dev/sd$d 2>/dev/null; done

# nfsd threads 64

echo 64 > /proc/fs/nfsd/threads 2>/dev/null

# RPC slot table

echo 128 > /proc/sys/sunrpc/tcp_slot_table_entries 2>/dev/null

echo 128 > /proc/sys/sunrpc/tcp_max_slot_table_entries 2>/dev/null

# VM writeback cache

echo 40 > /proc/sys/vm/dirty_ratio

echo 5 > /proc/sys/vm/dirty_background_ratio

echo 6000 > /proc/sys/vm/dirty_expire_centisecs

# bond xmit_hash_policy layer3+4

sh -c 'echo layer3+4 > /sys/class/net/bond0/bonding/xmit_hash_policy' 2>/dev/null

# exports: async + wdelay (NO no_wdelay) - allow write batching

[ -f /volume0/etc/exports ] && sed -i "s/no_wdelay,//" /volume0/etc/exports 2>/dev/null

/volume0/usr/builtin/sbin/exportfs -ra 2>/dev/null

;;

stop)

;;

esac

exit 0

EOF

```

```
sudo chmod +x /usr/local/etc/init.d/S98nfstune

sudo /usr/local/etc/init.d/S98nfstune start

```

After running the script, verify that the hash policy has changed:

```
cat /sys/class/net/bond0/bonding/xmit_hash_policy

# Expected: layer3+4

```

**Mounting NAS on Spark Nodes**

Create an NFS mount point on each Spark and connect to the NAS:

```
sudo mkdir -p /mnt/asustor

sudo mount -t nfs \

-o vers=4.2,nconnect=8,rsize=1048576,wsize=1048576,hard,noatime \

192.168.1.31:/volume1/openzeka /mnt/asustor

```

**Simple Write/Read Test**

After the NAS is mounted, test the basic write and read performance. Write Test:

```
dd if=/dev/zero of=/mnt/asustor/testfile bs=1M count=10240 conv=fdatasync

```

Read Test:

```
# Flush cache:

sync; echo 3 | sudo tee /proc/sys/vm/drop_caches

# Read:

dd if=/mnt/asustor/testfile of=/dev/null bs=1M

```

Cleanup:

```
rm /mnt/asustor/testfile

```

## Results and Verification

By following the steps in this document, a fully functional DGX Spark AI cluster consisting of the following components is set up:

| **Component** | **Status** | **Verification Method** |
| --- | --- | --- |
| Management Network (10GbE) | **Ready** | **Inter-node ping successful** |
| Compute Network (200GbE QSFP) | **Ready** | ib_write_bw ~100-111 Gbps |
| **RoCEv2 / RDMA** | **Ready** | **ib_write_lat ~1-3 µs** |
| sparkrun Cluster | **Ready** | **sparkrun setup completed** |
| **DCB / PFC** | **Ready** | **dcb pfc show output TC3:on** |
| NAS (NFS) | **Ready** | dd write/read test |
| **Model Service** | **Ready** | **"Application startup complete." message** |

**Cluster Health Check Summary**

To verify that the installation is complete, you can perform the following checks:

1.  **Management network:** Can all nodes ping each other?

2.  **Compute network:** Does the ib_write_bw test give ~100 Gbps for each subnet?

3.  **MTU:** Does the ping -M do -s 8972 test pass without packet loss?

4.  **sparkrun mesh:** Is passwordless SSH access to all nodes working?

5.  **DCB service:** Does systemctl status dcb-roce.service show active?

6.  **NAS mount:** Does df -h /mnt/asustor show the mount point?

7.  **Model:** Are the benchmark results consistent with the table above?

If all these checks are successful, the cluster is ready for AI workloads.

## Troubleshooting

**Docker Storage Driver overlay2 Appears**

If you see overlay2 in the docker info output, add the containerd-snapshotter feature to the /etc/docker/daemon.json file and restart Docker (see Docker Configuration).

**ping -M do Jumbo Frame Test Fails**

- Make sure l2mtu=9500 mtu=9000 settings are configured on the QSFP-DD ports on the switch side.

- Make sure the MTU values of the CX7 interfaces on the Spark side are 9000: ip link show.

**RDMA Bandwidth Low (Below ~100 Gbps)**

- Make sure all system and firmware updates are performed (see System and Firmware Updates).

- Make sure QoS hardware offloading is enabled on the switch side: qos-hw-offloading=yes.

- Verify that DCB settings are applied: dcb pfc show dev enp1s0f1np1.

- Check that the dcb-roce.service service is running: systemctl status dcb-roce.service.

**sparkrun SSH Authorization Error**

If you get an authorization error when running sparkrun:

```
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys

```

Run the command and run sparkrun again.

**NFS Export "unknown error (ref. 5052)" Error**

Restart the NAS after enabling the NFS service. You will get this error if you try to add an export before the NFS service has fully started.

**NAS Bond Hash Policy Shows layer2+4**

Run the performance tuning script and verify:

```
sudo /usr/local/etc/init.d/S98nfstune start

cat /sys/class/net/bond0/bonding/xmit_hash_policy

# Expected: layer3+4

```
**CRS812 Breakout Ports Not Linking Up**

- Check that the breakout cable latches are fully seated.

- Make sure auto-negotiation=no and speed=200G-baseCR4 settings are applied to the correct ports.

- Remove and reinsert the cable and check the port status: /interface/ethernet/print.
