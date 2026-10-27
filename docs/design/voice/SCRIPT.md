# Ittro voice recording script: short directions

Revised 27 October 2026. Arabic: simple Modern Standard Arabic. French: vous.

**30 prompts × 3 languages = 90 recordings.** This replaces the earlier 38-prompt / 114-recording script.

Hand movement uses three short cues per direction: a direction, a small correction, and a continuation. Numbered distances have been removed.

Read each table cell as one complete recording. Identifiers are labels, not spoken text. Filename pattern: `<identifier>.<language>.wav`, with `en`, `ar`, or `fr`.

## Which voice records what

| Language | Voice | Files |
|---|---|---|
| English | Meta MMS-TTS (`facebook/mms-tts-eng`) | `<id>.en.wav`, in this folder |
| French | Meta MMS-TTS (`facebook/mms-tts-fra`) | `<id>.fr.wav`, in this folder |
| Arabic | The phone's own text-to-speech | Made by the app on first launch with `synthesizeToFile`, from `clips.json` |

`make_voice.py` remakes the English and French files (it needs torch and transformers). MMS is licensed CC BY-NC 4.0: non-commercial use, with credit to Meta.

## Hand: right

| ID | English | العربية | Français |
|---|---|---|---|
| hand_right | Move your hand right. | حرّك يدك إلى اليمين. | Déplacez la main vers la droite. |
| hand_right_small | A little to your right. | حرّك يدك قليلًا إلى اليمين. | Un peu à droite. |
| hand_right_continue | Keep moving your hand right. | واصل تحريك يدك إلى اليمين. | Continuez vers la droite. |

## Hand: left

| ID | English | العربية | Français |
|---|---|---|---|
| hand_left | Move your hand left. | حرّك يدك إلى اليسار. | Déplacez la main vers la gauche. |
| hand_left_small | A little to your left. | حرّك يدك قليلًا إلى اليسار. | Un peu à gauche. |
| hand_left_continue | Keep moving your hand left. | واصل تحريك يدك إلى اليسار. | Continuez vers la gauche. |

## Hand: up

| ID | English | العربية | Français |
|---|---|---|---|
| hand_up | Move your hand up. | ارفع يدك. | Montez la main. |
| hand_up_small | A little higher. | ارفع يدك قليلًا. | Un peu plus haut. |
| hand_up_continue | Keep moving your hand up. | واصل رفع يدك. | Montez encore la main. |

## Hand: down

| ID | English | العربية | Français |
|---|---|---|---|
| hand_down | Move your hand down. | اخفض يدك. | Descendez la main. |
| hand_down_small | A little lower. | اخفض يدك قليلًا. | Un peu plus bas. |
| hand_down_continue | Keep moving your hand down. | واصل خفض يدك. | Descendez encore la main. |

## Reaching and checking

| ID | English | العربية | Français |
|---|---|---|---|
| almost | Almost there. | يدك قريبة من المنتج. | Vous y êtes presque. |
| reach_forward | Your hand is lined up. Reach forward slowly to feel for it. | يدك في الاتجاه الصحيح. مدّها ببطء إلى الأمام حتى تلمس المنتج. | Votre main est alignée avec le produit. Avancez-la doucement pour le toucher. |
| pick_up | Pick it up. | خُذ المنتج. | Prenez-le. |
| checking | I’m checking. | أتحقّق من المنتج. | Je vérifie. |
| put_back | Put it back. | أعِد المنتج إلى مكانه. | Remettez-le à sa place. |
| yes | Yes. | نعم. | Oui. |
| no | No. | لا. | Non. |
| cannot_confirm | I can’t confirm yet. | لا أستطيع التأكّد بعد. | Je ne peux pas encore confirmer. |

## Hand tracking

| ID | English | العربية | Français |
|---|---|---|---|
| hand_lost | I lost track of your hand. Keep it still. | لم أعد أرى يدك. أبقِ يدك ثابتة. | Je ne vois plus votre main. Gardez-la immobile. |
| hand_show | I can’t see your hand. Move it in front of the camera. | لا أرى يدك. ضع يدك أمام الكاميرا. | Je ne vois pas votre main. Placez-la devant la caméra. |

## Aiming the phone

| ID | English | العربية | Français |
|---|---|---|---|
| phone_right_slow | Turn the phone slowly to your right. | وجّه كاميرا الهاتف ببطء إلى اليمين. | Orientez lentement le téléphone vers la droite. |
| phone_left_slow | Turn the phone slowly to your left. | وجّه كاميرا الهاتف ببطء إلى اليسار. | Orientez lentement le téléphone vers la gauche. |
| phone_right_small | Turn the phone a little to your right. | وجّه كاميرا الهاتف قليلًا إلى اليمين. | Orientez un peu le téléphone vers la droite. |
| phone_left_small | Turn the phone a little to your left. | وجّه كاميرا الهاتف قليلًا إلى اليسار. | Orientez un peu le téléphone vers la gauche. |
| phone_up_small | Point the phone a little higher. | وجّه كاميرا الهاتف إلى الأعلى قليلًا. | Orientez le téléphone un peu plus haut. |
| phone_down_small | Point the phone a little lower. | وجّه كاميرا الهاتف إلى الأسفل قليلًا. | Orientez le téléphone un peu plus bas. |
| phone_slower | Move the phone more slowly. | حرّك الهاتف ببطء أكثر. | Déplacez le téléphone plus lentement. |
| phone_still | Keep the phone still. | أبقِ الهاتف ثابتًا. | Gardez le téléphone immobile. |

## Playback notes

- State the product name in the first complete guidance sentence; follow-up movement cues use the recordings above. The variable product-name sentence is outside this fixed recording inventory.
- Give one axis at a time. Direction words refer to the user’s perspective. Name the hand or phone when changing which one should move.
- Use changing proximity ticks between necessary spoken cues. Speak “Almost there” once per approach and display the matching text when playback starts.
- Stop directional cues when tracking becomes unreliable. Image alignment alone does not establish depth or physical contact; do not trigger “Pick it up” solely because the hand stops or overlaps an outline.
- “Yes” and “No” introduce the appropriate product-verification explanation; do not use an isolated verdict where its meaning would be unclear.
- Use a warm, steady delivery and a short pause between sentences. Arabic should be spoken naturally without exaggerated grammatical endings at sentence boundaries.
