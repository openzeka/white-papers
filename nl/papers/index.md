---
title: Whitepapers
nav_order: 3
has_children: true
lang: nl
page_id: papers-index
description: Lijst van technische whitepapers van Openzeka.
permalink: /papers/
---

# Whitepapers

De volgende technische whitepapers worden gepubliceerd door {% include company/block.html name="legal_name" %}.

| Titel | Onderwerp | Platform |
| --- | --- | --- |
| [Handleiding voor lokaal LLM-gebruik](yerel-llm-rehberi) | Beslisgids hardware → model → software | Jetson, RTX PRO, DGX Spark, DGX/HGX |
| [Conditional memory en offloading bij LLM-inferentie](conditional-memory-offloading) | Architectuur, geheugenplaatsing en gemeten inferentie met conditional-memory-offloading | DGX Spark, RTX PRO 6000; geheugenarchitectuur van DGX B300 |
| [NVIDIA DGX B300 vs GB300 NVL72: vergelijking van clusterarchitecturen](b300-gb300-cluster-mimarisi) | Technische vergelijking van twee Blackwell Ultra-architecturen, gids voor platformkeuze op basis van de workload | NVIDIA DGX B300, GB300 NVL72 (Blackwell Ultra) |
| [Installatiehandleiding voor een DGX Spark AI-cluster met 2 nodes](dgx-spark-2node-cluster-kurulumu) | Clusterinstallatie met point-to-point-topologie, RoCEv2/RDMA, sparkrun | 2x NVIDIA DGX Spark (GB10) |
| [Installatiehandleiding voor een DGX Spark AI-cluster met 3 nodes](dgx-spark-3node-cluster-kurulumu) | Clusterinstallatie met ringtopologie (mesh), RoCEv2/RDMA, sparkrun | 3x NVIDIA DGX Spark (GB10) |
| [Installatiehandleiding voor een DGX Spark AI-cluster met 4 nodes](dgx-spark-4node-cluster-kurulumu) | Clusterinstallatie op basis van een switch, RoCEv2/RDMA, sparkrun, NAS | 4x NVIDIA DGX Spark (GB10) |
| [Installatiehandleiding voor een DGX Spark AI-cluster met 8 nodes](dgx-spark-8node-cluster-kurulumu) | Clusterinstallatie op basis van een switch, RoCEv2/RDMA, sparkrun, NAS | 8x NVIDIA DGX Spark (GB10) |
| [Qwen3.6-27B DGX Spark-benchmark](qwen3.6-27b-dgx-spark-benchmark) | Vergelijking van LLM-kwantisatie (FP8/AWQ/NVFP4 + MTP) | NVIDIA DGX Spark (GB10) |
| [Schaling van Qwen3.6-27B op een DGX Spark-cluster](qwen3.6-27b-dgx-spark-scaling) | Schaling over meerdere nodes (TP1/TP2/TP4), SLO-gestuurde capaciteitsplanning | 1x/2x/4x NVIDIA DGX Spark (GB10) |
| [DeepSeek-V4.1-Flash-deployment op 4× DGX Spark](deepseek-v4.1-flash-4spark-deployment) | Deployment van een MoE-model van 763B op 4× DGX Spark (GB10) met TP4: vLLM-buildketen, 7 SM121-patches, Engram-on-disk, DSpark k=5 | 4× NVIDIA DGX Spark (GB10) |
| [DeepSeek-V4.1-Flash-deployment op 8× DGX Spark met TP8](deepseek-v4.1-flash-8spark-deployment) | MoE-model van 763B op 8× DGX Spark (GB10) met TP8: twee configuraties (300K Engram-in-memory, 1M Engram-on-disk), NCCL-optimalisatie, benchmarkresultaten en vergelijking met TP4 | 8× NVIDIA DGX Spark (GB10) |
| [Kimi K3-inferentiebenchmark op DGX-B300](kimi-k3-dgx-b300-inference-benchmark) | Vergelijking van inferentie-engine + speculatieve decodering (vLLM vs SGLang, direct vs DSpark) | NVIDIA DGX-B300 (8x Blackwell Ultra, TP=8) |
| [LLM Inference Benchmark Explorer]({{ '/llm-inference-benchmarks/' | relative_url }}) | Interactieve benchmarktabel: filter op apparaat, model en kwantisatie, stel uw eigen drempels voor het serviceniveau in | DGX Spark (GB10), DGX B300, RTX PRO 6000, Jetson Thor |
| [CV Inference Benchmark Explorer]({{ '/cv-inference-benchmarks/' | relative_url }}) | Interactieve benchmark voor computer vision: kies een apparaat en een detectiemodel om de volgehouden FPS te zien, hoe die daalt naarmate er camera's bijkomen, en hoeveel camera's het draagt bij uw doel-FPS | DGX Spark (GB10), Jetson AGX Thor, Jetson Orin Nano, RTX 3060, RTX 3090 |
