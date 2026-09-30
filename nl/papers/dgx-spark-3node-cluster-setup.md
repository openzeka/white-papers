---
title: Installatiehandleiding voor een DGX Spark AI-cluster met 3 nodes
parent: White Papers
nav_order: 5
lang: nl
page_id: dgx-spark-3node-cluster-setup
date: 2026-07-30 08:21:44 +0300
card_tag: "Clusterinstallatie"
description: >-
  Installatie van een AI-cluster in ringtopologie (mesh) met 3 NVIDIA DGX Spark-nodes:
  management- en compute-netwerk, RoCEv2/RDMA, sparkrun-configuratie.
permalink: /papers/dgx-spark-3node-cluster-setup/
redirect_from:
  - /papers/dgx-spark-3node-cluster-kurulumu/
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
- [sparkrun installeren op de Spark-nodes](#sparkrun-installeren-op-de-spark-nodes)
  - [Configuratie van gebruiker en SSH](#configuratie-van-gebruiker-en-ssh)
  - [Installatie van sparkrun](#installatie-van-sparkrun)
- [Snelheidstests en RDMA-tests](#snelheidstests-en-rdma-tests)
- [Modellen draaien met sparkrun](#modellen-draaien-met-sparkrun)
- [Resultaten en verificatie](#resultaten-en-verificatie)
- [Probleemoplossing](#probleemoplossing)

<div class="product-card" markdown="1">
<div class="product-card-image">
<img src="{{ '/papers/dgx-spark-3node-cluster-setup/images/DGX_Spark_Triple_2-500x499.webp' | relative_url }}" alt="NVIDIA DGX Spark Triple" />
</div>
<div class="product-card-body">
<h3>NVIDIA DGX Spark Triple</h3>
<p>3 DGX Spark-nodes, 200GbE RoCEv2 RDMA en sparkrun-clusterbeheer voor een end-to-end AI-infrastructuur.</p>
{% include company/product-button.html product="dgx-spark-triple" %}
</div>
</div>

Dit document beschrijft de volledige installatie- en configuratiestappen voor een AI-cluster dat bestaat uit 3 NVIDIA DGX Spark-nodes in een ringtopologie (mesh). Het cluster gebruikt de **sparkrun**-toolkit om gedistribueerde AI-workloads en de uitvoering van modellen te beheren.

Het document behandelt de voorbereiding van het managementnetwerk en het compute-netwerk, de configuratie van de ConnectX-7 QSFP112-poorten, de RoCEv2/RDMA-instellingen, SSH-toegang en de stappen voor de statuscontrole van het cluster.

## Architectuuroverzicht

| Component | Beschrijving |
| :---- | :---- |
| **DGX Spark × 3** | Elk met een ConnectX-7 200GbE QSFP112-poort |
| **QSFP112-kabel × 3** | Amphenol: NJAAKK-N911 |
| **sparkrun** | Toolkit voor clusterbeheer, SSH-mesh en CX7-configuratie |

## Vereisten

**Hardware**

* 3× NVIDIA DGX Spark-systemen
* 3× Amphenol: NJAAKK-N911-kabels
* Cat6-kabels (managementnetwerk)

**Software en besturingssysteem**

* DGX OS (vooraf geïnstalleerd op elk Spark-systeem)
* Internettoegang (voor het downloaden van pakketten en updates)

**Kennis en toegang**

* Basiskennis van de Linux-opdrachtregel
* Fysieke toegang tot alle apparaten (voor het aansluiten van de kabels)

**Installatie van DGX Spark OS**

U kunt de volgende video gebruiken voor de installatie van DGX Spark OS:

[NVIDIA DGX Spark Kurulumu Part 1](https://www.youtube.com/watch?v=-z8GqGKDyXE)

## **Voorbereiding van de DGX Spark-nodes**

Zorg ervoor dat alle Spark-systemen de nieuwste software- en firmwareversies draaien voordat u verdergaat met de fysieke verbindingen en de netwerkconfiguratie. Een aanzienlijk deel van de prestatieproblemen die tijdens de installatie optreden, komt voort uit verouderde drivers, ontbrekende updates of incompatibele firmware.

De volgende stappen moeten op alle drie de Spark-systemen worden uitgevoerd.

### **Updates van systeem en firmware**

Werk eerst de pakketten van het besturingssysteem bij:

```bash
sudo apt update
sudo apt dist-upgrade
```

Werk daarna de systeemfirmware bij:

```bash
sudo fwupdmgr refresh --force
sudo fwupdmgr upgrade
```

Controleer in het DGX Dashboard of er updates beschikbaar zijn en installeer deze als dat het geval is:

![]({{ '/papers/dgx-spark-3node-cluster-setup/images/01-dgx-dashboard.png' | relative_url }})

Start het systeem opnieuw op nadat de updates zijn voltooid:

```bash
sudo reboot
```

Tijdens het testen werd vastgesteld dat verouderde firmwareversies ertoe leidden dat de verbindingsprestaties achterbleven bij het verwachte niveau. Daarom wordt aanbevolen om als eerste stap alle systemen bij te werken.

### **Docker-configuratie**

Om de containergebaseerde tools die in de volgende stappen worden gebruikt zonder sudo te kunnen draaien, worden op elke Spark de post-installatiestappen van Docker uitgevoerd.

Voeg eerst de huidige gebruiker toe aan de Docker-groep:

```bash
sudo groupadd docker
sudo usermod -aG docker $USER
newgrp docker
```

Controleer de configuratie met de volgende test:

```bash
docker run hello-world
```

![]({{ '/papers/dgx-spark-3node-cluster-setup/images/02-docker-hello.png' | relative_url }})

Als de opdracht met succes wordt uitgevoerd en Docker de voorbeeldcontainer kan starten, is bevestigd dat de benodigde voorbereiding voor de containergebaseerde tools in de volgende stappen voltooid is.

**De storage driver controleren**

Daarnaast werd op alle Spark-nodes de storage driver van Docker gecontroleerd. De uitvoer van `docker info` bevestigde dat de waarde van Storage Driver `overlayfs` is. Als `overlay2` of een andere storage driver werd aangetroffen, werd Docker geconfigureerd om de containerd-snapshotter (`overlayfs`) te gebruiken en werd de Docker-service opnieuw gestart. Zo werd een consistente runtime-omgeving op alle nodes gewaarborgd.

Eerst werd de huidige storage driver gecontroleerd met de volgende opdracht:

```bash
docker info -f 'Driver={{.Driver}} DriverStatus={{.DriverStatus}} DockerRootDir={{.DockerRootDir}}'
```

Als de uitvoer `overlay2` toont, werd de volgende configuratie toegepast:

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

Na de configuratie werd dezelfde controleopdracht opnieuw uitgevoerd en werd bevestigd dat de storage driver `overlayfs` is.

![]({{ '/papers/dgx-spark-3node-cluster-setup/images/03-docker-storage.png' | relative_url }})

## Aansluiting van het managementnetwerk (10GbE)

De 10GbE-ethernetpoort van elke DGX Spark wordt met een Cat6-kabel aangesloten op een van de RJ45-poorten van de switch. Controleer na het aansluiten of de linkindicator van de betreffende poort op de switch brandt.

Open een terminal op het bureaublad van de Spark en controleer of het apparaat een IP-adres heeft gekregen:

```bash
ip addr show
```

![]({{ '/papers/dgx-spark-3node-cluster-setup/images/04-ip-addr.png' | relative_url }})

Als u, zoals in het voorbeeld, een IP-adres op de 10GbE-interface ziet, is SSH-toegang via het managementnetwerk beschikbaar. Als er geen IP-adres is toegewezen, wijs er dan handmatig een toe via het bureaublad van DGX OS:

1. Klik op het netwerkpictogram in de rechterbovenhoek → selecteer Wired Settings
2. Klik op het tandwielpictogram (⚙) naast de betreffende 10GbE-verbinding
3. Ga naar het tabblad IPv4
4. Wijzig Method in Manual
5. Voer de volgende gegevens in:
- Address: 192.168.1.163 (verschillend voor elke Spark, bijv. .147, .148 — pas dit aan uw netwerk aan)
- Netmask: 255.255.255.0
- Gateway: 192.168.1.1 (indien beschikbaar, laat het veld anders leeg)
- DNS: 1.1.1.1,8.8.8.8
6. Klik op Apply en schakel de verbinding uit en weer in

![]({{ '/papers/dgx-spark-3node-cluster-setup/images/05-wired-settings.png' | relative_url }})

Als er internettoegang is, is de 10GbE-managementverbinding gereed. Herhaal dezelfde stappen op de andere twee Spark-systemen en wijs elk daarvan een ander IP-adres toe.

**Controle van de verbinding tussen de nodes**

Controleer of alle Spark-systemen elkaar via het managementnetwerk kunnen zien. Ping vanaf één Spark de andere Sparks:

```bash
ping -c 4 192.168.1.147
ping -c 4 192.168.1.148
```

Als alle pings slagen, is het managementnetwerk gereed en kunnen alle nodes met elkaar communiceren.

## Fysieke aansluiting van het compute-netwerk (200GbE QSFP)

In deze opstelling is elke Spark via zijn twee ConnectX-7 QSFP-poorten met 100GbE verbonden met de andere twee Sparks (twee poorten, samen 200GbE).

**Kabelplan**

De poorttoewijzingen voor de fysieke verbindingen tussen de drie Spark-systemen zijn als volgt:

| Bron | Bestemming |
| ----- | ----- |
| Spark1 Port0 | Spark2 Port1 |
| Spark1 Port1 | Spark3 Port0 |
| Spark2 Port0 | Spark3 Port1 |

**![]({{ '/papers/dgx-spark-3node-cluster-setup/images/06-cable-plan.png' | relative_url }})**

## sparkrun installeren op de Spark-nodes

### Configuratie van gebruiker en SSH

Nadat de netwerkconfiguratie is voltooid, moet op alle nodes een gemeenschappelijke gebruiker worden aangemaakt, zodat de Spark-systemen zonder wachtwoord met elkaar kunnen communiceren. sparkrun gebruikt deze gebruiker om via SSH verbinding te maken met alle nodes en de clusterbeheertaken uit te voeren.

**Hostnamen instellen**
Geef elke Spark een unieke hostnaam. Dit is essentieel voor het beheer van SSH known_hosts, voor loganalyse en om de nodes van het cluster te kunnen volgen:

```bash
# On Spark 1:
sudo hostnamectl set-hostname spark1

# On Spark 2:
sudo hostnamectl set-hostname spark2

# On Spark 3:
sudo hostnamectl set-hostname spark3
```

**Een gedeelde gebruiker aanmaken**
Op alle Spark-systemen moet dezelfde gebruikersnaam worden aangemaakt. In dit document wordt de gebruikersnaam `nvidia` gebruikt. Voer de volgende opdrachten uit op alle drie de Spark-systemen:

```bash
sudo useradd -m nvidia
sudo usermod -aG sudo nvidia
sudo passwd nvidia
```

Gebruik op alle systemen hetzelfde wachtwoord — dat vereenvoudigt het beheer. Tijdens het opzetten van de SSH-mesh door sparkrun wordt dit wachtwoord bij de eerste verbinding gevraagd; daarna neemt authenticatie op basis van sleutels het over.

**Sudo zonder wachtwoord configureren**

sparkrun voert tijdens de CX7-netwerkconfiguratie opdrachten uit met sudo. Om te voorkomen dat er telkens om een wachtwoord wordt gevraagd, moet sudo zonder wachtwoord worden geconfigureerd:

```bash
echo "nvidia ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/nvidia
sudo chmod 440 /etc/sudoers.d/nvidia
```

![]({{ '/papers/dgx-spark-3node-cluster-setup/images/07-passwordless-sudo.png' | relative_url }})

### Installatie van sparkrun

De installatie wordt uitgevoerd onder het gebruikersaccount `nvidia`.

```bash
su - nvidia
```

Installeer eerst het pakket `uv`:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc
```

Installeer daarna sparkrun:

```bash
uvx sparkrun setup
```

Beantwoord de vragen tijdens de installatie:

1. Voer eerst de IP-adressen van de apparaten in:
2. Geef het cluster een naam
3. Voer `nvidia` in als SSH-gebruikersnaam (aangemaakt in de vorige stap)
4. Kies Y voor de MESH-installatie

    ![]({{ '/papers/dgx-spark-3node-cluster-setup/images/08-sparkrun-wizard.png' | relative_url }})

5. Antwoord Y op "Configure CX7 networking?":
6. Laat de topologiekeuze op "auto" staan of kies "ring":

    ![]({{ '/papers/dgx-spark-3node-cluster-setup/images/09-sparkrun-topology.png' | relative_url }})

7. Antwoord Y op "Add 'nvidia' to the docker group on all hosts?"
8. Antwoord Y op "Install sudoers entries?"
9. Antwoord Y op "Install earlyoom?"
10. Wanneer het bericht "Setup complete" verschijnt, is de installatie met succes voltooid

    ![]({{ '/papers/dgx-spark-3node-cluster-setup/images/10-sparkrun-complete.png' | relative_url }})

## Snelheidstests en RDMA-tests

In deze stap controleren we of het compute-netwerk correct functioneert en of de RDMA-communicatie via RoCEv2 naar verwachting presteert. De tests worden uitgevoerd tussen twee Spark-systemen.

**Referentie voor IP-toewijzing**
Hieronder staan de IP-adressen die de sparkrun-wizard aan de CX7-interfaces heeft toegewezen. Gebruik in uw scenario in plaats daarvan uw eigen adressen:

| Spark | Management (enP7s7) | enp1s0f0np0 | enp1s0f1np1 | enP2p1s0f0np0 | enP2p1s0f1np1 |
| ----- | ----- | ----- | ----- | ----- | ----- |
| Spark 1 | 192.168.1.163 | 192.168.0.2 | 192.168.3.1 | 192.168.2.2 | 192.168.4.1 |
| Spark 2 | 192.168.1.147 | 192.168.5.2 | 192.168.2.1 | 192.168.6.2 | 192.168.0.1 |
| Spark 3 | 192.168.1.148 | 192.168.4.2 | 192.168.6.1 | 192.168.3.2 | 192.168.5.1 |

In een ringtopologie zijn er 2 subnetten tussen elk paar nodes (in totaal 6 subnetten). De tests worden uitgevoerd op één paar nodes en kunnen op dezelfde manier voor de andere paren worden herhaald:

- Link 0 (Spark 1 ↔ Spark 2): 192.168.0.0/24 + 192.168.2.0/24
- Link 1 (Spark 1 ↔ Spark 3): 192.168.3.0/24 + 192.168.4.0/24
- Link 2 (Spark 2 ↔ Spark 3): 192.168.5.0/24 + 192.168.6.0/24

**IP- en MTU-test**
Test vanaf Spark 1 de connectiviteit en jumboframes door Spark 2 te pingen:

```bash
# On Spark 1:
ping -c 4 192.168.0.1
ping -M do -s 8972 -c 4 192.168.0.1
```

De eerste ping test de basisconnectiviteit; de tweede test een MTU van 9000 bytes. `-M do` verhindert fragmentatie — als het pakket niet wegvalt, werkt MTU 9000 end-to-end.

Herhaal dit voor het tweede subnet:

```bash
ping -c 4 192.168.2.1
ping -M do -s 8972 -c 4 192.168.2.1
```

![]({{ '/papers/dgx-spark-3node-cluster-setup/images/11-ping-mtu.png' | relative_url }})

**TCP-doorvoertest (iperf3)**
Meet de basisbandbreedte (bandwidth) over de Ethernet/IP-laag. Deze test is geen RDMA — hij gebruikt TCP, waarbij de CPU betrokken is.

```bash
# On Spark 2 (server):
iperf3 -s
# On Spark 1 (client):
iperf3 -c 192.168.0.1 -P 8 -t 30
```

`-P 8` betekent acht parallelle streams, `-t 30` een testduur van dertig seconden. Verwacht resultaat: in totaal ~100-120 Gbps doorvoer (throughput).

Opmerking: installeer iperf3 als het nog niet is geïnstalleerd:

```bash
sudo apt install iperf3
```

![]({{ '/papers/dgx-spark-3node-cluster-setup/images/12-iperf3.png' | relative_url }})

**RDMA-apparaten identificeren**
Toon de namen van de RDMA-apparaten:

```bash
ibdev2netdev
```

Voorbeelduitvoer:
rocep1s0f0 port 1 ==> enp1s0f0np0 (Up)
rocep1s0f1 port 1 ==> enp1s0f1np1 (Up)
roceP2p1s0f0 port 1 ==> enP2p1s0f0np0 (Up)
roceP2p1s0f1 port 1 ==> enP2p1s0f1np1 (Up)

![]({{ '/papers/dgx-spark-3node-cluster-setup/images/13-ibdev2netdev.png' | relative_url }})

**RDMA-schrijftest (ib_write_bw)**
Meet de bandbreedte van RDMA-schrijfbewerkingen via RoCEv2. Hiermee wordt directe geheugenoverdracht zonder betrokkenheid van de CPU getest.

**Subnet 192.168.0.0/24:**
Op Spark 2 (server):

```bash
ib_write_bw -d roceP2p1s0f1 -F --report_gbits
```

Op Spark 1 (client):

```bash
ib_write_bw -d rocep1s0f0 -F --report_gbits 192.168.0.1
```

Verwacht resultaat: ~100-111 Gbps.
![]({{ '/papers/dgx-spark-3node-cluster-setup/images/14-ib-write-bw-1.png' | relative_url }})

**Subnet 192.168.2.0/24:**
Op Spark 2 (server):

```bash
ib_write_bw -d rocep1s0f1 -F --report_gbits
```

Op Spark 1 (client):

```bash
ib_write_bw -d roceP2p1s0f0 -F --report_gbits 192.168.2.1
```

Verwacht resultaat: ~100-111 Gbps.
![]({{ '/papers/dgx-spark-3node-cluster-setup/images/15-ib-write-bw-2.png' | relative_url }})

Als beide interfaces ~100 Gbps leveren, heeft elk paar Sparks in totaal ~200 Gbps RDMA-bandbreedte.

**RDMA-leestest (ib_read_bw)**
Meet de bandbreedte van RDMA-leesbewerkingen:

**Subnet 192.168.0.0/24:**
Op Spark 2 (server):

```bash
ib_read_bw -d roceP2p1s0f1 -F --report_gbits
```

Op Spark 1 (client):

```bash
ib_read_bw -d rocep1s0f0 -F --report_gbits 192.168.0.1
```

Verwacht resultaat: ~95-110 Gbps.
![]({{ '/papers/dgx-spark-3node-cluster-setup/images/16-ib-read-bw-1.png' | relative_url }})

**Subnet 192.168.2.0/24:**
Op Spark 2 (server):

```bash
ib_read_bw -d rocep1s0f1 -F --report_gbits
```

Op Spark 1 (client):

```bash
ib_read_bw -d roceP2p1s0f0 -F --report_gbits 192.168.2.1
```

![]({{ '/papers/dgx-spark-3node-cluster-setup/images/17-ib-read-bw-2.png' | relative_url }})

Verwacht resultaat: ~95-110 Gbps.

**RDMA-latentietest (ib_write_lat)**
Op Spark 2 (server):

```bash
ib_write_lat -d roceP2p1s0f1
```

Op Spark 1 (client):

```bash
ib_write_lat -d rocep1s0f0 192.168.0.1
```

![]({{ '/papers/dgx-spark-3node-cluster-setup/images/18-ib-write-lat.png' | relative_url }})

Verwacht resultaat: een latentie (latency) van ~1-3 microseconden.

## Modellen draaien met sparkrun

In deze stap draaien we via sparkrun een inferentieworkload (inference) over meerdere nodes om te controleren of het cluster end-to-end werkt.

**Model en recipe**
Voor deze test wordt het model Intel/Qwen3.5-397B-A17B-int4-AutoRound gebruikt. Het model draait met pipelineparallellisme (pipeline parallelism) over 3 nodes. Het standaardrecipe van sparkrun is geconfigureerd voor tensorparallellisme (tensor parallelism); daarom is een eigen YAML-bestand opgesteld om voor 3 nodes pipelineparallellisme te gebruiken.

**Het model draaien**
Sla het volgende YAML-bestand op als *qwen3.5-397b-a17b-int4-vllm.yaml*:

```yaml
model: Intel/Qwen3.5-397B-A17B-int4-AutoRound
runtime: vllm-ray
min_nodes: 3
container: ghcr.io/spark-arena/dgx-vllm-eugr-nightly:latest

metadata:
  description: "Qwen3.5-397B-A17B int4 AutoRound - 3 Node PP3"

defaults:
  port: 8000
  host: 0.0.0.0
  tensor_parallel: 1
  pipeline_parallel: 3
  gpu_memory_utilization: 0.85
  max_model_len: 131072
  load_format: auto
  tool_call_parser: qwen3_coder
  reasoning_parser: qwen3

env:
  VLLM_MARLIN_USE_ATOMIC_ADD: "1"
  NCCL_DEBUG: "INFO"
  HF_TOKEN: ${HF_TOKEN}
  HF_HUB_OFFLINE: "1"
  TRANSFORMERS_OFFLINE: "1"
  HF_DATASETS_OFFLINE: "1"

command: |
  vllm serve {model} \
    --trust-remote-code \
    --gpu-memory-utilization {gpu_memory_utilization} \
    -tp {tensor_parallel} \
    -pp {pipeline_parallel} \
    --max-model-len {max_model_len} \
    --load-format {load_format} \
    --enable-auto-tool-choice \
    --tool-call-parser {tool_call_parser} \
    --reasoning-parser {reasoning_parser} \
    --host {host} \
    --port {port}
```

Start daarna het model:

```bash
sparkrun run qwen3.5-397b-a17b-int4-vllm.yaml
```

**SSH-autorisatiefout oplossen**
Als u na het uitvoeren van de opdracht een autorisatiegerelateerde fout krijgt wanneer sparkrun verbinding probeert te maken met zichzelf, gebruik dan de volgende opdracht en voer sparkrun opnieuw uit:

```bash
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
```

![]({{ '/papers/dgx-spark-3node-cluster-setup/images/19-ssh-auth-fix.png' | relative_url }})

**Controleren of het model gereed is**
Wanneer het model start, ziet u het bericht "Application startup complete."; dit geeft aan dat het model klaar is voor gebruik:
![]({{ '/papers/dgx-spark-3node-cluster-setup/images/20-model-startup.png' | relative_url }})

**Benchmarkresultaten**
De gemiddelde waarden uit tests met de [benchmarktool](https://github.com/CordatusAI/llm-benchmark) op het op deze manier uitgerolde model zijn als volgt:

| Gelijktijdige verzoeken | TTFT (ms) | Token/s | Latentie (s) | Doorvoer (RPS) |
| ----- | ----- | ----- | ----- | ----- |
| 1 | 452 | 16.69 | 7.67 | 0.13 |
| 2 | 708 | 13.63 | 9.40 | 0.11 |
| 4 | 827 | 10.19 | 12.57 | 0.08 |
| 8 | 1394 | 6.54 | 19.57 | 0.05 |

## Resultaten en verificatie

Door de stappen in dit document te volgen, wordt een volledig functioneel DGX Spark AI-cluster opgezet dat uit de volgende componenten bestaat:

| Component | Status | Verificatiemethode |
| :---- | :---- | :---- |
| Managementnetwerk (10GbE) | Gereed | Ping tussen de nodes geslaagd |
| Compute-netwerk (200GbE QSFP) | Gereed | ib_write_bw ~100-111 Gbps |
| RoCEv2 / RDMA | Gereed | ib_write_lat ~1-3 µs |
| sparkrun-cluster | Gereed | sparkrun setup voltooid |
| Modelservice | Gereed | Bericht "Application startup complete." |

**Samenvatting van de statuscontrole van het cluster**

U kunt de volgende controles uitvoeren om te verifiëren dat de installatie voltooid is:

1. **Managementnetwerk:** Kunnen alle nodes elkaar pingen?
2. **Compute-netwerk:** Levert elk subnet ~100 Gbps in de test `ib_write_bw`?
3. **MTU:** Slaagt de test `ping -M do -s 8972` zonder pakketverlies?
4. **sparkrun-mesh:** Werkt SSH-toegang zonder wachtwoord naar alle nodes?
5. **Model:** Komen de benchmarkresultaten overeen met de tabel hierboven?

Als alle controles slagen, is het cluster gereed voor AI-workloads.

## Probleemoplossing

**De storage driver van Docker toont `overlay2`**

Als u `overlay2` ziet in de uitvoer van `docker info`, voeg dan de feature `containerd-snapshotter` toe aan het bestand `/etc/docker/daemon.json` en start Docker opnieuw (zie Docker-configuratie).

**Jumboframetest met `ping -M do` mislukt**

Controleer of de MTU-waarden van de CX7-interfaces aan de kant van de Spark op 9000 zijn ingesteld: `ip link show`.

**Lage RDMA-bandbreedte (onder ~100 Gbps)**

* Controleer of alle systeem- en firmware-updates zijn toegepast (zie Updates van systeem en firmware).
* Controleer of de kabels goed vastzitten.
* Controleer de toewijzing van interfaces aan apparaten met de uitvoer van `ibdev2netdev`.

**SSH-autorisatiefout bij sparkrun**

Als u bij het uitvoeren van sparkrun een autorisatiefout krijgt:

```bash
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
```

Voer de bovenstaande opdracht uit en voer sparkrun opnieuw uit.

---

<div class="product-card" markdown="1">
<div class="product-card-image">
<img src="{{ '/papers/dgx-spark-3node-cluster-setup/images/DGX_Spark_Triple_2-500x499.webp' | relative_url }}" alt="NVIDIA DGX Spark Triple" />
</div>
<div class="product-card-body">
<h3>NVIDIA DGX Spark Triple</h3>
<p>3 DGX Spark-nodes, 200GbE RoCEv2 RDMA en sparkrun-clusterbeheer voor een end-to-end AI-infrastructuur.</p>
{% include company/product-button.html product="dgx-spark-triple" %}
</div>
</div>
