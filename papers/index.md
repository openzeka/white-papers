---
title: White Papers
nav_order: 3
has_children: true
lang: en
page_id: papers-index
description: Openzeka technical white paper list.
permalink: /papers/
---

# White Papers

The following technical white papers are published by Openzeka Teknoloji A.Ş.

| Title | Topic | Platform |
| --- | --- | --- |
| [Local LLM Usage Guide](yerel-llm-rehberi) | Hardware → model → software decision guide | Jetson, RTX PRO, DGX Spark, DGX/HGX |
| [NVIDIA DGX B300 vs GB300 NVL72 Cluster Architecture Comparison](b300-gb300-cluster-mimarisi) | Technical comparison of two Blackwell Ultra architectures, workload-based platform selection guide | NVIDIA DGX B300, GB300 NVL72 (Blackwell Ultra) |
| [DGX Spark 2-Node AI Cluster Setup Guide](dgx-spark-2node-cluster-kurulumu) | Point-to-point topology cluster setup, RoCEv2/RDMA, sparkrun | 2x NVIDIA DGX Spark (GB10) |
| [DGX Spark 3-Node AI Cluster Setup Guide](dgx-spark-3node-cluster-kurulumu) | Ring (mesh) topology cluster setup, RoCEv2/RDMA, sparkrun | 3x NVIDIA DGX Spark (GB10) |
| [DGX Spark 4-Node AI Cluster Setup Guide](dgx-spark-4node-cluster-kurulumu) | Switch-based cluster setup, RoCEv2/RDMA, sparkrun, NAS | 4x NVIDIA DGX Spark (GB10) |
| [DGX Spark 8-Node AI Cluster Setup Guide](dgx-spark-8node-cluster-kurulumu) | Switch-based cluster setup, RoCEv2/RDMA, sparkrun, NAS | 8x NVIDIA DGX Spark (GB10) |
| [Qwen3.6-27B DGX Spark Benchmark](qwen3.6-27b-dgx-spark-benchmark) | LLM quantization comparison (FP8/AWQ/NVFP4 + MTP) | NVIDIA DGX Spark (GB10) |
| [Qwen3.6-27B DGX Spark Cluster Scaling](qwen3.6-27b-dgx-spark-scaling) | Multi-node scaling (TP1/TP2/TP4), SLO-driven capacity planning | 1x/2x/4x NVIDIA DGX Spark (GB10) |
| [DeepSeek-V4.1-Flash 4× DGX Spark Deployment](deepseek-v4.1-flash-4spark-deployment) | 763B MoE model deployment on 4× DGX Spark (GB10) with TP4: vLLM build chain, 7 SM121 patches, Engram-on-disk, DSpark k=5 | 4× NVIDIA DGX Spark (GB10) |
| [DeepSeek-V4.1-Flash 8× DGX Spark TP8 Deployment](deepseek-v4.1-flash-8spark-deployment) | 763B MoE model on 8× DGX Spark (GB10) with TP8: two configurations (300K Engram-in-memory, 1M Engram-on-disk), NCCL optimization, benchmark results and TP4 comparison | 8× NVIDIA DGX Spark (GB10) |
| [Kimi K3 Inference Benchmark on DGX-B300](kimi-k3-dgx-b300-inference-benchmark) | Inference engine + speculative decoding comparison (vLLM vs SGLang, direct vs DSpark) | NVIDIA DGX-B300 (8x Blackwell Ultra, TP=8) |
| [LLM Inference Benchmark Explorer]({{ '/llm-inference-benchmarks/' | relative_url }}) | Interactive benchmark table: filter by device, model and quantization, set your own service-level thresholds | DGX Spark (GB10), DGX B300, RTX PRO 6000, Jetson Thor |
| [CV Inference Benchmark Explorer]({{ '/cv-inference-benchmarks/' | relative_url }}) | Interactive computer-vision benchmark: pick a device and a detection model to see sustained FPS, how it falls as cameras are added, and how many cameras it carries at your target FPS | DGX Spark (GB10), Jetson AGX Thor, Jetson Orin Nano, RTX 3060, RTX 3090 |
