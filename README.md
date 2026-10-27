# Ittro

[![Latest release](https://img.shields.io/github/v/release/AmineYagoub/ittro?sort=semver)](https://github.com/AmineYagoub/ittro/releases/latest)
[![Good first issues](https://img.shields.io/github/issues/AmineYagoub/ittro/good%20first%20issue?label=good%20first%20issues&color=7057ff)](https://github.com/AmineYagoub/ittro/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
[![Improvements](https://img.shields.io/github/issues/AmineYagoub/ittro/enhancement?label=improvements&color=a2eeef)](https://github.com/AmineYagoub/ittro/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement+sort%3Areactions-%2B1-desc)

Ittro is an Android shopping companion for blind and low-vision shoppers. The shopper says what they want in Arabic, French or English; Ittro finds that exact product on the shelf through the phone camera, guides their hand to it by voice and vibration, and confirms the product in hand before saying yes.

It is built with Meta AI through the Meta Model API: Muse Spark for understanding requests and reading labels, Muse Voice Transcribe for the always-on microphone, and SAM 3.1 for finding products on the shelf. Hand tracking runs on the phone. Ittro is our entry for the Meta Global AI Developer Hackathon (Indie track).

## Quick start

```bash
git clone https://github.com/AmineYagoub/ittro
```

The Android app (`app/`) and the relay (`relay/`) are being scaffolded for the hackathon. This section grows tested commands as each part lands. Until then, follow the issues for status.

## How it works

The phone never holds the Meta API key. The app talks to a small relay, and only the relay calls Meta. Every Muse Spark call uses structured output, and the relay accepts an answer only when it completed and parses. A wrong "yes" is the worst outcome, so "I can't tell, turn the product" always beats a guess.

## Make your first contribution

1. Pick an issue labelled [good first issue](https://github.com/AmineYagoub/ittro/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).
2. Comment on it to say you're working on it.
3. Follow [CONTRIBUTING.md](CONTRIBUTING.md) to set up, test and open a pull request.
4. We reply to newcomers' pull requests within 7 days. A review or a merge may take longer.

You can help without writing code, too: docs, translation, testing, design and accessibility.

## Licence

[MIT](LICENSE).
