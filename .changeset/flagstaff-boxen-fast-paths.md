---
"flagstaff": patch
---
`flagstaff/boxen` draws a box about 40% faster: text with no escape, tab or backspace skips the control-character walk, and a border bar of ASCII or box-drawing characters is cut by index instead of walked. Output is unchanged; boxen 9.0.0's own suite still passes 213 / 213.
