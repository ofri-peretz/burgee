---
"linegauge": patch
---

Fixed: `wrap()` normalized the whole string to NFC, escape sequences included. A combining mark right after a sequence composed with the sequence's last character, so `ESC[31m` followed by `U+0301` became `ESC[31ḿ`. That is no longer an SGR: the colour was lost and its bytes were wrapped as visible text. OSC payloads such as window titles and hyperlink targets were rewritten as well. Only the text between sequences is normalized now, as wrap-ansi 10.0.2 does. `flagstaff/log-update` and `flagstaff/boxen` wrap through it.
