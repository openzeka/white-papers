---
title: Installatiehandleiding voor een DGX Spark AI-cluster met 8 nodes
parent: White Papers
nav_order: 7
lang: nl
page_id: dgx-spark-8node-cluster-setup
date: 2026-07-24 14:01:17 +0300
card_tag: "Clusterinstallatie"
description: >-
  Installatie van een switchgebaseerd AI-cluster met 8 NVIDIA DGX Spark-nodes via
  een MikroTik CRS804 met 200G-breakout: management- en compute-netwerk,
  RoCEv2/RDMA, sparkrun en NAS.
permalink: /papers/dgx-spark-8node-cluster-setup/
redirect_from:
  - /papers/dgx-spark-8node-cluster-kurulumu/
last_modified_date: 2026-09-30
toc: true
---

## Inhoudsopgave

- [Architectuuroverzicht](#architectuuroverzicht)
- [Vereisten](#vereisten)
- [Voorbereiding van de DGX Spark-nodes](#voorbereiding-van-de-dgx-spark-nodes)
  - [Updates van systeem en firmware](#updates-van-systeem-en-firmware)
  - [Docker-configuratie](#docker-configuratie)
- [Aansluiting van het managementnetwerk (10GbE)](#aansluiting-van-het-managementnetwerk-10gbe)
- [Fysieke aansluiting van het compute-netwerk (200GbE QSFP)](#fysieke-aansluiting-van-het-compute-netwerk-200gbe-qsfp)
- [Configuratie van de MikroTik CRS312-switch](#configuratie-van-de-mikrotik-crs312-switch)
  - [Bonding van de NAS-poorten](#bonding-van-de-nas-poorten)
- [Configuratie van de MikroTik CRS804-switch](#configuratie-van-de-mikrotik-crs804-switch)
  - [Voorbereiding van de switch](#voorbereiding-van-de-switch)
  - [Inventarisatie en back-up vooraf](#inventarisatie-en-back-up-vooraf)
  - [Breakoutconfiguratie 2×200G voor de QSFP-DD-poorten](#breakoutconfiguratie-2200g-voor-de-qsfp-dd-poorten)
  - [Configuratie van jumboframes en MTU](#configuratie-van-jumboframes-en-mtu)
  - [Classificatie van RoCEv2-verkeer](#classificatie-van-rocev2-verkeer)
- [sparkrun installeren op de Spark-nodes](#sparkrun-installeren-op-de-spark-nodes)
  - [Configuratie van gebruiker en SSH](#configuratie-van-gebruiker-en-ssh)
  - [Installatie van sparkrun](#installatie-van-sparkrun)
  - [Configuratie van DCB (Data Center Bridging)](#configuratie-van-dcb-data-center-bridging)
- [Snelheidstests en RDMA-tests](#snelheidstests-en-rdma-tests)
- [Modellen draaien met sparkrun](#modellen-draaien-met-sparkrun)
- [NAS-configuratie (ASUSTOR AS6808T)](#nas-configuratie-asustor-as6808t)
- [Resultaten en verificatie](#resultaten-en-verificatie)
- [Probleemoplossing](#probleemoplossing)

---

<div class="product-card" markdown="1">
<div class="product-card-image">
<img src="{{ '/papers/dgx-spark-8node-cluster-setup/images/spark-8-1.2.png' | relative_url }}" alt="NVIDIA DGX Spark 8-Node AI Cluster" />
</div>
<div class="product-card-body">
<h3>NVIDIA DGX Spark 8-Node AI Cluster – 8 nodes, 1 TB, 200GbE</h3>
<p>8 DGX Spark-nodes, 200GbE RoCEv2 RDMA en clusterbeheer met sparkrun voor een end-to-end AI-infrastructuur.</p>
{% include company/product-button.html product="dgx-spark-8-node" %}
</div>
</div>

Dit document beschrijft de volledige installatie- en configuratiestappen voor een switchgebaseerd AI-cluster dat bestaat uit 8 NVIDIA DGX Spark-nodes. Het cluster gebruikt de **sparkrun**-toolkit om gedistribueerde AI-workloads en de uitvoering van modellen te beheren.

Het document behandelt de voorbereiding van het management- en het compute-netwerk, de configuratie van de ConnectX-7/QSFP-poorten, de RoCEv2/RDMA-instellingen, SSH-toegang, de validatie van de NCCL-communicatie en de stappen voor de statuscontrole van het cluster.

## Architectuuroverzicht

| **Component** | **Beschrijving** |
| --- | --- |
| **DGX Spark × 8** | Elk met een ConnectX-7 200GbE QSFP56-poort |
| **MikroTik CRS312** | 10GbE-switch voor het managementnetwerk; bevat ook de bondingpoorten voor de NAS |
| **MikroTik CRS804** | 400G QSFP-DD-switch voor het compute-netwerk; levert 8×200G via breakout |
| **ASUSTOR AS6808T** | NAS met 8 schijven; via 2×10Gbps LACP aangesloten op de CRS312 |
| **sparkrun** | Toolkit voor clusterbeheer, SSH-mesh en CX7-configuratie |

## Vereisten

**Hardware**

- 8× NVIDIA DGX Spark-systemen

- 1× MikroTik CRS312-4C+8XS-switch (managementnetwerk)

- 1× MikroTik CRS804-switch (compute-netwerk)

- 1× ASUSTOR AS6808T NAS (8× HDD)

- 4× passieve breakoutkabel QSFP-DD → 2× QSFP56 (compute-netwerk)

- Cat6-kabels (managementnetwerk en NAS-aansluitingen)

**Software en besturingssysteem**

- DGX OS (geïnstalleerd op elk Spark-systeem)

- Internettoegang (voor het downloaden van pakketten en updates)

**Kennis en toegang**

- Kennis van de webinterface en de CLI van MikroTik RouterOS

- Basiskennis van de Linux-opdrachtregel

- Fysieke toegang tot alle apparaten (voor de bekabeling)

**Installatie van DGX Spark OS**

Voor de installatie van DGX Spark OS kunt u de volgende video gebruiken:

[NVIDIA DGX Spark Setup Part 1](https://www.youtube.com/watch?v=-z8GqGKDyXE)

## **Voorbereiding van de DGX Spark-nodes**

Zorg ervoor dat op alle Spark-systemen de nieuwste software- en firmwareversies draaien voordat u verdergaat met de fysieke aansluitingen en de netwerkconfiguratie. Een aanzienlijk deel van de prestatieproblemen die tijdens de installatie optreden, kan worden veroorzaakt door verouderde drivers, ontbrekende updates of incompatibele firmware.

De volgende stappen moeten op alle acht de Spark-systemen worden uitgevoerd.

### **Updates van systeem en firmware**

Eerst worden de pakketten van het besturingssysteem bijgewerkt:

```bash
sudo apt update
sudo apt dist-upgrade
```
Daarna wordt de systeemfirmware bijgewerkt:

```bash
sudo fwupdmgr refresh --force
sudo fwupdmgr upgrade
```
Controleer via het DGX Dashboard dat er geen openstaande updates zijn; als die er wel zijn, voer ze dan uit:

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/01-dgx-dashboard.jpg' | relative_url }})

Start het systeem opnieuw op nadat de updates zijn voltooid:

```bash
sudo reboot
```
Tijdens de tests die in het installatieproces zijn uitgevoerd, bleek dat de verbindingsprestaties door verouderde firmwareversies niet het verwachte niveau haalden. Daarom wordt aanbevolen om als eerste stap van de installatie alle systemen bij te werken.

### **Docker-configuratie**

Om de containergebaseerde tools die in de volgende stappen worden gebruikt zonder sudo te kunnen draaien, worden op elke Spark de post-installatiestappen van Docker uitgevoerd.

Eerst wordt de huidige gebruiker aan de Docker-groep toegevoegd:

```bash
sudo groupadd docker
sudo usermod -aG docker $USER
newgrp docker
```
De configuratie kan met de volgende test worden gecontroleerd:

```bash
docker run hello-world
```
![]({{ '/papers/dgx-spark-8node-cluster-setup/images/02-docker-hello.jpg' | relative_url }})

Als de opdracht met succes wordt uitgevoerd en Docker de voorbeeldcontainer kan starten, is de voorbereiding voor de containergebaseerde tools die in de volgende stappen worden gebruikt voltooid.

**Verificatie van de storage driver**

Daarnaast is de storage driver van Docker op alle Spark-nodes gecontroleerd. Er is geverifieerd dat de waarde Storage Driver in de uitvoer van docker info overlayfs was. Werd overlay2 of een andere storage driver aangetroffen, dan is Docker geconfigureerd om de containerd-snapshotter (overlayfs) te gebruiken en is de Docker-service opnieuw gestart. Zo werd dezelfde opslaginfrastructuur op alle nodes gebruikt en ontstond een consistente runtime-omgeving.

Eerst is de huidige storage driver met de volgende opdracht gecontroleerd:

```bash
docker info -f 'Driver={{.Driver}} DriverStatus={{.DriverStatus}} DockerRootDir={{.DockerRootDir}}'
```
Als de uitvoer overlay2 als driver toonde, is de volgende configuratie toegepast:

```bash
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "features": {
    "containerd-snapshotter": true
  }
}
EOF

sudo systemctl restart docker
```
Na de configuratie is dezelfde controleopdracht opnieuw uitgevoerd en is geverifieerd dat de storage driver overlayfs was.

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/03-docker-storage.png' | relative_url }})
## Aansluiting van het managementnetwerk (10GbE)

De 10GbE-ethernetpoort van elke DGX Spark wordt met een Cat6-kabel aangesloten op een van de 10G-poorten van de MikroTik CRS312-switch. Controleer na het aansluiten van de kabel of de linkindicator van de betreffende switchpoort brandt.

Open een terminal op het bureaublad van de Spark en controleer of het apparaat een IP-adres heeft gekregen:

```bash
ip addr show
```

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/04-ip-addr.jpg' | relative_url }})

Als u in de uitvoer, zoals in het voorbeeld, een IP-adres op de 10GbE-interface ziet, kan SSH-toegang via het managementnetwerk worden opgezet. Is er geen IP-adres toegekend, dan kunt u het handmatig toewijzen via het bureaublad van DGX OS:

1.  Klik op het netwerkpictogram rechtsboven → kies Wired Settings

2.  Klik op het tandwielpictogram (⚙) naast de betreffende 10GbE-verbinding

3.  Ga naar het tabblad IPv4

4.  Wijzig het veld Method in Manual

5.  Voer de volgende gegevens in:

    - Address: 192.168.1.x (voor elke Spark anders en afhankelijk van uw eigen netwerk)


   - Netmask: 255.255.255.0


   - Gateway: 192.168.1.1 (indien aanwezig, anders leeg laten)


   - DNS: 1.1.1.1,8.8.8.8


6.  Druk op de knop Apply en schakel de verbinding uit en weer in

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/05-wired-settings.jpg' | relative_url }})

Als er internettoegang is, is de 10GbE-managementverbinding gereed. Herhaal dezelfde stappen op de andere zeven Sparks en geef elk een ander IP-adres.

**Controle van de verbinding tussen nodes**

Controleer of alle Sparks elkaar via het managementnetwerk kunnen bereiken. Ping vanaf één Spark de andere:

```bash
ping -c 4 192.168.1.x #Other Sparks' addresses
```

Als alle pings slagen, is het managementnetwerk gereed en kunnen alle nodes met elkaar communiceren.

## Fysieke aansluiting van het compute-netwerk (200GbE QSFP)

In het DGX Spark 8-Node AI Cluster is elke Spark via de ConnectX-7 QSFP-poort met een snelheid van 200GbE aangesloten op de MikroTik CRS804-switch. De 400G QSFP-DD-poorten van de CRS804 worden met passieve breakoutkabels elk in twee 200G-verbindingen opgesplitst.

**Kabelplan**

| **CRS804-poort** | **Poortsnelheid** | **Breakout**    | **Aangesloten Spark** |
| --------------- | -------------- | --------------- | ------------------- |
| QSFP-DD-poort 1  | 400G           | 2 × 200G QSFP56 | Spark 1 + Spark 2   |
| QSFP-DD-poort 2  | 400G           | 2 × 200G QSFP56 | Spark 3 + Spark 4   |
| QSFP-DD-poort 3  | 400G           | 2 × 200G QSFP56 | Spark 5 + Spark 6   |
| QSFP-DD-poort 4  | 400G           | 2 × 200G QSFP56 | Spark 7 + Spark 8   |

**Aansluitstappen**

1.  Steek het QSFP-DD-uiteinde van de eerste breakoutkabel in QSFP-DD-poort nummer 1 van de CRS804. Zorg ervoor dat de vergrendelingshendels aan beide uiteinden van de kabel volledig vastzitten.

    ![]({{ '/papers/dgx-spark-8node-cluster-setup/images/06-breakout-cable.jpg' | relative_url }})

2.  Steek de twee QSFP56-uiteinden van dezelfde kabel in de buitenste ConnectX-7-poorten van de systemen Spark 1 en Spark 2.

    ![]({{ '/papers/dgx-spark-8node-cluster-setup/images/07-connectx7-ports.jpg' | relative_url }})

3.  Sluit de andere 3 kabels op dezelfde manier aan om de switch met de Sparks te verbinden.

4.  Schakel de CRS804-switch in.

## Configuratie van de MikroTik CRS312-switch

Wanneer de switch wordt ingeschakeld, is het standaard-IP-adres 192.168.88.1/24. U bereikt dit adres via de poort Ethernet-1.

1.  Verbind de poort Ethernet-1 van de CRS312 met uw computer.

2.  Wijs het statische IP-adres 192.168.88.2/24 toe aan de ethernetinterface van uw computer.

3.  Ga in uw browser naar http://192.168.88.1

4.  De gebruikersnaam is admin en het wachtwoord staat op het label aan de onderkant van het apparaat. Meld u aan met deze gegevens:

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/08-crs312-login.png' | relative_url }})

**Toewijzing van het management-IP-adres**

Na het aanmelden verschijnt een scherm waarin u wordt gevraagd uw wachtwoord te wijzigen. Nadat u hier het wachtwoord hebt gewijzigd, kunt u in het scherm dat daarna opent het management-IP-adres toewijzen. Hier wordt 192.168.1.122/24 als voorbeeld gebruikt; voer de gateway- en DNS-serveradressen in die bij uw netwerkinstellingen passen en druk op de knop “Apply Configuration”:

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/09-crs312-mgmt-ip.jpg' | relative_url }})

Door deze instelling toe te passen wordt uw sessie verbroken. Zet het IP-adres van uw computer daarom weer op een adres in het netwerk 192.168.1.0/24 en open de interface van de switch door 192.168.1.122 in uw browser in te voeren.

**RouterOS-update**

Controleer in deze fase eerst of de RouterOS-software up-to-date is. Ga daarvoor naar de pagina System - Packages - Check for Updates, druk op de knop “Check for Updates” en voer de update uit als er een beschikbaar is:

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/10-crs312-update.jpg' | relative_url }})

### Bonding van de NAS-poorten

Door de beide 10Gbps-poorten van de gebruikte NAS te bundelen en aan te sluiten op de gebundelde Combo3- en Combo4-poorten van de switch, ontstaat een totale bandbreedte (bandwidth) van 20Gbps.

**De poorten Combo3 en Combo4 uit de bridge verwijderen**

1.  Ga naar het tabblad Bridge → Ports

2.  Zoek de poorten combo3 en combo4

3.  Selecteer ze één voor één en klik op de knop Remove (−)

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/11-bridge-ports.jpg' | relative_url }})

**Bonding aanmaken**

1.  Ga in de interface van de switch naar het tabblad Interfaces → Bonding

2.  Druk op de knop “new”

3.  Voer de volgende waarden in:

    1.  Name: bond-nas

    2.  Slaves: combo3, combo4

    3.  Mode: 802.3ad

    4.  Transmit Hash Policy: layer-3-and-4

4.  Druk op de knoppen Apply en OK

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/12-bonding-config.jpg' | relative_url }})

**De bond aan de bridge toevoegen**

Tot slot wordt de aangemaakte bond aan de bridge toegevoegd:

1.  Ga naar het tabblad Bridge → Ports

2.  Druk op de knop “new”

3.  Kies “bond-nas” als Interface

4.  Druk op de knoppen Apply en OK

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/13-bond-bridge.jpg' | relative_url }})

## Configuratie van de MikroTik CRS804-switch

### Voorbereiding van de switch:

Wanneer de switch wordt ingeschakeld, is het standaard-IP-adres 192.168.88.1/24. U bereikt dit adres via de poort MGMT-1:

1.  Verbind de poort MGMT-1 van de CRS804 met uw computer.

2.  Wijs het statische IP-adres 192.168.88.2/24 toe aan de ethernetinterface van uw computer.

3.  Ga in uw browser naar http://192.168.88.1

4.  De gebruikersnaam is admin en het wachtwoord staat op het label aan de onderkant van het apparaat. Meld u aan met deze gegevens:

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/14-crs812-login.png' | relative_url }})

**Toewijzing van het management-IP-adres**

Na het aanmelden verschijnt een scherm waarin u wordt gevraagd uw wachtwoord te wijzigen. Nadat u hier het wachtwoord hebt gewijzigd, kunt u in het scherm dat daarna opent het management-IP-adres toewijzen. Hier wordt 192.168.1.155/24 als voorbeeld gebruikt; voer de gateway- en DNS-serveradressen in die bij uw netwerkinstellingen passen en druk op de knop “Apply Configuration”:

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/15-crs812-mgmt-ip.jpg' | relative_url }})

Door deze instelling toe te passen wordt uw sessie verbroken. Zet het IP-adres van uw computer daarom weer op een adres in het netwerk 192.168.1.0/24 en open de interface van de switch door 192.168.1.155 in uw browser in te voeren.

**RouterOS-update**

Het eerste wat u in deze fase doet, is ervoor zorgen dat de RouterOS-software de nieuwste versie heeft. Ga daarvoor naar de pagina System - Packages - Check for Updates, druk op de knop “Check for Updates” en voer de update uit als er een beschikbaar is:

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/16-crs812-update.jpg' | relative_url }})

### Inventarisatie en back-up vooraf

Maak via het management-IP-adres een SSH-verbinding met de interface van de switch. Alle configuratiestappen worden via de terminal uitgevoerd.

```bash
ssh admin@192.168.1.155
```
Maak een back-up van de huidige configuratie voordat u aan de RoCEv2-configuratie begint:

```bash
/export file=before-roce
/system/backup/save name=before-roce
/file/print
```
![]({{ '/papers/dgx-spark-8node-cluster-setup/images/17-config-backup.png' | relative_url }})

### Breakoutconfiguratie 2×200G voor de QSFP-DD-poorten

Elk van de vier fysieke QSFP-DD-poorten van de CRS804 is standaard 400G. Elke 400G-poort wordt met een passieve breakoutkabel in twee 200G-verbindingen opgesplitst. De QSFP-DD-poorten hebben 8 subinterfaces; in de modus 2×200G zijn -1 en -5 de 200G-hoofdinterfaces. De overige subinterfaces (-2, -3, -4, -6, -7, -8) worden niet uitgeschakeld; ze blijven actief, maar hoeven niet te worden geconfigureerd.

Configureer na het aansluiten van de breakoutkabels elke 200G-hoofdinterface met een vaste snelheid en uitgeschakelde auto-negotiation:

```bash
/interface/ethernet
set qsfp56-dd-1-1 auto-negotiation=no speed=200G-baseCR4
set qsfp56-dd-1-5 auto-negotiation=no speed=200G-baseCR4
set qsfp56-dd-2-1 auto-negotiation=no speed=200G-baseCR4
set qsfp56-dd-2-5 auto-negotiation=no speed=200G-baseCR4
set qsfp56-dd-3-1 auto-negotiation=no speed=200G-baseCR4
set qsfp56-dd-3-5 auto-negotiation=no speed=200G-baseCR4
set qsfp56-dd-4-1 auto-negotiation=no speed=200G-baseCR4
set qsfp56-dd-4-5 auto-negotiation=no speed=200G-baseCR4
```
![]({{ '/papers/dgx-spark-8node-cluster-setup/images/18-qsfp-breakout.png' | relative_url }})

### Configuratie van jumboframes en MTU

Stel op de QSFP-DD-poorten die met de Sparks zijn verbonden zowel de L2MTU- als de MTU-waarde in:

```bash
/interface/ethernet
set qsfp56-dd-1-1 l2mtu=9500 mtu=9000
set qsfp56-dd-1-5 l2mtu=9500 mtu=9000
set qsfp56-dd-2-1 l2mtu=9500 mtu=9000
set qsfp56-dd-2-5 l2mtu=9500 mtu=9000
set qsfp56-dd-3-1 l2mtu=9500 mtu=9000
set qsfp56-dd-3-5 l2mtu=9500 mtu=9000
set qsfp56-dd-4-1 l2mtu=9500 mtu=9000
set qsfp56-dd-4-5 l2mtu=9500 mtu=9000
```
![]({{ '/papers/dgx-spark-8node-cluster-setup/images/19-mtu-config.png' | relative_url }})

### Classificatie van RoCEv2-verkeer

**QoS-profielen**

```bash
/interface/ethernet/switch/qos/profile
add name=roce dscp=26 traffic-class=3
add name=cnp dscp=48 traffic-class=6
```
![]({{ '/papers/dgx-spark-8node-cluster-setup/images/20-qos-profiles.png' | relative_url }})

**Tx-queue, ETS, ECN en CNP-prioriteit**

```bash
/interface/ethernet/switch/qos/tx-manager/queue
set 1 schedule=high-priority-group weight=1
set 3 schedule=high-priority-group weight=1 ecn=yes
set 6 schedule=strict-priority
```
TC1 en TC3 draaien in de ETS-groep met een gelijk gewicht (1:1); op TC3 is ECN-markering ingeschakeld; CNP-controlepakketten krijgen voorrang via strict priority op TC6. Als TC1 inactief is, kan TC3 de volledige poort gebruiken — deze opdracht stelt geen permanente rate-limit van 100G/100G in.

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/21-tx-queue.png' | relative_url }})

**PFC-profiel**

```bash
/interface/ethernet/switch/qos/priority-flow-control
add name=pfc-tc3 traffic-class=3 rx=yes tx=yes
```
Maakt een bidirectioneel profiel voor Priority-based Flow Control voor TC3 aan. Met tx=yes kan de switch voor TC3 XOFF/XON-frames naar de buur sturen; met rx=yes houdt hij rekening met TC3-PFC-frames die van de buur worden ontvangen.

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/22-pfc-profile.png' | relative_url }})

**Trust, PFC en referentie voor de queue-rate op de Spark-poorten**

```bash
/interface/ethernet/switch/qos/port
set qsfp56-dd-1-1 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
set qsfp56-dd-1-5 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
set qsfp56-dd-2-1 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
set qsfp56-dd-2-5 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
set qsfp56-dd-3-1 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
set qsfp56-dd-3-5 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
set qsfp56-dd-4-1 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
set qsfp56-dd-4-5 trust-l3=keep pfc=pfc-tc3 egress-rate-queue3=200Gbps
```
![]({{ '/papers/dgx-spark-8node-cluster-setup/images/23-trust-pfc.png' | relative_url }})

**Lossless traffic class en bufferpool**

```bash
/interface/ethernet/switch/qos/settings
set lossless-traffic-class=3 lossless-buffers=auto
```
![]({{ '/papers/dgx-spark-8node-cluster-setup/images/24-lossless.png' | relative_url }})

**QoS-hardware-offload**

```bash
/interface/ethernet/switch
set switch1 qos-hw-offloading=yes
```
![]({{ '/papers/dgx-spark-8node-cluster-setup/images/25-qos-hw-offload.png' | relative_url }})

**LLDP-DCBX-advertisement**

```bash
/ip/neighbor/discovery-settings
set lldp-dcbx=yes
```

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/26-lldp-dcbx.png' | relative_url }})
## sparkrun installeren op de Spark-nodes

### Configuratie van gebruiker en SSH

Nadat de netwerkconfiguratie is voltooid, moet op alle nodes een gemeenschappelijke gebruiker worden aangemaakt, zodat de Spark-systemen zonder wachtwoord met elkaar kunnen communiceren. sparkrun maakt via deze gebruiker een SSH-verbinding met alle nodes en voert de clusterbeheertaken uit.

**Hostnamen instellen**

Geef elke Spark een unieke hostnaam. Dit is nodig voor het beheer van SSH known_hosts, de analyse van logs en het bijhouden van de clusternodes:

```bash
# On Spark 1:
sudo hostnamectl set-hostname spark1

# On Spark 2:
sudo hostnamectl set-hostname spark2

# On Spark 3:
sudo hostnamectl set-hostname spark3

# On Spark 4:
sudo hostnamectl set-hostname spark4

# On Spark 5:
sudo hostnamectl set-hostname spark5

# On Spark 6:
sudo hostnamectl set-hostname spark6

# On Spark 7:
sudo hostnamectl set-hostname spark7

# On Spark 8:
sudo hostnamectl set-hostname spark8
```

**Gemeenschappelijke gebruiker aanmaken**

Op alle Spark-systemen moet dezelfde gebruikersnaam worden aangemaakt. In dit document wordt de gebruikersnaam nvidia gebruikt. De volgende opdrachten worden op alle acht de Spark-systemen uitgevoerd:

```bash
sudo useradd -m nvidia
sudo usermod -aG sudo nvidia
sudo passwd nvidia
```

Gebruik op alle systemen hetzelfde wachtwoord — dat vereenvoudigt het beheer. sparkrun vraagt bij de eerste verbinding tijdens de installatie van de SSH-mesh om dit wachtwoord; daarna wordt authenticatie op basis van sleutels gebruikt.

**Sudo zonder wachtwoord configureren**

sparkrun voert tijdens de CX7-netwerkconfiguratie opdrachten met sudo uit. Om te voorkomen dat er elke keer om een wachtwoord wordt gevraagd, moet sudo zonder wachtwoord worden geconfigureerd:

```bash
echo "nvidia ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/nvidia
sudo chmod 440 /etc/sudoers.d/nvidia
```
![]({{ '/papers/dgx-spark-8node-cluster-setup/images/27-passwordless-sudo.png' | relative_url }})

### Installatie van sparkrun

De installatie wordt uitgevoerd onder het account van de gebruiker nvidia.

```bash
su - nvidia
```

Eerst wordt het pakket uv geïnstalleerd:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
```

Daarna wordt sparkrun geïnstalleerd:

```bash
uvx sparkrun setup
```

Beantwoord de vragen die tijdens de installatie worden gesteld als volgt:

1.  Voer eerst de IP-adressen van de apparaten in:

2.  Geef het cluster een naam

3.  Voer als SSH-gebruikersnaam nvidia in, de gebruikersnaam die in de vorige stap is aangemaakt.

4.  Kies Y voor de installatie van de MESH

    ![]({{ '/papers/dgx-spark-8node-cluster-setup/images/28-sparkrun-wizard.jpg' | relative_url }})

5.  Beantwoord de vraag Configure CX7 networking? met Y:

    ![]({{ '/papers/dgx-spark-8node-cluster-setup/images/29-cx7-password.png' | relative_url }})

6.  Kies Y bij de vraag Add 'nvidia' to the docker group on all hosts?

7.  Kies “Y” bij de vraag Install sudoers entries?

8.  Kies “Y” bij de vraag Install earlyoom?

9.  Wanneer de melding Setup complete verschijnt, is de installatie met succes voltooid

    ![]({{ '/papers/dgx-spark-8node-cluster-setup/images/30-sparkrun-complete.png' | relative_url }})

### Configuratie van DCB (Data Center Bridging)

PFC en ECN zijn aan de kant van de switch geconfigureerd, maar ook voor de ConnectX-7-interfaces aan de kant van de Spark moeten DSCP-tagging en PFC worden ingeschakeld. Deze stap wordt niet door sparkrun uitgevoerd — hij moet op elke Spark handmatig worden toegepast.

**Actieve CX7-interfaces bepalen**

Bepaal op elke Spark welke CX7-interfaces actief zijn:

```
ip link show | grep -E 'enp.*np|enP.*np'
```

De interfaces met MTU 9000 en de status UP,LOWER_UP zijn de actieve. In dit document worden op elke Spark twee actieve interfaces gebruikt:

- enp1s0f1np1 — Subnet 1

- enP2p1s0f1np1 — Subnet 2

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/31-cx7-interfaces.png' | relative_url }})

**Koppeling van DSCP → traffic class**

Met de opdracht dcb app wordt de DSCP-waarde 26 van RoCEv2-pakketten die op de ConnectX-7-interfaces binnenkomen gekoppeld aan traffic class 3:

```bash
sudo dcb app add dev enp1s0f1np1 dscp-prio 26:3
sudo dcb app add dev enP2p1s0f1np1 dscp-prio 26:3
```

Deze opdracht zorgt ervoor dat pakketten die met DSCP 26 zijn gemarkeerd naar de queue met prioriteit 3 (TC3) worden geleid. Er wordt dezelfde traffic class gebruikt als in de TC3-configuratie aan de kant van de switch.

**PFC inschakelen**

Schakel PFC in om lossless communicatie voor TC3 te bieden:

```bash
sudo dcb pfc set dev enp1s0f1np1 prio-pfc 3:on
sudo dcb pfc set dev enP2p1s0f1np1 prio-pfc 3:on
```

prio-pfc 3:on — verzend en ontvang PFC-frames alleen voor prioriteit 3. Andere prioriteiten worden niet beïnvloed.

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/32-pfc-enable.png' | relative_url }})

**Persistentie (systemd-service)**

DCB-opdrachten gaan na een herstart verloren. Maak een systemd-servicebestand aan, zodat ze automatisch worden toegepast. Op elke Spark:

```bash
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
![]({{ '/papers/dgx-spark-8node-cluster-setup/images/33-dcb-roce-service.jpg' | relative_url }})
## Snelheidstests en RDMA-tests

In deze stap controleren we of het compute-netwerk correct werkt en of de RDMA-communicatie via RoCEv2 naar verwachting presteert. De tests worden tussen twee Sparks uitgevoerd; voor 8 nodes kunnen kruistests op dezelfde manier worden herhaald.

**Referentie voor de IP-toewijzing**

De IP-adressen die de sparkrun-wizard voor de eerste twee Sparks aan de CX7-interfaces heeft toegewezen, staan hieronder; in uw scenario gebruikt u in plaats daarvan uw eigen adressen:

| **Spark** | **Management (enP7s7)** | **CX7-subnet 1 (enp1s0f1np1)** | **CX7-subnet 2 (enP2p1s0f1np1)** |
| --- | --- | --- | --- |
| Spark 1 | 192.168.1.147 | 192.168.0.147 | 192.168.2.147 |
| Spark 2 | 192.168.1.153 | 192.168.0.153 | 192.168.2.153 |

Voor de tests worden twee CX7-subnetten gebruikt:

- Subnet 1: 192.168.0.0/24 → enp1s0f1np1

- Subnet 2: 192.168.2.0/24 → enP2p1s0f1np1

**IP- en MTU-test**

Test met ping de verbinding en de jumboframes van Spark 1 naar Spark 2:

```bash
# On Spark 1:
ping -c 4 192.168.0.153
ping -M do -s 8972 -c 4 192.168.0.153
```

De eerste ping test de normale verbinding, de tweede ping test een MTU van 9000 bytes. -M do voorkomt fragmentatie — als er geen pakketten wegvallen, werkt MTU 9000 end-to-end.

Herhaal dit voor het tweede subnet:

```bash
ping -c 4 192.168.2.153
ping -M do -s 8972 -c 4 192.168.2.153
```

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/34-ping-mtu.jpg' | relative_url }})

**Test van de TCP-doorvoer (iperf3)**

Meet de basisbandbreedte op de Ethernet/IP-laag. Deze test is geen RDMA — het is een TCP-overdracht waarbij de CPU betrokken is.

```bash
# On Spark 2 (server):
iperf3 -s

# On Spark 1 (client):
iperf3 -c 192.168.0.153 -P 8 -t 30
```

-P 8 betekent acht parallelle stromen, -t 30 betekent een testduur van dertig seconden. Verwacht resultaat: een totale doorvoer (throughput) van ~100-120 Gbps.

Opmerking: als iperf3 niet is geïnstalleerd, installeer het dan:

```bash
sudo apt install iperf3
```
![]({{ '/papers/dgx-spark-8node-cluster-setup/images/35-iperf3.jpg' | relative_url }})

**RDMA-apparaten identificeren**

Achterhaal de namen van de RDMA-apparaten:

```bash
ibdev2netdev
```

Voorbeelduitvoer:

rocep1s0f1 port 1 ==> enp1s0f1np1 (Up)

roceP2p1s0f1 port 1 ==> enP2p1s0f1np1 (Up)

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/36-ibdev2netdev.png' | relative_url }})

**RDMA-schrijftest (ib_write_bw)**

Meet de bandbreedte van de RDMA-schrijfbewerking via RoCEv2. Deze test meet rechtstreeks de geheugenoverdracht zonder tussenkomst van de CPU.

**Subnet 1 (enp1s0f1np1 → rocep1s0f1):**

Op Spark 2 (server):

```bash
ib_write_bw -d rocep1s0f1 -F --report_gbits
```

Op Spark 1 (client):

```bash
ib_write_bw -d rocep1s0f1 -F --report_gbits 192.168.0.153
```

Verwacht resultaat: ~100-111 Gbps.

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/37-ib-write-bw-1.jpg' | relative_url }})

**Subnet 2 (enP2p1s0f1np1 → roceP2p1s0f1):**

Op Spark 2 (server):

```bash
ib_write_bw -d roceP2p1s0f1 -F --report_gbits
```

Op Spark 1 (client):

```bash
ib_write_bw -d roceP2p1s0f1 -F --report_gbits 192.168.2.153
```

Verwacht resultaat: ~100-111 Gbps.

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/38-ib-write-bw-2.jpg' | relative_url }})

Als beide interfaces ~100 Gbps leveren, is er tussen elke Spark in totaal ~200 Gbps RDMA-bandbreedte beschikbaar.

**RDMA-leestest (ib_read_bw)**

Meet de bandbreedte van de RDMA-leesbewerking:

**Subnet 1 (enp1s0f1np1 → rocep1s0f1):**

Op Spark 2 (server):

```bash
ib_read_bw -d rocep1s0f1 -F --report_gbits
```

Op Spark 1 (client):

```bash
ib_read_bw -d rocep1s0f1 -F --report_gbits 192.168.0.153
```
Verwacht resultaat: ~95-110 Gbps.

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/39-ib-read-bw-1.jpg' | relative_url }})

**Subnet 2 (enP2p1s0f1np1 → roceP2p1s0f1):**

Op Spark 2 (server):

```bash
ib_read_bw -d roceP2p1s0f1 -F --report_gbits
```

Op Spark 1 (client):

```bash
ib_read_bw -d roceP2p1s0f1 -F --report_gbits 192.168.2.153
```
![]({{ '/papers/dgx-spark-8node-cluster-setup/images/40-ib-read-bw-2.jpg' | relative_url }})

Verwacht resultaat: ~95-110 Gbps.

**RDMA-latentietest (ib_write_lat)**

Op Spark 2 (server):

```bash
ib_write_lat -d rocep1s0f1
```

Op Spark 1 (client):

```bash
ib_write_lat -d rocep1s0f1 192.168.0.153
```

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/41-ib-write-lat.jpg' | relative_url }})

Verwacht resultaat: een latentie (latency) van ~1-3 microseconden.

## Modellen draaien met sparkrun

In deze stap controleren we of het cluster end-to-end werkt door via sparkrun een multi-node workload voor inferentie (inference) uit te voeren.

**Model en recipe**

Voor deze test wordt het model glm-5.2-nvfp4 gebruikt. Het model draait met tensorparallellisme (tensor parallelism) over 8 nodes. De aangepaste containerimage en het recipe-YAML-bestand voor dit model zijn door OpenZeka voorbereid.

Download eerst de containerimage met de volgende opdracht:

```bash
docker pull registry.cordata.ai/spark-cluster/vllm-zatz-dcp:probe
```

Geef de image daarna een nieuwe tag:

```bash
docker tag registry.cordata.ai/spark-cluster/vllm-zatz-dcp:probe vllm-zatz-dcp:probe
```

Nadat de image is ingesteld, kan de inferentieworkload met sparkrun worden uitgevoerd met het meegeleverde recipe-YAML-bestand.

**Het model uitvoeren**

Hieronder staan de opdracht en de inhoud van het yaml-bestand voor het model dat als voorbeeld wordt uitgevoerd:

```bash
sparkrun run glm52-nvfp4-tp8-256k.yaml
```

De inhoud van het uitgevoerde yaml-bestand is als volgt:

```bash
model: nvidia/GLM-5.2-NVFP4
runtime: vllm-ray
container: vllm-zatz-dcp:probe

min_nodes: 8
max_nodes: 8

metadata:
  description: nvidia/GLM-5.2-NVFP4 TP8 + Expert-Parallel (resmi config) 8x DGX Spark, B12X_MLA_SPARSE, cudagraph NONE
  maintainer: local
  model_dtype: nvfp4

# --- Variables defined here in ONE place; used with curly braces in command ---
defaults:
  port: 8210
  host: 0.0.0.0
  tensor_parallel: 8
  pipeline_parallel: 1
  gpu_memory_utilization: 0.75
  max_model_len: 256000
  max_num_seqs: 2
  max_num_batched_tokens: 4096
  kv_cache_dtype: fp8_ds_mla
  kv_cache_memory_bytes: 35000000000
  load_format: auto
  served_model_name: glm-5.2-nvfp4
  quantization: modelopt
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
  VLLM_KZ_TRIM_AFTER_LOAD: "1"
  VLLM_USE_B12X_MOE: "0"
  VLLM_USE_B12X_FP8_GEMM: "0"
  VLLM_DISABLE_TP_MQ_BROADCASTER: "1"
  VLLM_ENABLE_PCIE_ALLREDUCE: "0"
  USES_B12X: "True"
  FLASHINFER_DISABLE_VERSION_CHECK: "1"
  RAY_memory_usage_threshold: "0.99"
  RAY_memory_monitor_refresh_ms: "0"
  VLLM_DEEP_GEMM_WARMUP: "skip"

command: |
  vllm serve {model} \
      --served-model-name {served_model_name} \
      --trust-remote-code \
      --load-format {load_format} \
      --quantization {quantization} \
      --distributed-executor-backend ray \
      --tensor-parallel-size {tensor_parallel} \
      --pipeline-parallel-size {pipeline_parallel} \
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
      --speculative-config '{"method":"mtp","num_speculative_tokens":5,"draft_attention_backend":"B12X_MLA_SPARSE","moe_backend":"flashinfer_cutlass"}' \
      --long-prefill-token-threshold 2048 \
      --load-format instanttensor \
      --async-scheduling
```

**Oplossing voor een SSH-autorisatiefout**

Als er na het uitvoeren van de sparkrun-opdracht een autorisatiefout optreedt wanneer de node verbinding met zichzelf maakt, voert u de volgende opdracht uit en start u sparkrun opnieuw:

```bash
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
```

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/42-ssh-auth-fix.png' | relative_url }})

**Controleren of het model gereed is**

Wanneer het model is gestart, krijgt u de melding "Application startup complete." — het model is nu klaar voor gebruik:

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/43-model-startup.jpg' | relative_url }})

**Benchmarkresultaten**

De gemiddelde waarden uit de tests die op het zo uitgerolde model zijn uitgevoerd met de benchmarktool die we via [deze link](https://github.com/CordatusAI/llm-benchmark) beschikbaar stellen, zijn als volgt:

| Gelijktijdigheid | Gem. TTFT | Gem. ITL | Gem. TPS | Gem. latentie | p90-latentie |
| ----------: | -------: | ------: | ------: | -----------: | ----------: |
|           1 | 346.31 ms | 39.17 ms | 24.80 token/s | 5.32 s | 6.48 s |
|           2 | 609.43 ms | 52.36 ms | 18.15 token/s | 7.26 s | 9.14 s |
|           4 | 7710.88 ms | 55.84 ms | 8.90 token/s | 14.81 s | 17.45 s |
|           8 | 22812.65 ms | 57.75 ms | 4.54 token/s | 30.15 s | 35.06 s |

De testresultaten laten zien dat het model met succes gedistribueerd over 8 nodes draaide, wat de end-to-end validatie van de multi-node inferentie-infrastructuur bevestigt. Naarmate de gelijktijdigheid (concurrency) toenam, stegen de TTFT en de totale latentie, terwijl de snelheid van tokengeneratie per gebruiker afnam.

## NAS-configuratie (ASUSTOR AS6808T)

Dit deel beschrijft de installatie van de NAS die in deze configuratie wordt gebruikt: vanaf het uitpakken, het aansluiten op de CRS312-switch via 2×10Gbps LACP met bonding, het aanmaken van een gedeelde map en het instellen van de rechten daarvan, tot het mounten van deze map op een Spark-node.

**Fysieke installatie**

1.  Plaats 8 HDD-schijven in uw apparaat.

2.  Sluit de twee 10Gbps-poorten aan de achterkant van de NAS met Cat6-kabels aan op de poorten Combo3 en Combo4 van de CRS312.

3.  Sluit de voeding aan.

**Eerste keer opstarten en fabrieksreset van de NAS**

Schakel het apparaat in door de aan/uit-knop 1-2 seconden ingedrukt te houden. Tijdens het opstarten verschijnen de volgende meldingen achtereenvolgens op het lcd-scherm:

1.  "Starting system please wait" — het systeem start op

2.  "booting-service" / "booting-network" — de services en het netwerk starten op

3.  "Initialize NAS?" — vraag voor de eerste installatie/fabrieksreset

Wanneer de vraag "Initialize NAS?" op het scherm verschijnt, drukt u met YES geselecteerd op de knop Confirm (enter) rechtsonder op het lcd-scherm.

Daarna verschijnt de vraag "Delete all data?". Omdat alle gegevens worden gewist, drukt u, als u het zeker weet, opnieuw op de knop Confirm met YES geselecteerd.

De melding "Initializing please wait" verschijnt op het scherm en het proces begint. Na enige tijd is het proces voltooid en verschijnt het aan de NAS toegewezen IP-adres op het lcd-scherm.

**Het IP-adres van de NAS vinden**

In de fabrieksinstellingen krijgt de NAS zijn IP-adres via DHCP. Als er in uw netwerk een DHCP-server is, wordt het IP-adres automatisch op het lcd-scherm weergegeven.

Als er in uw netwerk geen DHCP-server is, krijgt de NAS een link-local-adres (169.254.x.x). In dat geval bereikt u de NAS door uw computer in hetzelfde link-local-bereik te plaatsen.

Ga, zodra u het IP-adres kent, in uw browser naar http://<nas-ip>:8000. Bijvoorbeeld: [http://192.168.1.31:8000](http://192.168.1.31:8000)

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/44-nas-login.jpg' | relative_url }})

In het scherm voor de eerste installatie zijn de standaardgebruikersnaam en het standaardwachtwoord admin / admin. Na het aanmelden wordt de standaardpoortconfiguratie getoond; u kunt die wijzigen of doorgaan met de standaardinstellingen:

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/45-nas-port-config.jpg' | relative_url }})

Als u wordt gevraagd uw wachtwoord te wijzigen, doe dat dan. Wordt dat niet gevraagd, dan kunt u rechtsboven op het pictogram A klikken, daar Personal kiezen en uw wachtwoord wijzigen in het scherm dat opent:

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/46-nas-password.jpg' | relative_url }})

**RAID-configuratie**

In de fabrieksinstellingen is de NAS geconfigureerd met RAID 5 over 8 schijven. RAID 5 biedt een tolerantie van 1 schijf en ~51 TB bruikbare ruimte.

| **RAID** | **Schijftolerantie** | **Bruikbare ruimte** | **Snelheid** | **Aanbevolen gebruik** |
| --- | --- | --- | --- | --- |
| RAID 0 | Geen | 58 TB | Snelst | Maximale prestaties, gegevensveiligheid niet belangrijk |
| RAID 5 | 1 schijf | 51 TB | Gemiddeld | Standaard, gebalanceerd gebruik |
| RAID 6 | 2 schijven | 44 TB | Laag | Hoge gegevensveiligheid |

Opmerking: hoewel op de labels van de schijven 8 TB staat, worden ze in de interface van de NAS als 7.28 TB weergegeven. Dat komt doordat schijffabrikanten de capaciteit in het decimale stelsel opgeven, terwijl besturingssystemen in het binaire stelsel rekenen. 8 TB (decimaal) wordt weergegeven als ≈ 7.28 TB (binair). De onderstaande waarden zijn berekend volgens het binaire stelsel.

In dit document wordt de RAID 0-configuratie beschreven, voor snelheid maar ten koste van redundantie. Als u het systeem wilt gebruiken dat standaard met RAID 5 is geconfigureerd, kunt u deze stap overslaan. Wilt u redundantie voor 2 schijven, dan kunt u RAID 6 kiezen, maar in dat geval nemen uw snelheid en opslagruimte af. U kunt kiezen op basis van uw behoeften.

**Stappen voor de RAID 0-configuratie:**

1.  Ga in de webinterface van de NAS naar de pagina Storage Manager → Volume

2.  Selecteer het bestaande RAID 5-volume

3.  Klik op de knop Remove

    ![]({{ '/papers/dgx-spark-8node-cluster-setup/images/47-raid-volume.jpg' | relative_url }})

4.  Kies in het scherm dat verschijnt de optie Quick Setup

    ![]({{ '/papers/dgx-spark-8node-cluster-setup/images/48-raid-quick-setup.jpg' | relative_url }})

5.  Kies in het volgende scherm de optie RAID 0

    ![]({{ '/papers/dgx-spark-8node-cluster-setup/images/49-raid0-select.jpg' | relative_url }})

6.  Druk op de knop Finish

Wanneer het proces is voltooid, is het RAID 0-volume met 8 schijven gereed. De totale bruikbare ruimte bedraagt ~58 TB.

**Netwerkconfiguratie — LACP-bonding**

Bundel de twee 10Gbps-ethernetpoorten van de NAS in één bondinginterface voor een 2×10Gbps-LACP-verbinding:

1.  Ga in de webinterface van de NAS naar de pagina Settings → Network → Network Interface

2.  Klik op ADD → Create Link Aggregation

    ![]({{ '/papers/dgx-spark-8node-cluster-setup/images/50-link-aggregation.jpg' | relative_url }})

3.  Selecteer in het veld Interface LAN 1 en LAN 2

4.  Aggregation Mode: kies 802.3ad

5.  Druk op de knop Next

    ![]({{ '/papers/dgx-spark-8node-cluster-setup/images/51-lacp-config.jpg' | relative_url }})

6.  Vink de optie Set up IP address manually aan

7.  Voer de volgende gegevens in:

    1.  IP Address: 192.168.1.31

    2.  Subnet Mask: 255.255.255.0

    3.  Gateway: 192.168.1.1

8.  Druk op de knop Next

    ![]({{ '/papers/dgx-spark-8node-cluster-setup/images/52-nas-ip-config.jpg' | relative_url }})

9.  Controleer het overzichtsscherm en druk op de knop Finish

Wanneer het proces is voltooid, gebruikt de NAS de twee ethernetpoorten als één bondinginterface. Samen met de LACP-bonding aan de kant van de CRS312-switch levert dit een gezamenlijke doorvoer van 2×10Gbps.

**SSH-toegang inschakelen**

Om het script voor prestatie-afstemming te installeren, moet u via SSH verbinding maken met de NAS. SSH is standaard uitgeschakeld.

1.  Ga in de webinterface van de NAS naar de pagina Services → Terminal

2.  Vink de optie Enable SSH Service aan

3.  Druk op de knop Apply

![]({{ '/papers/dgx-spark-8node-cluster-setup/images/53-ssh-enable.jpg' | relative_url }})

U kunt nu via SSH verbinding maken met de NAS:

```bash
ssh admin@192.168.1.31
```

De gebruikersnaam is admin en het wachtwoord is het wachtwoord dat u tijdens de installatie hebt ingesteld.

**NFS-service inschakelen**

1.  Ga in de webinterface van de NAS naar de pagina Services → NFS

2.  Vink de optie Enable NFS Service aan

3.  Druk op de knop Apply

4.  Start de NAS opnieuw op, zodat de NFS-service volledig start

Belangrijk: na het inschakelen van de NFS-service moet u de NAS opnieuw opstarten. Anders kunt u bij het toevoegen van een NFS-export de fout "unknown error (ref. 5052)" krijgen.

**Een gedeelde map aanmaken**

1.  Klik in de webinterface van de NAS op de knop File Explorer → + (Create New Shared Folder)

    ![]({{ '/papers/dgx-spark-8node-cluster-setup/images/54-shared-folder.png' | relative_url }})

2.  Klik op de knop Add

    1.  Name: voer een naam in

3.  Druk op de knop Next

4.  In het scherm Access Rights:

    1.  Kies de optie Read and Write for all users (iedereen krijgt lees- en schrijfrechten)

    2.  Of laat de standaardoptie Read and Write for admins staan

    ![]({{ '/papers/dgx-spark-8node-cluster-setup/images/55-access-rights.jpg' | relative_url }})

5.  Druk op de knop Next

6.  Aanvullende beschermingsmaatregelen: kies de optie Skip

    1.  Encrypt this shared folder: u kunt dit desgewenst kiezen; in dit document is het niet gekozen

    ![]({{ '/papers/dgx-spark-8node-cluster-setup/images/56-protection-measures.jpg' | relative_url }})

7.  Druk op de knoppen Next → Finish

**NFS-rechten instellen**

1.  Ga in de webinterface van de NAS naar de pagina Access Control → Shared Folders

2.  Selecteer de betreffende map

3.  Klik op de knop Access Rights

    ![]({{ '/papers/dgx-spark-8node-cluster-setup/images/57-nfs-privileges.jpg' | relative_url }})

4.  Ga naar het tabblad NFS Privileges

5.  Klik op de knop Add

6.  Voer de volgende gegevens in:

    1.  Client Address: 192.168.1.1/24 (voer uw eigen netwerkbereik in; het masker /24 omvat het hele subnet)

    2.  Privilege: Read and Write

    3.  Root Mapping: root (0)

7.  Druk op de knop OK

    ![]({{ '/papers/dgx-spark-8node-cluster-setup/images/58-nfs-add.jpg' | relative_url }})

**Script voor prestatie-afstemming**

Maak via SSH verbinding met de NAS en maak het script voor prestatie-afstemming aan. Dit script wordt bij elke herstart automatisch uitgevoerd en wijzigt de hash-policy van de bonding in layer3+4:

```bash
ssh admin@192.168.1.31
```

```bash
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

```bash
sudo chmod +x /usr/local/etc/init.d/S98nfstune
sudo /usr/local/etc/init.d/S98nfstune start
```

Controleer na het uitvoeren van het script of de hash-policy is gewijzigd:

```bash
cat /sys/class/net/bond0/bonding/xmit_hash_policy
# Expected: layer3+4
```

**De NAS mounten op de Spark-nodes**

Maak op elke Spark een NFS-mountpoint aan en maak verbinding met de NAS:

```bash
sudo mkdir -p /mnt/asustor
sudo mount -t nfs \
  -o vers=4.2,nconnect=8,rsize=1048576,wsize=1048576,hard,noatime \
  192.168.1.31:/volume1/openzeka /mnt/asustor
```

**Eenvoudige schrijf- en leestest**

Test na het mounten van de NAS de basisprestaties voor schrijven en lezen. Schrijftest:

```bash
dd if=/dev/zero of=/mnt/asustor/testfile bs=1M count=10240 conv=fdatasync
```

Leestest:

```bash
# Flush cache:
sync; echo 3 | sudo tee /proc/sys/vm/drop_caches

# Read:
dd if=/mnt/asustor/testfile of=/dev/null bs=1M
```

Opruimen:

```bash
rm /mnt/asustor/testfile
```

## Resultaten en verificatie

Door de stappen in dit document te volgen, wordt een volledig functioneel DGX Spark AI-cluster opgezet dat uit de volgende componenten bestaat:

| **Component** | **Status** | **Verificatiemethode** |
| --- | --- | --- |
| Managementnetwerk (10GbE) | Gereed | Ping tussen nodes geslaagd |
| Compute-netwerk (200GbE QSFP) | Gereed      | ib_write_bw ~100-111 Gbps |
| RoCEv2 / RDMA | Gereed      | ib_write_lat ~1-3 µs |
| sparkrun-cluster | Gereed      | sparkrun setup voltooid |
| DCB / PFC | Gereed      | uitvoer van dcb pfc show: TC3:on |
| NAS (NFS) | Gereed      | dd-schrijf-/leestest |
| Modelservice | Gereed      | melding "Application startup complete." |

**Samenvatting van de statuscontrole van het cluster**

Om te controleren of de installatie voltooid is, kunt u de volgende controles uitvoeren:

1.  **Managementnetwerk:** kunnen alle nodes elkaar pingen?

2.  **Compute-netwerk:** geeft de test ib_write_bw ~100 Gbps voor elk subnet?

3.  **MTU:** slaagt de test ping -M do -s 8972 zonder pakketverlies?

4.  **sparkrun-mesh:** werkt SSH-toegang zonder wachtwoord naar alle nodes?

5.  **DCB-service:** toont systemctl status dcb-roce.service de status active?

6.  **NAS-mount:** toont df -h /mnt/asustor het mountpoint?

7.  **Model:** komen de benchmarkresultaten overeen met de bovenstaande tabel?

Als al deze controles slagen, is het cluster klaar voor AI-workloads.

## Probleemoplossing

**Docker toont overlay2 als storage driver**

Als u overlay2 ziet in de uitvoer van docker info, voeg dan de functie containerd-snapshotter toe aan het bestand /etc/docker/daemon.json en start Docker opnieuw (zie Docker-configuratie).

**Jumboframetest met ping -M do mislukt**

- Controleer of de instellingen l2mtu=9500 mtu=9000 aan de kant van de switch op de QSFP-DD-poorten zijn geconfigureerd.

- Controleer of de MTU-waarden van de CX7-interfaces aan de kant van de Spark 9000 zijn: ip link show.

**RDMA-bandbreedte laag (onder ~100 Gbps)**

- Controleer of alle systeem- en firmware-updates zijn uitgevoerd (zie Updates van systeem en firmware).

- Controleer of QoS-hardware-offloading aan de kant van de switch is ingeschakeld: qos-hw-offloading=yes.

- Controleer of de DCB-instellingen zijn toegepast: dcb pfc show dev enp1s0f1np1.

- Controleer of de service dcb-roce.service draait: systemctl status dcb-roce.service.

**SSH-autorisatiefout bij sparkrun**

Als u bij het uitvoeren van sparkrun een autorisatiefout krijgt:

```bash
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
```

Voer de opdracht uit en start sparkrun opnieuw.

**Fout "unknown error (ref. 5052)" bij een NFS-export**

Start de NAS opnieuw op nadat u de NFS-service hebt ingeschakeld. U krijgt deze fout als u een export probeert toe te voegen voordat de NFS-service volledig is gestart.

**Bond-hash-policy van de NAS toont geen layer3+4**

Voer het script voor prestatie-afstemming uit en controleer het resultaat:

```bash
sudo /usr/local/etc/init.d/S98nfstune start
cat /sys/class/net/bond0/bonding/xmit_hash_policy
# Expected: layer3+4
```
**Breakoutpoorten van de CRS804 maken geen link**

- Controleer of de vergrendelingen van de breakoutkabel volledig vastzitten.

- Controleer of de instellingen auto-negotiation=no en speed=200G-baseCR4 op de juiste poorten zijn toegepast.

- Verwijder de kabel, steek hem opnieuw in en controleer de poortstatus: /interface/ethernet/print.

---

<div class="product-card" markdown="1">
<div class="product-card-image">
<img src="{{ '/papers/dgx-spark-8node-cluster-setup/images/spark-8-1.2.png' | relative_url }}" alt="NVIDIA DGX Spark 8-Node AI Cluster" />
</div>
<div class="product-card-body">
<h3>NVIDIA DGX Spark 8-Node AI Cluster – 8 nodes, 1 TB, 200GbE</h3>
<p>8 DGX Spark-nodes, 200GbE RoCEv2 RDMA en clusterbeheer met sparkrun voor een end-to-end AI-infrastructuur.</p>
{% include company/product-button.html product="dgx-spark-8-node" %}
</div>
</div>
